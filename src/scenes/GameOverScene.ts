import Phaser from 'phaser';
import { GameMode, getShadowTrial } from '../data/modes';
import { getOperative, OperativeId } from '../data/operatives';
import { getStage } from '../data/stages';
import type { CombatProfile } from '../systems/RunRecorder';
import { CampaignProgressionManager, type StageCompletion, type StageResultReward } from '../systems/CampaignProgressionManager';
import { MetaProgressionManager, type RunSummary } from '../systems/MetaProgressionManager';
import { ScoreManager } from '../systems/ScoreManager';
import { ShadowTrialManager, type ShadowTrialResult } from '../systems/ShadowTrialManager';
import { backdrop, button, heading, label, paperCard, portrait, shortcut, stamp, titleRule, UI } from '../ui/theme';

interface ResultData {
  score?:number; kills?:number; wave?:number; level?:number; victory?:boolean; endless?:boolean;
  durationSec?:number; profile?:CombatProfile|null; operativeId?:OperativeId; defeatReason?:string;
  mode?:GameMode;stageId?:number;trialTier?:number;stageResult?:StageResultReward|null;trialResult?:ShadowTrialResult|null;
  stageCompletion?:StageCompletion;
  profileSaved?:boolean;
  runSummary?:RunSummary; completionId?:string;
  reward?:{earned:number;total:number;masteryXp?:number;saved?:boolean}|null;
}

