import type Phaser from 'phaser';

/** Simulation time stops during instructions, card choices and pause menus. */
export function getBattleTime(scene: Phaser.Scene): number {
  return (scene.data.get('battleTime') as number | undefined) ?? scene.time.now;
}
