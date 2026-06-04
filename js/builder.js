import * as THREE from 'three';
import {
  PART_TYPES, PART_SCALE, partSceneLength,
} from './parts.js';
import {
  solveJansenLeg, JANSEN_EDGES,
} from './jansen.js';
import {
  PVC_COLOR,
  createPipeAssembly,
  createCouplerGroup,
  createFootPad,
  createPipeGeometry,
  makePipeMaterial,
  orientPipeAssembly,
  orientBarMesh,
  pipeInset,
} from './pipe.js';

let _id = 0;
export function nextId() {
  return `p_${++_id}`;
}

const SNAP_RADIUS = 0.18;
const GRID_SIZE = 0.25;
const JANSEN_PIPE_RADIUS = 0.01;

export class StrandbeestBuilder {
  constructor(scene) {
    this.scene = scene;
    this.parts = [];
    this.connections = [];
    this.group = new THREE.Group();
    this.group.name = 'creature';
    scene.scene.add(this.group);

    this.ghostGroup = new THREE.Group();
    scene.scene.add(this.ghostGroup);

    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.05, 0.075, 32),
      new THREE.MeshBasicMaterial({
        color: 0x3a8f5c,
        transparent: true,
        opacity: 0.9,
        side: THREE.DoubleSide,
        depthTest: false,
      })
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.03;
    ring.visible = false;
    ring.renderOrder = 999;
    this.snapMarker = ring;
    scene.scene.add(ring);

    this.connectLine = null;
    this.hoveredJoint = null;

    this.jointHubGroup = new THREE.Group();
    this.jointHubGroup.name = 'jointHubs';
    this.group.add(this.jointHubGroup);

