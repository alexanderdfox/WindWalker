const STORAGE_KEY = 'windwalker_museum';

export class Museum {
  constructor(builder) {
    this.builder = builder;
    this.entries = this.load();
  }

  load() {
    try {
      return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    } catch {
      return [];
    }
  }

  persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this.entries));
  }

  save(name, meta = {}) {
    const data = this.builder.serialize();
    const entry = {
      id: `beast_${Date.now()}`,
      name: name.trim() || 'Unnamed Strandbeest',
      savedAt: new Date().toISOString(),
      meta: {
        stability: meta.stability ?? 0,
        legCount: meta.legCount ?? 0,
        partCount: data.parts?.length ?? 0,
      },
      design: data,
    };
    this.entries.unshift(entry);
    if (this.entries.length > 24) this.entries.length = 24;
    this.persist();
    return entry;
  }

  remove(id) {
    this.entries = this.entries.filter((e) => e.id !== id);
    this.persist();
  }

  loadDesign(id) {
    const entry = this.entries.find((e) => e.id === id);
    if (entry) this.builder.deserialize(entry.design);
    return entry;
  }

  renderList(container, onLoad, onDelete) {
    container.innerHTML = '';
    if (!this.entries.length) {
      container.innerHTML = '<li class="muted">No creatures preserved yet. Walk with grace, then save.</li>';
      return;
    }
    for (const e of this.entries) {
      const li = document.createElement('li');
      const date = new Date(e.savedAt).toLocaleDateString();
      li.innerHTML = `
        <strong>${escapeHtml(e.name)}</strong>
        <div style="font-size:0.75rem;opacity:0.7;margin:0.25rem 0">${date} · ${e.meta.legCount} legs · ${Math.round((e.meta.stability || 0) * 100)}% grace</div>
        <button class="ghost load-btn" data-id="${e.id}" style="margin-right:0.35rem;font-size:0.75rem">Load</button>
        <button class="ghost delete-btn" data-id="${e.id}" style="font-size:0.75rem;color:var(--accent)">Release</button>
      `;
      li.querySelector('.load-btn').addEventListener('click', () => onLoad(e.id));
      li.querySelector('.delete-btn').addEventListener('click', () => {
        onDelete(e.id);
        this.remove(e.id);
        this.renderList(container, onLoad, onDelete);
      });
      container.appendChild(li);
    }
  }

  count() {
    return this.entries.length;
  }
}

function escapeHtml(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

