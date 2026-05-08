export class PersistentChildWorlds {
  constructor({ limit = 16 } = {}) {
    this.limit = limit;
    this.children = [];
  }

  considerPopulation(population = {}, world = {}, tick = 0) {
    const born = [];
    for (const child of population.children || []) {
      if ((child.fitness || 0) < 0.50 && (child.promoted || 0) < 1) continue;
      const id = `${world.runtime?.lineage?.worldId || 'world'}:${child.id}:${tick}`;
      if (this.children.some(item => item.id === id)) continue;
      const record = {
        id,
        archetype: child.id,
        bornAtTick: tick,
        fitness: Number(child.fitness || 0),
        promoted: child.promoted || 0,
        tested: child.tested || 0,
        status: 'forkable_seed',
        lineageHint: {
          parentWorldId: world.runtime?.lineage?.worldId || 'active',
          forkReason: `population_${child.id}`,
          generation: (world.runtime?.lineage?.generation || 0) + 1
        },
        best: (child.best || []).slice(0, 6)
      };
      this.children.unshift(record);
      born.push(record);
    }
    this.children = this.children.slice(0, this.limit);
    return born;
  }

  serialize() {
    return {
      count: this.children.length,
      children: this.children.slice(0, this.limit)
    };
  }
}
