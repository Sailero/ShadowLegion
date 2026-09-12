// Actual renderer: compare vector/cached ground on one frozen display list,
// then verify texture ownership across all fifty authored stage scenes.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const output = path.resolve('.cache', `ground-cache-qa-${Date.now()}`);
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', path.join(output, 'profile'));
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const report = { output, scope: 'Isolated development renderer; seeded route access, direct stage launches and frozen scenes. Original Graphics and generated texture are captured on the same scene. This verifies rendering/resource ownership, not difficulty or player progress.', stages: [], errors: [] };
const deadline = setTimeout(() => { console.error('Ground cache check timed out'); app.exit(1); }, 180000);
let win;
app.whenReady().then(async () => {
  try {
    win = new BrowserWindow({ width: 1024, height: 768, useContentSize: true, show: false,
      webPreferences: { offscreen: true, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false } });
    win.webContents.setFrameRate(60);
    win.webContents.on('console-message', event => { if (event.level === 'error' || event.level === 3) report.errors.push(event.message); });
    const evaluate = code => win.webContents.executeJavaScript(code, true);
    const waitFor = async (code, label) => { for (let i = 0; i < 160; i++) { if (await evaluate(code)) return; await delay(40); } throw new Error(`Timeout: ${label}`); };
    const snap = async name => { await delay(100); fs.writeFileSync(path.join(output, `${name}.png`), (await win.webContents.capturePage()).toPNG()); };
    await win.loadURL('http://127.0.0.1:3000/?renderqa=1');
    await waitFor("Boolean(window.__sunlitQA?.game.scene.isActive('MenuScene'))", 'menu');
    await evaluate(`(async () => {
      const { createDefaultMetaState } = await import('/systems/MetaProgressionManager.ts');
      const meta = createDefaultMetaState();
      meta.stageProgress = Object.fromEntries(Array.from({length:50}, (_,i) => [i+1,{stars:1,replayRewards:0,masteryStars:{},migrated:true}]));
      localStorage.setItem('shadowlegion_meta_v1', JSON.stringify(meta));
      localStorage.setItem('shadowlegion_tutorial_v4', 'done');
      const arena = window.__sunlitQA.game.scene.getScene('ArenaScene');
      window.__originalGroundCache = arena.cacheStaticGround;
      arena.cacheStaticGround = function (graphics) { this.__vectorGround = graphics; };
    })()`);
    for (let id = 1; id <= 50; id++) {
      await evaluate(`window.__sunlitQA.game.scene.getScene('MenuScene').scene.start('ArenaScene',{mode:'campaign',stageId:${id},operativeId:'ranger',freshRun:true});void 0`);
      await waitFor(`{const a=window.__sunlitQA.game.scene.getScene('ArenaScene');a.sys.isActive()&&a.stage?.id===${id}&&a.__vectorGround?.active}`, 'stage ' + id);
      await evaluate(`{const a=window.__sunlitQA.game.scene.getScene('ArenaScene');a.clearUpgradeUI();a.sys.pause();a.cameras.main.stopFollow();a.cameras.main.setZoom(.6);a.cameras.main.centerOn(800,600);void 0}`);
      const pictured = [1, 11, 21, 31, 41].includes(id);
      if (pictured) await snap(`stage-${id}-vector`);
      const state = await evaluate(`{const game=window.__sunlitQA.game,a=game.scene.getScene('ArenaScene'),g=a.__vectorGround;
        const geometry=()=>JSON.stringify(a.obstacles.getChildren().map(o=>[o.x,o.y,o.width,o.height]));
        const beforeGeometry=geometry(),beforeCommands=g.commandBuffer.length;
        window.__originalGroundCache.call(a,g);
        const key='sunlit-arena-ground-cache',t=game.textures.get(key),image=a.children.getChildren().find(o=>o.name==='static-ground-cache');
        ({id:${id},beforeCommands,cached:game.textures.exists(key),width:t.getSourceImage().width,height:t.getSourceImage().height,
          oldGraphicsDestroyed:!g.active,oneCache:a.children.getChildren().filter(o=>o.name==='static-ground-cache').length===1,
          depth:image?.depth,geometryUnchanged:beforeGeometry===geometry()})}`);
      if (!state.cached || !state.oldGraphicsDestroyed || !state.oneCache || !state.geometryUnchanged || state.width !== 1600 || state.height !== 1200 || state.depth !== -1) throw new Error('Cache contract failed: ' + JSON.stringify(state));
      if (pictured) await snap(`stage-${id}-cached`);
      await evaluate("window.__sunlitQA.game.scene.getScene('ArenaScene').scene.start('MenuScene');void 0");
      await waitFor("window.__sunlitQA.game.scene.isActive('MenuScene')", 'menu after ' + id);
      state.releasedOnShutdown = await evaluate("!window.__sunlitQA.game.textures.exists('sunlit-arena-ground-cache')");
      if (!state.releasedOnShutdown) throw new Error('Ground texture retained after stage ' + id);
      report.stages.push(state);
      if (id % 10 === 0) console.log(`Verified ${id}/50 cached stage lifecycles`);
    }
    if (report.errors.length) throw new Error('Renderer errors');
    report.checks = { stages: report.stages.length === 50, textureDimensions: true, exactlyOneOwnedTexture: true, releasedEveryTime: true, collisionGeometryUnchanged: true };
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ output, checks: report.checks, errors: report.errors }));
    clearTimeout(deadline); win.destroy(); app.exit(0);
  } catch (error) {
    report.failure = String(error.stack || error);
    fs.writeFileSync(path.join(output, 'report.json'), JSON.stringify(report, null, 2));
    console.error(report.failure); clearTimeout(deadline); win?.destroy(); app.exit(1);
  }
});
