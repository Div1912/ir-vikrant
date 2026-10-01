"use client";

import React, { useRef, useEffect } from 'react';
import * as THREE from 'three';

interface ParticleWaveProps {
  className?: string;
  transparent?: boolean;
}

export const ParticleWave: React.FC<ParticleWaveProps> = ({ className = '', transparent = true }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    particles: THREE.Points;
    particleMaterial: THREE.ShaderMaterial;
    animationId: number | null;
  } | null>(null);

  const particleVertex = `
    attribute float scale;
    uniform float uTime;
    varying float vElevation;
    void main() {
      vec3 p = position;
      
      // High-definition multi-frequency sinusoidal wave equation
      float elevation = (sin(p.x * 0.38 + uTime * 1.6) * 1.25) + (cos(p.z * 0.32 + uTime * 1.35) * 1.25);
      p.y += elevation;
      vElevation = (elevation + 2.5) / 5.0; // 0 to 1 normalized range
      
      vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
      
      // Calculate perspective size with high-visibility particle glow
      float size = (scale * 38.0) * (1.0 / max(0.08, -mvPosition.z));
      gl_PointSize = clamp(size, 3.2, 18.0);
      gl_Position = projectionMatrix * mvPosition;
    }
  `;

  const particleFragment = `
    uniform vec3 uColor;
    varying float vElevation;
    void main() {
      vec2 coord = gl_PointCoord - vec2(0.5);
      float dist = length(coord);
      if (dist > 0.5) discard;
      
      // Soft radial glow gradient
      float alpha = smoothstep(0.5, 0.03, dist);
      
      // Luminous cyan-sky gradient blending to pure electric white at wave crests
      vec3 crestColor = vec3(0.15, 0.75, 1.0);
      vec3 finalColor = mix(uColor, crestColor, vElevation * 0.85);
      
      gl_FragColor = vec4(finalColor, alpha * 0.98);
    }
  `;

  const initScene = () => {
    if (!canvasRef.current || typeof window === 'undefined') return;

    const canvas = canvasRef.current;
    const winWidth = window.innerWidth;
    const winHeight = window.innerHeight;
    const aspectRatio = winWidth / winHeight;

    // Perspective Camera angled downwards across the wave plane
    const camera = new THREE.PerspectiveCamera(60, aspectRatio, 0.1, 1000);
    camera.position.set(0, 5.5, 8.2);
    camera.lookAt(0, -0.6, -4.0);

    const scene = new THREE.Scene();

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance"
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(winWidth, winHeight);
    renderer.setClearColor(0x000000, 0);

    // Optimized dense grid of wave particles (100x100 = 10,000 points for ultra-smooth liquid wave)
    const gap = 0.48;
    const amountX = 100;
    const amountY = 100;
    const particleNum = amountX * amountY;
    const particlePositions = new Float32Array(particleNum * 3);
    const particleScales = new Float32Array(particleNum);
    
    let i = 0;
    let j = 0;
    for (let ix = 0; ix < amountX; ix++) {
      for (let iy = 0; iy < amountY; iy++) {
        particlePositions[i] = ix * gap - ((amountX * gap) / 2);
        particlePositions[i + 1] = 0;
        particlePositions[i + 2] = iy * gap - ((amountY * gap) / 2);
        particleScales[j] = 1.0;
        i += 3;
        j++;
      }
    }

    const particleGeometry = new THREE.BufferGeometry();
    particleGeometry.setAttribute('position', new THREE.BufferAttribute(particlePositions, 3));
    particleGeometry.setAttribute('scale', new THREE.BufferAttribute(particleScales, 1));

    const particleMaterial = new THREE.ShaderMaterial({
      transparent: true,
      vertexShader: particleVertex,
      fragmentShader: particleFragment,
      uniforms: {
        uTime: { value: 0 },
        uColor: { value: new THREE.Vector3(0.01, 0.48, 0.95) } // High-Vibrancy Sky Cobalt Blue
      }
    });

    const particles = new THREE.Points(particleGeometry, particleMaterial);
    scene.add(particles);

    sceneRef.current = {
      scene,
      camera,
      renderer,
      particles,
      particleMaterial,
      animationId: null
    };
  };

  const animate = () => {
    if (!sceneRef.current) return;

    const { scene, camera, renderer, particleMaterial } = sceneRef.current;
    
    particleMaterial.uniforms.uTime.value += 0.022;
    renderer.render(scene, camera);
    
    sceneRef.current.animationId = requestAnimationFrame(animate);
  };

  const handleResize = () => {
    if (!sceneRef.current || typeof window === 'undefined') return;

    const { camera, renderer } = sceneRef.current;
    const winWidth = window.innerWidth;
    const winHeight = window.innerHeight;

    camera.aspect = winWidth / winHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(winWidth, winHeight);
  };

  useEffect(() => {
    initScene();
    animate();

    const handleResizeEvent = () => handleResize();
    window.addEventListener('resize', handleResizeEvent);

    return () => {
      if (sceneRef.current?.animationId) {
        cancelAnimationFrame(sceneRef.current.animationId);
      }
      window.removeEventListener('resize', handleResizeEvent);
      
      if (sceneRef.current) {
        const { scene, renderer, particles } = sceneRef.current;
        scene.remove(particles);
        if (particles.geometry) particles.geometry.dispose();
        if (particles.material) {
          if (Array.isArray(particles.material)) {
            particles.material.forEach(m => m.dispose());
          } else {
            particles.material.dispose();
          }
        }
        renderer.dispose();
      }
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className={`pointer-events-none fixed inset-0 w-full h-full ${className}`}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        zIndex: 0,
        pointerEvents: 'none'
      }}
    />
  );
};

export default ParticleWave;
