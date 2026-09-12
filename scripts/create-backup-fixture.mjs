// Generates a non-player fixture with real progression APIs for UI backup QA.
// node --import ./scripts/test-loader.mjs scripts/create-backup-fixture.mjs
import fs from 'node:fs';
import {MetaProgressionManager as Meta} from '../src/systems/MetaProgressionManager.ts';
import {CampaignProgressionManager as Campaign} from '../src/systems/CampaignProgressionManager.ts';
import {ShadowTrialManager} from '../src/systems/ShadowTrialManager.ts';
import {RunCheckpointManager} from '../src/systems/RunCheckpointManager.ts';
import {RunRecorder} from '../src/systems/RunRecorder.ts';
import {SettingsManager} from '../src/systems/SettingsManager.ts';
import {SaveBackupManager} from '../src/systems/SaveBackupManager.ts';
const entries=new Map();
globalThis.localStorage={getItem:key=>entries.get(key)??null,setItem:(key,value)=>entries.set(key,String(value)),removeItem:key=>entries.delete(key)};
for(let id=1;id<=15;id++){
  const result=Campaign.recordStageResult(id,{completionId:`backup-ui-${id}`,victory:true,operativeId:'ranger',durationSec:40,coreRatio:1,
    commands:10,dashes:20,skills:20,terrainHits:100,intercepts:100,priorityKills:100});
  if(!result.saved)throw Error('Failed to create isolated progression fixture');
}
for(const ok of [Meta.purchase('armor'),Meta.purchaseResearch('tidy_satchel'),Meta.purchaseSpecialization('ranger_roamer'),Meta.equipSpecialization('ranger','ranger_roamer')]){
  if(!ok)throw Error('Fixture purchase failed');
}
ShadowTrialManager.recordVictory(2,91);
SettingsManager.update({volume:0,reducedMotion:true,autoFire:true});
localStorage.setItem('shadowlegion_tutorial_v4','done');
RunCheckpointManager.save({level:2,stageId:16,startLevel:2,mode:'campaign',operativeId:'ranger',endless:false,score:0,kills:0,elapsedMs:0,
  appliedUpgrades:[],shadowTrial:false,recorder:new RunRecorder().serialize()});
const result=SaveBackupManager.exportBackup();
if(!result.ok)throw Error(result.message);
fs.mkdirSync('.cache',{recursive:true});
fs.writeFileSync('.cache/backup-fixture.json',result.text);
console.log(JSON.stringify({path:'.cache/backup-fixture.json',preview:result.preview,scope:'Generated fixture, not real player progress'}));
