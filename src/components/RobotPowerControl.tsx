'use client';

import React, { useState, useEffect } from 'react';
import { Power, Play, Square, RotateCcw, AlertTriangle, CheckCircle2, ShieldAlert, Zap } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface RobotPowerControlProps {
  unit: {
    id: string;
    unit_code: string;
    status: string;
    battery_pct?: number;
    mission_state?: string;
  };
  onStatusChange?: (newStatus: string) => void;
}

export default function RobotPowerControl({ unit, onStatusChange }: RobotPowerControlProps) {
  const [currentStatus, setCurrentStatus] = useState<string>(unit.status || 'offline');
  const [isConfirmingStop, setIsConfirmingStop] = useState<boolean>(false);
  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [commandLog, setCommandLog] = useState<any[]>([]);

  // Keep local status in sync with props
  useEffect(() => {
    setCurrentStatus(unit.status || 'offline');
  }, [unit.status]);

  // Fetch recent robot commands for this unit
  useEffect(() => {
    const fetchCommands = async () => {
      const { data } = await supabase
        .from('robot_commands')
        .select('*')
        .eq('unit_id', unit.id)
        .order('issued_at', { ascending: false })
        .limit(3);
      if (data) setCommandLog(data);
    };

    fetchCommands();

    const channelId = `robot_cmd_${unit.id}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const channel = supabase
      .channel(channelId)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'robot_commands', filter: `unit_id=eq.${unit.id}` },
        payload => {
          if (payload.eventType === 'INSERT') {
            setCommandLog(prev => [payload.new, ...prev].slice(0, 3));
          } else if (payload.eventType === 'UPDATE') {
            setCommandLog(prev => prev.map(c => (c.id === payload.new.id ? payload.new : c)));
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [unit.id]);

  const isPowerActive = currentStatus === 'active' || currentStatus === 'patrolling';

  const sendCommand = async (commandType: 'start' | 'stop' | 'return_to_dock') => {
    setIsExecuting(true);
    try {
      // 1. Issue command row in robot_commands table
      const { data: cmdRow, error: cmdErr } = await supabase
        .from('robot_commands')
        .insert({
          unit_id: unit.id,
          command: commandType,
          status: 'pending',
          issued_at: new Date().toISOString()
        })
        .select()
        .single();

      if (cmdErr) console.error('Failed to log command:', cmdErr);

      // Simulate vehicle acknowledging & executing command
      setTimeout(async () => {
        let newUnitStatus = 'standby';
        let newMissionState = 'idle';

        if (commandType === 'start') {
          newUnitStatus = 'active';
          newMissionState = 'patrolling';
        } else if (commandType === 'stop') {
          newUnitStatus = 'offline';
          newMissionState = 'idle';
        } else if (commandType === 'return_to_dock') {
          newUnitStatus = 'active';
          newMissionState = 'returning-to-dock';
        }

        // 2. Update unit table in Supabase
        await supabase
          .from('units')
          .update({
            status: newUnitStatus,
            mission_state: newMissionState,
            last_seen: new Date().toISOString()
          })
          .eq('id', unit.id);

        // 3. Mark command executed in robot_commands
        if (cmdRow) {
          await supabase
            .from('robot_commands')
            .update({ status: 'executed' })
            .eq('id', cmdRow.id);
        }

        setCurrentStatus(newUnitStatus);
        if (onStatusChange) onStatusChange(newUnitStatus);
        setIsExecuting(false);
      }, 750);
    } catch (err) {
      console.error('Error executing robot command:', err);
      setIsExecuting(false);
    }
  };

  return (
    <div className="glass-panel rounded-xl p-4 border border-panel-border relative overflow-hidden flex flex-col gap-3">
      {/* Safety Confirmation Modal for STOP Command */}
      {isConfirmingStop && (
        <div className="absolute inset-0 z-50 bg-black/90 backdrop-blur-md flex flex-col items-center justify-center p-4 text-center">
          <AlertTriangle size={36} className="text-warning mb-2 animate-bounce" />
          <h4 className="text-sm font-bold font-mono tracking-wider text-white mb-1">
            CONFIRM POWER DISENGAGEMENT
          </h4>
          <p className="text-[11px] text-foreground/70 mb-4 max-w-[280px]">
            Stopping <strong>{unit.unit_code}</strong> will power down actuator motor drives and hold brakes in current joint posture.
          </p>
          <div className="flex gap-3 w-full max-w-[240px]">
            <button
              onClick={() => setIsConfirmingStop(false)}
              className="flex-1 py-1.5 rounded bg-white/10 hover:bg-white/20 text-[11px] font-mono font-medium transition-colors"
            >
              CANCEL
            </button>
            <button
              onClick={() => {
                setIsConfirmingStop(false);
                sendCommand('stop');
              }}
              className="flex-1 py-1.5 rounded bg-destructive text-white hover:bg-destructive/80 text-[11px] font-mono font-bold transition-colors shadow-lg"
            >
              CONFIRM STOP
            </button>
          </div>
        </div>
      )}

      {/* Header & Prominent Power State Badge */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Zap size={15} className={isPowerActive ? 'text-success' : 'text-foreground/40'} />
          <span className="text-xs font-mono tracking-widest text-foreground/70 uppercase">
            ROBOT POWER & DRIVE CONTROL
          </span>
        </div>

        {/* Live Power State Pill */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border text-[10px] font-mono font-bold tracking-wider ${
            isPowerActive
              ? 'border-success text-success bg-success/10'
              : 'border-white/10 text-foreground/50 bg-black/40'
          }`}
        >
          <span className={`w-2 h-2 rounded-full ${isPowerActive ? 'bg-success animate-pulse' : 'bg-foreground/30'}`} />
          {isPowerActive ? 'DRIVE ENERGIZED' : 'POWER STANDBY'}
        </div>
      </div>

      {/* Tactile Start / Stop Controls */}
      <div className="grid grid-cols-3 gap-2 mt-1">
        {/* START BUTTON */}
        <button
          onClick={() => sendCommand('start')}
          disabled={isPowerActive || isExecuting}
          className={`py-3 px-2 rounded-lg font-mono text-xs font-bold flex flex-col items-center justify-center gap-1.5 transition-all border ${
            isPowerActive
              ? 'bg-white/5 text-foreground/30 border-white/5 cursor-not-allowed'
              : 'bg-success/20 text-success border-success/40 hover:bg-success hover:text-black active:scale-95 shadow-md shadow-success/10'
          }`}
        >
          <Play size={16} className="fill-current" />
          <span>START ROBOT</span>
        </button>

        {/* STOP BUTTON */}
        <button
          onClick={() => setIsConfirmingStop(true)}
          disabled={!isPowerActive || isExecuting}
          className={`py-3 px-2 rounded-lg font-mono text-xs font-bold flex flex-col items-center justify-center gap-1.5 transition-all border ${
            !isPowerActive
              ? 'bg-white/5 text-foreground/30 border-white/5 cursor-not-allowed'
              : 'bg-destructive/20 text-destructive border-destructive/40 hover:bg-destructive hover:text-white active:scale-95 shadow-md shadow-destructive/10'
          }`}
        >
          <Square size={16} className="fill-current" />
          <span>STOP ROBOT</span>
        </button>

        {/* RETURN TO DOCK */}
        <button
          onClick={() => sendCommand('return_to_dock')}
          disabled={isExecuting}
          className="py-3 px-2 rounded-lg font-mono text-xs font-medium flex flex-col items-center justify-center gap-1.5 bg-white/5 hover:bg-white/10 text-foreground/80 border border-white/10 transition-all active:scale-95"
          title="Command unit to return to charging station"
        >
          <RotateCcw size={16} />
          <span>RETURN DOCK</span>
        </button>
      </div>

      {/* Command Dispatch History */}
      <div className="bg-black/30 rounded-lg p-2 border border-panel-border text-[9px] font-mono">
        <div className="text-foreground/40 uppercase tracking-widest mb-1 flex justify-between">
          <span>TELEMETRY COMMAND BUS</span>
          <span>STATUS</span>
        </div>
        {commandLog.length === 0 ? (
          <div className="text-foreground/30 py-1">No recent dispatch commands.</div>
        ) : (
          <div className="space-y-1">
            {commandLog.slice(0, 2).map(cmd => (
              <div key={cmd.id} className="flex justify-between items-center text-foreground/70">
                <span className="truncate">
                  CMD: <strong className="text-accent uppercase">{cmd.command}</strong> • {new Date(cmd.issued_at).toLocaleTimeString()}
                </span>
                <span className={`px-1.5 py-0.2 rounded text-[8px] uppercase ${cmd.status === 'executed' ? 'text-success' : 'text-warning'}`}>
                  {cmd.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
