import Phaser from 'phaser';
import { GameMode, getShadowTrial, SHADOW_TRIALS } from '../data/modes';
import { getOperative, OPERATIVES, OperativeId } from '../data/operatives';
import { getSkill } from '../data/skills';
import { skillTexture } from '../ui/skillVisuals';
import { getStage } from '../data/stages';
import { PROGRESSION_MILESTONES } from '../data/progression';
import { MetaProgressionManager } from '../systems/MetaProgressionManager';
import { CampaignProgressionManager } from '../systems/CampaignProgressionManager';
import { RunCheckpointManager } from '../systems/RunCheckpointManager';
import { ShadowTrialManager } from '../systems/ShadowTrialManager';
import { backdrop, button, choiceHit, heading, label, paperCard, portrait, shortcut, stamp, titleRule, UI } from '../ui/theme';

interface LoadoutData { mode?: GameMode; stageId?: number; trialTier?: number; operativeId?: OperativeId; endless?: boolean; chapter?: number }
export class LoadoutScene extends Phaser.Scene {
  private mode: GameMode = 'campaign';
  private stageId = 1;
  private trialTier = 1;
  private selectedOperative: OperativeId = 'ranger';
  constructor() { super('LoadoutScene'); }
  init(data: LoadoutData = {}) {
    this.mode = data.mode ?? (data.endless ? 'endless' : 'campaign');
    this.stageId = data.stageId ?? CampaignProgressionManager.getNextUnlockedStage().id;
    this.trialTier = getShadowTrial(data.trialTier ?? 1).tier;
    this.selectedOperative = data.operativeId ?? 'ranger';
  }

  create() {
    CampaignProgressionManager.reconcilePendingRewards();
    const state = MetaProgressionManager.getState();
    if (!state.unlockedOperatives.includes(this.selectedOperative)) this.selectedOperative = 'ranger';
    if (this.mode === 'campaign' && !CampaignProgressionManager.isStageUnlocked(this.stageId)) this.stageId = CampaignProgressionManager.getNextUnlockedStage().id;
    const stage = getStage(this.stageId);
    const operative = getOperative(this.selectedOperative);
    const mastery = MetaProgressionManager.getMastery(this.selectedOperative, state);
    const specialization = MetaProgressionManager.getSpecializations(this.selectedOperative, state).find(item => item.equipped);
    backdrop(this, '出发前的一页  /  THE TRAVELER’S SATCHEL');
    button(this, 919, 35, 141, '返回  ESC', () => this.back(), { secondary: true, height: 33, size: 12 });
    heading(this, 41, 91, this.mode === 'campaign' ? `${stage.label} · ${stage.name}` : this.mode === 'shadow' ? '收到了，昨天的挑战书。' : '去看看，路的尽头还有什么。', 33);
    label(this, 44, 142, this.mode === 'campaign' ? '选好邮装和拿手本领，先把下一段邮路练习走稳。' : this.mode === 'shadow' ? '五封独立挑战书，三轮切磋。看清蓄力，找到自己的破绽。' : '五种风景不断轮转，保留本局搭配，向更远的波次进发。', 13, UI.muted);
    paperCard(this, 512, 442, 951, 536);
    const seam = this.add.graphics();
    seam.lineStyle(1, UI.line,.8).lineBetween(419,194,419,687);
    seam.lineStyle(5,0xb7a280,.08).lineBetween(424,194,424,687);
    label(this,60,201,'01  棉棉今天穿哪套邮装？',14,UI.green,true);
    OPERATIVES.forEach((item,index) => {
      const y=275+index*80;
      const unlocked=state.unlockedOperatives.includes(item.id);
      const selected=item.id===this.selectedOperative;
      const g=this.add.graphics();
      if(selected) g.fillStyle(UI.pale).fillPoints([{x:55,y:y-36},{x:397,y:y-32},{x:391,y:y+34},{x:59,y:y+37}],true);
      g.lineStyle(1,UI.line,.55).lineBetween(129,y+35,383,y+35);
      portrait(this,91,y,item.id,56);
      label(this,135,y-22,item.name,17,unlocked?UI.ink:UI.muted,true);
      const milestone=PROGRESSION_MILESTONES.find(unlock=>unlock.operativeId===item.id);
      label(this,135,y+7,unlocked?item.role:`走过 ${getStage(milestone?.stageId??1).label} 后学会`,11,UI.muted);
      label(this,378,y-20,selected?'✓':unlocked?String(index+1):'锁',12,selected?UI.green:UI.muted,true).setOrigin(1,0);
      if(unlocked) choiceHit(this,226,y,342,72,()=>this.refresh({operativeId:item.id}));
      shortcut(this,String(index+1),()=>{if(unlocked)this.refresh({operativeId:item.id});});
    });
    label(this,62,601,`熟练度 ${mastery.rank} · ${mastery.title}`,12,UI.green,true);
    const xp=this.add.graphics();xp.fillStyle(UI.line,.6).fillRect(62,629,324,5);xp.fillStyle(UI.green).fillRect(62,629,324*mastery.progress,5);
    label(this,62,646,specialization?`专精 · ${specialization.name}`:'专精 · 随着关卡中的成长逐渐掌握',11,UI.muted);
    button(this,225,682,322,'整理装备与专精  →',()=>this.scene.start('WorkshopScene',{tab:'specialization',operativeId:this.selectedOperative,returnTo:{scene:'LoadoutScene',data:this.navigationData()}}),{secondary:true,height:33,size:12});

    heading(this,454,205,operative.name,29);
    portrait(this,911,253,this.selectedOperative,92);
    label(this,456,251,operative.trait,13,UI.muted).setWordWrapWidth(350,true).setLineSpacing(7);
    const skill = getSkill(operative.signatureSkill)!;
    this.add.image(474, 323, skillTexture(skill.id)).setDisplaySize(34, 34);
    label(this,498,305,`拿手本领 · ${skill.name}`,14,UI.green,true);
    label(this,498,328,`${skill.purpose} · ${skill.chargeCost} 点灵感`,11,UI.muted);
    titleRule(this,455,350,501);
    if(this.mode==='campaign') {
      label(this,456,375,'02  这次出发，要记住的事',14,UI.green,true);
      label(this,456,410,`地形 · ${stage.mapVariant.name}  /  ${stage.waves.length} 波挑战`,13,UI.ink,true);
      label(this,456,443,stage.description,13,UI.muted).setWordWrapWidth(475,true);
      [stage.objective.label,stage.bonusObjective.label].forEach((text,index)=>label(this,456,500+index*40,`☆  ${text}`,13,UI.muted).setWordWrapWidth(478,true));
      label(this,456,606,'完成本关后回到地图，暖晶与熟练度会留在行囊。',12,UI.green);
    } else if(this.mode==='shadow') this.drawTrials();
    else {
      heading(this,456,378,'这一次，不急着寄出最后一封信。',23);
      const rules=[['01','五章风景轮转','地形会改变进攻与回防路线。'],['02','本局流派持续成长','在波间挑选增幅，让搭配逐步成型。'],['03','影伴依然在你身边','按 E 安排同行或守营，彼此留出退路。']];
      rules.forEach(([n,title,description],index)=>{
        const y=431+index*61;label(this,457,y,n,12,UI.amber,true);label(this,490,y,title,14,UI.ink,true);label(this,490,y+24,description,12,UI.muted);
      });
    }
    button(this,708,674,504,this.mode==='campaign'?'带上行囊，出发  →':this.mode==='shadow'?'拆开挑战书，开始切磋  →':'向更远的地方出发  →',()=>this.launch(),{height:48,size:16});
    label(this,512,748,RunCheckpointManager.load()?'开始新旅途会替换尚未完成的关卡记录。':'WASD 移动 · 鼠标瞄准 · SHIFT 轻跃 · SPACE 本领 · E 安排影伴',11,UI.muted).setOrigin(.5);
    shortcut(this,'ESC',()=>this.back());
  }

