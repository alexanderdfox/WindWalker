export const CHALLENGES = [
  {
    id: 'first_joint',
    title: 'The First Pivot',
    description: 'Place any 3 parts and connect 2 joints together.',
    unlock: null,
    check: (ctx) => ctx.connectivity.partCount >= 3 && ctx.connectivity.connections >= 2,
  },
  {
    id: 'holy_crank',
    title: 'Breath of Rotation',
    description: 'Add a crankshaft and frame beam to your creation.',
    unlock: 'first_joint',
    check: (ctx) => ctx.connectivity.hasCrank && ctx.connectivity.hasFrame,
  },
  {
    id: 'single_leg',
    title: 'One Leg of Life',
    description: 'Place a complete Jansen leg kit and view linkage analysis.',
    unlock: 'holy_crank',
    check: (ctx) => ctx.connectivity.legCount >= 1,
  },
  {
    id: 'four_legs',
    title: 'Quadruped Dream',
    description: 'Build a 4-leg walker frame (quad kit or 4 Jansen legs).',
    unlock: 'single_leg',
    check: (ctx) => ctx.connectivity.legCount >= 4,
  },
  {
    id: 'first_walk',
    title: 'Summon the Wind',
    description: 'Make your creation walk 5 meters across the beach.',
    unlock: 'four_legs',
    check: (ctx) => ctx.walkDistance >= 5,
  },
  {
    id: 'grace',
    title: 'Grace Toward the Horizon',
    description: 'Achieve 70%+ foot-path quality and walk 10m gracefully.',
    unlock: 'first_walk',
    check: (ctx) => ctx.footScore >= 70 && ctx.walkDistance >= 10,
  },
  {
    id: 'sail',
    title: 'Wind Sail',
    description: 'Add a wind sail to your walker.',
    unlock: 'four_legs',
    check: (ctx) => ctx.hasSail,
  },
  {
    id: 'museum',
    title: 'Immortal in the Museum',
    description: 'Save a successful walker to the Museum of Life.',
    unlock: 'first_walk',
    check: (ctx) => ctx.museumSaves >= 1,
  },
];

const STORAGE_KEY = 'windwalker_challenges';

export class ChallengeManager {
  constructor() {
    this.completed = new Set(this.load());
    this.activeId = this.findNextActive();
    this.walkDistance = 0;
    this.walkStartX = null;
    this.footScore = 0;
    this.hasSail = false;
    this.museumSaves = 0;
  }

  load() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
      return [];
    }
  }

  save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...this.completed]));
  }

  isUnlocked(ch) {
    if (!ch.unlock) return true;
    return this.completed.has(ch.unlock);
  }

  findNextActive() {
    for (const ch of CHALLENGES) {
      if (!this.completed.has(ch.id) && this.isUnlocked(ch)) return ch.id;
    }
    return null;
  }

  getActive() {
    return CHALLENGES.find((c) => c.id === this.activeId);
  }

  updateContext(ctx) {
    this.footScore = ctx.footScore ?? 0;
    this.hasSail = ctx.hasSail ?? false;
    this.museumSaves = ctx.museumSaves ?? 0;
  }

  trackWalk(groupPos, simActive) {
    if (!simActive) {
      this.walkStartX = null;
      return this.walkDistance;
    }
    if (this.walkStartX == null) this.walkStartX = groupPos.x;
    this.walkDistance = Math.max(this.walkDistance, groupPos.x - this.walkStartX);
    return this.walkDistance;
  }

  evaluate(ctx) {
    const full = {
      connectivity: ctx.connectivity,
      walkDistance: this.walkDistance,
      footScore: ctx.footScore ?? 0,
      hasSail: ctx.hasSail ?? false,
      museumSaves: ctx.museumSaves ?? 0,
    };

    let newlyCompleted = null;
    for (const ch of CHALLENGES) {
      if (this.completed.has(ch.id)) continue;
      if (!this.isUnlocked(ch)) continue;
      if (ch.check(full)) {
        this.completed.add(ch.id);
        newlyCompleted = ch;
      }
    }
    if (newlyCompleted) {
      this.save();
      this.activeId = this.findNextActive();
    }
    return newlyCompleted;
  }

  renderList(container) {
    container.innerHTML = '';
    for (const ch of CHALLENGES) {
      const li = document.createElement('li');
      const unlocked = this.isUnlocked(ch);
      const done = this.completed.has(ch.id);
      const active = ch.id === this.activeId;
      if (!unlocked) li.classList.add('locked');
      if (done) li.classList.add('complete');
      if (active) li.classList.add('active');
      li.innerHTML = `
        <strong>${ch.title}</strong>
        ${done ? '<span class="challenge-badge"> ✓ Complete</span>' : ''}
        <p style="margin-top:0.35rem;font-size:0.8rem;opacity:0.8">${ch.description}</p>
      `;
      container.appendChild(li);
    }
  }

  progressPercent() {
    return (this.completed.size / CHALLENGES.length) * 100;
  }
}

