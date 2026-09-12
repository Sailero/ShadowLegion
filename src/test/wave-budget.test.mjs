import test from 'node:test';
import assert from 'node:assert/strict';
import { registerHooks } from 'node:module';
registerHooks({resolve(specifier,context,next){
  if(specifier==='phaser')return{url:new URL('./fixtures/phaser-math.mjs',import.meta.url).href,shortCircuit:true};
  return next(specifier,context);
}});
const {WaveManager}=await import('../systems/WaveManager.ts');
const {MAX_ACTIVE_ENEMIES,MAX_ENDLESS_LEVEL,MAX_ENDLESS_WAVE,normalizeRunLevel}=await import('../config/gameConfig.ts');
const {sanitizeRunCheckpoint}=await import('../systems/RunCheckpointManager.ts');
const {RunRecorder}=await import('../systems/RunRecorder.ts');

test('queued encounters wait at the shared entity budget and finish only after every queued enemy dies',()=>{
  const children=Array.from({length:MAX_ACTIVE_ENEMIES},()=>({active:true}));
  const events=[];
  const group={countActive:()=>children.filter(e=>e.active).length,getChildren:()=>children};
  const manager=new WaveManager({events:{emit:(...args)=>events.push(args)}},1,group);
  Object.assign(manager,{wave:1,waveActive:true,spawning:true,spawnIntervalMs:800,
    pendingSpawns:[{type:'slime',elite:false,boss:false,laneIndex:0},{type:'bat',elite:false,boss:false,laneIndex:0}]});
  const spawned=[];
  manager.spawnOne=type=>{spawned.push(type);children.push({active:true});};
  manager.update(100000,100000);
  assert.equal(group.countActive(),MAX_ACTIVE_ENEMIES);
  assert.equal(manager.aliveCount,MAX_ACTIVE_ENEMIES+2);
  assert.equal(spawned.length,0);
  assert.equal(events.length,0);
  children[0].active=false;
  manager.update(100016,16);
  assert.equal(group.countActive(),MAX_ACTIVE_ENEMIES);
  assert.equal(spawned.length,1);
  children[1].active=false;
  manager.update(100032,16);
  assert.equal(spawned.length,1,'a freed slot must not dump overdue spawns in one frame');
  manager.update(100832,800);
  assert.equal(group.countActive(),MAX_ACTIVE_ENEMIES);
  assert.deepEqual(new Set(spawned),new Set(['slime','bat']));
  children.forEach(e=>e.active=false);
  manager.update(100848,16);
  manager.update(100864,16);
  assert.equal(manager.aliveCount,0);
  assert.equal(events.filter(e=>e[0]==='waveComplete').length,1);
});

test('invalid endless levels cannot create nonfinite difficulty or an undefined chapter',()=>{
  for(const value of [NaN,Infinity,-Infinity,undefined,'100',0,-3,2.8,1001,Number.MAX_SAFE_INTEGER]){
    const manager=new WaveManager({},value,{},true);
    assert.ok(Number.isSafeInteger(manager.level)&&manager.level>=1&&manager.level<=MAX_ENDLESS_LEVEL);
    assert.ok(Number.isFinite(manager.endlessScale));
    assert.ok(manager.chapter&&manager.totalWaves>0);
  }
  assert.equal(normalizeRunLevel(1001,true),1001);
  assert.equal(normalizeRunLevel(Infinity,true),1);
  assert.equal(normalizeRunLevel(2.8,true),2);
  assert.equal(normalizeRunLevel(1001,false),5);
  assert.ok(Number.isSafeInteger(MAX_ENDLESS_WAVE));
});

test('an endless checkpoint beyond station one thousand preserves its route and build contract',()=>{
  const input={version:1,savedAt:'2026-09-12T00:00:00Z',level:1001,startLevel:1,operativeId:'ranger',endless:true,
    mode:'endless',score:0,kills:0,elapsedMs:0,appliedUpgrades:[],shadowTrial:false,recorder:new RunRecorder().serialize()};
  assert.equal(sanitizeRunCheckpoint(input)?.level,1001);
  assert.equal(sanitizeRunCheckpoint({...input,level:MAX_ENDLESS_LEVEL})?.level,MAX_ENDLESS_LEVEL);
  assert.equal(sanitizeRunCheckpoint({...input,level:Infinity}),null);
  assert.equal(sanitizeRunCheckpoint({...input,level:MAX_ENDLESS_LEVEL+1}),null);
});
