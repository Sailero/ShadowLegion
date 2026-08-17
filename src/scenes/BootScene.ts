import Phaser from 'phaser';
import { SpriteFactory } from '../utils/SpriteFactory';
import { COLORS, GAME_WIDTH, GAME_HEIGHT } from '../config/gameConfig';

export class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }

  create() {
    SpriteFactory.createAll(this);

    const bg = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, COLORS.bg);
    const title = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 24, 'SHADOW LEGION', {
      fontSize: '48px', fontFamily: 'Arial', fontStyle: 'bold', color: '#fbbf24',
      stroke: '#000', strokeThickness: 4,
    }).setOrigin(0.5).setAlpha(0);

    const sub = this.add.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 36, '暗影军团', {
      fontSize: '22px', fontFamily: 'Arial', color: '#9ca3af',
    }).setOrigin(0.5).setAlpha(0);

    this.tweens.add({
      targets: [title, sub],
      alpha: 1,
      duration: 600,
      onComplete: () => {
        this.tweens.add({
          targets: [title, sub, bg],
          alpha: 0,
          delay: 800,
          duration: 400,
          onComplete: () => this.scene.start('MenuScene'),
        });
      },
    });
  }
}
