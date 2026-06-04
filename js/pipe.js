import * as THREE from 'three';
import { PART_SCALE } from './parts.js';

/** Strandbeest-style yellow PVC + dark fittings */
export const PVC_COLOR = 0xf2e6b8;
export const FITTING_COLOR = 0x8a7a52;
export const FOOT_PAD_COLOR = 0x6a5c40;

export const PIPE_SEGMENTS = 20;
export const COUPLER_RADIUS_RATIO = 1.48;
export const COUPLER_LENGTH_RATIO = 0.62;
export const END_BAND_RADIUS_RATIO = 1.12;
export const END_BAND_HEIGHT_RATIO = 0.2;
/** How far pipe ends sit inside a coupler (× pipe radius) */
export const PIPE_INSET_RATIO = 0.52;

export function radiusToMm(radiusScene) {
  return radiusScene / PART_SCALE;
}

export function mmToRadius(mm) {
  return mm * PART_SCALE;
}

export function makePipeMaterial(color = PVC_COLOR) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.38,
    metalness: 0.04,
  });
}

export function makeFittingMaterial(color = FITTING_COLOR) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.32,
    metalness: 0.18,
  });
}

export function pipeInset(outerRadius) {
  return outerRadius * PIPE_INSET_RATIO;
}

export function couplerRadius(outerRadius) {
  return outerRadius * COUPLER_RADIUS_RATIO;
}

export function couplerHalfHeight(outerRadius) {
  return outerRadius * COUPLER_LENGTH_RATIO;
}

export function createPipeGeometry(length, outerRadius) {
  const geo = new THREE.CylinderGeometry(
    outerRadius,
    outerRadius * 0.98,
    length,
    PIPE_SEGMENTS,
    1,
    false
  );
  geo.translate(0, length / 2, 0);
  return geo;
}

/** PVC tube + end bands (local +Y from 0 to length) */
export function createPipeAssembly(length, outerRadius, pipeColor = PVC_COLOR) {
  const group = new THREE.Group();
  group.name = 'pipeAssembly';
  group.userData.outerRadius = outerRadius;

  const pipeMat = makePipeMaterial(pipeColor);
  const fitMat = makeFittingMaterial();

  const bar = new THREE.Mesh(createPipeGeometry(length, outerRadius), pipeMat);
  bar.name = 'bar';
  bar.userData.baseBarLen = length;
  bar.castShadow = true;
  bar.receiveShadow = true;
  group.add(bar);

  const bandH = outerRadius * END_BAND_HEIGHT_RATIO;
  const bandGeo = new THREE.CylinderGeometry(
    outerRadius * END_BAND_RADIUS_RATIO,
    outerRadius * END_BAND_RADIUS_RATIO,
    bandH,
    14
  );
  bandGeo.translate(0, bandH / 2, 0);

  const bandA = new THREE.Mesh(bandGeo, fitMat.clone());
  bandA.name = 'bandA';
  bandA.castShadow = true;
  group.add(bandA);

  const bandB = new THREE.Mesh(bandGeo.clone(), fitMat.clone());
  bandB.position.y = length;
  bandB.name = 'bandB';
  bandB.castShadow = true;
  group.add(bandB);

  return group;
}

/** Coupler sleeve centered on origin, axis +Y */
export function createCouplerGroup(outerRadius) {
  const r = couplerRadius(outerRadius);
  const h = couplerHalfHeight(outerRadius) * 2;
  const geo = new THREE.CylinderGeometry(r, r * 1.02, h, 16);
  geo.translate(0, h / 2, 0);

  const group = new THREE.Group();
  group.name = 'coupler';
  const mesh = new THREE.Mesh(geo, makeFittingMaterial());
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  group.add(mesh);

  const collarGeo = new THREE.TorusGeometry(r * 1.04, r * 0.08, 8, 20);
  const collar = new THREE.Mesh(collarGeo, makeFittingMaterial());
  collar.rotation.x = Math.PI / 2;
  collar.position.y = h * 0.55;
  collar.castShadow = true;
  group.add(collar);

  group.userData.outerRadius = outerRadius;
  group.userData.halfHeight = h / 2;
  return group;
}

