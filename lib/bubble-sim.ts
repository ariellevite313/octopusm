/** Petite simulation de forces pour la bubble map : collisions, ressorts entre portefeuilles liés, gravité au centre. */
export type SimNode = { id: string; r: number; x: number; y: number; vx: number; vy: number; fixed?: boolean };
export type SimLink = { a: string; b: string };

export function initNodes(items: { id: string; r: number; x: number; y: number }[]): SimNode[] {
  return items.map((i) => ({ ...i, vx: 0, vy: 0 }));
}

/** Un pas de simulation. Retourne l'énergie restante (somme des vitesses) pour savoir quand s'arrêter. */
export function stepSim(nodes: SimNode[], links: SimLink[], size = 100, alpha = 1): number {
  const c = size / 2;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  // ressorts : les portefeuilles liés se rapprochent
  for (const l of links) {
    const a = byId.get(l.a), b = byId.get(l.b);
    if (!a || !b) continue;
    const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01;
    const rest = a.r + b.r + 2.5;
    const f = (d - rest) * 0.02 * alpha;
    a.vx += (dx / d) * f; a.vy += (dy / d) * f;
    b.vx -= (dx / d) * f; b.vy -= (dy / d) * f;
  }
  // collisions + légère répulsion
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const a = nodes[i], b = nodes[j];
      const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 0.01;
      const min = a.r + b.r + 0.6;
      const push = d < min ? (min - d) * 0.5 : 8 / (d * d) * alpha;
      const ux = dx / d, uy = dy / d;
      if (!a.fixed) { a.vx -= ux * push * (b.r / (a.r + b.r)); a.vy -= uy * push * (b.r / (a.r + b.r)); }
      if (!b.fixed) { b.vx += ux * push * (a.r / (a.r + b.r)); b.vy += uy * push * (a.r / (a.r + b.r)); }
    }
  }
  let energy = 0;
  for (const n of nodes) {
    if (n.fixed) { n.vx = 0; n.vy = 0; continue; }
    n.vx += (c - n.x) * 0.004 * alpha;
    n.vy += (c - n.y) * 0.004 * alpha;
    n.vx *= 0.82; n.vy *= 0.82;
    n.x += n.vx; n.y += n.vy;
    // reste dans le cadre
    n.x = Math.min(size - n.r, Math.max(n.r, n.x));
    n.y = Math.min(size - n.r, Math.max(n.r, n.y));
    energy += Math.abs(n.vx) + Math.abs(n.vy);
  }
  return energy;
}
