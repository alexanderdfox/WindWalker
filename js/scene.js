import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class BeachScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.footprints = [];
    this.windParticles = null;
    this.init();
  }

  init() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      alpha: false,
    });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x7eb8da);
    this.scene.fog = new THREE.Fog(0x9ec9e0, 40, 120);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 200);
    this.camera.position.set(8, 5, 10);

    this.controls = new OrbitControls(this.camera, this.canvas);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.06;
    this.controls.maxPolarAngle = Math.PI / 2 - 0.05;
    this.controls.minDistance = 3;
    this.controls.maxDistance = 35;
    this.controls.target.set(0, 0.5, 0);

    this.buildLights();
    this.buildBeach();
    this.buildWind();
    this.buildSkyDecor();

    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);

    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  buildLights() {
    const hemi = new THREE.HemisphereLight(0xb8dff0, 0xe8d4a8, 0.85);
    this.scene.add(hemi);

    const sun = new THREE.DirectionalLight(0xfff4dc, 1.25);
    sun.position.set(12, 18, 8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 0.5;
    sun.shadow.camera.far = 50;
    const s = 18;
    sun.shadow.camera.left = -s;
    sun.shadow.camera.right = s;
    sun.shadow.camera.top = s;
    sun.shadow.camera.bottom = -s;
    sun.shadow.bias = -0.0002;
    this.scene.add(sun);
    this.sun = sun;
  }

  buildBeach() {
    const sandGeo = new THREE.PlaneGeometry(80, 80, 64, 64);
    const pos = sandGeo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const wave = Math.sin(x * 0.15) * 0.04 + Math.cos(z * 0.12) * 0.03;
      pos.setY(i, wave);
    }
    sandGeo.computeVertexNormals();

    const sandMat = new THREE.MeshStandardMaterial({
      color: 0xe8d4a8,
      roughness: 0.95,
      metalness: 0.02,
    });
    this.ground = new THREE.Mesh(sandGeo, sandMat);
    this.ground.rotation.x = -Math.PI / 2;
    this.ground.receiveShadow = true;
    this.ground.name = 'ground';
    this.scene.add(this.ground);

    const grid = new THREE.GridHelper(80, 40, 0xc9b07a, 0xdcc99e);
    grid.position.y = 0.01;
    grid.material.opacity = 0.25;
    grid.material.transparent = true;
    this.scene.add(grid);
  }

  buildWind() {
    const count = 400;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = [];

    for (let i = 0; i < count; i++) {
      positions[i * 3] = (Math.random() - 0.5) * 40;
      positions[i * 3 + 1] = Math.random() * 8 + 0.5;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 40;
      velocities.push({
        speed: 0.02 + Math.random() * 0.04,
        sway: Math.random() * Math.PI * 2,
      });
    }
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const mat = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.06,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
    });
    this.windParticles = new THREE.Points(geo, mat);
    this.windVelocities = velocities;
    this.scene.add(this.windParticles);
  }

  buildSkyDecor() {
    const cloudMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.5,
      roughness: 1,
    });
    for (let i = 0; i < 6; i++) {
      const g = new THREE.SphereGeometry(1.2 + Math.random(), 8, 8);
      const c = new THREE.Mesh(g, cloudMat);
      c.position.set((Math.random() - 0.5) * 50, 12 + Math.random() * 4, -15 - Math.random() * 20);
      c.scale.set(2 + Math.random() * 2, 0.6, 1.5);
      this.scene.add(c);
    }
  }

  updateWind(dt, windStrength = 0) {
    if (!this.windParticles) return;
    const pos = this.windParticles.geometry.attributes.position;
    const boost = 1 + windStrength * 2;
    for (let i = 0; i < this.windVelocities.length; i++) {
      const v = this.windVelocities[i];
      let x = pos.getX(i) + v.speed * boost;
      const y = pos.getY(i) + Math.sin(performance.now() * 0.001 + v.sway) * 0.002;
      let z = pos.getZ(i);
      if (x > 25) x = -25;
      pos.setXYZ(i, x, y, z);
    }
    pos.needsUpdate = true;
  }

  addFootprint(x, z) {
    const geo = new THREE.CircleGeometry(0.12, 12);
    const mat = new THREE.MeshStandardMaterial({
      color: 0xc9b07a,
      roughness: 1,
      transparent: true,
      opacity: 0.5,
    });
    const fp = new THREE.Mesh(geo, mat);
    fp.rotation.x = -Math.PI / 2;
    fp.position.set(x, 0.02, z);
    fp.rotation.z = Math.random() * Math.PI;
    this.scene.add(fp);
    this.footprints.push({ mesh: fp, age: 0 });
    if (this.footprints.length > 80) {
      const old = this.footprints.shift();
      this.scene.remove(old.mesh);
      old.mesh.geometry.dispose();
      old.mesh.material.dispose();
    }
  }

  updateFootprints(dt) {
    for (const fp of this.footprints) {
      fp.age += dt;
      fp.mesh.material.opacity = Math.max(0, 0.5 - fp.age * 0.08);
    }
  }

  getGroundPoint(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const target = new THREE.Vector3();
    this.raycaster.ray.intersectPlane(this.groundPlane, target);
    return target;
  }

  pickObjects(clientX, clientY, objects) {
    const rect = this.canvas.getBoundingClientRect();
    this.pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    this.pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    this.raycaster.setFromCamera(this.pointer, this.camera);
    return this.raycaster.intersectObjects(objects, true);
  }

  resize() {
    const parent = this.canvas.parentElement;
    const w = parent.clientWidth;
    const h = parent.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  render() {
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

