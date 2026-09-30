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
      
      // Multi-frequency sinusoidal wave equation
      float elevation = (sin(p.x * 0.35 + uTime * 1.5) * 0.8) + (cos(p.z * 0.3 + uTime * 1.2) * 0.8);
      p.y += elevation;
      vElevation = (elevation + 1.6) / 3.2; // 0 to 1 range
      
      vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
      
      // Calculate perspective size with a guaranteed visible minimum
      float size = (scale * 28.0) * (1.0 / max(0.1, -mvPosition.z));
      gl_PointSize = clamp(size, 2.5, 14.0);
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
      float alpha = smoothstep(0.5, 0.05, dist);
      
      // Blend between ice blue at the bottom to luminous white at peaks
      vec3 finalColor = mix(uColor, vec3(1.0, 1.0, 1.0), vElevation * 0.7);
      
      gl_FragColor = vec4(finalColor, alpha * 0.9);
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
    camera.position.set(0, 6.0, 8.5);
    camera.lookAt(0, -0.5, -4.0);

    const scene = new THREE.Scene();

    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "high-performance"
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(winWidth, winHeight);
    renderer.setClearColor(0x000000, 0);

    // Dense grid of wave particles
    const gap = 0.32;
    const amountX = 160;
    const amountY = 160;
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
        uColor: { value: new THREE.Vector3(0.08, 0.42, 0.82) } // Luminous Sapphire-Cobalt Blue for bright mode visibility
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
