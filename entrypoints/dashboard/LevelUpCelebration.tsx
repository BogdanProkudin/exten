import { useEffect, useRef } from "react";
import * as THREE from "three";
import { createRenderer, disposeScene, prefersReducedMotion } from "../../src/lib/three-utils";

interface LevelUpProps {
  level: number;
  title: string;
  icon: string;
  onClose: () => void;
}

/**
 * Full-screen 3D celebration overlay shown when the user reaches a new level.
 * Renders a golden trophy with falling confetti particles.
 * Auto-closes after 4 seconds. Falls back to static display if reduced motion.
 */
export function LevelUpCelebration({ level, title, icon, onClose }: LevelUpProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (prefersReducedMotion()) {
      const t = setTimeout(onClose, 3000);
      return () => clearTimeout(t);
    }

    const canvas = canvasRef.current;
    if (!canvas) return;

    const size = 300;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    camera.position.z = 6;

    const renderer = createRenderer(canvas, size, size);

    // Dramatic lighting
    scene.add(new THREE.AmbientLight(0xffffff, 0.3));
    const spotLight = new THREE.SpotLight(0x6366f1, 2, 20, Math.PI / 4);
    spotLight.position.set(3, 5, 5);
    scene.add(spotLight);
    const rimLight = new THREE.PointLight(0xc084fc, 1, 15);
    rimLight.position.set(-3, 2, 3);
    scene.add(rimLight);

    // Golden material
    const goldMat = new THREE.MeshPhysicalMaterial({
      color: 0xfbbf24,
      metalness: 0.8,
      roughness: 0.2,
    });

    // Base
    const base = new THREE.Mesh(new THREE.CylinderGeometry(0.8, 1, 0.3, 12), goldMat);
    base.position.y = -1.5;
    scene.add(base);

    // Stem
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.3, 1.2, 8), goldMat);
    stem.position.y = -0.6;
    scene.add(stem);

    // Cup (lathe)
    const cupPoints = [
      new THREE.Vector2(0.05, 0),
      new THREE.Vector2(0.6, 0),
      new THREE.Vector2(0.8, 0.5),
      new THREE.Vector2(0.9, 1.0),
      new THREE.Vector2(0.85, 1.5),
      new THREE.Vector2(0.5, 1.8),
    ];
    const cup = new THREE.Mesh(new THREE.LatheGeometry(cupPoints, 16), goldMat);
    cup.position.y = 0;
    scene.add(cup);

    // Star on top
    const starMat = new THREE.MeshPhysicalMaterial({
      color: 0xfef3c7,
      metalness: 0.5,
      roughness: 0.3,
      emissive: 0xfbbf24,
      emissiveIntensity: 0.3,
    });
    const star = new THREE.Mesh(new THREE.OctahedronGeometry(0.4), starMat);
    star.position.y = 2.2;
    scene.add(star);

    // Confetti particles
    const particleCount = 50;
    const particleGeo = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const confettiPalette = [
      [0.39, 0.40, 0.95],
      [0.75, 0.55, 0.98],
      [0.98, 0.75, 0.14],
      [0.13, 0.77, 0.37],
      [0.95, 0.30, 0.30],
    ];

    for (let i = 0; i < particleCount; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 8;
      positions[i * 3 + 1] = Math.random() * 8 - 2;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 4;
      const c = confettiPalette[Math.floor(Math.random() * confettiPalette.length)];
      colors[i * 3] = c[0];
      colors[i * 3 + 1] = c[1];
      colors[i * 3 + 2] = c[2];
    }

    particleGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    particleGeo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const particles = new THREE.Points(
      particleGeo,
      new THREE.PointsMaterial({ size: 0.15, vertexColors: true, transparent: true, opacity: 0.8 }),
    );
    scene.add(particles);

    let time = 0;
    let frame = 0;

    function animate() {
      time += 0.02;

      // Trophy rotates
      const rot = Math.sin(time * 0.5) * 0.3;
      cup.rotation.y = rot;
      base.rotation.y = rot;
      stem.rotation.y = rot;

      // Star spins + floats
      star.rotation.y += 0.03;
      star.rotation.x = Math.sin(time) * 0.2;
      star.position.y = 2.2 + Math.sin(time * 2) * 0.1;

      // Confetti falls
      const pos = particles.geometry.attributes.position;
      for (let i = 0; i < particleCount; i++) {
        (pos.array as Float32Array)[i * 3 + 1] -= 0.02 + Math.random() * 0.01;
        (pos.array as Float32Array)[i * 3] += Math.sin(time + i) * 0.005;
        if ((pos.array as Float32Array)[i * 3 + 1] < -3) {
          (pos.array as Float32Array)[i * 3 + 1] = 5;
        }
      }
      pos.needsUpdate = true;

      // Camera sway
      camera.position.x = Math.sin(time * 0.3) * 0.5;
      camera.lookAt(0, 0.5, 0);

      renderer.render(scene, camera);
      frame = requestAnimationFrame(animate);
    }

    animate();

    const closeTimer = setTimeout(onClose, 4000);

    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(closeTimer);
      disposeScene(scene, renderer);
    };
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ background: "rgba(0,0,0,0.5)", backdropFilter: "blur(8px)" }}
      onClick={onClose}
    >
      <div className="text-center" onClick={(e) => e.stopPropagation()}>
        {!prefersReducedMotion() ? (
          <canvas ref={canvasRef} width={300} height={300} className="mx-auto" />
        ) : (
          <div className="text-8xl mb-4">{icon}</div>
        )}
        <div className="mt-4">
          <p className="text-white/60 text-sm font-medium">Level {level}</p>
          <h2 className="text-3xl font-bold text-white mb-1">{title}</h2>
          <p className="text-white/50 text-sm">Keep learning to reach the next level!</p>
        </div>
      </div>
    </div>
  );
}
