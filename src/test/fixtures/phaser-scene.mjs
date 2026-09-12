import phaser from './phaser-math.mjs';

// A constructor boundary for calling actual scene lifecycle methods in Node.
// This does not simulate rendering, input, physics or Phaser's scene manager.
export default { ...phaser, Scene: class {} };
