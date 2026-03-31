// Simple force-directed graph layout, no external dependencies.
// Spring-electric model with center gravity.

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface LayoutEdge {
  source: string;
  target: string;
}

export function forceLayout(
  nodes: { id: string; x?: number; y?: number }[],
  edges: LayoutEdge[],
  options: { width: number; height: number; iterations?: number } = { width: 600, height: 400 },
): { id: string; x: number; y: number }[] {
  const { width, height, iterations = 100 } = options;
  const cx = width / 2;
  const cy = height / 2;

  // Initialize positions randomly around center
  const layoutNodes: LayoutNode[] = nodes.map((n, i) => ({
    id: n.id,
    x: n.x ?? cx + (Math.cos(i * 2.39996) * width * 0.3),
    y: n.y ?? cy + (Math.sin(i * 2.39996) * height * 0.3),
    vx: 0,
    vy: 0,
  }));

  const nodeMap = new Map(layoutNodes.map((n) => [n.id, n]));
  const REPULSION = 15000;
  const SPRING_K = 0.01;
  const SPRING_LENGTH = 160;
  const GRAVITY = 0.015;
  const DAMPING = 0.85;
  const OVERLAP_MIN_DIST = 150;

  for (let iter = 0; iter < iterations; iter++) {
    const alpha = 1 - iter / iterations;

    // Repulsion between all pairs
    for (let i = 0; i < layoutNodes.length; i++) {
      for (let j = i + 1; j < layoutNodes.length; j++) {
        const a = layoutNodes[i];
        const b = layoutNodes[j];
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const force = (REPULSION * alpha) / (dist * dist);
        dx = (dx / dist) * force;
        dy = (dy / dist) * force;
        a.vx -= dx;
        a.vy -= dy;
        b.vx += dx;
        b.vy += dy;
      }
    }

    // Spring forces along edges
    for (const edge of edges) {
      const a = nodeMap.get(edge.source);
      const b = nodeMap.get(edge.target);
      if (!a || !b) continue;
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const displacement = dist - SPRING_LENGTH;
      const force = SPRING_K * displacement * alpha;
      dx = (dx / dist) * force;
      dy = (dy / dist) * force;
      a.vx += dx;
      a.vy += dy;
      b.vx -= dx;
      b.vy -= dy;
    }

    // Center gravity
    for (const node of layoutNodes) {
      node.vx += (cx - node.x) * GRAVITY * alpha;
      node.vy += (cy - node.y) * GRAVITY * alpha;
    }

    // Apply velocities with damping
    for (const node of layoutNodes) {
      node.vx *= DAMPING;
      node.vy *= DAMPING;
      node.x += node.vx;
      node.y += node.vy;
      // Clamp to bounds
      node.x = Math.max(80, Math.min(width - 80, node.x));
      node.y = Math.max(40, Math.min(height - 40, node.y));
    }

    // Overlap prevention — push apart nodes closer than OVERLAP_MIN_DIST
    for (let i = 0; i < layoutNodes.length; i++) {
      for (let j = i + 1; j < layoutNodes.length; j++) {
        const a = layoutNodes[i];
        const b = layoutNodes[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        if (dist < OVERLAP_MIN_DIST) {
          const overlap = (OVERLAP_MIN_DIST - dist) / 2;
          const nx = (dx / dist) * overlap;
          const ny = (dy / dist) * overlap;
          a.x -= nx;
          a.y -= ny;
          b.x += nx;
          b.y += ny;
        }
      }
    }
  }

  return layoutNodes.map((n) => ({ id: n.id, x: n.x, y: n.y }));
}

/** Linearly interpolate between two position maps. t is 0-1 (eased). */
export function interpolatePositions(
  oldPositions: Map<string, { x: number; y: number }>,
  newPositions: Map<string, { x: number; y: number }>,
  t: number,
): Map<string, { x: number; y: number }> {
  const result = new Map<string, { x: number; y: number }>();
  for (const [id, newPos] of newPositions) {
    const oldPos = oldPositions.get(id);
    if (oldPos) {
      result.set(id, {
        x: oldPos.x + (newPos.x - oldPos.x) * t,
        y: oldPos.y + (newPos.y - oldPos.y) * t,
      });
    } else {
      result.set(id, { x: newPos.x, y: newPos.y });
    }
  }
  return result;
}
