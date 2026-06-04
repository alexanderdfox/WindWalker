/** Theo Jansen's 13 holy numbers (relative proportions) */
export const HOLY = {
  a: 38.0, b: 41.5, c: 39.3, d: 40.1, e: 55.8, f: 39.4,
  g: 36.7, h: 65.7, i: 49.0, j: 50.0, k: 61.9, l: 7.8, m: 15.0,
};

export const HOLY_KEYS = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j', 'k', 'l', 'm'];

const EPS = 1e-6;

function add2D(p, v) {
  return [p[0] + v[0], p[1] + v[1]];
}

function polar2D(origin, angle, dist) {
  return [origin[0] + Math.cos(angle) * dist, origin[1] + Math.sin(angle) * dist];
}

/** Circle-circle intersection: centers p1,p2 radii r1,r2; pick point closer to hint */
function intersectCircles(p1, r1, p2, r2, hint) {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  const d = Math.hypot(dx, dy);
  if (d < EPS || d > r1 + r2 + EPS || d < Math.abs(r1 - r2) - EPS) return null;
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h2 = r1 * r1 - a * a;
  if (h2 < -EPS) return null;
  const h = Math.sqrt(Math.max(0, h2));
  const px = p1[0] + (a * dx) / d;
  const py = p1[1] + (a * dy) / d;
  const rx = (-dy * h) / d;
  const ry = (dx * h) / d;
  const c1 = [px + rx, py + ry];
  const c2 = [px - rx, py - ry];
  if (!hint) return c1;
  const d1 = (c1[0] - hint[0]) ** 2 + (c1[1] - hint[1]) ** 2;
  const d2 = (c2[0] - hint[0]) ** 2 + (c2[1] - hint[1]) ** 2;
  return d1 <= d2 ? c1 : c2;
}

/**
 * Solve full Jansen leg for crank angle (radians).
 * Returns joint positions in leg-local 2D (Z origin, +X along beach).
 */
export function solveJansenLeg(crankAngle, scale = 1, constants = HOLY) {
  const s = scale;
  const { a, b, c, d, e, f, g, h, i, j, k, l, m } = constants;

  const Z = [0, 0];
  const X = polar2D(Z, crankAngle, m * s);
  const Y = add2D(Z, [a * s, l * s]);

  const W = intersectCircles(X, j * s, Y, b * s, [Y[0], Y[1] - 50 * s]);
  if (!W) return null;

  const V = intersectCircles(W, e * s, Y, d * s, [W[0] + 30 * s, W[1]]);
  if (!V) return null;

  const U = intersectCircles(Y, c * s, X, k * s, [Y[0] - 30 * s, Y[1] + 20 * s]);
  if (!U) return null;

  const T = intersectCircles(V, f * s, U, g * s, [V[0], V[1] + 40 * s]);
  if (!T) return null;

  const S = intersectCircles(T, h * s, U, i * s, [T[0], T[1] - 60 * s]);
  if (!S) return null;

  return { Z, X, Y, W, V, U, T, S, crankAngle };
}

/** Sample foot path over one crank revolution */
export function sampleFootPath(steps = 72, scale = 1, constants = HOLY) {
  const pts = [];
  for (let i = 0; i <= steps; i++) {
    const ang = (i / steps) * Math.PI * 2;
    const leg = solveJansenLeg(ang, scale, constants);
    if (leg) pts.push([...leg.S]);
  }
  return pts;
}

/** Flatness of stance phase: lower = better ground contact */
export function footPathQuality(scale = 1, constants = HOLY) {
  const path = sampleFootPath(90, scale, constants);
  if (path.length < 10) return { score: 0, flatness: 999, closed: false };

  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of path) {
    minY = Math.min(minY, p[1]);
    maxY = Math.max(maxY, p[1]);
  }
  const groundBand = minY + (maxY - minY) * 0.15;
  const stance = path.filter((p) => p[1] <= groundBand);
  if (stance.length < 3) return { score: 0, flatness: 999, closed: false };

  const ys = stance.map((p) => p[1]);
  const flatness = Math.max(...ys) - Math.min(...ys);
  const first = path[0];
  const last = path[path.length - 1];
  const closed = Math.hypot(first[0] - last[0], first[1] - last[1]) < scale * 2;

  const score = Math.max(0, Math.min(100, 100 - flatness * (80 / scale)));
  return { score, flatness, closed };
}

/** Compare measured bar lengths to holy ratios */
export function analyzeProportions(measured, scale = 1) {
  const holy = HOLY;
  const results = [];
  let totalDev = 0;
  let count = 0;

  for (const key of HOLY_KEYS) {
    const expected = holy[key] * scale;
    const actual = measured[key];
    if (actual == null || actual <= 0) continue;
    const dev = Math.abs(actual - expected) / expected * 100;
    totalDev += dev;
    count++;
    results.push({
      key,
      expected: expected.toFixed(1),
      actual: actual.toFixed(1),
      deviation: dev,
      ok: dev < 3,
    });
  }

  return {
    segments: results,
    avgDeviation: count ? totalDev / count : 100,
    quality: footPathQuality(scale),
  };
}

/** Edges of Jansen graph for rendering */
export const JANSEN_EDGES = [
  ['Z', 'X'], ['X', 'W'], ['W', 'Y'], ['W', 'V'], ['Y', 'V'],
  ['X', 'U'], ['Y', 'U'], ['U', 'T'], ['V', 'T'], ['U', 'S'], ['T', 'S'], ['Z', 'Y'],
];

export const JANSEN_JOINT_LABELS = {
  Z: 'Hip anchor', X: 'Crank', Y: 'Upper hip', W: 'Knee coupler',
  V: 'Shin node', U: 'Femur top', T: 'Ankle triangle', S: 'Foot',
};
