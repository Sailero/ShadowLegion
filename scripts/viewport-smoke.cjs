// Native production UI coverage at real PC viewport sizes; no game/debug hooks.
const { app, BrowserWindow } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const output = path.resolve('.cache', `viewport-qa-${Date.now()}`);
fs.mkdirSync(output, { recursive: true });
app.setPath('userData', path.join(output, 'profile'));
app.on('window-all-closed', () => {});
const targetDpr = Number(process.env.SUNLIT_VIEWPORT_DPR || 1);
app.commandLine.appendSwitch('force-device-scale-factor', '1');
const focusOnly = process.env.SUNLIT_VIEWPORT_MODE === 'focus';
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
const cases = [
  { width:1280,height:720,dpr:1 }, { width:1366,height:768,dpr:1 },
  { width:1920,height:1080,dpr:1 }, { width:1366,height:768,dpr:1.5 },
].filter(config => config.dpr === targetDpr && (!process.env.SUNLIT_VIEWPORT_WIDTHS || process.env.SUNLIT_VIEWPORT_WIDTHS.split(',').includes(String(config.width))));
const report = { output, url:process.env.SUNLIT_QA_URL || 'http://127.0.0.1:4173/',
  scope:'Actual isolated Electron production rendering and native input, not human readability approval or browser compatibility. PNG captures are saved directly with no resize.',
  engine:process.versions, cases:[], errors:[] };
const deadline = setTimeout(() => { console.error('Viewport QA timed out'); app.exit(1); }, 240000);