export class GameOverScene extends Phaser.Scene {
  private pendingExit: string | null = null;
  private saveNotice?: Phaser.GameObjects.Text;
  constructor(){super('GameOverScene');}
  create(data:ResultData={}){
    this.pendingExit = null;
    const mode=data.mode??(data.endless?'endless':'campaign');
    const stageId=data.stageId??Math.max(1,((data.level??1)-1)*10+1);
    const trialTier=data.trialTier??1;
    const victory=Boolean(data.victory),stageResult=data.stageResult,profile=data.profile;
    const operativeId=data.operativeId??'ranger';
    const stage=getStage(stageId);
    const mastery=MetaProgressionManager.getMastery(operativeId);
    const elapsed=Math.max(0,Math.round(data.durationSec??0));
    const earned=stageResult?.earned??data.reward?.earned??0;
    const total=stageResult?.total??data.reward?.total??MetaProgressionManager.getState().shadowCores;
    const saved=stageResult?.saved??data.reward?.saved??true;
    const trialSaved=mode!=='shadow'||!victory||data.trialResult?.saved===true;
    backdrop(this,'一封旅途回信  /  A LETTER TO TOMORROW');
    const title=stageResult?.campaignCompleted?'五十封信，都有了回响。':victory?(mode==='campaign'?`第 ${stageId} 封信，送到了。`:mode==='shadow'?'昨天的自己，向你击了个掌。':'这一程，走得很好。'):'歇一歇，故事还会继续。';
    heading(this,45,93,title,36);
    label(this,49,150,mode==='campaign'?`${stage.label} · ${stage.name}`:mode==='shadow'?`影子试炼 ${trialTier} · ${getShadowTrial(trialTier).name}`:`无尽漫游 · 第 ${data.level??1} 站 · ${data.wave??0} 波`,14,UI.muted);
    paperCard(this,512,423,929,449);
    this.add.graphics().lineStyle(1,UI.line,.7).lineBetween(513,219,513,626);
    stamp(this,432,261,victory?'已送达':'待续',38,victory?UI.green:UI.amber);
    portrait(this,159,310,operativeId,144);
    heading(this,260,268,getOperative(operativeId).name,25);
    label(this,262,311,`熟练度 ${mastery.rank} · ${mastery.title}`,12,UI.green,true);
    label(this,262,347,`本次熟练度 +${stageResult?.masteryXp??data.reward?.masteryXp??0}`,12,UI.muted);
    if(mode==='campaign'){
      const stars=stageResult?.stars??0;
      label(this,84,389,'★'.repeat(stars)+'☆'.repeat(Math.max(0,3-stars)),30,UI.amber,true);
      label(this,229,401,stageResult?.firstClear?'第一次送达，谢谢你的勇气。':stageResult?.newStars?`比上次多了 ${stageResult.newStars} 枚星章。`:victory?'这段熟悉的路，又多了一次回响。':'每一次尝试，都让下一次更熟悉。',12,UI.muted).setWordWrapWidth(255,true);
    }else label(this,84,395,!trialSaved?'挑战已完成，切磋纪录暂未保存。':data.trialResult?.firstClear?'首次完成这封挑战书。':victory?'新的默契，已经收进行囊。':'影子会记住，你这次走过的路。',14,trialSaved?UI.green:UI.rose,true);
    const stats=[['积分',ScoreManager.formatScore(data.score??0)],['击退',String(data.kills??0)],['同行',`${Math.floor(elapsed/60)}:${String(elapsed%60).padStart(2,'0')}`]];
    stats.forEach(([name,value],index)=>{const x=85+index*136;label(this,x,460,name,11,UI.muted);label(this,x,485,value,23,UI.ink,true);});
    titleRule(this,83,537,393);
    heading(this,84,557,`+${earned} 暖晶`,30,UI.green);
    label(this,85,602,stageResult?.unlocks.length?`新收获 · ${stageResult.unlocks.join(' / ')}`:`行囊里共有 ${total} 暖晶`,12,stageResult?.unlocks.length?UI.green:UI.muted).setWordWrapWidth(395,true);

    heading(this,545,234,'寄给明天的自己',27);
    label(this,549,281,data.profileSaved===false?'这次的习惯尚未存入日记，当前页可查看。':profile?`${profile.style}的影子，已经记下这次的习惯。`:'见习影子会继续陪你出发。',13,data.profileSaved===false?UI.rose:UI.green,true).setWordWrapWidth(386,true);
    const habits=[['移动',profile?.mobility??0],['火力',profile?.firepower??0],['轻跃',profile?.reflex??0],['本领',profile?.technique??0]] as const;
    habits.forEach(([name,value],index)=>{
      const y=333+index*42;label(this,549,y,name,12,UI.muted);label(this,934,y,String(value),12,UI.green,true).setOrigin(1,0);
      this.add.graphics().fillStyle(UI.line,.5).fillRect(601,y+8,277,5).fillStyle(UI.green).fillRect(601,y+8,277*Math.min(100,value)/100,5);
    });
    label(this,549,513,'这是行为偏好，不是能力评分。',11,UI.muted);
    const suggestion=stageResult?.campaignCompleted?'去无尽漫游延续流派，或与五阶影子换一种方式切磋。':victory?'下一封信和新的风景正在等你。也可以先回工坊，整理刚刚得到的收获。':/营地|防线|暖灯|据点/.test(data.defeatReason??'')?'下次试试按 E 安排影伴守营，自己沿树荫截住来路。':'下次留一次轻跃给危险的弹幕，技能充满后，用 SPACE 打开退路。';
    label(this,549,548,suggestion,13,UI.green,true).setWordWrapWidth(386,true).setLineSpacing(8);

    const next=stageResult?.nextStageId;
    const canNext=mode==='campaign'&&victory&&saved&&data.profileSaved!==false&&next&&CampaignProgressionManager.isStageUnlocked(next);
    const needsSave=(mode==='campaign'&&!saved&&Boolean(data.stageCompletion)) ||
      (mode==='shadow'&&victory&&(!saved||!trialSaved)&&Boolean(data.completionId)) ||
      (data.profileSaved===false&&Boolean(data.runSummary));
    const protectedSave=needsSave&&(stageResult?.error==='future-save-version'||MetaProgressionManager.getWriteProtection()==='future-version');
    const retry={mode,stageId:mode==='campaign'?stageId:undefined,trialTier,operativeId,freshRun:true};
    button(this,214,696,335,protectedSave?'新版存档已保护':needsSave?'重试保存这封回信  ·  S':canNext?'下一封信，准备出发  →':victory&&mode==='campaign'?'把回信收进旅行地图':'再走一次这段路  ·  R',()=>needsSave?this.retryStageSave(data):canNext?this.scene.start('LoadoutScene',{mode:'campaign',stageId:next,operativeId}):victory&&mode==='campaign'?this.scene.start('CampaignScene',{stageId}):this.scene.start('ArenaScene',retry),{disabled:protectedSave,height:48,size:15});
    button(this,540,696,280,mode==='campaign'?'打开旅行地图':mode==='shadow'?'选择另一封挑战书':'换一位旅人',()=>this.leaveResult(data,'map',()=>this.scene.start(mode==='campaign'?'CampaignScene':'LoadoutScene',mode==='campaign'?{stageId}:{mode,trialTier,operativeId})),{secondary:true,height:48,size:14});
    button(this,840,696,275,'去工坊整理行囊',()=>this.leaveResult(data,'workshop',()=>this.scene.start('WorkshopScene',{operativeId})),{secondary:true,height:48,size:14});
    const saveNotice=protectedSave?'存档来自更新版本，请使用新版继续；原有记录已保留。'
      :stageResult&&!saved&&!stageResult.routeSaved?'本次成果只留在当前页面 · S 重试保存；刷新或离开会丢失本次成果'
      :data.profileSaved===false?'部分记录尚未保存，包含本次习惯日记 · S 重试保存；离开会丢失未保存部分'
      :mode==='shadow'&&victory
      ?`切磋纪录${trialSaved?'已保存':'暂未保存'} · 暖晶结果${saved?'已保存':'暂未保存'} · ${trialSaved&&saved?'R 重试 · ESC 返回':'S 重试保存；离开会丢失未保存结果'}`
      :saved?'R 重试本次旅途 · ESC 返回 · 本次成长已记在本机日记里'
      :stageResult?.routeSaved?'路线已保存，奖励记录等待确认 · S 重试保存，或回营后自动核对'
      :'本次成果只留在当前页面 · S 重试保存；刷新或离开会丢失本次成果';
    this.saveNotice=label(this,512,749,saveNotice,11,saved&&trialSaved?UI.muted:UI.rose).setOrigin(.5);
    shortcut(this,'S',()=>{if(needsSave&&!protectedSave)this.retryStageSave(data);});
    shortcut(this,'R',()=>needsSave?(!protectedSave&&this.retryStageSave(data)):this.scene.start('ArenaScene',retry));
    shortcut(this,'ESC',()=>this.leaveResult(data,'escape',()=>this.scene.start(mode==='campaign'?'CampaignScene':'MenuScene',mode==='campaign'?{stageId}:undefined)));
  }

