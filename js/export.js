import * as THREE from 'three';
import { STLExporter } from 'three/addons/exporters/STLExporter.js';
import {
  solveJansenLeg, JANSEN_EDGES, sampleFootPath,
} from './jansen.js';
import { PART_SCALE } from './parts.js';
import {
  radiusToMm,
  dxfPipeSegment,
  dxfCoupler,
  COUPLER_RADIUS_RATIO,
} from './pipe.js';

const JANSEN_PIPE_MM = 10;

/** Scene units → millimeters (matches holy-number part lengths) */
export const SCENE_TO_MM = 1 / PART_SCALE;

function downloadBlob(blob, filename) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

function timestamp() {
  const d = new Date();
  return d.toISOString().slice(0, 19).replace(/[:T]/g, '-');
}

function buildExportScene(builder, crankAngle = 0) {
  builder.refreshAllGeometry(crankAngle);
  const root = new THREE.Group();
  root.name = 'export_mm';
  const wrapper = new THREE.Group();
  wrapper.scale.setScalar(SCENE_TO_MM);
  wrapper.add(builder.group);
  root.add(wrapper);
  root.updateMatrixWorld(true);
  return root;
}

/** Merge nearby joint markers (mm) so DXF shows one hub per connection */
function mergeJointPoints(points, toleranceMm = 0.8) {
  const merged = [];
  for (const p of points) {
    let hit = null;
    for (const m of merged) {
      if (Math.hypot(m.x - p.x, m.y - p.y) < toleranceMm) {
        hit = m;
        break;
      }
    }
    if (hit) {
      const n = hit.n + 1;
      hit.x = (hit.x * hit.n + p.x) / n;
      hit.y = (hit.y * hit.n + p.y) / n;
      hit.pipeRadiusMm = Math.max(hit.pipeRadiusMm ?? 10, p.pipeRadiusMm ?? 10);
      hit.n = n;
    } else {
      merged.push({
        x: p.x,
        y: p.y,
        pipeRadiusMm: p.pipeRadiusMm ?? 10,
        n: 1,
      });
    }
  }
  return merged;
}

/**
 * Binary STL of the full 3D build (millimeters).
 */
export function exportSTL(builder, filename, options = {}) {
  if (!builder.parts.length) {
    throw new Error('Place at least one part before exporting.');
  }

  const crankAngle = options.crankAngle ?? 0;
  const scene = buildExportScene(builder, crankAngle);
  const exporter = new STLExporter();
  const data = exporter.parse(scene, { binary: true });
  const name = filename || `strandbeest-${timestamp()}.stl`;
  downloadBlob(new Blob([data], { type: 'application/octet-stream' }), name);
}

// --- DXF (AutoCAD R12 ASCII) ---

function dxfNum(n) {
  return Number(n).toFixed(4);
}

function dxfLine(layer, x1, y1, x2, y2, z = 0) {
  return `0
LINE
8
${layer}
10
${dxfNum(x1)}
20
${dxfNum(y1)}
30
${dxfNum(z)}
11
${dxfNum(x2)}
21
${dxfNum(y2)}
31
${dxfNum(z)}
`;
}

function dxfCircle(layer, cx, cy, r, z = 0) {
  return `0
CIRCLE
8
${layer}
10
${dxfNum(cx)}
20
${dxfNum(cy)}
30
${dxfNum(z)}
40
${dxfNum(r)}
`;
}

function dxfPolyline(layer, points, closed = false) {
  let s = `0
POLYLINE
8
${layer}
66
1
70
${closed ? 1 : 0}
`;
  for (const [x, y] of points) {
    s += `0
VERTEX
8
${layer}
10
${dxfNum(x)}
20
${dxfNum(y)}
`;
  }
  s += `0
SEQEND
8
${layer}
`;
  return s;
}

function sceneTopMm(v) {
  return { x: v.x * SCENE_TO_MM, y: -v.z * SCENE_TO_MM };
}

function collectTopViewGeometry(builder, crankAngle = 0) {
  const lines = [];
  const joints = [];
  const footpaths = [];

  for (const part of builder.parts) {
    if (part.isKinematicLeg) {
      const solved = solveJansenLeg(crankAngle, part.scale ?? 1);
      if (!solved) continue;

      part.mesh.updateMatrixWorld(true);
      const baseY = 0.32;
      const toWorld = (p) => {
        const local = new THREE.Vector3(
          p[0] * PART_SCALE,
          baseY + p[1] * PART_SCALE,
          0
        );
        return local.applyMatrix4(part.mesh.matrixWorld);
      };

      for (const [ja, jb] of JANSEN_EDGES) {
        const a = sceneTopMm(toWorld(solved[ja]));
        const b = sceneTopMm(toWorld(solved[jb]));
        lines.push({ a, b, layer: 'JANSEN_LINKS', radiusMm: JANSEN_PIPE_MM / 2 });
      }

      for (const key of ['Z', 'X', 'Y', 'W', 'V', 'U', 'T', 'S']) {
        const p = sceneTopMm(toWorld(solved[key]));
        joints.push({
          ...p,
          pipeRadiusMm: key === 'S' ? JANSEN_PIPE_MM * 0.65 : JANSEN_PIPE_MM / 2,
        });
      }

      const steps = 72;
      const path2d = [];
      for (let i = 0; i <= steps; i++) {
        const ang = (i / steps) * Math.PI * 2;
        const frame = solveJansenLeg(ang, part.scale ?? 1);
        if (!frame) continue;
        const w = toWorld(frame.S);
        const t = sceneTopMm(w);
        path2d.push([t.x, t.y]);
      }
      if (path2d.length > 1) footpaths.push(path2d);
      continue;
    }

    const ends = builder.getBarEndpointsWorld(part);
    if (ends) {
      const a = sceneTopMm(ends.a);
      const b = sceneTopMm(ends.b);
      const radiusMm = radiusToMm(part.def?.radius ?? 0.01);
      lines.push({
        a,
        b,
        layer: part.def?.holyKey ? `HOLY_${part.def.holyKey}` : 'BARS',
        radiusMm,
      });
      joints.push({ ...a, pipeRadiusMm: radiusMm });
      joints.push({ ...b, pipeRadiusMm: radiusMm });
    } else if (part.def?.isJoint) {
      const p = new THREE.Vector3();
      part.mesh.getWorldPosition(p);
      joints.push({ ...sceneTopMm(p), pipeRadiusMm: 12 });
    }
  }

  return {
    lines,
    joints: mergeJointPoints(joints),
    footpaths,
  };
}

