// Native pointer/keyboard navigation of the production bundle. No game debug hook.
// Start `npm run preview -- --host 127.0.0.1` first.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs');
const path=require('node:path');
const output=path.resolve('.cache',`production-qa-${Date.now()}`);
fs.mkdirSync(output,{recursive:true});
app.setPath('userData',path.join(output,'profile'));
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const errors=[];
const timeout=setTimeout(()=>{console.error('Production QA timed out');app.exit(1);},90000);
app.whenReady().then(async()=>{
  try{
    const win=new BrowserWindow({width:1024,height:768,useContentSize:true,show:false,
      webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false,offscreen:true}});
    win.webContents.setFrameRate(60);
    win.webContents.on('console-message',event=>{if(event.level==='error'||event.level===3)errors.push(event.message);});
    const evaluate=code=>win.webContents.executeJavaScript(code,true);
    const snap=async name=>{await pause(650);fs.writeFileSync(path.join(output,`${name}.png`),(await win.webContents.capturePage()).toPNG());};
    const click=async(x,y)=>{win.webContents.sendInputEvent({type:'mouseMove',x,y});await pause(50);win.webContents.sendInputEvent({type:'mouseDown',x,y,button:'left',clickCount:1});await pause(80);win.webContents.sendInputEvent({type:'mouseUp',x,y,button:'left',clickCount:1});await pause(600);};
    const key=async keyCode=>{win.webContents.sendInputEvent({type:'keyDown',keyCode});await pause(90);win.webContents.sendInputEvent({type:'keyUp',keyCode});await pause(500);};
    await win.loadURL(process.env.SUNLIT_QA_URL||'http://127.0.0.1:4173/');
    for(let i=0;i<100;i++){if(await evaluate("document.documentElement.dataset.gameReady==='true'"))break;await pause(200);}
    if(!await evaluate("document.documentElement.dataset.gameReady==='true'&&!window.__sunlitQA&&document.querySelectorAll('canvas').length===1"))throw new Error('Production boot or private-hook check failed');
    win.webContents.focus();
    await snap('01-menu');
    await click(230,330);await snap('02-campaign');
    await click(852,657);await snap('03-loadout');
    await click(708,674);await snap('04-first-time-guide');
    await key('Enter');await snap('05-opening-draft');
    await key('1');await pause(2200);await snap('06-battle');
    if(!await evaluate("localStorage.getItem('shadowlegion_tutorial_v4')==='done'"))throw new Error('Native onboarding confirmation failed');
    await key('Escape');await snap('07-pause');
    await key('M');await snap('08-checkpoint-menu');
    const checkpoint=await evaluate("JSON.parse(localStorage.getItem('shadowlegion_checkpoint_v1')||'null')");
    if(checkpoint?.mode!=='campaign'||checkpoint?.stageId!==1)throw new Error('First-stage checkpoint missing');
    await click(228,672);await snap('09-resumed-stage');
    const report={scope:'Production bundle boot and native pointer/keyboard navigation, onboarding, first battle, pause, checkpoint menu and resume. Screenshots require visual review; no debug game hooks. This isolated Electron renderer does not establish browser compatibility or human playability.',engine:process.versions,checkpoint:{mode:checkpoint.mode,stageId:checkpoint.stageId,operativeId:checkpoint.operativeId},errors,output};
    fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));
    console.log(JSON.stringify(report,null,2));
    if(errors.length)throw new Error('Production renderer errors');
    clearTimeout(timeout);app.exit(0);
  }catch(error){console.error(error.stack||error);fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({message:String(error),errors},null,2));clearTimeout(timeout);app.exit(1);}
});
