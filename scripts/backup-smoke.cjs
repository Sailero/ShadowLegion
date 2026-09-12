// Production DOM/file APIs, native clicks and isolated saved progress.
// First run scripts/create-backup-fixture.mjs through the test-loader.
const {app,BrowserWindow}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const output=path.resolve('.cache',`backup-qa-${Date.now()}`);
fs.mkdirSync(output,{recursive:true});app.setPath('userData',path.join(output,'profile'));
const fixture=fs.readFileSync('.cache/backup-fixture.json','utf8');
const expected=JSON.parse(fixture).data;
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const errors=[];
const watchdog=setTimeout(()=>{console.error('Backup UI timed out');app.exit(1);},120000);
app.whenReady().then(async()=>{
  try{
    const win=new BrowserWindow({width:1024,height:768,useContentSize:true,frame:false,show:false,
      webPreferences:{contextIsolation:true,nodeIntegration:false,sandbox:true,backgroundThrottling:false,offscreen:true}});
    win.webContents.setFrameRate(60);
    win.webContents.on('console-message',event=>{if(event.level==='error'||event.level===3)errors.push(event.message);});
    const evaluate=code=>win.webContents.executeJavaScript(code,true);
    const waitFor=async(code,label)=>{for(let i=0;i<100;i++){if(await evaluate(code))return;await delay(100);}throw Error('Timed out: '+label);};
    const snap=async name=>{await delay(500);fs.writeFileSync(path.join(output,name+'.png'),(await win.webContents.capturePage()).toPNG());};
    const click=async(x,y)=>{win.webContents.sendInputEvent({type:'mouseMove',x,y});await delay(50);win.webContents.sendInputEvent({type:'mouseDown',x,y,button:'left',clickCount:1});await delay(80);win.webContents.sendInputEvent({type:'mouseUp',x,y,button:'left',clickCount:1});await delay(250);};
    const clickElement=async selector=>{
      const point=await evaluate(`{const e=document.querySelector(${JSON.stringify(selector)});e.scrollIntoView({block:'center'});const r=e.getBoundingClientRect();({x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)})}`);
      await delay(150);await click(point.x,point.y);
    };
    const key=async code=>{win.webContents.sendInputEvent({type:'keyDown',keyCode:code});await delay(80);win.webContents.sendInputEvent({type:'keyUp',keyCode:code});await delay(250);};
    const inputFile=async text=>{
      // Native OS picker is deliberately not automated. Exercise the real File
      // and change-handler contract without reading any user's files.
      await evaluate(`{const data=new DataTransfer();data.items.add(new File([${JSON.stringify(text)}],'isolated-journey.json',{type:'application/json'}));const input=document.querySelector('#backup-file');input.files=data.files;input.dispatchEvent(new Event('change',{bubbles:true}));void 0}`);
      await delay(300);
    };
    const savedState=()=>evaluate("JSON.stringify(Object.fromEntries(Object.keys(localStorage).sort().map(key=>[key,localStorage.getItem(key)])))");
    await win.loadURL('http://127.0.0.1:4173/');
    await waitFor("document.documentElement.dataset.gameReady==='true'",'menu');win.webContents.focus();
    await evaluate("localStorage.setItem('unrelated-qa-key','keep-me');void 0");
    await key('S');await waitFor("Boolean(document.querySelector('#backup-file'))",'settings');
    const before=await savedState();
    await inputFile('{not-json');
    assert.match(await evaluate("document.querySelector('#backup-status').textContent"),/不是完整的 JSON/);
    assert.equal(await savedState(),before);await snap('01-rejected-file');
    await inputFile(fixture);await waitFor("!document.querySelector('#backup-preview').hidden",'preview');
    assert.equal(await evaluate("document.querySelector('#backup-clears').textContent"),'15 / 50');
    assert.equal(await evaluate("document.querySelector('#backup-stars').textContent"),'45 / 150');
    assert.equal(await savedState(),before);await snap('02-preview');
    await clickElement('#backup-cancel');assert.equal(await savedState(),before);
    assert.match(await evaluate("document.querySelector('#backup-status').textContent"),/已取消恢复/);
    await inputFile(fixture);await waitFor("!document.querySelector('#backup-preview').hidden",'second preview');
    await clickElement('#backup-confirm');
    await waitFor("document.documentElement.dataset.gameReady==='true'&&!document.querySelector('.settings-dialog')",'reload to menu');
    const restored=await evaluate("({meta:JSON.parse(localStorage.getItem('shadowlegion_meta_v1')),campaign:JSON.parse(localStorage.getItem('shadowlegion_campaign_v1')),checkpoint:JSON.parse(localStorage.getItem('shadowlegion_checkpoint_v1')),foreign:localStorage.getItem('unrelated-qa-key')})");
    assert.equal(restored.meta.shadowCores,expected.meta.shadowCores);
    assert.deepEqual(restored.meta.modules,expected.meta.modules);
    assert.deepEqual(restored.meta.research,expected.meta.research);
    assert.deepEqual(restored.meta.equippedSpecializations,expected.meta.equippedSpecializations);
    assert.equal(restored.campaign.totalStars,45);assert.equal(restored.checkpoint.stageId,16);assert.equal(restored.foreign,'keep-me');
    await snap('03-restored-menu');
    await key('S');await waitFor("Boolean(document.querySelector('#backup-download'))",'restored settings');
    assert.equal(await evaluate("document.querySelector('#sound-volume').value"),'0');
    assert.equal(await evaluate("document.querySelector('#auto-fire').checked"),true);
    let downloaded;
    const downloadPath=path.join(output,'downloaded-journey.json');
    win.webContents.session.once('will-download',(_event,item)=>{
      item.setSavePath(downloadPath);
      item.once('done',(_event,state)=>{downloaded={state,path:downloadPath};});
    });
    await clickElement('#backup-download');
    for(let i=0;i<80&&!downloaded;i++)await delay(100);
    assert.equal(downloaded?.state,'completed');
    const exported=JSON.parse(fs.readFileSync(downloadPath,'utf8'));
    assert.deepEqual(exported.data,expected);
    assert.equal(JSON.stringify(exported).includes('keep-me'),false);
    await snap('04-downloaded');
    await key('Escape');await click(230,330);await delay(400);await click(852,657);await delay(400);await click(708,674);
    await delay(700);await key('1');await key('1');await delay(900);await key('Escape');
    await click(512,501);await waitFor("Boolean(document.querySelector('#backup-upload'))",'battle settings');
    assert.equal(await evaluate("document.querySelector('#backup-upload').disabled"),true);
    assert.equal(await evaluate("document.querySelector('#backup-restriction').hidden"),false);
    await snap('05-battle-restore-disabled');
    const report={scope:'Production backup UI: real DOM File APIs (OS picker not automated), native confirm/cancel/download, actual reload and localStorage readback. Synthetic progression created through real managers, not player progress.',
      engine:process.versions.chrome,restored:{clears:15,stars:45,cores:restored.meta.shadowCores,checkpoint:16,modules:restored.meta.modules,research:restored.meta.research,equipped:restored.meta.equippedSpecializations},
      checks:{invalidFileNoMutation:true,previewNoMutation:true,cancelNoMutation:true,downloadRoundTrip:true,foreignKeyPreserved:true,restoredSettings:true,battleRestoreDisabled:true},errors,output};
    fs.writeFileSync(path.join(output,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
    if(errors.length)throw Error('Renderer errors');clearTimeout(watchdog);app.exit(0);
  }catch(error){console.error(error.stack||error);fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({message:String(error),errors},null,2));clearTimeout(watchdog);app.exit(1);}
});