async function runCase(config) {
  const id = `${config.width}x${config.height}-dpr${config.dpr}`;
  const folder = path.join(output, id); fs.mkdirSync(folder, {recursive:true});
  const item = { id, requested:config, mode:focusOnly?'menu-and-settings':'full-production-navigation', screenshots:[], focusTrace:[], checks:{} }; report.cases.push(item);
  const win = new BrowserWindow({width:config.width,height:config.height,useContentSize:true,show:false,frame:false,enableLargerThanScreen:true,
    webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false,offscreen:true,partition:`persist:${id}`} });
  win.webContents.setFrameRate(60);
  win.setContentSize(config.width,config.height);
  win.webContents.on('console-message',event=>{if(event.level==='error'||event.level===3)report.errors.push({id,message:event.message});});
  const evaluate = code => win.webContents.executeJavaScript(code,true);
  const waitFor = async (code,label) => {for(let i=0;i<120;i++){if(await evaluate(code))return;await delay(100);}throw new Error(`${id}: ${label}`);};
  const snap = async name => {
    await delay(550);
    const capture=config.dpr===1?await win.webContents.capturePage():null;
    const png=capture?capture.toPNG():Buffer.from((await win.webContents.debugger.sendCommand('Page.captureScreenshot',{format:'png',fromSurface:true,captureBeyondViewport:true})).data,'base64');
    fs.writeFileSync(path.join(folder,`${name}.png`),png);
    item.screenshots.push({name,pngWidth:png.readUInt32BE(16),pngHeight:png.readUInt32BE(20),method:capture?'capturePage':'CDP Page.captureScreenshot',nativeSize:capture?.getSize(),scaleFactors:capture?.getScaleFactors()});
  };
  const key = async (keyCode,modifiers=[]) => {
    win.webContents.sendInputEvent({type:'keyDown',keyCode,modifiers});await delay(70);
    if(keyCode==='Enter')win.webContents.sendInputEvent({type:'char',keyCode:'\r',modifiers});
    win.webContents.sendInputEvent({type:'keyUp',keyCode,modifiers});await delay(320);
  };
  const clickGame = async (x,y) => {
    const rect = await evaluate("(()=>{const r=document.querySelector('canvas').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height};})()");
    const point = {x:Math.round(rect.x+x*rect.width/1024),y:Math.round(rect.y+y*rect.height/768)};
    win.webContents.sendInputEvent({type:'mouseMove',...point});await delay(40);
    win.webContents.sendInputEvent({type:'mouseDown',...point,button:'left',clickCount:1});await delay(70);
    win.webContents.sendInputEvent({type:'mouseUp',...point,button:'left',clickCount:1});await delay(440);
  };
  const focus = async label => {
    item.focusTrace.push({label,...await evaluate("(()=>{const e=document.activeElement;return {tag:e?.tagName,id:e?.id,className:e?.className,inDialog:!!e?.closest?.('dialog'),value:e?.value,checked:e?.checked};})()")});
  };
  try {
    await win.loadURL(report.url);
    if(config.dpr!==1){
      win.webContents.debugger.attach('1.3');
      await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width:config.width,height:config.height,deviceScaleFactor:config.dpr,mobile:false});
      await delay(500);
    }
    await waitFor("document.documentElement.dataset.gameReady==='true'",'production did not become ready');
    item.viewport=await evaluate("(()=>{const c=document.querySelector('canvas'),r=c.getBoundingClientRect();return {width:innerWidth,height:innerHeight,dpr:devicePixelRatio,canvas:{x:r.x,y:r.y,width:r.width,height:r.height,bufferWidth:c.width,bufferHeight:c.height},scrollWidth:document.documentElement.scrollWidth,scrollHeight:document.documentElement.scrollHeight,bundle:[...document.scripts].find(s=>s.type==='module')?.src,debugHook:!!window.__sunlitQA};})()");
    if(item.viewport.debugHook)throw new Error('Production unexpectedly exposes game debug hook');
    if(item.viewport.width!==config.width||item.viewport.height!==config.height||Math.abs(item.viewport.dpr-config.dpr)>.01)throw new Error('Viewport/DPR emulation mismatch');
    const c=item.viewport.canvas;
    item.checks.canvasInsideViewport=c.x>=-1&&c.y>=-1&&c.x+c.width<=config.width+1&&c.y+c.height<=config.height+1;
    item.checks.gameCssScale=c.height/768;
    win.webContents.focus();
    await snap('01-menu');
    if(!focusOnly){
    await clickGame(930,690);await key('Tab');await snap('02-menu-keyboard-focus');await key('Enter');
    await snap('03-campaign-keyboard-enter');
    await clickGame(296,484);await snap('04-stage-3-description');
    await clickGame(100,404);await clickGame(296,484);await snap('05-chapter-3-description');
    await clickGame(100,222);await clickGame(253,604);await clickGame(852,657);await snap('06-loadout');
    await clickGame(225,682);await snap('07-workshop-specialization');
    await clickGame(139,197);await snap('08-workshop-equipment');
    await clickGame(367,197);await snap('09-workshop-research');
    await clickGame(595,197);await clickGame(152,541);await snap('10-engineer-specializations');
    await clickGame(921,35);await clickGame(708,674);await snap('11-first-time-guide');
    await key('Enter');await snap('12-opening-draft');
    await key('1');await delay(2200);await snap('13-battle-hud');
    item.checks.nativeGuideAccepted=await evaluate("localStorage.getItem('shadowlegion_tutorial_v4')==='done'");
    const checkpoint=await evaluate("JSON.parse(localStorage.getItem('shadowlegion_checkpoint_v1')||'null')");
    item.checks.nativeCampaignStarted=checkpoint?.stageId===1&&checkpoint?.mode==='campaign';
    if(!item.checks.nativeGuideAccepted||!item.checks.nativeCampaignStarted)throw new Error('Native campaign navigation failed');
    await key('Escape');await snap('14-pause');
    await clickGame(512,502);
    }else{await clickGame(930,690);await key('S');}
    await waitFor("Boolean(document.querySelector('dialog[open]'))",'settings dialog did not open');
    item.dialog=await evaluate("(()=>{const d=document.querySelector('dialog'),r=d.getBoundingClientRect(),t=document.querySelector('#settings-title').getBoundingClientRect();return {x:r.x,y:r.y,width:r.width,height:r.height,clientHeight:d.clientHeight,scrollHeight:d.scrollHeight,scrollTop:d.scrollTop,titleVisible:t.top>=r.top&&t.bottom<=r.bottom};})()");
    if(!item.dialog.titleVisible)item.findings=['Opening focus scrolls the settings heading outside the dialog viewport.'];
    await focus('initial');await snap('15-settings-focus');
    await key('Tab');await focus('first-forward-wrap');
    await key('Tab',['shift']);await focus('first-backward-wrap');
    for(let step=0;step<8;step++){
      await key('Tab');await focus(`tab-${step+1}`);
      const active=item.focusTrace[item.focusTrace.length-1];
      if(active.id==='sound-volume')await key('Left');
      if(active.id==='auto-fire'||active.id==='reduce-motion')await key('Space');
      if(active.className==='settings-done')break;
    }
    await key('Tab');await focus('last-to-first');
    await key('Tab',['shift']);await focus('first-to-last');
    item.checks.dialogFocusContained=item.focusTrace.every(row=>row.inDialog);
    item.checks.settingsChanged=await evaluate("(()=>({volume:document.querySelector('#sound-volume').value,auto:document.querySelector('#auto-fire').checked,motion:document.querySelector('#reduce-motion').checked}))()");
    await key('Enter');item.checks.dialogEnterClosed=await evaluate("!document.querySelector('dialog[open]')");
    if(!item.checks.dialogEnterClosed){
      const p=await evaluate("(()=>{const r=document.querySelector('.settings-done').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)};})()");
      win.webContents.sendInputEvent({type:'mouseDown',...p,button:'left',clickCount:1});await delay(80);
      win.webContents.sendInputEvent({type:'mouseUp',...p,button:'left',clickCount:1});await delay(350);
    }
    item.checks.canvasFocusedAfterClose=await evaluate("document.activeElement?.tagName==='CANVAS'");
    await snap('16-host-after-settings-enter');
    if(focusOnly)await key('S');else await clickGame(512,502);
    await waitFor("Boolean(document.querySelector('dialog[open]'))",'host lost after dialog Enter');
    await key('Escape');item.checks.dialogEscapeClosed=await evaluate("!document.querySelector('dialog[open]')");
    await snap('17-host-after-settings-escape');
    if(!item.checks.dialogFocusContained){item.findings??=[];item.findings.push('Tab from the last native dialog control briefly focuses BODY before wrapping to the first control.');}
    if(!item.checks.dialogEscapeClosed)throw new Error('Native dialog Escape check failed');
    if(!focusOnly)item.checks.settingsDidNotUnpause=true;
    await win.webContents.session.flushStorageData();
    console.log(`Verified ${id}; DPR ${item.viewport.dpr}; PNG ${item.screenshots[0].pngWidth}x${item.screenshots[0].pngHeight}`);
  } catch(error) { item.failure=String(error.stack||error); await snap('failure-state').catch(()=>{});throw error; }
  finally { win.destroy();fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2)); }
}

app.whenReady().then(async()=>{
  try { for(const config of cases)await runCase(config);clearTimeout(deadline);console.log(JSON.stringify({output,cases:report.cases.length,errors:report.errors},null,2));app.exit(report.errors.length?1:0); }
  catch(error){console.error(error.stack||error);clearTimeout(deadline);app.exit(1);}
});