export function createFootPad(radius = 0.028) {
  const geo = new THREE.CylinderGeometry(radius, radius * 1.15, radius * 0.35, 16);
  geo.translate(0, radius * 0.175, 0);
  const mesh = new THREE.Mesh(geo, makeFittingMaterial(FOOT_PAD_COLOR));
  mesh.castShadow = true;
  mesh.name = 'footPad';
  return mesh;
}

/**
 * Place pipe assembly along segment jointA→jointB (parent-local).
 * Trims ends when they meet couplers.
 */
export function orientPipeAssembly(
  assembly,
  jointA,
  jointB,
  { insetA = 0, insetB = 0 } = {}
) {
  const bar = assembly.getObjectByName('bar');
  if (!bar) return;

  const pa = jointA.position;
  const pb = jointB.position;
  const dir = pb.clone().sub(pa);
  const len = dir.length();
  if (len < 1e-6) return;

  const unit = dir.clone().normalize();
  const visLen = Math.max(1e-5, len - insetA - insetB);
  const start = pa.clone().add(unit.clone().multiplyScalar(insetA));

  assembly.position.copy(start);
  assembly.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), unit);

  const baseLen = bar.userData.baseBarLen || visLen;
  bar.scale.set(1, visLen / baseLen, 1);

  const bandA = assembly.getObjectByName('bandA');
  const bandB = assembly.getObjectByName('bandB');
  if (bandA) bandA.position.y = 0;
  if (bandB) bandB.position.y = visLen;
}

/** Orient a bare bar mesh (Jansen leg links) */
export function orientBarMesh(bar, start, end, outerRadius, { insetA = 0, insetB = 0 } = {}) {
  const dir = end.clone().sub(start);
  const len = dir.length();
  if (len < 1e-6) return;
  const unit = dir.clone().normalize();
  const visLen = Math.max(1e-5, len - insetA - insetB);
  const trimmedStart = start.clone().add(unit.clone().multiplyScalar(insetA));
  const trimmedEnd = end.clone().sub(unit.clone().multiplyScalar(insetB));
  const mid = trimmedStart.clone().add(trimmedEnd).multiplyScalar(0.5);

  bar.position.copy(mid);
  const baseLen = bar.userData.baseLen || bar.userData.baseBarLen || 1;
  bar.scale.set(1, visLen / baseLen, 1);
  bar.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), unit);
}

/** DXF: centerline + parallel wall lines + end caps */
export function dxfPipeSegment(entities, layer, ax, ay, bx, by, radiusMm, options = {}) {
  const { couplerMm = radiusMm * COUPLER_RADIUS_RATIO, drawWalls = true } = options;
  const dx = bx - ax;
  const dy = by - ay;
  const len = Math.hypot(dx, dy);
  if (len < 1e-6) return entities;

  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;

  entities += dxfLine(`${layer}_CENTER`, ax, ay, bx, by);

  if (drawWalls) {
    entities += dxfLine(`${layer}_WALL`, ax + nx * radiusMm, ay + ny * radiusMm, bx + nx * radiusMm, by + ny * radiusMm);
    entities += dxfLine(`${layer}_WALL`, ax - nx * radiusMm, ay - ny * radiusMm, bx - nx * radiusMm, by - ny * radiusMm);
  }

  entities += dxfCircle(`${layer}_BAND`, ax, ay, radiusMm * END_BAND_RADIUS_RATIO);
  entities += dxfCircle(`${layer}_BAND`, bx, by, radiusMm * END_BAND_RADIUS_RATIO);

  return entities;
}

export function dxfCoupler(entities, layer, cx, cy, radiusMm) {
  const outer = radiusMm * COUPLER_RADIUS_RATIO;
  const inner = radiusMm * 0.55;
  entities += dxfCircle(`${layer}_COUPLER`, cx, cy, outer);
  entities += dxfCircle(`${layer}_BORE`, cx, cy, inner);
  return entities;
}

function dxfLine(layer, x1, y1, x2, y2) {
  const n = (v) => Number(v).toFixed(4);
  return `0
LINE
8
${layer}
10
${n(x1)}
20
${n(y1)}
30
0
11
${n(x2)}
21
${n(y2)}
31
0
`;
}

function dxfCircle(layer, cx, cy, r) {
  const n = (v) => Number(v).toFixed(4);
  return `0
CIRCLE
8
${layer}
10
${n(cx)}
20
${n(cy)}
30
0
40
${n(r)}
`;
}