  private drawTrials():void {
    const records=ShadowTrialManager.getRecords();
    label(this,456,372,'02  挑一封昨天寄来的挑战书',14,UI.green,true);
    SHADOW_TRIALS.forEach((trial,index)=>{
      const x=532+(index%3)*167,y=441+Math.floor(index/3)*85;
      const selected=trial.tier===this.trialTier;
      paperCard(this,x,y,153,72,selected?UI.pale:UI.card,selected?UI.green:UI.line);
      label(this,x-63,y-25,`0${trial.tier} / ${trial.rivals===2?'双影':'单影'}`,10,UI.amber,true);
      label(this,x-63,y-4,trial.name,14,UI.ink,true);
      label(this,x-63,y+20,records.some(row=>row.tier===trial.tier)?'已完成 ✓':selected?'已选择':'等待你的击掌',10,UI.muted);
      choiceHit(this,x,y,153,72,()=>this.refresh({trialTier:trial.tier}));
    });
    const trial=getShadowTrial(this.trialTier);
    label(this,457,584,trial.lesson,12,UI.green,true).setWordWrapWidth(483,true);
    label(this,457,616,'独立三轮切磋 · 营地安全 · 可反复练习',11,UI.muted);
  }
  private navigationData():LoadoutData{return{mode:this.mode,stageId:this.stageId,trialTier:this.trialTier,operativeId:this.selectedOperative};}
  private refresh(patch:LoadoutData):void{this.scene.restart({...this.navigationData(),...patch});}
  private back():void{this.scene.start(this.mode==='campaign'?'CampaignScene':'MenuScene',this.mode==='campaign'?{stageId:this.stageId}:undefined);}
  private launch():void{this.scene.start('ArenaScene',{mode:this.mode,stageId:this.mode==='campaign'?this.stageId:undefined,trialTier:this.trialTier,operativeId:this.selectedOperative,freshRun:true});}
}
