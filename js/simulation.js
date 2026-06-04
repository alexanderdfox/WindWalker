import * as THREE from 'three';
import { footPathQuality, solveJansenLeg } from './jansen.js';
import { PART_SCALE } from './parts.js';

export class WindSimulation {
  constructor(builder, beachScene) {
    this.builder = builder;
    this.beach = beachScene;
    this.active = false;
    this.time = 0;
    this.crankSpeed = 2.5;
    this.body = null;
    this.velocity = new THREE.Vector3();
    this.angularVelocity = 0;
    this.stability = 0.5;
    this.footGrounded = [];
    this.lastFootprint = 0;
  }

  start() {
    const score = this.evaluateGeometry();
    this.stability = score.stability;
    this.active = true;
    this.time = 0;
    this.velocity.set(0, 0, 0);

    if (!this.body) {
      this.body = new THREE.Group();
      this.body.name = 'simBody';
      this.beach.scene.add(this.body);
    }

    const legs = this.builder.getJansenLegs();
    if (legs.length === 0 && this.builder.parts.length > 0) {
      this.creatureGroup = this.builder.group;
    } else {
      this.creatureGroup = this.builder.group;
    }

    return score;
  }

  stop() {
    this.active = false;
    this.creatureGroup = null;
  }

  evaluateGeometry() {
    const legs = this.builder.getJansenLegs();
    const measured = this.builder.measureBuiltProportions();
    const quality = footPathQuality(1);
    const conn = this.builder.getConnectivityScore();

    let stability = 0.3;
    let message = 'The geometry whispers chaos…';

    if (legs.length >= 4) {
      const q = footPathQuality(legs[0]?.scale ?? 1);
      stability = (q.score / 100) * 0.85 + 0.1;
      if (q.score > 70) message = 'The holy numbers sing — it may stride with grace.';
      else if (q.score > 40) message = 'An uneven gait awaits — teach your links patience.';
      else message = 'The foot path stumbles — adjust thy proportions.';
    } else if (legs.length >= 1) {
      const q = footPathQuality(legs[0]?.scale ?? 1);
      stability = (q.score / 100) * 0.5 + legs.length * 0.08;
      message = 'One leg learns to walk; add three more for balance.';
    } else if (conn.connections >= 3 && conn.hasCrank) {
      stability = 0.25 + Math.min(0.35, conn.connections * 0.05);
      const devKeys = Object.keys(measured).length;
      if (devKeys >= 4) stability += 0.15;
      message = 'A tinkerer\'s walker — wind will test thy joints.';
    } else {
      stability = 0.1 + conn.partCount * 0.02;
      message = 'Too few bonds — the beast cannot stand against the wind.';
    }

    stability = Math.max(0.05, Math.min(0.98, stability));

    return {
      stability,
      message,
      legCount: legs.length,
      footQuality: quality,
      connectivity: conn,
    };
  }

  update(dt) {
    if (!this.active) return null;

    this.time += dt;
    const legs = this.builder.getJansenLegs();
    const crankAngle = this.time * this.crankSpeed;

    let avgFootY = 0;
    let grounded = 0;

    legs.forEach((leg, i) => {
      const phase = crankAngle + (i % 2) * Math.PI;
      leg.updateKinematics?.(phase);
      const solved = solveJansenLeg(phase, leg.scale ?? 1);
      if (solved) {
        const footY = solved.S[1] * PART_SCALE;
        avgFootY += footY;
        if (footY < 0.05) grounded++;
      }
    });

    if (legs.length) avgFootY /= legs.length;

    const group = this.builder.group;
    const wobble = (1 - this.stability) * 0.4;
    const chaos = (1 - this.stability) * 2;

    const forward = this.stability * 0.35 * dt;
    const stumbleX = Math.sin(this.time * 7 * chaos) * wobble * dt * 0.5;
    const stumbleZ = Math.cos(this.time * 5.3 * chaos) * wobble * dt * 0.4;
    const tumble = (1 - this.stability) > 0.6 && Math.sin(this.time * 3) > 0.85;

    if (tumble) {
      group.rotation.x += dt * 1.2 * chaos;
      group.rotation.z += dt * 0.8 * chaos;
      group.position.y = Math.max(0, group.position.y - dt * 0.5);
      if (group.position.y <= 0.01) {
        group.position.y = 0;
        group.rotation.x *= 0.98;
      }
    } else {
      group.rotation.x *= 0.95;
      group.rotation.z *= 0.95;
      group.position.y = 0;
      group.position.x += forward + stumbleX;
      group.position.z += stumbleZ * 0.3;
      group.rotation.y += stumbleX * 0.5;
    }

    if (this.stability > 0.55 && this.time - this.lastFootprint > 0.35 / this.stability) {
      const fp = group.position;
      this.beach.addFootprint(fp.x, fp.z);
      this.lastFootprint = this.time;
    }

    const windPct = Math.round(this.stability * 100);
    return {
      stability: this.stability,
      windPct,
      grounded,
      legCount: legs.length,
      collapsed: tumble && group.rotation.x > 0.8,
    };
  }
}