  private retryStageSave(data: ResultData): void {
    const needed = (data.stageCompletion && data.stageResult && !data.stageResult.saved) ||
      (data.mode === 'shadow' && data.victory && data.completionId && (!data.trialResult?.saved || !data.reward?.saved)) ||
      (data.profileSaved === false && data.runSummary);
    if (!needed) return;
    const updated = { ...data };
    if (data.stageCompletion && data.stageResult && !data.stageResult.saved) {
      const previous = data.stageResult;
      const result = CampaignProgressionManager.recordStageResult(previous.stageId, data.stageCompletion);
      updated.stageResult = { ...result,
        firstClear: previous.firstClear || result.firstClear,
        newStars: Math.max(previous.newStars, result.newStars),
        earned: previous.earned + result.earned,
        masteryXp: previous.masteryXp + result.masteryXp,
        unlocks: [...new Set([...previous.unlocks, ...result.unlocks])],
      };
    }
    if (data.mode === 'shadow' && data.victory && data.completionId) {
      if (!data.trialResult?.saved) updated.trialResult = ShadowTrialManager.recordVictory(data.trialTier ?? 1, data.durationSec ?? 1, data.completionId);
      if (!data.reward?.saved) {
        const result = MetaProgressionManager.recordModeProgress({ completionId: data.completionId,
          mode: 'shadow', tier: data.trialTier ?? 1, operativeId: data.operativeId ?? 'ranger' });
        updated.reward = { ...result, earned: (data.reward?.earned ?? 0) + result.earned,
          masteryXp: (data.reward?.masteryXp ?? 0) + result.masteryXp };
      }
    }
    if (data.profileSaved === false && data.runSummary) {
      MetaProgressionManager.recordRun(data.runSummary);
      updated.profileSaved = MetaProgressionManager.getState().rewardReceipts.includes(`run:${data.runSummary.completionId}`);
    }
    this.scene.restart(updated);
  }

  /** Only an unwritten route needs a discard choice; durable rewards survive departure. */
  private leaveResult(data: ResultData, destination: string, leave: () => void): void {
    const transient = (data.stageResult && !data.stageResult.saved && !data.stageResult.routeSaved) ||
      (data.mode === 'shadow' && data.victory && (!data.trialResult?.saved || !data.reward?.saved)) || data.profileSaved === false;
    if (transient && this.pendingExit !== destination) {
      this.pendingExit = destination;
      this.saveNotice?.setText('本次成果尚未保存。再次选择同一出口将放弃本次成果；按 S 可重试保存。');
      return;
    }
    leave();
  }
}
