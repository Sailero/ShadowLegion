import type Phaser from 'phaser';

export type CombatAction = 'dash' | 'skill' | 'cycleSkill';

/** Preserve a short press until one combat tick, without buffering repeated actions. */
export class DiscreteActionInput {
  private pending = new Set<CombatAction>();
  private bindings: Array<{ key: Phaser.Input.Keyboard.Key; handler: (key: Phaser.Input.Keyboard.Key, event: KeyboardEvent) => void }> = [];
  private closed = false;

  constructor(private readonly canAccept: () => boolean) {}

  bind(action: CombatAction, key: Phaser.Input.Keyboard.Key): void {
    const handler = (_key: Phaser.Input.Keyboard.Key, event: KeyboardEvent) => {
      if (this.closed) return;
      if (!this.canAccept()) { this.clear(); return; }
      // Key.reset() can make an OS repeat look like a fresh Key down event.
      if (event.repeat) return;
      this.pending.add(action);
    };
    key.on('down', handler);
    this.bindings.push({ key, handler });
  }

  consume(action: CombatAction): boolean {
    if (this.closed || !this.canAccept()) { this.clear(); return false; }
    // Delete even when the action will fail its cooldown or charge check.
    return this.pending.delete(action);
  }

  clear(): void { this.pending.clear(); }

  destroy(): void {
    this.closed = true;
    this.clear();
    for (const { key, handler } of this.bindings) key.off('down', handler);
    this.bindings = [];
  }
}
