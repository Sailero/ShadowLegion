import Phaser from 'phaser';
import { GAME_CONFIG, UnitType } from '../config/gameConfig';
import { HexGrid } from '../core/HexGrid';
import { GameState } from '../core/GameState';
import { TurnManager } from '../core/TurnManager';
import { Unit } from '../core/Unit';
import { AIController } from '../ai/AIController';
import { delay } from '../utils/helpers';

type InteractionMode = 'select' | 'deploy';

export class GameScene extends Phaser.Scene {
  private gameState!: GameState;
  private turnManager!: TurnManager;
  private aiController!: AIController;

  private gridGraphics!: Phaser.GameObjects.Graphics;
  private unitGraphics!: Phaser.GameObjects.Graphics;
  private overlayGraphics!: Phaser.GameObjects.Graphics;

  private selectedUnit: Unit | null = null;
  private moveTargets: { q: number; r: number }[] = [];
  private attackTargets: string[] = [];

  private interactionMode: InteractionMode = 'select';
  private deployUnitType: UnitType = 'STRIKER';

  private isAIThinking: boolean = false;
  private uiScene!: Phaser.Scene;

  constructor() {
    super({ key: 'GameScene' });
  }

  create(): void {
    this.gameState = new GameState();
    this.gameState.initialize();
    this.aiController = new AIController(0.5);

    this.turnManager = new TurnManager(this.gameState, (phase, turn) => {
      this.events.emit('phaseChanged', phase, turn);
    });

    this.gridGraphics = this.add.graphics();
    this.unitGraphics = this.add.graphics();
    this.overlayGraphics = this.add.graphics();

    this.spawnInitialUnits();
    this.renderAll();

    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.isAIThinking) return;
      this.handleClick(pointer.x, pointer.y);
    });

    this.scene.launch('UIScene', { gameScene: this });
    this.cameras.main.fadeIn(400);
  }

  private spawnInitialUnits(): void {
    const playerUnits: { type: UnitType; q: number; r: number }[] = [
      { type: 'STRIKER', q: 2, r: 1 },
      { type: 'GUARDIAN', q: 4, r: 0 },
      { type: 'SNIPER', q: 6, r: 1 },
      { type: 'SCOUT', q: 3, r: 2 },
    ];

    const enemyUnits: { type: UnitType; q: number; r: number }[] = [
      { type: 'STRIKER', q: 3, r: 8 },
      { type: 'GUARDIAN', q: 5, r: 9 },
      { type: 'SNIPER', q: 7, r: 8 },
      { type: 'SCOUT', q: 6, r: 7 },
    ];

    for (const data of playerUnits) {
      const unit = new Unit(data.type, 'player', data.q, data.r);
      this.gameState.addUnit(unit);
    }

    for (const data of enemyUnits) {
      const unit = new Unit(data.type, 'enemy', data.q, data.r);
      this.gameState.addUnit(unit);
    }
  }

  private handleClick(px: number, py: number): void {
    const coord = this.gameState.grid.pixelToAxial(px, py);
    if (!this.gameState.grid.isValidCoord(coord.q, coord.r)) return;

    const { phase } = this.gameState;

    if (phase === 'deploy') {
      this.handleDeployClick(coord.q, coord.r);
    } else if (phase === 'action') {
      this.handleActionClick(coord.q, coord.r);
    }
  }

  private handleDeployClick(q: number, r: number): void {
    if (this.interactionMode !== 'deploy') return;

    const tile = this.gameState.grid.getTile(q, r);
    if (!tile || !tile.isPassable || tile.unitId) return;
    if (r > 3) return;

    const cost = GAME_CONFIG.UNITS[this.deployUnitType].cost;
    if (this.gameState.playerResources.energy < cost) return;

    const unit = new Unit(this.deployUnitType, 'player', q, r);
    this.gameState.addUnit(unit);
    this.gameState.playerResources.energy -= cost;

    this.events.emit('resourceChanged');
    this.renderAll();
  }

  private handleActionClick(q: number, r: number): void {
    const tile = this.gameState.grid.getTile(q, r);
    if (!tile) return;

    const coordKey = HexGrid.coordKey(q, r);
    const isMoveTarget = this.moveTargets.some(t => HexGrid.coordKey(t.q, t.r) === coordKey);

    if (isMoveTarget && this.selectedUnit) {
      this.gameState.moveUnit(this.selectedUnit.id, q, r);
      this.clearSelection();
      this.renderAll();
      return;
    }

    if (tile.unitId && this.selectedUnit && this.attackTargets.includes(tile.unitId)) {
      const result = this.gameState.attackUnit(this.selectedUnit.id, tile.unitId);
      if (result) {
        this.showDamageEffect(q, r, result.damage, result.killed);
      }
      this.clearSelection();
      this.renderAll();
      this.events.emit('resourceChanged');
      return;
    }

    if (tile.unitId) {
      const clickedUnit = this.gameState.units.get(tile.unitId);
      if (clickedUnit && clickedUnit.owner === 'player') {
        this.selectUnit(clickedUnit);
        return;
      }
    }

    this.clearSelection();
    this.renderAll();
  }

  private selectUnit(unit: Unit): void {
    this.clearSelection();
    this.selectedUnit = unit;
    this.interactionMode = 'select';

    if (!unit.hasMoved) {
      const blocked = new Set<string>();
      for (const u of this.gameState.units.values()) {
        if (u.id !== unit.id) blocked.add(HexGrid.coordKey(u.q, u.r));
      }
      this.moveTargets = this.gameState.grid
        .getReachable({ q: unit.q, r: unit.r }, unit.moveRange, blocked)
        .filter(c => !(c.q === unit.q && c.r === unit.r));
    }

    if (!unit.hasAttacked) {
      const inRange = this.gameState.getUnitsInRange(unit.q, unit.r, unit.attackRange);
      this.attackTargets = inRange
        .filter(u => u.owner !== unit.owner)
        .map(u => u.id);
    }

    this.renderAll();
  }

  private clearSelection(): void {
    this.selectedUnit = null;
    this.moveTargets = [];
    this.attackTargets = [];
  }

  async endPlayerTurn(): Promise<void> {
    if (this.isAIThinking || this.gameState.gameOver) return;

    this.clearSelection();
    this.turnManager.advancePhase(); // deploy → action
    this.turnManager.advancePhase(); // action → enemy_turn

    this.isAIThinking = true;
    this.events.emit('aiThinking', true);

    await delay(500);

    await this.aiController.executeTurn(this.gameState, async () => {
      this.renderAll();
      await delay(300);
    });

    this.isAIThinking = false;
    this.events.emit('aiThinking', false);

    this.turnManager.advancePhase(); // enemy_turn → settle
    this.turnManager.advancePhase(); // settle → deploy (next turn)

    this.renderAll();
    this.events.emit('phaseChanged', this.gameState.phase, this.gameState.turn);
    this.events.emit('resourceChanged');

    if (this.gameState.gameOver) {
      this.showGameOver();
    }
  }

  setDeployMode(unitType: UnitType): void {
    this.interactionMode = 'deploy';
    this.deployUnitType = unitType;
    this.clearSelection();
    this.renderAll();
  }

  setSelectMode(): void {
    this.interactionMode = 'select';
    this.clearSelection();
    this.renderAll();
  }

  private renderAll(): void {
    this.renderGrid();
    this.renderOverlay();
    this.renderUnits();
  }

  private renderGrid(): void {
    const g = this.gridGraphics;
    g.clear();
    const grid = this.gameState.grid;

    for (const tile of grid.getAllTiles()) {
      const { x, y } = grid.axialToPixel(tile.q, tile.r);
      const color = GAME_CONFIG.COLORS.TERRAIN[tile.terrain];

      g.fillStyle(color, 0.8);
      grid.drawHexagon(g, x, y, grid.radius - 1);
      g.fillPath();

      g.lineStyle(1, 0x334455, 0.4);
      grid.drawHexagon(g, x, y, grid.radius - 1);
      g.strokePath();
    }
  }

  private renderOverlay(): void {
    const g = this.overlayGraphics;
    g.clear();
    const grid = this.gameState.grid;

    if (this.interactionMode === 'deploy' && this.gameState.phase === 'deploy') {
      for (const tile of grid.getAllTiles()) {
        if (tile.r <= 3 && tile.isPassable && !tile.unitId) {
          const { x, y } = grid.axialToPixel(tile.q, tile.r);
          g.fillStyle(GAME_CONFIG.COLORS.PLAYER, 0.15);
          grid.drawHexagon(g, x, y, grid.radius - 2);
          g.fillPath();
        }
      }
    }

    if (this.selectedUnit) {
      const { x: sx, y: sy } = grid.axialToPixel(this.selectedUnit.q, this.selectedUnit.r);
      g.lineStyle(2, GAME_CONFIG.COLORS.HIGHLIGHT, 1);
      grid.drawHexagon(g, sx, sy, grid.radius);
      g.strokePath();

      for (const pos of this.moveTargets) {
        const { x, y } = grid.axialToPixel(pos.q, pos.r);
        g.fillStyle(GAME_CONFIG.COLORS.MOVE_RANGE, 0.25);
        grid.drawHexagon(g, x, y, grid.radius - 2);
        g.fillPath();
      }

      for (const targetId of this.attackTargets) {
        const target = this.gameState.units.get(targetId);
        if (target) {
          const { x, y } = grid.axialToPixel(target.q, target.r);
          g.fillStyle(GAME_CONFIG.COLORS.ATTACK_RANGE, 0.35);
          grid.drawHexagon(g, x, y, grid.radius - 2);
          g.fillPath();
        }
      }
    }
  }

  private renderUnits(): void {
    const g = this.unitGraphics;
    g.clear();
    const grid = this.gameState.grid;

    for (const unit of this.gameState.units.values()) {
      const { x, y } = grid.axialToPixel(unit.q, unit.r);
      const color = unit.owner === 'player' ? GAME_CONFIG.COLORS.PLAYER : GAME_CONFIG.COLORS.ENEMY;

      g.fillStyle(color, 0.9);
      g.fillCircle(x, y, 10);

      g.lineStyle(2, color, 1);
      g.strokeCircle(x, y, 10);

      this.drawUnitIcon(g, x, y, unit.type, color);

      if (unit.hp < unit.maxHp) {
        const barW = 18;
        const barH = 3;
        const barX = x - barW / 2;
        const barY = y + 14;

        g.fillStyle(0x333333, 1);
        g.fillRect(barX, barY, barW, barH);

        const hpColor = unit.hpPercent > 0.5 ? 0x44ff44 : unit.hpPercent > 0.25 ? 0xffaa00 : 0xff4444;
        g.fillStyle(hpColor, 1);
        g.fillRect(barX, barY, barW * unit.hpPercent, barH);
      }

      if (unit.owner === 'player' && unit.hasMoved && unit.hasAttacked) {
        g.fillStyle(0x000000, 0.4);
        g.fillCircle(x, y, 10);
      }
    }
  }

  private drawUnitIcon(g: Phaser.GameObjects.Graphics, x: number, y: number, type: UnitType, color: number): void {
    g.lineStyle(2, 0xffffff, 0.8);

    switch (type) {
      case 'STRIKER':
        g.lineBetween(x, y - 6, x, y + 4);
        g.lineBetween(x, y - 6, x + 4, y - 2);
        g.lineBetween(x, y - 6, x - 4, y - 2);
        break;
      case 'GUARDIAN':
        g.strokeRoundedRect(x - 5, y - 5, 10, 10, 2);
        break;
      case 'SNIPER':
        g.lineBetween(x - 6, y, x + 6, y);
        g.lineBetween(x, y - 6, x, y + 6);
        g.strokeCircle(x, y, 4);
        break;
      case 'SCOUT':
        g.lineBetween(x - 4, y + 3, x, y - 5);
        g.lineBetween(x, y - 5, x + 4, y + 3);
        g.lineBetween(x + 4, y + 3, x - 4, y + 3);
        break;
      case 'ENGINEER':
        g.strokeRect(x - 3, y - 5, 6, 4);
        g.lineBetween(x - 5, y - 1, x + 5, y - 1);
        g.lineBetween(x, y - 1, x, y + 5);
        break;
    }
  }

  private showDamageEffect(q: number, r: number, damage: number, killed: boolean): void {
    const { x, y } = this.gameState.grid.axialToPixel(q, r);
    const text = killed ? `${damage} 击杀!` : `-${damage}`;
    const color = killed ? '#ff4444' : '#ffaa00';

    const dmgText = this.add.text(x, y - 10, text, {
      fontSize: '14px',
      fontFamily: 'Microsoft YaHei, sans-serif',
      color,
      fontStyle: 'bold',
    }).setOrigin(0.5);

    this.tweens.add({
      targets: dmgText,
      y: y - 40,
      alpha: 0,
      duration: 800,
      ease: 'Power2',
      onComplete: () => dmgText.destroy(),
    });
  }

  private showGameOver(): void {
    const { width, height } = this.cameras.main;
    const winner = this.gameState.winner;
    const text = winner === 'player' ? '胜 利！' : '失 败...';
    const color = winner === 'player' ? '#44ff88' : '#ff4444';

    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.6);
    overlay.fillRect(0, 0, width, height);

    this.add.text(width / 2, height * 0.35, text, {
      fontSize: '56px',
      fontFamily: 'Microsoft YaHei, sans-serif',
      color,
      fontStyle: 'bold',
    }).setOrigin(0.5);

    const stats = [
      `回合数: ${this.gameState.turn}`,
      `剩余单位: ${this.gameState.getPlayerUnits().length}`,
      `策略多样性: ${(this.gameState.getStrategyDiversity('player') * 100).toFixed(0)}%`,
    ];

    this.add.text(width / 2, height * 0.5, stats.join('\n'), {
      fontSize: '16px',
      fontFamily: 'Microsoft YaHei, sans-serif',
      color: '#aabbcc',
      align: 'center',
      lineSpacing: 8,
    }).setOrigin(0.5);

    const restartBtn = this.add.text(width / 2, height * 0.7, '返回主菜单', {
      fontSize: '20px',
      fontFamily: 'Microsoft YaHei, sans-serif',
      color: '#4a9eff',
      padding: { x: 20, y: 10 },
      backgroundColor: '#1a2a3a',
    }).setOrigin(0.5).setInteractive();

    restartBtn.on('pointerdown', () => {
      this.scene.stop('UIScene');
      this.scene.start('MenuScene');
    });
    restartBtn.on('pointerover', () => restartBtn.setColor('#ffffff'));
    restartBtn.on('pointerout', () => restartBtn.setColor('#4a9eff'));
  }

  getGameState(): GameState {
    return this.gameState;
  }

  getAIController(): AIController {
    return this.aiController;
  }
}
