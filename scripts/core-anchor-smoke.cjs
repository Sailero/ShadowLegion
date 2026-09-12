// Isolated real-physics regression: repeatedly crowd actual spawned enemies
// against the camp. This is directed collision QA, not ordinary difficulty.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const output = path.resolve('.cache', `core-anchor-qa-${Date.now()}`);
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', path.join(output, 'profile'));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = { output, scope: 'Isolated development renderer; stage 47 access seeded, HP refilled, actual spawned enemies repositioned to force repeated circle contacts. No direct camp damage or accelerated game clock. Not human play or performance certification.', samples: [], errors: [] };
const watchdog = setTimeout(() => { console.error('Camp anchor check timed out'); app.exit(2); }, 65000);
let win;
app.whenReady().then(async () => {
  try {
    win = new BrowserWindow({ show: false, width: 1024, height: 768, useContentSize: true,
      webPreferences: { offscreen: true, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
    win.webContents.setFrameRate(60);
    win.webContents.on('console-message', event => { if (event.level === 'error' || event.level === 3) report.errors.push(event.message); });
    const evaluate = code => win.webContents.executeJavaScript(code, true);
    const waitFor = async (code, label) => { for (let i = 0; i < 100; i++) { if (await evaluate(code)) return; await delay(50); } throw Error(`Timeout: ${label}`); };
    await win.loadURL(process.env.SUNLIT_QA_URL || 'http://127.0.0.1:3000/?renderqa=1');
    await waitFor("Boolean(window.__sunlitQA?.game.scene.isActive('MenuScene'))", 'menu');
    await evaluate(`(async () => {
      const { createDefaultMetaState } = await import('/systems/MetaProgressionManager.ts');
      const meta = createDefaultMetaState();
      meta.stageProgress = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [i + 1, { stars: 1, replayRewards: 0, masteryStars: {}, migrated: true }]));
      localStorage.setItem('shadowlegion_meta_v1', JSON.stringify(meta));
      localStorage.setItem('shadowlegion_tutorial_v4', 'done');
      window.__sunlitQA.game.scene.getScene('MenuScene').scene.start('ArenaScene', { mode: 'campaign', stageId: 47, operativeId: 'ranger', freshRun: true });
    })()`);
    await waitFor("window.__sunlitQA.game.scene.isActive('ArenaScene')", 'arena');
    await evaluate(`{
      const a = window.__sunlitQA.game.scene.getScene('ArenaScene');
      while (a.upgrading) a.selectUpgrade(a.upgradeMgr.pickThree('wave', a.hero)[0], 'wave');
      window.__anchorContacts = 0;
      const damage = a.damageDefense;
      a.damageDefense = function (...args) { window.__anchorContacts++; return damage.apply(this, args); };
      window.__anchorTimer = setInterval(() => {
        a.hero.hp = a.hero.maxHp; a.defenseHp = a.defenseMaxHp;
        for (const enemy of a.enemies.getChildren()) if (enemy.active) {
          enemy.setPosition(a.defenseCore.x - 15, a.defenseCore.y - 15);
          enemy.body.updateFromGameObject();
        }
      }, 100);
      void 0;
    }`);
    for (let i = 0; i <= 8; i++) {
      report.samples.push(await evaluate(`{
        const a = window.__sunlitQA.game.scene.getScene('ArenaScene'), c = a.defenseCore, b = c.body;
        ({ x: c.x, y: c.y, scale: c.scaleX, body: { x: b.x, y: b.y, immovable: b.immovable, pushable: b.pushable }, time: a.combatTime, enemies: a.enemies.countActive(true), contacts: window.__anchorContacts });
      }`));
      if (i < 8) await delay(2500);
    }
    await evaluate('clearInterval(window.__anchorTimer)');
    report.checks = {
      campRemainsAtMapCenter: report.samples.every(s => Math.hypot(s.x - 800, s.y - 600) < 0.01),
      anchoredCircleBody: report.samples.every(s => s.body.immovable && !s.body.pushable),
      realContactsOccurred: report.samples.at(-1).contacts > 10,
      combatClockAdvanced: report.samples.at(-1).time >= 19000,
      actualEnemiesPresent: report.samples.some(s => s.enemies > 0),
    };
    for (const [name, passed] of Object.entries(report.checks)) if (!passed) report.errors.push(name);
    fs.writeFileSync(path.join(output, 'final.png'), (await win.webContents.capturePage()).toPNG());
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
    clearTimeout(watchdog); app.exit(report.errors.length ? 1 : 0);
  } catch (error) {
    report.errors.push(String(error.stack || error));
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.error(error); clearTimeout(watchdog); app.exit(1);
  }
});
