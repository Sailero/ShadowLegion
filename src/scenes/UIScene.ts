import Phaser from 'phaser';
import { GAME_CONFIG, UnitType } from '../config/gameConfig';
import { GameScene } from './GameScene';

export class UIScene extends Phaser.Scene {
  private gameScene!: GameScene;
  private phaseText!: Phaser.GameObjects.Text;
  private turnText!: Phaser.GameObjects.Text;
  private energyText!: Phaser.GameObjects.Text;
  private infoText!: Phaser.GameObjects.Text;
  private aiStatusText!: Phaser.GameObjects.Text;
  private deployButtons: Phaser.GameObjects.Container[] = [];

  constructor() {
    super({ key: 'UIScene' });
  }

  init(data: { gameScene: GameScene }): void {
    this.gameScene = data.gameScene;
  }

  create(): void {
    const { width, height } = this.cameras.main;

    this.createTopBar(width);
    this.createSidePanel(width, height);
    this.createBottomBar(width, height);

    const gs = this.gameScene;
    gs.events.on('phaseChanged', () => this.updateUI());
    gs.events.on('resourceChanged', () => this.updateUI());
    gs.events.on('aiThinking', (thinking: boolean) => {
      this.aiStatusText.setText(thinking ? 'AI 思考中...' : '');
      this.aiStatusText.setVisible(thinking);
    });

    this.updateUI();
  }

  private createTopBar(width: number): void {
    const barBg = this.add.graphics();
    barBg.fillStyle(0x0d1520, 0.9);
    barBg.fillRect(0, 0, width, 44);
    barBg.lineStyle(1, 0x2a3a4a, 1);
    barBg.lineBetween(0, 44, width, 44);

    this.turnText = this.add.text(16, 12, '', {
      fontSize: '16px',
      fontFamily: 'Microsoft YaHei, sans-serif',
      color: '#ccddee',
    });

    this.phaseText = this.add.text(150, 12, '', {
      fontSize: '16px',
      fontFamily: 'Microsoft YaHei, sans-serif',
      color: '#4a9eff',
    });

    this.energyText = this.add.text(350, 12, '', {
      fontSize: '16px',
      fontFamily: 'Microsoft YaHei, sans-serif',
      color: '#ffdd44',
    });

    this.aiStatusText = this.add.text(width / 2, 12, '', {
      fontSize: '16px',
      fontFamily: 'Microsoft YaHei, sans-serif',
      color: '#ff8844',
    }).setOrigin(0.5, 0).setVisible(false);
  }

  private createSidePanel(width: number, height: number): void {
    const panelX = width - 160;
    const panelW = 155;
    const panelH = 380;
    const panelY = 55;

    const bg = this.add.graphics();
    bg.fillStyle(0x0d1520, 0.85);
    bg.fillRoundedRect(panelX, panelY, panelW, panelH, 8);
    bg.lineStyle(1, 0x2a3a4a, 0.8);
    bg.strokeRoundedRect(panelX, panelY, panelW, panelH, 8);

    this.add.text(panelX + panelW / 2, panelY + 14, '部署单位', {
      fontSize: '14px',
      fontFamily: 'Microsoft YaHei, sans-serif',
      color: '#8899aa',
    }).setOrigin(0.5);

    const unitTypes: { type: UnitType; label: string }[] = [
      { type: 'STRIKER', label: '突击兵' },
      { type: 'GUARDIAN', label: '盾卫兵' },
      { type: 'SNIPER', label: '狙击手' },
      { type: 'SCOUT', label: '侦察兵' },
      { type: 'ENGINEER', label: '工程兵' },
    ];

    unitTypes.forEach((item, i) => {
      const btnY = panelY + 38 + i * 55;
      const btn = this.createDeployButton(panelX + 8, btnY, panelW - 16, 48, item.type, item.label);
      this.deployButtons.push(btn);
    });

    const endTurnBtnY = panelY + panelH - 48;
    this.createEndTurnButton(panelX + 8, endTurnBtnY, panelW - 16, 38);
  }