function collectLegPlans(builder, crankAngle = 0) {
  const plans = [];
  const spacing = 220;

  builder.getJansenLegs().forEach((leg, index) => {
    const solved = solveJansenLeg(crankAngle, leg.scale ?? 1);
    if (!solved) return;

    const ox = index * spacing;
    const layer = `LEG${index + 1}_PLAN`;
    const lines = [];
    const joints = [];

    const rMm = JANSEN_PIPE_MM / 2;
    for (const [ja, jb] of JANSEN_EDGES) {
      const pa = solved[ja];
      const pb = solved[jb];
      lines.push({
        x1: pa[0] + ox,
        y1: pa[1],
        x2: pb[0] + ox,
        y2: pb[1],
        layer,
        radiusMm: rMm,
      });
    }

    for (const key of ['Z', 'X', 'Y', 'W', 'V', 'U', 'T', 'S']) {
      const p = solved[key];
      joints.push({
        x: p[0] + ox,
        y: p[1],
        pipeRadiusMm: key === 'S' ? rMm * 1.3 : rMm,
        layer,
      });
    }

    const path = sampleFootPath(72, leg.scale ?? 1).map((p) => [p[0] + ox, p[1]]);
    plans.push({ lines, joints, path, layer, ox });
  });

  return plans;
}

function buildDxfDocument(builder, crankAngle = 0) {
  builder.refreshAllGeometry(crankAngle);
  const { lines, joints, footpaths } = collectTopViewGeometry(builder, crankAngle);
  const legPlans = collectLegPlans(builder, crankAngle);

  let entities = '';

  entities += `0
TEXT
8
NOTES
10
0
20
0
30
0
40
4
1
Windwalker export — units mm. Pipes: CENTER + WALL outlines + BAND circles. JOINTS: COUPLER + BORE. LEGn_PLAN = 2D leg kit.
`;

  for (const { a, b, layer, radiusMm } of lines) {
    entities = dxfPipeSegment(
      entities, layer, a.x, a.y, b.x, b.y, radiusMm ?? 10
    );
  }

  for (const j of joints) {
    const pipeR = j.pipeRadiusMm ?? (j.r ? j.r / COUPLER_RADIUS_RATIO : 10);
    entities = dxfCoupler(entities, 'JOINTS', j.x, j.y, pipeR);
  }

  footpaths.forEach((pts, i) => {
    entities += dxfPolyline(`FOOTPATH_TOP_${i + 1}`, pts, true);
  });

  for (const plan of legPlans) {
    for (const ln of plan.lines) {
      entities = dxfPipeSegment(
        entities,
        ln.layer,
        ln.x1,
        ln.y1,
        ln.x2,
        ln.y2,
        ln.radiusMm ?? JANSEN_PIPE_MM / 2
      );
    }
    for (const j of plan.joints) {
      entities = dxfCoupler(
        entities, j.layer, j.x, j.y, j.pipeRadiusMm ?? JANSEN_PIPE_MM / 2
      );
    }
    if (plan.path?.length > 1) {
      entities += dxfPolyline(`${plan.layer}_FOOT`, plan.path, true);
    }
  }

  return `0
SECTION
2
HEADER
9
$ACADVER
1
AC1009
9
$INSUNITS
70
4
0
ENDSEC
0
SECTION
2
TABLES
0
TABLE
2
LAYER
70
8
0
LAYER
2
JANSEN_LINKS
70
0
62
3
0
LAYER
2
BARS
70
0
62
5
0
LAYER
2
JOINTS_COUPLER
70
0
62
1
0
LAYER
2
BARS_WALL
70
0
62
5
0
LAYER
2
BARS_CENTER
70
0
62
3
0
LAYER
2
FOOTPATH_TOP_1
70
0
62
6
0
ENDTAB
0
ENDSEC
0
SECTION
2
ENTITIES
${entities}0
ENDSEC
0
EOF
`;
}

/**
 * DXF plan: top-view assembly + 2D Jansen leg plans (millimeters).
 */
export function exportDXF(builder, options = {}) {
  if (!builder.parts.length) {
    throw new Error('Place at least one part before exporting.');
  }

  const crankAngle = options.crankAngle ?? 0;
  const dxf = buildDxfDocument(builder, crankAngle);
  const name = options.filename || `strandbeest-${timestamp()}.dxf`;
  downloadBlob(new Blob([dxf], { type: 'application/dxf' }), name);
}

export function getExportSummary(builder, crankAngle = 0) {
  const { lines, joints } = collectTopViewGeometry(builder, crankAngle);
  return {
    barCount: lines.length,
    jointCount: joints.length,
    legCount: builder.getJansenLegs().length,
    units: 'mm',
  };
}
