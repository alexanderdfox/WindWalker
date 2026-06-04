import { BeachScene } from './scene.js';
import { StrandbeestBuilder } from './builder.js';
import { WindSimulation } from './simulation.js';
import { Museum } from './museum.js';
import { ChallengeManager } from './challenges.js';
import {
  buildPaletteItems, buildKitItems,
} from './parts.js';
import {
  analyzeProportions, footPathQuality, sampleFootPath, HOLY,
} from './jansen.js';
import { exportSTL, exportDXF } from './export.js';
import * as THREE from 'three';

// --- DOM ---
const intro = document.getElementById('intro');
const app = document.getElementById('app');
const canvas = document.getElementById('canvas');
const partList = document.getElementById('part-list');
const kitList = document.getElementById('kit-list');
const toast = document.getElementById('toast');
const analysisPanel = document.getElementById('analysis-panel');
const analysisContent = document.getElementById('analysis-content');
const footpathCanvas = document.getElementById('footpath-canvas');
const windValue = document.getElementById('wind-value');
const modeLabel = document.getElementById('mode-label');
const btnWind = document.getElementById('btn-wind');
const btnAnalysis = document.getElementById('btn-analysis');
const saveForm = document.getElementById('save-form');
const challengePanel = document.getElementById('challenge-panel');
const challengeTitle = document.getElementById('challenge-title');
const challengeDesc = document.getElementById('challenge-desc');
const challengeProgress = document.getElementById('challenge-progress');

let beach, builder, sim, museum, challenges;
let tool = 'move';
let analysisOn = false;
let dragState = null;
let jointDrag = null;
let placement = null;
let selectedPaletteEl = null;
let connectLine = null;
let lastWalkGrace = 0;

document.getElementById('begin-btn').addEventListener('click', () => {
  intro.classList.remove('visible');
  setTimeout(() => {
    intro.classList.add('hidden');
    app.classList.remove('hidden');
    initGame();
  }, 600);
});

function initGame() {
  beach = new BeachScene(canvas);
  builder = new StrandbeestBuilder(beach);
  sim = new WindSimulation(builder, beach);
  museum = new Museum(builder);
  challenges = new ChallengeManager();

  buildPalette();
  bindUI();
  bindPointer();
  bindKeyboard();
  updateChallengeUI();
  loop();

  spawnKit('quadFrame', new THREE.Vector3(0, 0, 0));
  showToast('Starter walker ready — Summon Wind, or click parts to customize.');
}

function buildPalette() {
  for (const k of buildKitItems()) {
    kitList.appendChild(makeKitEl(k));
  }

  for (const p of buildPaletteItems()) {
    const el = document.createElement('div');
    el.className = 'part-item';
    el.draggable = true;
    el.dataset.typeId = p.id;
    el.innerHTML = `
      <span class="part-swatch ${p.isJoint ? 'joint' : ''}" style="background:#${(p.color >>> 0).toString(16).padStart(6, '0')}"></span>
      <span>${p.name}</span>
    `;
    el.addEventListener('click', () => selectPlacement({ typeId: p.id }, el));
    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('typeId', p.id);
      selectPlacement({ typeId: p.id }, el);
    });
    partList.appendChild(el);
  }
}

function makeKitEl(k) {
  const el = document.createElement('div');
  el.className = 'kit-item';
  el.draggable = true;
  el.dataset.kitId = k.id;
  el.innerHTML = `<span>⚙</span><span><strong>${k.name}</strong><br/><small>${k.description}</small></span>`;
  el.addEventListener('click', () => selectPlacement({ kitId: k.id }, el));
  el.addEventListener('dragstart', (e) => {
    e.dataTransfer.setData('kitId', k.id);
    selectPlacement({ kitId: k.id }, el);
  });
  return el;
}

function selectPlacement(spec, el) {
  placement = { ...spec, rotation: placement?.rotation ?? 0 };
  if (selectedPaletteEl) selectedPaletteEl.classList.remove('selected');
  selectedPaletteEl = el;
  if (el) el.classList.add('selected');

  builder.clearPlacementGhost();
  if (spec.typeId) builder.createPlacementGhost(spec.typeId);

  const hint = document.getElementById('placement-hint');
  const label = spec.kitId ? 'kit' : spec.typeId;
  hint.classList.remove('hidden');
  hint.textContent = `Click sand to place · Q/E rotate · Esc cancel`;
  modeLabel.textContent = `Placing ${label}`;
}

