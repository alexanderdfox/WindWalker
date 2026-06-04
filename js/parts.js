import { HOLY, HOLY_KEYS } from './jansen.js';

/** Scale for workshop (mm → scene units) */
export const PART_SCALE = 0.008;

export const PART_TYPES = {
  femur: {
    id: 'femur',
    name: 'Femur (link c)',
    holyKey: 'c',
    length: HOLY.c,
    radius: 0.012,
    color: 0xf2e6b8,
    joints: ['a', 'b'],
  },
  tibia: {
    id: 'tibia',
    name: 'Tibia (link f)',
    holyKey: 'f',
    length: HOLY.f,
    radius: 0.011,
    color: 0xf0e2b0,
    joints: ['a', 'b'],
  },
  upperRod: {
    id: 'upperRod',
    name: 'Upper rod (link e)',
    holyKey: 'e',
    length: HOLY.e,
    radius: 0.011,
    color: 0xf2e6b8,
    joints: ['a', 'b'],
  },
  coupler: {
    id: 'coupler',
    name: 'Coupler (link b)',
    holyKey: 'b',
    length: HOLY.b,
    radius: 0.01,
    color: 0xeee0b4,
    joints: ['a', 'b'],
  },
  crank: {
    id: 'crank',
    name: 'Crankshaft (m)',
    holyKey: 'm',
    length: HOLY.m,
    radius: 0.014,
    color: 0xe8dcc0,
    joints: ['pivot', 'tip'],
    isCrank: true,
  },
  backbone: {
    id: 'backbone',
    name: 'Backbone (a)',
    holyKey: 'a',
    length: HOLY.a,
    radius: 0.013,
    color: 0xf2e6b8,
    joints: ['a', 'b'],
  },
  hipStrut: {
    id: 'hipStrut',
    name: 'Hip strut (d)',
    holyKey: 'd',
    length: HOLY.d,
    radius: 0.01,
    color: 0xeee0b4,
    joints: ['a', 'b'],
  },
  ankle: {
    id: 'ankle',
    name: 'Ankle link (h)',
    holyKey: 'h',
    length: HOLY.h,
    radius: 0.01,
    color: 0xf0e2b0,
    joints: ['a', 'b'],
  },
  footRod: {
    id: 'footRod',
    name: 'Foot rod (i)',
    holyKey: 'i',
    length: HOLY.i,
    radius: 0.009,
    color: 0xeee0b4,
    joints: ['a', 'b'],
  },
  kneeJoint: {
    id: 'kneeJoint',
    name: 'Knee joint',
    holyKey: null,
    length: 0,
    radius: 0.018,
    color: 0xd4c9a0,
    isJoint: true,
    joints: ['hub'],
  },
  hipJoint: {
    id: 'hipJoint',
    name: 'Hip joint',
    holyKey: null,
    length: 0,
    radius: 0.02,
    color: 0xc9b07a,
    isJoint: true,
    joints: ['hub'],
  },
  axle: {
    id: 'axle',
    name: 'Axle / pivot',
    holyKey: null,
    length: 0,
    radius: 0.016,
    color: 0xb8a88a,
    isJoint: true,
    joints: ['hub'],
  },
  frame: {
    id: 'frame',
    name: 'Frame beam',
    holyKey: null,
    length: 80,
    radius: 0.016,
    color: 0xe0d6bc,
    joints: ['a', 'b'],
  },
  sail: {
    id: 'sail',
    name: 'Wind sail',
    holyKey: null,
    length: 0,
    radius: 0,
    color: 0xffffff,
    isSail: true,
    joints: ['base'],
  },
  connector: {
    id: 'connector',
    name: 'Tie rod (custom)',
    holyKey: null,
    length: 40,
    radius: 0.008,
    color: 0xeee0b4,
    joints: ['a', 'b'],
    customLength: true,
  },
};

export const LEG_KITS = {
  jansenLeg: {
    id: 'jansenLeg',
    name: 'Complete Jansen leg',
    description: '13-link holy proportions, one DOF',
    scale: PART_SCALE * 1000,
  },
  crankPair: {
    id: 'crankPair',
    name: 'Dual crank + spine',
    description: '180° phased cranks on frame',
    scale: PART_SCALE * 1000,
  },
  quadFrame: {
    id: 'quadFrame',
    name: '4-leg walker frame',
    description: 'Frame + 4 Jansen legs',
    scale: PART_SCALE * 1000,
  },
};

export function holyLength(key, scale = 1) {
  return (HOLY[key] ?? 0) * scale;
}

export function partSceneLength(partDef, customScale = 1) {
  const mm = partDef.length * customScale;
  return mm * PART_SCALE;
}

export function buildPaletteItems() {
  return Object.values(PART_TYPES);
}

export function buildKitItems() {
  return Object.values(LEG_KITS);
}

/** Map Jansen edge to part type for analysis */
export const EDGE_TO_HOLY = {
  'Z-Y': 'a', 'Z-X': 'm', 'X-W': 'j', 'W-Y': 'b', 'W-V': 'e',
  'Y-V': 'd', 'X-U': 'k', 'Y-U': 'c', 'U-T': 'g', 'V-T': 'f',
  'U-S': 'i', 'T-S': 'h',
};

export function getHolyForPart(partTypeId) {
  const p = PART_TYPES[partTypeId];
  return p?.holyKey ?? null;
}

export function listHolyParts() {
  return HOLY_KEYS.map((k) => ({ key: k, value: HOLY[k] }));
}