  private createDeployButton(x: number, y: number, w: number, h: number, type: UnitType, label: string): Phaser.GameObjects.Container {
    const container = this.add.container(x, y);
    const cost = GAME_CONFIG.UNITS[type].cost;

    const bg = this.add.graphics();
    bg.fillStyle(0x1a2a3a, 1);
    bg.fillRoundedRect(0, 0, w, h, 4);

    const nameText = this.add.text(8, 6, label, {
      fontSize: '13px',
      fontFamily: 'Microsoft YaHei, sans-serif',
      color: '#ccddee',
    });

    const costText = this.add.text(8, 26, `费用: ${cost}⚡`, {
      fontSize: '11px',
      fontFamily: 'Microsoft YaHei, sans-serif',
      color: '#ffdd44',
    });

    const stats = GAME_CONFIG.UNITS[type];
    const statText = this.add.text(w - 8, 16, `⚔${stats.attack} 🛡${stats.defense}`, {
      fontSize: '11px',
      fontFamily: 'Microsoft YaHei, sans-serif',
      color: '#667788',
    }).setOrigin(1, 0.5);

    container.add([bg, nameText, costText, statText]);

    const hitArea = new Phaser.Geom.Rectangle(0, 0, w, h);
    container.setInteractive(hitArea, Phaser.Geom.Rectangle.Contains);

    container.on('pointerover', () => {
      bg.clear();
      bg.fillStyle(0x2a3a4a, 1);
      bg.lineStyle(1, 0x4a9eff, 0.8);
      bg.fillRoundedRect(0, 0, w, h, 4);
      bg.strokeRoundedRect(0, 0, w, h, 4);
    });

    container.on('pointerout', () => {
      bg.clear();
      bg.fillStyle(0x1a2a3a, 1);
      bg.fillRoundedRect(0, 0, w, h, 4);
    });

    container.on('pointerdown', () => {
      this.gameScene.setDeployMode(type);
    });

    return container;
  }

  private createEndTurnButton(x: number, y: number, w: number, h: number): void {
    const container = this.add.container(x, y);

    const bg = this.add.graphics();
    bg.fillStyle(0x2a1a1a, 1);
    bg.lineStyle(1, 0xff6644, 0.6);
    bg.fillRoundedRect(0, 0, w, h, 4);
    bg.strokeRoundedRect(0, 0, w, h, 4);

    const text = this.add.text(w / 2, h / 2, '结束回合', {
      fontSize: '14px',
      fontFamily: 'Microsoft YaHei, sans-serif',
      color: '#ff8866',
    }).setOrigin(0.5);

    container.add([bg, text]);

    const hitArea = new Phaser.Geom.Rectangle(0, 0, w, h);
    container.setInteractive(hitArea, Phaser.Geom.Rectangle.Contains);

    container.on('pointerover', () => {
      bg.clear();
      bg.fillStyle(0x3a2a2a, 1);
      bg.lineStyle(2, 0xff6644, 1);
      bg.fillRoundedRect(0, 0, w, h, 4);
      bg.strokeRoundedRect(0, 0, w, h, 4);
      text.setColor('#ffffff');
    });

    container.on('pointerout', () => {
      bg.clear();
      bg.fillStyle(0x2a1a1a, 1);
      bg.lineStyle(1, 0xff6644, 0.6);
      bg.fillRoundedRect(0, 0, w, h, 4);
      bg.strokeRoundedRect(0, 0, w, h, 4);
      text.setColor('#ff8866');
    });

    container.on('pointerdown', () => {
      this.gameScene.endPlayerTurn();
    });
  }

  private createBottomBar(width: number, height: number): void {
    const barH = 32;
    const barY = height - barH;

    const bg = this.add.graphics();
    bg.fillStyle(0x0d1520, 0.9);
    bg.fillRect(0, barY, width, barH);
    bg.lineStyle(1, 0x2a3a4a, 1);
    bg.lineBetween(0, barY, width, barY);

    this.infoText = this.add.text(16, barY + 8, '提示：选择单位进行操作，或从右侧面板部署新单位', {
      fontSize: '12px',
      fontFamily: 'Microsoft YaHei, sans-serif',
      color: '#667788',
    });
  }

  private updateUI(): void {
    const state = this.gameScene.getGameState();

    this.turnText.setText(`回合 ${state.turn}/20`);

    const phaseLabels: Record<string, string> = {
      deploy: '📦 部署阶段',
      action: '⚔️ 行动阶段',
      enemy_turn: '🤖 敌方回合',
      settle: '📊 结算中',
    };
    this.phaseText.setText(phaseLabels[state.phase] || state.phase);

    this.energyText.setText(`⚡ ${state.playerResources.energy}  🔬 ${state.playerResources.tech}`);

    const playerCount = state.getPlayerUnits().length;
    const enemyCount = state.getEnemyUnits().length;
    this.infoText.setText(`我方: ${playerCount} 单位 | 敌方: ${enemyCount} 单位 | AI策略: ${this.gameScene.getAIController().strategyName}`);
  }
}