function clearPlacement() {
  placement = null;
  if (selectedPaletteEl) selectedPaletteEl.classList.remove('selected');
  selectedPaletteEl = null;
  builder.clearPlacementGhost();
  document.getElementById('placement-hint').classList.add('hidden');
  modeLabel.textContent = tool === 'delete' ? 'Remove — click a part' : 'Move — drag parts & joints';
}

function placeAtGround(clientX, clientY) {
  const pt = beach.getGroundPoint(clientX, clientY);
  if (!pt || !placement) return false;
  builder.snapToGrid(pt);
  if (placement.kitId) {
    spawnKit(placement.kitId, pt);
  } else if (placement.typeId) {
    const part = builder.addPart(placement.typeId, pt, placement.rotation);
    if (part) {
      builder.snapPartToJoint(part, pt);
      builder.autoConnectAllNearby(part);
    }
  }
  refreshUI();
  return true;
}

function bindUI() {
  document.getElementById('btn-quick-build').addEventListener('click', () => {
    if (sim.active) toggleWind();
    spawnKit('quadFrame', new THREE.Vector3(0, 0, 0));
    showToast('4-leg walker spawned at center.');
    refreshUI();
  });

  document.getElementById('btn-move').addEventListener('click', () => setTool('move'));
  document.getElementById('btn-delete').addEventListener('click', () => setTool('delete'));
  document.getElementById('btn-clear').addEventListener('click', () => {
    if (sim.active) toggleWind();
    builder.clear();
    refreshUI();
  });

  document.getElementById('btn-export-stl').addEventListener('click', () => {
    try {
      const crankAngle = sim?.active ? sim.time * sim.crankSpeed : 0;
      exportSTL(builder, undefined, { crankAngle });
      showToast('STL downloaded — units: millimeters');
    } catch (e) {
      showToast(e.message || 'Export failed');
    }
  });

  document.getElementById('btn-export-dxf').addEventListener('click', () => {
    try {
      const crankAngle = sim?.active ? sim.time * sim.crankSpeed : 0;
      exportDXF(builder, { crankAngle });
      showToast('DXF downloaded — top view + leg plans (mm)');
    } catch (e) {
      showToast(e.message || 'Export failed');
    }
  });

  btnWind.addEventListener('click', toggleWind);
  btnAnalysis.addEventListener('click', () => {
    analysisOn = !analysisOn;
    btnAnalysis.classList.toggle('active', analysisOn);
    analysisPanel.classList.toggle('hidden', !analysisOn);
    updateAnalysis();
  });

  document.getElementById('btn-museum').addEventListener('click', () => {
    document.getElementById('museum-panel').classList.remove('hidden');
    refreshMuseum();
  });
  document.getElementById('close-museum').addEventListener('click', () => {
    document.getElementById('museum-panel').classList.add('hidden');
  });

  document.getElementById('btn-challenges').addEventListener('click', () => {
    document.getElementById('challenges-side').classList.remove('hidden');
    challenges.renderList(document.getElementById('challenges-list'));
  });
  document.getElementById('close-challenges').addEventListener('click', () => {
    document.getElementById('challenges-side').classList.add('hidden');
  });

  saveForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('beast-name').value;
    const score = sim.evaluateGeometry();
    museum.save(name, {
      stability: score.stability,
      legCount: score.legCount,
    });
    challenges.museumSaves = museum.count();
    checkChallenges();
    showToast(`"${name || 'Strandbeest'}" lives forever in the Museum.`);
    saveForm.classList.add('hidden');
    refreshMuseum();
  });

  canvas.addEventListener('dragover', (e) => e.preventDefault());
  canvas.addEventListener('drop', onDrop);
}

function setTool(t) {
  tool = t;
  builder.tool = t;
  builder.connectFrom = null;
  document.querySelectorAll('.tool').forEach((b) => b.classList.remove('active'));
  document.getElementById(t === 'delete' ? 'btn-delete' : 'btn-move').classList.add('active');
  if (t === 'delete') clearPlacement();
  modeLabel.textContent = t === 'delete' ? 'Remove — click a part' : 'Move — drag parts & joints';
}

