export function hashString(value = '') {
  let h = 2166136261 >>> 0;
  const text = String(value);
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h >>> 0;
}

export function makeSeed(parts = []) {
  const text = Array.isArray(parts) ? parts.join(':') : String(parts || 'spectreverse');
  return hashString(text) || 0x9e3779b9;
}

export class SeededPrng {
  constructor(seed = 0x9e3779b9) {
    this.initialSeed = Number(seed) >>> 0;
    this.state = this.initialSeed || 0x9e3779b9;
    this.count = 0;
  }

  next() {
    this.count += 1;
    let t = this.state += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  int(max = 1) {
    return Math.floor(this.next() * Math.max(1, Number(max) || 1));
  }

  range(min = 0, max = 1) {
    return min + (max - min) * this.next();
  }

  pick(items = []) {
    return items.length ? items[this.int(items.length)] : null;
  }

  fork(label = '') {
    return new SeededPrng(makeSeed([this.state, this.count, label]));
  }

  serialize() {
    return { initialSeed: this.initialSeed, state: this.state >>> 0, count: this.count };
  }

  hydrate(source = {}) {
    this.initialSeed = Number(source.initialSeed ?? source.seed ?? this.initialSeed) >>> 0;
    this.state = Number(source.state ?? this.initialSeed) >>> 0;
    this.count = Number(source.count || 0);
  }
}
