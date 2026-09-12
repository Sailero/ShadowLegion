import type Phaser from 'phaser';
import { SKILLS, type SkillDef } from '../data/skills';

export const skillTexture = (id: string): string => `skill-emblem-${id}`;

/** Shared silhouettes for the satchel, draft cards, HUD and deployed helper. */
export function createSkillTextures(scene: Phaser.Scene): void {
  for (const skill of SKILLS) {
    const key = skillTexture(skill.id);
    if (scene.textures.exists(key)) continue;
    const g = scene.make.graphics({ x: 0, y: 0 });
    drawEmblem(g, skill);
    g.generateTexture(key, 96, 96);
    g.destroy();
  }
}

function drawEmblem(g: Phaser.GameObjects.Graphics, skill: SkillDef): void {
  const ink = 0x546448, cream = 0xfff5d8;
  g.fillStyle(cream, .96).fillCircle(48, 48, 43);
  g.lineStyle(2, skill.color, .65).strokeCircle(48, 48, 42);
  switch (skill.icon) {
    case 'flower':
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        g.fillStyle(i % 2 ? 0xe6a178 : 0xf0c277).fillCircle(48 + Math.cos(a) * 20, 48 + Math.sin(a) * 20, 12);
        g.lineStyle(2, 0xb77f52, .65).lineBetween(48 + Math.cos(a) * 33, 48 + Math.sin(a) * 33, 48 + Math.cos(a) * 37, 48 + Math.sin(a) * 37);
      }
      g.fillStyle(cream).fillCircle(48, 48, 14);
      g.fillStyle(0xc58a4c).fillCircle(48, 48, 8);
      break;
    case 'popcorn':
      for (let i = 0; i < 8; i++) {
        const a = i * Math.PI / 4;
        const x = 48 + Math.cos(a) * 27, y = 48 + Math.sin(a) * 27;
        g.fillStyle(0xb98058).fillCircle(x, y, 8);
        g.fillStyle(0xffe7aa).fillCircle(x - 2, y - 2, 7).fillCircle(x + 3, y - 2, 5);
        g.lineStyle(2, 0xb98058, .75).lineBetween(48 + Math.cos(a) * 13, 48 + Math.sin(a) * 13, 48 + Math.cos(a) * 17, 48 + Math.sin(a) * 17);
      }
      g.fillStyle(0xd99267).fillCircle(48, 48, 8);
      break;
    case 'tea':
      g.lineStyle(3, 0xa697b8, .7).strokeEllipse(48, 67, 63, 19);
      g.lineStyle(5, 0x877798).strokeCircle(70, 48, 10);
      g.fillStyle(0xb8aacb).fillRoundedRect(26, 34, 42, 29, { tl: 3, tr: 3, bl: 13, br: 13 });
      g.fillStyle(0xf3e2be).fillEllipse(47, 35, 38, 9);
      g.fillStyle(0xb28359).fillEllipse(47, 36, 29, 5);
      g.lineStyle(3, 0xa697b8, .85).lineBetween(39, 26, 43, 17).lineBetween(53, 26, 57, 17);
      g.fillStyle(cream).fillCircle(47, 49, 4);
      break;
    case 'bee':
      g.lineStyle(2, 0x789a8e).fillStyle(0xe5f3eb).fillEllipse(34, 30, 24, 28).strokeEllipse(34, 30, 24, 28);
      g.fillEllipse(62, 30, 24, 28).strokeEllipse(62, 30, 24, 28);
      g.fillStyle(0xe8bb69).fillRoundedRect(23, 37, 50, 32, 15);
      g.lineStyle(2, ink, .8).strokeRoundedRect(23, 37, 50, 32, 15);
      g.fillStyle(0x87734a).fillRoundedRect(37, 38, 6, 30, 3).fillRoundedRect(50, 38, 6, 30, 3);
      g.fillStyle(ink).fillCircle(64, 48, 2.8);
      g.fillStyle(0xdd947e).fillCircle(65, 56, 3.5);
      g.lineStyle(2, ink).lineBetween(66, 39, 69, 31);
      g.fillStyle(ink).fillCircle(69, 30, 2.5);
      break;
  }
}
