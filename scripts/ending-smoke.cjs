// Isolated QA fault injection: real shadow completion and separate record/wallet persistence.
// Enemy deaths are accelerated and one Storage key is deliberately rejected. Not normal play.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const output = path.resolve('.cache', `ending-qa-${Date.now()}`);
fs.mkdirSync(output,{recursive:true});
app.setPath('userData',path.join(output,'profile'));
const delay = ms => new Promise(resolve=>setTimeout(resolve,ms));
const report = { output, scope:'Development QA renderer; accelerated real rival deaths reach Arena.finishFiniteRun. Storage.prototype.setItem rejects only sunlit_shadow_trials_v1. The independent wallet must still save. Not ordinary gameplay or difficulty evidence.', errors:[] };
const deadline=setTimeout(()=>{console.error('Ending QA timed out');app.exit(1);},60000);
app.whenReady().then(async()=>{
  let win;
  try{
    win=new BrowserWindow({width:1024,height:768,useContentSize:true,show:false,webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,offscreen:true,backgroundThrottling:false}});
    win.webContents.setFrameRate(60);
    win.webContents.on('console-message',event=>{if(event.level==='error'||event.level===3)report.errors.push(event.message);});
    const evaluate=code=>win.webContents.executeJavaScript(code,true);
    const waitFor=async(code,label)=>{for(let i=0;i<100;i++){if(await evaluate(code))return;await delay(70);}throw new Error(label);};
    await win.loadURL('http://127.0.0.1:3000/?renderqa=1');
    await waitFor("Boolean(window.__sunlitQA?.game.scene.isActive('MenuScene'))",'Menu did not boot');
    await evaluate("localStorage.setItem('shadowlegion_tutorial_v4','done');window.__sunlitQA.game.scene.getScene('MenuScene').scene.start('ArenaScene',{mode:'shadow',trialTier:1,operativeId:'ranger',freshRun:true});void 0;");
    await waitFor("window.__sunlitQA.game.scene.isActive('ArenaScene')&&window.__sunlitQA.game.scene.getScene('ArenaScene').upgrading",'Shadow preparation did not open');
    report.before=await evaluate("(async()=>{const{MetaProgressionManager:M}=await import('/systems/MetaProgressionManager.ts');const{ShadowTrialManager:S}=await import('/systems/ShadowTrialManager.ts');return {cores:M.getState().shadowCores,records:S.getRecords()};})()");
    await evaluate("window.__endingNativeSetItem=Storage.prototype.setItem;window.__endingRejectedWrites=0;Storage.prototype.setItem=function(key,value){if(this===localStorage&&key==='sunlit_shadow_trials_v1'){window.__endingRejectedWrites++;throw new DOMException('QA injected shadow record write rejection','QuotaExceededError');}return window.__endingNativeSetItem.call(this,key,value);};void 0;");
    for(let pick=0;pick<2;pick++){await evaluate("{const a=window.__sunlitQA.game.scene.getScene('ArenaScene');if(a.upgrading)a.selectUpgrade(a.upgradeMgr.pickThree('wave',a.hero)[0],'wave');void 0;}");await delay(80);}
    report.rounds=[];
    for(let step=0;step<7;step++){
      const state=await evaluate("{const a=window.__sunlitQA.game.scene.getScene('ArenaScene');if(!a.dead){a.waveMgr.update(a.combatTime+2000,100000);for(const e of [...a.enemies.getChildren()])if(e.active)e.takeDamage(e.hp);a.waveMgr.update(a.combatTime+2001,1);if(a.upgrading)a.selectUpgrade(a.upgradeMgr.pickThree('wave',a.hero)[0],'wave');}({dead:a.dead,wave:a.waveMgr.wave,kills:a.kills})}");
      report.rounds.push(state);if(state.dead)break;await delay(100);
    }
    await waitFor("window.__sunlitQA.game.scene.isActive('GameOverScene')",'Shadow completion did not reach GameOver');
    await delay(550);
    report.after=await evaluate("(async()=>{const{MetaProgressionManager:M}=await import('/systems/MetaProgressionManager.ts');const{ShadowTrialManager:S}=await import('/systems/ShadowTrialManager.ts');const g=window.__sunlitQA.game.scene.getScene('GameOverScene');const texts=g.children.getChildren().filter(o=>o.type==='Text').map(o=>o.text);return {cores:M.getState().shadowCores,records:S.getRecords(),rejectedWrites:window.__endingRejectedWrites,texts,result:g.sys.settings.data};})()");
    fs.writeFileSync(path.join(output,'shadow-record-rejected-wallet-saved.png'),(await win.webContents.capturePage()).toPNG());
    const notice=report.after.texts.find(text=>text.includes('切磋纪录')&&text.includes('暖晶结果'));
    report.checks={recordWriteRejected:report.after.rejectedWrites>0,recordNotFabricated:report.after.records.length===0,walletSaved:report.after.cores>report.before.cores,noticeAccurate:notice?.includes('切磋纪录暂未保存')&&notice.includes('暖晶结果已保存'),victoryNotFailure:report.after.texts.some(text=>text.includes('向你击了个掌'))};
    report.notice=notice;
    await evaluate("Storage.prototype.setItem=window.__endingNativeSetItem;void 0;");
    await win.webContents.session.flushStorageData();
    fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
    if(Object.values(report.checks).some(value=>!value)||report.errors.length)throw new Error('Fault-injection result mismatch');
    console.log(JSON.stringify({output,checks:report.checks,notice,errors:report.errors},null,2));clearTimeout(deadline);win.destroy();app.exit(0);
  }catch(error){report.failure=String(error.stack||error);fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.error(report.failure);clearTimeout(deadline);win?.destroy();app.exit(1);}
});
