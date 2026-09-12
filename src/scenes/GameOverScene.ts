import Phaser from 'phaser';
import { GameMode, getShadowTrial } from '../data/modes';
import { getOperative, OperativeId } from '../data/operatives';
import { getStage } from '../data/stages';
import type { CombatProfile } from '../systems/RunRecorder';
import { CampaignProgressionManager } from '../systems/CampaignProgressionManager';
import { MetaProgressionManager } from '../systems/MetaProgressionManager';
import { ScoreManager } from '../systems/ScoreManager';
import type { ShadowTrialResult } from '../systems/ShadowTrialManager';
import { backdrop, button, heading, label, paperCard, portrait, shortcut, stamp, titleRule, UI } from '../ui/theme';

interface StageOutcome {
  stageId:number; stars:number; newStars:number; firstClear:boolean; nextStageId:number|null;
  chapterCompleted:boolean; campaignCompleted:boolean; earned:number; total:number;
  masteryXp:number; unlocks:string[]; duplicate:boolean; saved:boolean;
}
interface ResultData {
  score?:number; kills?:number; wave?:number; level?:number; victory?:boolean; endless?:boolean;
  durationSec?:number; profile?:CombatProfile|null; operativeId?:OperativeId; defeatReason?:string;
  mode?:GameMode;stageId?:number;trialTier?:number;stageResult?:StageOutcome|null;trialResult?:ShadowTrialResult|null;
  reward?:{earned:number;total:number;masteryXp?:number;saved?:boolean}|null;
}

export class GameOverScene extends Phaser.Scene {
  constructor(){super('GameOverScene');}
  create(data:ResultData={}){
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
    }else label(this,84,395,data.trialResult?.firstClear?'首次完成这封挑战书。':victory?'新的默契，已经收进行囊。':'影子会记住，你这次走过的路。',14,UI.green,true);
    const stats=[['积分',ScoreManager.formatScore(data.score??0)],['击退',String(data.kills??0)],['同行',`${Math.floor(elapsed/60)}:${String(elapsed%60).padStart(2,'0')}`]];
    stats.forEach(([name,value],index)=>{const x=85+index*136;label(this,x,460,name,11,UI.muted);label(this,x,485,value,23,UI.ink,true);});
    titleRule(this,83,537,393);
    heading(this,84,557,`+${earned} 暖晶`,30,UI.green);
    label(this,85,602,stageResult?.unlocks.length?`新收获 · ${stageResult.unlocks.join(' / ')}`:`行囊里共有 ${total} 暖晶`,12,stageResult?.unlocks.length?UI.green:UI.muted).setWordWrapWidth(395,true);

    heading(this,545,234,'寄给明天的自己',27);
    label(this,549,281,profile?`${profile.style}的影子，已经记下这次的习惯。`:'见习影子会继续陪你出发。',13,UI.green,true).setWordWrapWidth(386,true);
    const habits=[['移动',profile?.mobility??0],['火力',profile?.firepower??0],['轻跃',profile?.reflex??0],['本领',profile?.technique??0]] as const;
    habits.forEach(([name,value],index)=>{
      const y=333+index*42;label(this,549,y,name,12,UI.muted);label(this,934,y,String(value),12,UI.green,true).setOrigin(1,0);
      this.add.graphics().fillStyle(UI.line,.5).fillRect(601,y+8,277,5).fillStyle(UI.green).fillRect(601,y+8,277*Math.min(100,value)/100,5);
    });
    label(this,549,513,'这是行为偏好，不是能力评分。',11,UI.muted);
    const suggestion=stageResult?.campaignCompleted?'去无尽漫游延续流派，或与五阶影子换一种方式切磋。':victory?'下一封信和新的风景正在等你。也可以先回工坊，整理刚刚得到的收获。':/营地|防线|暖灯|据点/.test(data.defeatReason??'')?'下次试试按 E 安排影伴守营，自己沿树荫截住来路。':'下次留一次轻跃给危险的弹幕，技能充满后，用 SPACE 打开退路。';
    label(this,549,548,suggestion,13,UI.green,true).setWordWrapWidth(386,true).setLineSpacing(8);

    const next=stageResult?.nextStageId;
    const canNext=mode==='campaign'&&victory&&next&&CampaignProgressionManager.isStageUnlocked(next);
    const retry={mode,stageId:mode==='campaign'?stageId:undefined,trialTier,operativeId,freshRun:true};
    button(this,214,696,335,canNext?'下一封信，准备出发  →':victory&&mode==='campaign'?'把回信收进旅行地图':'再走一次这段路  ·  R',()=>canNext?this.scene.start('LoadoutScene',{mode:'campaign',stageId:next,operativeId}):victory&&mode==='campaign'?this.scene.start('CampaignScene',{stageId}):this.scene.start('ArenaScene',retry),{height:48,size:15});
    button(this,540,696,280,mode==='campaign'?'打开旅行地图':mode==='shadow'?'选择另一封挑战书':'换一位旅人',()=>this.scene.start(mode==='campaign'?'CampaignScene':'LoadoutScene',mode==='campaign'?{stageId}:{mode,trialTier,operativeId}),{secondary:true,height:48,size:14});
    button(this,840,696,275,'去工坊整理行囊',()=>this.scene.start('WorkshopScene',{operativeId}),{secondary:true,height:48,size:14});
    label(this,512,749,saved?'R 重试本次旅途 · ESC 返回 · 本次成长已记在本机日记里':'本次记录暂未保存，请保持页面打开后再检查浏览器存储。',11,saved?UI.muted:UI.rose).setOrigin(.5);
    shortcut(this,'R',()=>this.scene.start('ArenaScene',retry));
    shortcut(this,'ESC',()=>this.scene.start(mode==='campaign'?'CampaignScene':'MenuScene',mode==='campaign'?{stageId}:undefined));
  }
}
