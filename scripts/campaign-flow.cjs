// Real Phaser scenes, accelerated spawns/defeats. Verifies wiring, not difficulty.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const output = path.resolve('.cache', `campaign-flow-${Date.now()}`);
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', path.join(output, 'profile'));
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
const errors = [];
const completed = [];
const timeout = setTimeout(() => { console.error('Campaign flow timed out'); app.exit(1); }, 300000);
app.whenReady().then(async () => {
  try {
    const win = new BrowserWindow({ width:1024, height:768, useContentSize:true, show:false,
      webPreferences:{ contextIsolation:true, nodeIntegration:false, sandbox:true, backgroundThrottling:false, offscreen:true } });
    win.webContents.setFrameRate(60);
    win.webContents.on('console-message', event => { if(event.level==='error'||event.level===3){errors.push(event.message);console.error(event.message);} });
    const evaluate = async code => { try { return await win.webContents.executeJavaScript(code,true); } catch(error) { throw new Error(`${error.message} at ${code.slice(0,180)}`); } };
    const snap = async name => { await pause(500); fs.writeFileSync(path.join(output,`${name}.png`),(await win.webContents.capturePage()).toPNG()); };
    const waitFor = async (code, label, tries=100) => {
      for(let i=0;i<tries;i++){if(await evaluate(code))return;await pause(50);}
      throw new Error(`Timed out waiting for ${label}`);
    };
    await win.loadURL('http://127.0.0.1:3000/?renderqa=1');
    await waitFor("Boolean(window.__sunlitQA?.game.scene.isActive('MenuScene'))",'menu');
    await evaluate("localStorage.setItem('shadowlegion_tutorial_v4','done'); void 0");
    for(let id=1;id<=50;id++){
      await evaluate(`window.__sunlitQA.game.scene.getScenes(true)[0].scene.start('ArenaScene',{mode:'campaign',stageId:${id},operativeId:'ranger',freshRun:true});void 0`);
      await waitFor(`window.__sunlitQA.game.scene.isActive('ArenaScene') && window.__sunlitQA.game.scene.getScene('ArenaScene').stage?.id===${id}`,'stage '+id);
      for(let pick=0;pick<5;pick++){
        await pause(55);
        const drafting=await evaluate("{const a=window.__sunlitQA.game.scene.getScene('ArenaScene'); if(a.upgrading&&a.openingDrafts>0){a.selectUpgrade(a.upgradeMgr.pickThree('wave',a.hero)[0],'wave');} a.openingDrafts>0}");
        if(!drafting)break;
      }
      if([1,11,21,31,41].includes(id)){
        await evaluate("{const a=window.__sunlitQA.game.scene.getScene('ArenaScene');a.cameras.main.stopFollow();a.cameras.main.setZoom(.62);a.cameras.main.centerOn(800,600);void 0;}");
        await snap(`map-${Math.ceil(id/10)}`);
      }
      for(let wave=0;wave<8;wave++){
        const status=await evaluate("{const a=window.__sunlitQA.game.scene.getScene('ArenaScene');if(a.dead){({done:true})}else{a.waveMgr.update(a.combatTime+2000,100000);for(const e of [...a.enemies.getChildren()])if(e.active)e.takeDamage(e.hp);a.waveMgr.update(a.combatTime+2001,1);if(a.upgrading)a.selectUpgrade(a.upgradeMgr.pickThree('wave',a.hero)[0],'wave');({done:a.dead,wave:a.waveMgr.wave})}}");
        if(status.done)break;
        await pause(60);
      }
      await waitFor("window.__sunlitQA.game.scene.isActive('GameOverScene')",'result '+id);
      const record=await evaluate(`(async()=>{const {CampaignProgressionManager:C}=await import('/systems/CampaignProgressionManager.ts');const {MetaProgressionManager:M}=await import('/systems/MetaProgressionManager.ts');const r=C.getStageRecord(${id});return {id:${id},stars:r.stars,clears:r.clears,highest:C.getState().highestUnlockedStage,cores:M.getState().shadowCores};})()`);
      if(record.stars<1||record.clears!==1||record.highest!==Math.min(50,id+1))throw new Error('Progress mismatch '+JSON.stringify(record));
      completed.push(record);
      if([1,3,8,15,50].includes(id))await snap(`result-${id}`);
      if(id%10===0)console.log(`Verified ${id}/50 stages`);
    }
    await evaluate("window.__sunlitQA.game.scene.getScenes(true)[0].scene.start('CampaignScene',{chapter:5});void 0");
    await waitFor("window.__sunlitQA.game.scene.isActive('CampaignScene')",'completed atlas');
    await snap('complete-atlas');
    // The endless route must carry its build into a second floor.
    await evaluate("window.__sunlitQA.game.scene.getScenes(true)[0].scene.start('ArenaScene',{mode:'endless',operativeId:'engineer',freshRun:true});void 0");
    await waitFor("window.__sunlitQA.game.scene.isActive('ArenaScene')",'endless');
    for(let i=0;i<3;i++){await pause(70);await evaluate("{const a=window.__sunlitQA.game.scene.getScene('ArenaScene');if(a.upgrading)a.selectUpgrade(a.upgradeMgr.pickThree('wave',a.hero)[0],'wave');}");}
    for(let i=0;i<12;i++){
      await evaluate("{const a=window.__sunlitQA.game.scene.getScene('ArenaScene');a.waveMgr.update(a.combatTime+2000,100000);for(const e of [...a.enemies.getChildren()])if(e.active)e.takeDamage(e.hp);a.waveMgr.update(a.combatTime+2001,1);if(a.upgrading)a.selectUpgrade(a.upgradeMgr.pickThree('wave',a.hero)[0],'wave');}");
      await pause(80);
    }
    await pause(1900);
    await evaluate("{const a=window.__sunlitQA.game.scene.getScene('ArenaScene');if(a.upgrading)a.selectUpgrade(a.upgradeMgr.pickThree('level',a.hero)[0],'level');}");
    await waitFor("window.__sunlitQA.game.scene.isActive('ArenaScene')&&window.__sunlitQA.game.scene.getScene('ArenaScene').currentLevel===2",'endless second floor');
    const endless=await evaluate("{const a=window.__sunlitQA.game.scene.getScene('ArenaScene');({mode:a.mode,level:a.currentLevel,cards:a.upgradeMgr.getAppliedIds().length,operative:a.operativeId})}");
    if(endless.mode!=='endless'||endless.cards<3||endless.operative!=='engineer')throw new Error('Endless carryover failed');
    await snap('endless-floor-2');
    const state=await evaluate("(async()=>{const{MetaProgressionManager:M}=await import('/systems/MetaProgressionManager.ts');return M.getState()})()");
    const report={scope:'Accelerated Phaser flow: actual spawning/death/upgrade/result/save across all 50 stages and an endless floor transition. Not normal clear times or balance evidence.',engine:process.versions.chrome,completed,endless,unlocked:state.unlockedOperatives,builds:state.clearedBuilds,errors,output};
    fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify({stages:completed.length,endless,errors,output}));
    if(errors.length)throw new Error('Renderer errors');
    clearTimeout(timeout);app.exit(0);
  }catch(error){console.error(error.stack||error);fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({message:String(error),completed,errors},null,2));clearTimeout(timeout);app.exit(1);}
});