function bindKeyboard() {
  window.addEventListener('keydown', (e) => {
    if (e.target.matches('input')) return;
    if (e.key === 'Escape') clearPlacement();
    if (!placement) return;
    const step = e.shiftKey ? Math.PI / 2 : Math.PI / 12;
    if (e.key === 'q' || e.key === 'Q') {
      placement.rotation -= step;
      updatePlacementGhost();
    }
    if (e.key === 'e' || e.key === 'E') {
      placement.rotation += step;
      updatePlacementGhost();
    }
  });
}

function updatePlacementGhost() {
  if (!placement?.typeId) return;
  builder.createPlacementGhost(placement.typeId);
  const ghost = builder.ghostGroup.children[0];
  if (ghost) ghost.rotation.y = placement.rotation;
}

function ensureConnectLine() {
  if (connectLine) return;
  const geo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(),
    new THREE.Vector3(0, 1, 0),
  ]);
  connectLine = new THREE.Line(
    geo,
    new THREE.LineBasicMaterial({ color: 0x3a8f5c, linewidth: 2, depthTest: false })
  );
  connectLine.frustumCulled = false;
  beach.scene.add(connectLine);
}

function setConnectLineVisible(from, to) {
  if (!from || !to) {
    if (connectLine) connectLine.visible = false;
    return;
  }
  ensureConnectLine();
  connectLine.geometry.setFromPoints([from.clone(), to.clone()]);
  connectLine.visible = true;
}

function pickJointFromHits(hits) {
  for (const hit of hits) {
    let obj = hit.object;
    while (obj) {
      if (obj.userData.isJoint) {
        const root = obj.parent?.userData?.partId
          ? obj.parent
          : obj.parent?.parent;
        const partId = root?.userData?.partId;
        const p = builder.parts.find((x) => x.id === partId);
        if (p && !p.isKinematicLeg) return { part: p, jointName: obj.name, mesh: obj };
      }
      obj = obj.parent;
    }
  }
  return null;
}

function bindPointer() {
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointerleave', onPointerUp);
}

function onDrop(e) {
  e.preventDefault();
  placeAtGround(e.clientX, e.clientY);
}

function spawnKit(kitId, position) {
  switch (kitId) {
    case 'jansenLeg':
      builder.addJansenLeg(position, 0, 1);
      showToast('A complete Jansen leg — the thirteen holy numbers, alive.');
      break;
    case 'crankPair':
      builder.addCrankPair(position);
      showToast('Dual cranks phased for walking rhythm.');
      break;
    case 'quadFrame':
      builder.addQuadWalker(position);
      showToast('Four legs and frame — summon the wind when ready.');
      break;
    default:
      break;
  }
}

function onPointerDown(e) {
  if (e.button !== 0) return;

  const jointPickables = [];
  builder.forEachJoint((j) => jointPickables.push(j.mesh));
  const jointHits = beach.pickObjects(e.clientX, e.clientY, jointPickables);
  const joint = pickJointFromHits(jointHits);

  const hits = beach.pickObjects(e.clientX, e.clientY, builder.getAllPickables());
  const part = builder.pickPart(hits);

  if (tool === 'delete') {
    if (part) {
      builder.removePart(part);
      refreshUI();
    }
    return;
  }

  if (joint && !part?.isKinematicLeg) {
    const wp = new THREE.Vector3();
    joint.mesh.getWorldPosition(wp);
    jointDrag = { ...joint, startWorld: wp.clone() };
    beach.controls.enabled = false;
    return;
  }

  if (part) {
    beach.controls.enabled = false;
    dragState = { part, offset: new THREE.Vector3(), isLeg: part.isKinematicLeg };
    const ground = beach.getGroundPoint(e.clientX, e.clientY);
    dragState.offset.subVectors(part.mesh.position, ground);
    builder.selected = part;
    return;
  }

  if (placement) {
    placeAtGround(e.clientX, e.clientY);
    return;
  }

  beach.controls.enabled = true;
}

