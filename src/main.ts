import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from './config/gameConfig';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { ArenaScene } from './scenes/ArenaScene';
import { GameOverScene } from './scenes/GameOverScene';
import { WorkshopScene } from './scenes/WorkshopScene';

const config: Phaser.Types.Core.GameConfig = {
  type: Phaser.AUTO,
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  parent: 'game-container',
  backgroundColor: `#${COLORS.bg.toString(16).padStart(6, '0')}`,
  roundPixels: true,
  physics: {
    default: 'arcade',
    arcade: {
      gravity: { x: 0, y: 0 },
      debug: false,
    },
  },
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
  },
  scene: [BootScene, MenuScene, ArenaScene, GameOverScene, WorkshopScene],
};

const game = new Phaser.Game(config);

if ((import.meta as unknown as Record<string, Record<string, boolean>>).env?.DEV) {
  import('./test/RuntimeTest').then(({ runDataTests, printResults }) => {
    printResults('DATA TESTS', runDataTests());
  });

  game.events.on('step', () => {
    const arena = game.scene.getScene('ArenaScene');
    if (arena?.sys?.isActive()) {
      game.events.off('step');
      setTimeout(() => {
        import('./test/RuntimeTest').then(({ runSceneTests, printResults }) => {
          printResults('SCENE TESTS', runSceneTests(arena));
        });
        import('./test/scenarioTest').then(({ attachScenarioTests }) => {
          attachScenarioTests(arena);
        });
      }, 500);
    }
  });
}
