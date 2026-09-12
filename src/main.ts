import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT, COLORS } from './config/gameConfig';
import { BootScene } from './scenes/BootScene';
import { MenuScene } from './scenes/MenuScene';
import { ArenaScene } from './scenes/ArenaScene';
import { GameOverScene } from './scenes/GameOverScene';
import { WorkshopScene } from './scenes/WorkshopScene';
import { LoadoutScene } from './scenes/LoadoutScene';
import { CampaignScene } from './scenes/CampaignScene';
import { StoryScene } from './scenes/StoryScene';
import { LetterBookScene } from './scenes/LetterBookScene';
import { DeliveryScene } from './scenes/DeliveryScene';
import { JourneyMapScene } from './scenes/JourneyMapScene';
import { LakeScene } from './scenes/LakeScene';
import { MountainScene } from './scenes/MountainScene';
import { syncInitialBrowserFocus } from './systems/BrowserFocus';

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
  scene: [BootScene, MenuScene, CampaignScene, LoadoutScene, ArenaScene, GameOverScene, WorkshopScene, StoryScene, LetterBookScene, DeliveryScene, JourneyMapScene, LakeScene, MountainScene],
};

const game = new Phaser.Game(config);

const finishStartup = () => {
  if (!game.scene.isActive('MenuScene')) return;
  // READY precedes Game.start's focus listeners; the first menu STEP is after them.
  syncInitialBrowserFocus(game, document);
  window.dispatchEvent(new Event('sunlit:ready'));
  game.events.off(Phaser.Core.Events.STEP, finishStartup);
};
game.events.on(Phaser.Core.Events.STEP, finishStartup);

// Keyboard controls belong to the focused canvas; prevent the page from scrolling.
game.events.once(Phaser.Core.Events.READY, () => {
  const canvas = game.canvas;
  canvas.tabIndex = 0;
  canvas.setAttribute('aria-label', '暖影同行游戏画面。WASD或方向键、点地行走；SHIFT轻跃，E分工，F互动，Escape暂停。邮路练习中空格释放技能。');
  canvas.addEventListener('pointerdown', () => {
    canvas.focus({ preventScroll: true });
    syncInitialBrowserFocus(game, document);
  });
  game.input.keyboard?.addCapture(['SPACE', 'UP', 'DOWN', 'LEFT', 'RIGHT']);
});

if ((import.meta as unknown as Record<string, Record<string, boolean>>).env?.DEV) {
  if (new URLSearchParams(window.location.search).get('renderqa') === '1') {
    Object.defineProperty(window, '__sunlitQA', { value: { game }, configurable: true });
  }
  import('./test/RuntimeTest').then(({ runDataTests, printResults }) => {
    printResults('DATA TESTS', runDataTests());
  });

  game.events.on('step', () => {
    if (new URLSearchParams(window.location.search).get('qa') !== '1') return;
    const arena = game.scene.getScene('ArenaScene');
    const testedArena = arena as Phaser.Scene & { __devTestsAttached?: boolean };
    if (testedArena?.sys?.isActive() && !testedArena.__devTestsAttached) {
      testedArena.__devTestsAttached = true;
      setTimeout(() => {
        if (!testedArena.sys.isActive()) return;
        import('./test/RuntimeTest').then(({ runSceneTests, printResults }) => {
          printResults('SCENE TESTS', runSceneTests(testedArena));
        });
        import('./test/scenarioTest').then(({ attachScenarioTests }) => {
          attachScenarioTests(testedArena);
        });
      }, 500);
      testedArena.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
        testedArena.__devTestsAttached = false;
      });
    }
  });
}
