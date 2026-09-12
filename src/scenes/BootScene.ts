import Phaser from 'phaser';
import { SpriteFactory } from '../utils/SpriteFactory';
import { SettingsManager } from '../systems/SettingsManager';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/gameConfig';
import { drawFlower, label, UI } from '../ui/theme';

export class BootScene extends Phaser.Scene {
  constructor() { super('BootScene'); }
  preload() {
    this.load.image('journey-keyart', './art/journey-keyart.jpg');
    this.load.image('garden-atlas', './art/garden-atlas.png');
    this.load.image('terrain-atlas', './art/terrain-atlas.jpg');
  }
  create() {
    SpriteFactory.createAll(this);
    this.cameras.main.setBackgroundColor(UI.paper);
    drawFlower(this.add.graphics(), GAME_WIDTH / 2, GAME_HEIGHT / 2 - 73, 25, UI.amber);
    label(this, GAME_WIDTH / 2, GAME_HEIGHT / 2, '暖影同行', 39, UI.ink, true).setOrigin(0.5);
    label(this, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 48, 'SUNLIT ECHOES', 13, UI.green, true).setLetterSpacing(4).setOrigin(0.5);
    this.time.delayedCall(SettingsManager.get().reducedMotion ? 50 : 380, () => this.scene.start('MenuScene'));
  }
}