    this.selected = null;
    this.dragPart = null;
    this.connectFrom = null;
    this.tool = 'connect';
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  }

  createPartMesh(partDef, lengthScene) {
    const group = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({
      color: partDef.color,
      roughness: 0.55,
      metalness: 0.05,
    });

    if (partDef.isJoint) {
      const coupler = createCouplerGroup(partDef.radius * 0.85);
      coupler.traverse((c) => {
        if (c.isMesh) {
          c.userData.isJoint = true;
          c.name = 'jointA';
        }
      });
      group.add(coupler);
      group.userData.jointPos = new THREE.Vector3(0, 0, 0);
      return group;
    }

    if (partDef.isSail) {
      const geo = new THREE.PlaneGeometry(0.8, 1.2);
      const sailMat = new THREE.MeshStandardMaterial({
        color: 0xffffff,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
        roughness: 0.9,
      });
      const mesh = new THREE.Mesh(geo, sailMat);
      mesh.position.y = 0.6;
      mesh.castShadow = true;
      group.add(mesh);
      const pole = new THREE.Mesh(
        new THREE.CylinderGeometry(0.01, 0.01, 1.2, 8),
        mat
      );
      pole.position.y = 0.6;
      group.add(pole);
      group.userData.jointPos = new THREE.Vector3(0, 0, 0);
      return group;
    }

    const len = lengthScene || partSceneLength(partDef);
    const pipeAsm = createPipeAssembly(len, partDef.radius, partDef.color ?? PVC_COLOR);
    group.add(pipeAsm);

    const jointMat = () => new THREE.MeshStandardMaterial({
      color: 0xc9b07a,
      roughness: 0.6,
      emissive: 0x000000,
    });
    const jointA = new THREE.Mesh(
      new THREE.SphereGeometry(partDef.radius * 1.25, 12, 12),
      jointMat()
    );
    jointA.position.y = 0;
    jointA.name = 'jointA';
    jointA.userData.isJoint = true;

    const jointB = jointA.clone();
    jointB.position.y = len;
    jointB.name = 'jointB';
    jointB.userData.isJoint = true;

    group.add(jointA, jointB);
    group.userData.length = len;
    return group;
  }

  addPart(typeId, position, rotationY = 0, customLength = null) {
    const def = PART_TYPES[typeId];
    if (!def) return null;

    const len = customLength != null
      ? customLength * PART_SCALE
      : partSceneLength(def);

    const mesh = this.createPartMesh(def, len);
    mesh.position.copy(position);
    mesh.rotation.y = rotationY;

    const part = {
      id: nextId(),
      typeId,
      def,
      mesh,
      length: len,
      customLengthMm: customLength,
      pinned: def.id === 'frame',
      legId: null,
    };

    mesh.userData.partId = part.id;
    mesh.traverse((c) => { c.userData.partId = part.id; });

    this.group.add(mesh);
    this.parts.push(part);
    this.refreshPartBar(part);
    return part;
  }

  /** Spawn a full kinematic Jansen leg assembly */
  addJansenLeg(origin, rotationY = 0, scale = 1) {
    const legGroup = new THREE.Group();
    legGroup.position.copy(origin);
    legGroup.rotation.y = rotationY;

    const legId = nextId();
    const partRecords = [];
    const s = scale;
    const inset = pipeInset(JANSEN_PIPE_RADIUS);

    const legCouplerGroup = new THREE.Group();
    legCouplerGroup.name = 'legCouplers';
    legGroup.add(legCouplerGroup);

    const updateLeg = (crankAngle) => {
      const solved = solveJansenLeg(crankAngle, s);
      if (!solved) return;
      const map = solved;
      const baseY = 0.32;
      const to3 = (p) => new THREE.Vector3(
        p[0] * PART_SCALE,
        baseY + p[1] * PART_SCALE,
        0
      );

      for (const child of legGroup.children) {
        if (!child.userData.edge) continue;
        const [a, b] = child.userData.edge;
        const pa = to3(map[a]);
        const pb = to3(map[b]);
        orientBarMesh(child, pa, pb, JANSEN_PIPE_RADIUS, { insetA: inset, insetB: inset });
      }

      while (legCouplerGroup.children.length) {
        legCouplerGroup.remove(legCouplerGroup.children[0]);
      }
      for (const key of ['Z', 'X', 'Y', 'W', 'V', 'U', 'T']) {
        const coupler = createCouplerGroup(JANSEN_PIPE_RADIUS);
        coupler.position.copy(to3(map[key]));
        legCouplerGroup.add(coupler);
      }

      const foot = legGroup.getObjectByName('foot');
      if (foot) {
        const S = to3(map.S);
        foot.position.copy(S);
        foot.position.y -= JANSEN_PIPE_RADIUS * 0.15;
      }
    };

    const pipeMat = makePipeMaterial();
    const barLen = 0.3;

    for (const [a, b] of JANSEN_EDGES) {
      const geo = createPipeGeometry(barLen, JANSEN_PIPE_RADIUS);
      const bar = new THREE.Mesh(geo, pipeMat.clone());
      bar.castShadow = true;
      bar.receiveShadow = true;
      bar.userData.edge = [a, b];
      bar.userData.baseLen = barLen;
      legGroup.add(bar);
    }

    const foot = createFootPad(JANSEN_PIPE_RADIUS * 2.2);
    foot.name = 'foot';
    legGroup.add(foot);

    legGroup.userData.legId = legId;
    legGroup.userData.partId = legId;
    legGroup.userData.updateKinematics = updateLeg;
    legGroup.userData.isJansenLeg = true;
    legGroup.userData.scale = s;

    this.group.add(legGroup);
    updateLeg(0);

    const record = {
      id: legId,
      typeId: 'jansenLeg',
      mesh: legGroup,
      isKinematicLeg: true,
      updateKinematics: updateLeg,
      scale: s,
    };
    this.parts.push(record);
    partRecords.push(record);
    return { legGroup, updateLeg, legId };
  }

  addQuadWalker(position) {
    const frame = this.addPart('frame', position.clone(), 0);
    if (frame) {
      frame.mesh.scale.set(1.5, 1, 1);
      frame.length = partSceneLength(PART_TYPES.frame) * 1.5;
    }

    const spacing = 0.55;
    const legs = [];
    const offsets = [
      [-spacing / 2, 0, spacing / 2],
      [spacing / 2, 0, spacing / 2],
      [-spacing / 2, 0, -spacing / 2],
      [spacing / 2, 0, -spacing / 2],
    ];
    const rotations = [0, 0, Math.PI, Math.PI];

    offsets.forEach((off, i) => {
      const o = position.clone().add(new THREE.Vector3(...off));
      const leg = this.addJansenLeg(o, rotations[i], 1);
      legs.push(leg);
    });

    const crank = this.addPart('crank', position.clone().add(new THREE.Vector3(0, 0.4, 0)), 0);
    return { frame, legs, crank };
  }

  addCrankPair(position) {
    const frame = this.addPart('frame', position, 0);
    const c1 = this.addPart('crank', position.clone().add(new THREE.Vector3(-0.2, 0.35, 0)), 0);
    const c2 = this.addPart('crank', position.clone().add(new THREE.Vector3(0.2, 0.35, 0)), Math.PI);
    return { frame, c1, c2 };
  }

  getJointWorld(part, jointName) {
    const j = part.mesh.getObjectByName(jointName);
    if (j) {
      const v = new THREE.Vector3();
      j.getWorldPosition(v);
      return v;
    }
    if (part.isKinematicLeg) {
      return part.mesh.getWorldPosition(new THREE.Vector3());
    }
    const v = new THREE.Vector3();
    part.mesh.getWorldPosition(v);
    return v;
  }

  snapToGrid(position) {
    position.x = Math.round(position.x / GRID_SIZE) * GRID_SIZE;
    position.z = Math.round(position.z / GRID_SIZE) * GRID_SIZE;
    return position;
  }

  forEachJoint(callback, excludeId = null) {
    for (const part of this.parts) {
      if (part.id === excludeId || part.isKinematicLeg) continue;
      for (const jointName of ['jointA', 'jointB']) {
        const j = part.mesh.getObjectByName(jointName);
        if (!j) continue;
        const wp = new THREE.Vector3();
        j.getWorldPosition(wp);
        callback({ part, jointName, mesh: j, world: wp });
      }
    }
  }

  findNearestJoint(worldPos, excludeId = null, radius = SNAP_RADIUS) {
    let best = null;
    let bestDist = radius;

    this.forEachJoint(({ part, jointName, world }) => {
      if (part.id === excludeId) return;
      const d = world.distanceTo(worldPos);
      if (d < bestDist) {
        bestDist = d;
        best = { part, jointName, world: world.clone(), dist: d };
      }
    });
    return best;
  }

  showSnapMarker(worldPos) {
    if (!worldPos) {
      this.snapMarker.visible = false;
      return;
    }
    this.snapMarker.position.set(worldPos.x, 0.03, worldPos.z);
    this.snapMarker.visible = true;
  }

  hideSnapMarker() {
    this.snapMarker.visible = false;
  }

  setHoveredJoint(target) {
    const prev = this.hoveredJoint?.mesh;
    if (prev?.material?.emissive) prev.material.emissive.setHex(0x000000);
    this.hoveredJoint = target;
    const mesh = target?.mesh;
    if (mesh?.material?.emissive) mesh.material.emissive.setHex(0x2a6b4a);
  }

  alignPartJointToWorld(part, jointName, worldPos) {
    const j = part.mesh.getObjectByName(jointName);
    if (!j) return;
    const jw = new THREE.Vector3();
    j.getWorldPosition(jw);
    const delta = worldPos.clone().sub(jw);
    part.mesh.position.add(delta);
  }

  /** Snap part so jointA or jointB meets target; returns joint used */
  snapPartToJoint(part, worldPos, preferJoint = 'jointA') {
    const ja = part.mesh.getObjectByName('jointA');
    const jb = part.mesh.getObjectByName('jointB');
    if (!ja) return null;

    const near = this.findNearestJoint(worldPos, part.id);
    const target = near?.world ?? worldPos;

    const joints = preferJoint === 'jointB' ? ['jointB', 'jointA'] : ['jointA', 'jointB'];
    let used = joints[0];
    let bestD = Infinity;
    for (const jn of joints) {
      const j = part.mesh.getObjectByName(jn);
      if (!j) continue;
      const jw = new THREE.Vector3();
      j.getWorldPosition(jw);
      const d = jw.distanceTo(target);
      if (d < bestD) {
        bestD = d;
        used = jn;
      }
    }
    this.alignPartJointToWorld(part, used, target);
    return { jointName: used, snapTarget: near };
  }

  tryAutoConnect(part, jointName, snapTarget) {
    if (!snapTarget) return false;
    const other = snapTarget.part;
    const otherJoint = snapTarget.jointName;
    if (other.id === part.id) return false;
    return this.connectJoints(part, jointName, other, otherJoint);
  }

  autoConnectAllNearby(part, radius = SNAP_RADIUS) {
    let count = 0;
    for (const jn of ['jointA', 'jointB']) {
      const j = part.mesh.getObjectByName(jn);
      if (!j) continue;
      const wp = new THREE.Vector3();
      j.getWorldPosition(wp);
      const near = this.findNearestJoint(wp, part.id, radius);
      if (near && this.tryAutoConnect(part, jn, near)) count++;
    }
    return count;
  }

  connectJoints(partA, jointA, partB, jointB) {
    const key = [partA.id, jointA, partB.id, jointB].sort().join('|');
    if (this.connections.some((c) => c.key === key)) return false;

    this.connections.push({
      key,
      a: { partId: partA.id, joint: jointA },
      b: { partId: partB.id, joint: jointB },
    });

    const apply = () => {
      const ja = partA.mesh.getObjectByName(jointA);
      const jb = partB.mesh.getObjectByName(jointB);
      if (!ja || !jb) return;
      const wpB = new THREE.Vector3();
      jb.getWorldPosition(wpB);
      const local = wpB.clone();
      partA.mesh.worldToLocal(local);
      ja.position.copy(local);
    };
    apply();
    this.refreshPartBar(partA);
    this.refreshPartBar(partB);
    return true;
  }

  getAllPickables() {
    const objs = [];
    for (const p of this.parts) {
      if (p.isKinematicLeg) {
        objs.push(p.mesh);
        continue;
      }
      p.mesh.traverse((c) => {
        if (c.isMesh) objs.push(c);
      });
    }
    return objs;
  }

  pickPart(intersects) {
    for (const hit of intersects) {
      let o = hit.object;
      while (o) {
        if (o.userData.partId) {
          return this.parts.find((p) => p.id === o.userData.partId);
        }
        o = o.parent;
      }
    }
    return null;
  }

  removePart(part) {
    if (!part) return;
    this.connections = this.connections.filter(
      (c) => c.a.partId !== part.id && c.b.partId !== part.id
    );
    this.group.remove(part.mesh);
    part.mesh.traverse((c) => {
      if (c.geometry) c.geometry.dispose();
      if (c.material) {
        if (Array.isArray(c.material)) c.material.forEach((m) => m.dispose());
        else c.material.dispose();
      }
    });
    this.parts = this.parts.filter((p) => p.id !== part.id);
    if (this.selected?.id === part.id) this.selected = null;
  }

  clear() {
    [...this.parts].forEach((p) => this.removePart(p));
    this.connections = [];
    while (this.jointHubGroup.children.length) {
      this.jointHubGroup.remove(this.jointHubGroup.children[0]);
    }
  }

  getJansenLegs() {
    return this.parts.filter((p) => p.isKinematicLeg);
  }

  getConnectivityScore() {
    const joints = this.parts.filter((p) => !p.isKinematicLeg);
    const legs = this.getJansenLegs();
    const conns = this.connections.length;
    const hasCrank = this.parts.some((p) => p.typeId === 'crank');
    const hasFrame = this.parts.some((p) => p.typeId === 'frame');
    return {
      partCount: this.parts.length,
      legCount: legs.length,
      connections: conns,
      hasCrank,
      hasFrame,
      ready: legs.length >= 1 || (joints.length >= 4 && conns >= 2 && hasCrank),
    };
  }

  /** Measure bar lengths from placed manual parts for analysis */
  measureBuiltProportions() {
    const measured = {};
    for (const part of this.parts) {
      if (part.def?.holyKey && part.length) {
        const mm = part.length / PART_SCALE;
        measured[part.def.holyKey] = mm;
      }
    }
    return measured;
  }

  refreshPartBar(part) {
    if (part.isKinematicLeg || part.def?.isJoint || part.def?.isSail) return;
    const ja = part.mesh.getObjectByName('jointA');
    const jb = part.mesh.getObjectByName('jointB');
    const assembly = part.mesh.getObjectByName('pipeAssembly');
    if (!ja || !jb || !assembly) return;

    const connected = this.getConnectedJointKeys();
    const r = part.def?.radius ?? 0.01;
    const inset = pipeInset(r);
    orientPipeAssembly(assembly, ja, jb, {
      insetA: connected.has(`${part.id}|jointA`) ? inset : 0,
      insetB: connected.has(`${part.id}|jointB`) ? inset : 0,
    });
  }

  refreshAllPartBars() {
    for (const part of this.parts) this.refreshPartBar(part);
  }

  getConnectedJointKeys() {
    const keys = new Set();
    for (const conn of this.connections) {
      keys.add(`${conn.a.partId}|${conn.a.joint}`);
      keys.add(`${conn.b.partId}|${conn.b.joint}`);
    }
    return keys;
  }

  updateJointVisibility() {
    const connected = this.getConnectedJointKeys();
    for (const part of this.parts) {
      if (part.isKinematicLeg) continue;
      for (const jn of ['jointA', 'jointB']) {
        const j = part.mesh.getObjectByName(jn);
        if (j) j.visible = !connected.has(`${part.id}|${jn}`);
      }
    }
  }

  rebuildJointHubs() {
    while (this.jointHubGroup.children.length) {
      this.jointHubGroup.remove(this.jointHubGroup.children[0]);
    }
    if (!this.connections.length) return;

    this.group.updateMatrixWorld(true);
    const clusters = [];
    const tol = 0.012;

    const addPoint = (world, radius) => {
      for (const cluster of clusters) {
        if (cluster.center.distanceTo(world) < tol) {
          cluster.points.push(world.clone());
          cluster.pipeRadius = Math.max(cluster.pipeRadius, radius);
          return;
        }
      }
      clusters.push({
        points: [world.clone()],
        center: world.clone(),
        pipeRadius: radius,
      });
    };

    for (const conn of this.connections) {
      const partA = this.parts.find((p) => p.id === conn.a.partId);
      const partB = this.parts.find((p) => p.id === conn.b.partId);
      if (!partA || !partB) continue;
      const wp = new THREE.Vector3();
      partA.mesh.getObjectByName(conn.a.joint)?.getWorldPosition(wp);
      const r = Math.max(partA.def?.radius ?? 0.01, partB.def?.radius ?? 0.01);
      addPoint(wp, r);
    }

    for (const cluster of clusters) {
      if (cluster.points.length > 1) {
        cluster.center.set(0, 0, 0);
        for (const p of cluster.points) cluster.center.add(p);
        cluster.center.multiplyScalar(1 / cluster.points.length);
      }
      const coupler = createCouplerGroup(cluster.pipeRadius);
      const local = cluster.center.clone();
      this.group.worldToLocal(local);
      coupler.position.copy(local);
      this.jointHubGroup.add(coupler);
    }
  }

  /** World-space bar endpoints (joint centers) for export / analysis */
  getBarEndpointsWorld(part) {
    const ja = part.mesh.getObjectByName('jointA');
    const jb = part.mesh.getObjectByName('jointB');
    if (!ja || !jb) return null;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    ja.getWorldPosition(a);
    jb.getWorldPosition(b);
    return { a, b };
  }

  refreshAllGeometry(crankAngle = 0) {
    for (const leg of this.getJansenLegs()) {
      leg.updateKinematics?.(crankAngle);
    }
    this.updateConnectionConstraints();
    this.group.updateMatrixWorld(true);
  }

  updateConnectionConstraints() {
    for (const conn of this.connections) {
      const partA = this.parts.find((p) => p.id === conn.a.partId);
      const partB = this.parts.find((p) => p.id === conn.b.partId);
      if (!partA || !partB) continue;
      const ja = partA.mesh.getObjectByName(conn.a.joint);
      const jb = partB.mesh.getObjectByName(conn.b.joint);
      if (!ja || !jb) continue;
      const wp = new THREE.Vector3();
      jb.getWorldPosition(wp);
      const local = wp.clone();
      partA.mesh.worldToLocal(local);
      ja.position.copy(local);
    }
    this.refreshAllPartBars();
    this.updateJointVisibility();
    this.rebuildJointHubs();
  }

  serialize() {
    return {
      parts: this.parts.map((p) => {
        if (p.isKinematicLeg) {
          return {
            type: 'jansenLeg',
            id: p.id,
            position: p.mesh.position.toArray(),
            rotation: p.mesh.rotation.y,
            scale: p.scale,
          };
        }
        return {
          typeId: p.typeId,
          id: p.id,
          position: p.mesh.position.toArray(),
          rotation: p.mesh.rotation.y,
          customLengthMm: p.customLengthMm,
        };
      }),
      connections: this.connections,
    };
  }

  createPlacementGhost(typeId) {
    const def = PART_TYPES[typeId];
    if (!def || def.isJoint) return null;
    const ghost = this.createPartMesh(def, partSceneLength(def));
    ghost.traverse((c) => {
      if (c.isMesh && c.material) {
        c.material = c.material.clone();
        c.material.transparent = true;
        c.material.opacity = 0.4;
        c.material.depthWrite = false;
      }
    });
    this.ghostGroup.clear();
    this.ghostGroup.add(ghost);
    return ghost;
  }

  clearPlacementGhost() {
    this.ghostGroup.clear();
  }

  deserialize(data) {
    this.clear();
    if (!data?.parts) return;
    for (const p of data.parts) {
      if (p.type === 'jansenLeg') {
        const pos = new THREE.Vector3().fromArray(p.position);
        this.addJansenLeg(pos, p.rotation ?? 0, p.scale ?? 1);
      } else {
        const pos = new THREE.Vector3().fromArray(p.position);
        this.addPart(p.typeId, pos, p.rotation ?? 0, p.customLengthMm);
      }
    }
    this.connections = data.connections ?? [];
    this.refreshAllGeometry(0);
  }
}

