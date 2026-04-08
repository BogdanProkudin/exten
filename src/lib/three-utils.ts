import * as THREE from "three";

/** Recursively dispose all geometries and materials in a scene, then tear down the renderer. */
export function disposeScene(scene: THREE.Scene, renderer: THREE.WebGLRenderer) {
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry?.dispose();
      if (Array.isArray(object.material)) {
        object.material.forEach((m) => m.dispose());
      } else {
        object.material?.dispose();
      }
    }
    if (object instanceof THREE.Points) {
      object.geometry?.dispose();
      (object.material as THREE.Material)?.dispose();
    }
    if (object instanceof THREE.Sprite) {
      object.material?.map?.dispose();
      object.material?.dispose();
    }
    if (object instanceof THREE.Line) {
      object.geometry?.dispose();
      (object.material as THREE.Material)?.dispose();
    }
  });
  renderer.dispose();
  renderer.forceContextLoss();
}

/** Create a lightweight WebGL renderer with transparent background. */
export function createRenderer(
  canvas: HTMLCanvasElement,
  width: number,
  height: number,
): THREE.WebGLRenderer {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    powerPreference: "low-power",
  });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  return renderer;
}

/** Check if user prefers reduced motion. */
export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