function onPointerMove(e) {
  const ground = beach.getGroundPoint(e.clientX, e.clientY);

  if (placement && !dragState && !jointDrag && ground) {
    builder.snapToGrid(ground);
    const ghost = builder.ghostGroup.children[0];
    if (ghost) {
      ghost.position.copy(ground);
      ghost.rotation.y = placement.rotation;
      const snap = builder.findNearestJoint(ground, null, 0.35);
      builder.showSnapMarker(snap?.world ?? null);
    } else if (placement.kitId) {
      builder.showSnapMarker(ground);
    }
  }

  if (jointDrag && ground) {
    const cursor = ground.clone();
    cursor.y = jointDrag.startWorld.y;
    setConnectLineVisible(jointDrag.startWorld, cursor);
    const near = builder.findNearestJoint(cursor, jointDrag.part.id);
    const hoverMesh = near ? near.part.mesh.getObjectByName(near.jointName) : null;
    builder.setHoveredJoint(hoverMesh ? { mesh: hoverMesh } : null);
    if (near) builder.showSnapMarker(near.world);
    else builder.hideSnapMarker();
    return;
  }

  if (dragState && ground) {
    beach.controls.enabled = false;
    dragState.part.mesh.position.copy(ground).add(dragState.offset);
    builder.snapToGrid(dragState.part.mesh.position);
    dragState.part.mesh.position.y = Math.max(0, dragState.part.mesh.position.y);

    if (dragState.isLeg) {
      builder.hideSnapMarker();
      return;
    }

    let snapPt = null;
    for (const jn of ['jointA', 'jointB']) {
      const j = dragState.part.mesh.getObjectByName(jn);
      if (!j) continue;
      const jw = new THREE.Vector3();
      j.getWorldPosition(jw);
      const snap = builder.findNearestJoint(jw, dragState.part.id);
      if (snap) {
        const delta = snap.world.clone().sub(jw);
        dragState.part.mesh.position.add(delta);
        snapPt = snap.world;
        break;
      }
    }
    builder.showSnapMarker(snapPt);
    return;
  }

  if (!dragState && !jointDrag && tool === 'move') {
    const jointPickables = [];
    builder.forEachJoint((j) => jointPickables.push(j.mesh));
    const jh = beach.pickObjects(e.clientX, e.clientY, jointPickables);
    const hov = pickJointFromHits(jh);
    builder.setHoveredJoint(hov ? { mesh: hov.mesh } : null);
  }
}

function onPointerUp(e) {
  if (jointDrag) {
    const ground = beach.getGroundPoint(e.clientX, e.clientY);
    if (ground) {
      const cursor = ground.clone();
      cursor.y = jointDrag.startWorld.y;
      const near = builder.findNearestJoint(cursor, jointDrag.part.id);
      if (near) {
        const ok = builder.connectJoints(
          jointDrag.part,
          jointDrag.jointName,
          near.part,
          near.jointName
        );
        if (ok) showToast('Joints connected.');
      }
    }
    jointDrag = null;
    setConnectLineVisible(null, null);
    builder.setHoveredJoint(null);
    builder.hideSnapMarker();
    builder.updateConnectionConstraints();
    refreshUI();
  }

  if (dragState) {
    const n = builder.autoConnectAllNearby(dragState.part);
    builder.updateConnectionConstraints();
    if (n > 0) showToast(`Snapped — ${n} joint${n > 1 ? 's' : ''} connected.`);
    dragState = null;
    builder.hideSnapMarker();
    refreshUI();
  }

  beach.controls.enabled = true;
}

function toggleWind() {
  if (sim.active) {
    sim.stop();
    btnWind.classList.remove('active');
    btnWind.textContent = 'Summon Wind';
    modeLabel.textContent = 'Move — drag parts & joints';
    beach.controls.enabled = true;
  } else {
    const score = sim.start();
    btnWind.classList.add('active');
    btnWind.textContent = 'Still the Wind';
    modeLabel.textContent = 'Wind Walk';
    showToast(score.message);
    lastWalkGrace = score.stability;
    if (score.stability > 0.5) {
      saveForm.classList.remove('hidden');
    }
  }
  refreshUI();
}

function refreshUI() {
  const conn = builder.getConnectivityScore();
  btnWind.disabled = !conn.ready && builder.getJansenLegs().length === 0;

  const hasSail = builder.parts.some((p) => p.typeId === 'sail');
  challenges.hasSail = hasSail;
  challenges.museumSaves = museum.count();

  const legs = builder.getJansenLegs();
  if (legs.length) {
    const q = footPathQuality(legs[0].scale ?? 1);
    challenges.footScore = q.score;
  }

  checkChallenges();
  updateChallengeUI();
  if (analysisOn) updateAnalysis();
}

