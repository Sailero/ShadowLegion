// Minimal entity-method test boundary: no renderer, world, input or real Scene.
// This cannot establish that Phaser integration or browser behavior works.
class Sprite {
  setActive(value) { this.active = value; return this; }
  setVisible(value) { this.visible = value; return this; }
  destroy() { this.active = false; this.scene = undefined; this.body = undefined; }
}
export default {
  Physics: { Arcade: { Sprite } },
  Utils: { Array: { Shuffle: items => items.reverse() } },
  Math: {
    Angle: { Between: (x1, y1, x2, y2) => Math.atan2(y2 - y1, x2 - x1) },
    Distance: { Between: (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1) },
    Clamp: (value, min, max) => Math.max(min, Math.min(max, value)),
  },
};