function checkChallenges() {
  const conn = builder.getConnectivityScore();
  const dist = challenges.trackWalk(builder.group.position, sim.active);
  const newly = challenges.evaluate({
    connectivity: conn,
    footScore: challenges.footScore,
    hasSail: builder.parts.some((p) => p.typeId === 'sail'),
    museumSaves: museum.count(),
  });
  if (newly) showToast(`Challenge complete: ${newly.title}`);
}

function updateChallengeUI() {
  const active = challenges.getActive();
  if (active) {
    challengePanel.classList.remove('hidden');
    challengeTitle.textContent = active.title;
    challengeDesc.textContent = active.description;
  } else {
    challengePanel.classList.add('hidden');
  }
  challengeProgress.style.width = `${challenges.progressPercent()}%`;
}

function updateAnalysis() {
  const legs = builder.getJansenLegs();
  const measured = builder.measureBuiltProportions();
  const scale = legs[0]?.scale ?? 1;

  let html = '';
  if (legs.length) {
    const analysis = analyzeProportions(
      Object.fromEntries(
        Object.entries(HOLY).map(([k, v]) => [k, v * scale])
      ),
      scale
    );
    const q = footPathQuality(scale);
    html += `<p>Foot-path quality: <strong>${q.score.toFixed(0)}%</strong></p>`;
    html += `<p class="muted">Flatness ${q.flatness.toFixed(2)} · ${q.closed ? 'Closed loop ✓' : 'Open path'}</p>`;
    drawFootPath(scale);
  }

  if (Object.keys(measured).length) {
    html += '<p style="margin-top:0.5rem">Your placed bars vs holy numbers:</p>';
    for (const [key, mm] of Object.entries(measured)) {
      const expected = HOLY[key];
      const dev = Math.abs(mm - expected) / expected * 100;
      const cls = dev < 3 ? 'good' : 'bad';
      html += `<div class="metric ${cls}"><span>${key}</span><span>${dev.toFixed(1)}% off</span></div>`;
    }
  }

  if (!html) {
    html = '<p class="muted">Place a Jansen leg kit or holy-number bars to analyze linkage geometry.</p>';
  }

  analysisContent.innerHTML = html;
}

function drawFootPath(scale) {
  const ctx = footpathCanvas.getContext('2d');
  const w = footpathCanvas.width;
  const h = footpathCanvas.height;
  ctx.fillStyle = '#faf8f2';
  ctx.fillRect(0, 0, w, h);

  const path = sampleFootPath(72, scale);
  if (path.length < 2) return;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of path) {
    minX = Math.min(minX, p[0]);
    maxX = Math.max(maxX, p[0]);
    minY = Math.min(minY, p[1]);
    maxY = Math.max(maxY, p[1]);
  }
  const pad = 10;
  const sx = (w - pad * 2) / (maxX - minX || 1);
  const sy = (h - pad * 2) / (maxY - minY || 1);
  const s = Math.min(sx, sy);

  ctx.strokeStyle = '#4a90b8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  path.forEach((p, i) => {
    const x = pad + (p[0] - minX) * s;
    const y = h - pad - (p[1] - minY) * s;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.stroke();

  ctx.fillStyle = '#c45c26';
  const groundY = minY + (maxY - minY) * 0.15;
  path.filter((p) => p[1] <= groundY).forEach((p) => {
    const x = pad + (p[0] - minX) * s;
    const y = h - pad - (p[1] - minY) * s;
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fill();
  });
}

function refreshMuseum() {
  museum.renderList(
    document.getElementById('museum-list'),
    (id) => {
      if (sim.active) toggleWind();
      museum.loadDesign(id);
      refreshUI();
      showToast('Creature awakened from the Museum.');
      document.getElementById('museum-panel').classList.add('hidden');
    },
    () => {}
  );
}

function showToast(msg) {
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(showToast._t);
  showToast._t = setTimeout(() => toast.classList.remove('show'), 3200);
}

let lastTime = performance.now();
function loop() {
  requestAnimationFrame(loop);
  const now = performance.now();
  const dt = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  let windPct = 0;
  if (sim.active) {
    const state = sim.update(dt);
    windPct = state?.windPct ?? 0;
    if (state?.collapsed) {
      showToast('The linkage surrenders to chaos — refine thy holy numbers.');
      toggleWind();
    }
    checkChallenges();
  }

  builder.updateConnectionConstraints();

  beach.updateWind(dt, sim.active ? windPct / 100 : 0);
  beach.updateFootprints(dt);
  windValue.textContent = sim.active ? windPct : '0';
  beach.render();
}
