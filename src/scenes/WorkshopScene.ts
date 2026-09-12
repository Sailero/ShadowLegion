import Phaser from 'phaser';
import { OPERATIVES, getOperative, OperativeId } from '../data/operatives';
import { MetaProgressionManager, WORKSHOP_MODULES, WORKSHOP_MAX_RANK, workshopUpgradeCost } from '../systems/MetaProgressionManager';
import { SoundManager } from '../systems/SoundManager';
import { CampaignProgressionManager } from '../systems/CampaignProgressionManager';
import { openPlaytestRecords } from '../ui/playtestRecords';
import { backdrop, button, choiceHit, heading, label, paperCard, portrait, shortcut, stamp, titleRule, UI } from '../ui/theme';

type WorkshopTab = 'equipment' | 'research' | 'specialization';
interface WorkshopData { tab?: WorkshopTab; operativeId?: OperativeId; researchId?: string; notice?: string; returnTo?: { scene:string; data?:object } }
export class WorkshopScene extends Phaser.Scene {
  private tab: WorkshopTab = 'equipment';
  private operativeId: OperativeId = 'ranger';
  private researchId = '';
  private notice = '';
  private returnTo: WorkshopData['returnTo'];
  constructor(){super('WorkshopScene');}
  init(data:WorkshopData={}){
    this.tab=data.tab??'equipment';this.operativeId=data.operativeId??'ranger';
    this.researchId=data.researchId??'';this.notice=data.notice??'';this.returnTo=data.returnTo;
  }

  create(){
    CampaignProgressionManager.reconcilePendingRewards();
    const state=MetaProgressionManager.getState();
    const overview=MetaProgressionManager.getProgressionOverview(state);
    backdrop(this,'旅人行囊  /  LITTLE THINGS BECOME A JOURNEY');
    button(this,759,35,140,'查看试玩记录',()=>openPlaytestRecords(this),{secondary:true,height:33,size:12});
    button(this,921,35,138,'返回  ESC',()=>this.back(),{secondary:true,height:33,size:12});
    heading(this,42,92,'把收获，缝进下一程。',35);
    label(this,45,145,`已送达 ${overview.clearedStages}/50 封信 · 营地研究 ${overview.researchOwned}/6 · 成长随旅途永久保留`,13,UI.muted);
    label(this,978,104,`${state.shadowCores} 暖晶`,24,UI.amber,true).setOrigin(1,0);
    const tabs:[WorkshopTab,string][]=[['equipment','随身装备'],['research','营地研究'],['specialization','旅人专精']];
    tabs.forEach(([id,name],index)=>button(this,139+index*228,197,202,name,()=>this.refresh({tab:id}),{secondary:this.tab!==id,height:42,size:15}));
    paperCard(this,512,457,950,448);
    if(this.tab==='equipment')this.drawEquipment();
    else if(this.tab==='research')this.drawResearch();
    else this.drawSpecializations();
    label(this,47,708,this.notice || (this.tab==='specialization'?'每位旅人同时装备一种专精；已经掌握的专精可以免费重配。':'暖晶来自关卡与模式挑战；行囊里的成长会跟你一起出发。'),12,this.notice?UI.green:UI.muted).setWordWrapWidth(929,true);
    label(this,512,750,'TAB 选择 · ENTER 确认 · ESC 返回',11,UI.muted).setOrigin(.5);
    shortcut(this,'ESC',()=>this.back());
  }

  private drawEquipment():void{
    const state=MetaProgressionManager.getState();
    WORKSHOP_MODULES.forEach((module,index)=>{
      const x=194+index*316, rank=state.modules[module.id],cost=workshopUpgradeCost(rank);
      if(index>0)this.add.graphics().lineStyle(1,UI.line,.55).lineBetween(x-158,260,x-158,650);
      stamp(this,x,313,`${rank} / ${WORKSHOP_MAX_RANK}`,40,index===1?UI.green:UI.amber);
      heading(this,x,374,module.name,25).setOrigin(.5);
      label(this,x,418,module.desc,13,UI.muted).setWordWrapWidth(255,true).setAlign('center').setOrigin(.5);
      label(this,x,471,module.perRank,15,UI.green,true).setOrigin(.5);
      for(let i=0;i<WORKSHOP_MAX_RANK;i++)this.add.circle(x-52+i*26,514,5,i<rank?UI.green:UI.line);
      const full=rank>=WORKSHOP_MAX_RANK,canBuy=!full&&state.shadowCores>=cost;
      button(this,x,575,244,full?'已准备得很齐全 ✓':canBuy?`缝好下一针 · ${cost} 暖晶`:`还差 ${cost-state.shadowCores} 暖晶`,()=>{
        this.purchase(MetaProgressionManager.purchase(module.id),`${module.name}升级完成。`);
      },{disabled:!canBuy,height:44,size:14});
      label(this,x,625,'最多五级 · 每次出发都会生效',11,UI.muted).setOrigin(.5);
    });
  }

  private drawResearch():void{
    const state=MetaProgressionManager.getState();
    const nodes=MetaProgressionManager.getResearchNodes(state);
    const selected=nodes.find(node=>node.id===this.researchId)??nodes[0];
    label(this,61,255,'为营地收集的六枚邮票',14,UI.green,true);
    nodes.forEach((node,index)=>{
      const x=132+(index%3)*151,y=371+Math.floor(index/3)*168;
      const active=node.id===selected.id;
      paperCard(this,x,y,132,137,active?UI.pale:UI.card,active?UI.green:UI.line);
      const g=this.add.graphics();g.lineStyle(1,UI.line,.7).strokeRect(x-57,y-59,114,116);
      stamp(this,x,y-22,node.purchased?'✓':String(index+1),22,node.purchased?UI.green:UI.amber);
      label(this,x,y+16,node.name,13,UI.ink,true).setOrigin(.5).setWordWrapWidth(114,true).setAlign('center');
      label(this,x,y+48,node.purchased?'已经贴好':node.unlocked?`${node.cost} 暖晶`:`送达 ${node.requiredClears} 封解锁`,10,UI.muted).setOrigin(.5);
      choiceHit(this,x,y,132,137,()=>this.refresh({researchId:node.id}));
    });
    this.add.graphics().lineStyle(1,UI.line,.7).lineBetween(543,255,543,651);
    heading(this,574,288,selected.name,29);
    label(this,578,342,selected.description,15,UI.muted).setWordWrapWidth(364,true).setLineSpacing(10);
    titleRule(this,579,444,366);
    label(this,578,466,`送达 ${selected.requiredClears} 封信后可研究`,13,UI.green,true);
    label(this,578,506,selected.purchased?'已经成为营地的一部分。':`需要 ${selected.cost} 暖晶 · 研究后永久生效`,13,UI.muted);
    button(this,762,583,365,selected.purchased?'研究完成 ✓':selected.canPurchase?'把这枚邮票贴进日记':'还需要一些旅途收获',()=>this.purchase(MetaProgressionManager.purchaseResearch(selected.id),`${selected.name}研究完成。`),{disabled:!selected.canPurchase,height:48,size:14});
    label(this,578,630,'研究提供新的准备，让每次出发更有选择。',11,UI.muted);
  }

  private drawSpecializations():void{
    const state=MetaProgressionManager.getState();
    OPERATIVES.forEach((operative,index)=>{
      const y=295+index*82,selected=operative.id===this.operativeId;
      if(selected)this.add.graphics().fillStyle(UI.pale).fillRect(51,y-31,205,66);
      portrait(this,85,y,operative.id,51);
      label(this,119,y-18,operative.name,14,UI.ink,true);
      const rank=MetaProgressionManager.getMastery(operative.id,state).rank;
      label(this,120,y+10,`熟练度 ${rank}`,11,UI.muted);
      choiceHit(this,152,y,205,66,()=>this.refresh({operativeId:operative.id}));
    });
    this.add.graphics().lineStyle(1,UI.line,.7).lineBetween(274,256,274,651);
    const mastery=MetaProgressionManager.getMastery(this.operativeId,state);
    heading(this,299,260,`${getOperative(this.operativeId).name}的拿手本领`,25);
    label(this,302,302,`熟练度 ${mastery.rank} · ${mastery.title}   ${mastery.nextRankXp===null?'已经熟练掌握':`${mastery.xp} / ${mastery.nextRankXp}`}`,12,UI.green,true);
    this.add.graphics().fillStyle(UI.line,.6).fillRect(302,332,653,5).fillStyle(UI.green).fillRect(302,332,653*mastery.progress,5);
    const specializations=MetaProgressionManager.getSpecializations(this.operativeId,state);
    specializations.forEach((specialization,index)=>{
      const x=407+index*223;
      paperCard(this,x,480,209,244,specialization.equipped?UI.pale:UI.card,specialization.equipped?UI.green:UI.line);
      label(this,x-87,376,`专精 0${index+1}   ${specialization.equipped?'已装备 ✓':''}`,10,UI.amber,true);
      heading(this,x-88,405,specialization.name,19).setWordWrapWidth(175,true);
      label(this,x-87,442,specialization.description,12,UI.muted).setWordWrapWidth(175,true).setLineSpacing(7);
      label(this,x-87,532,specialization.purchased?'已掌握 · 可免费重配':`熟练度 ${specialization.requiredRank} · ${specialization.cost} 暖晶`,11,UI.muted);
      const available=specialization.purchased||specialization.canPurchase;
      button(this,x,575,176,specialization.equipped?'收起此专精':specialization.purchased?'装备此专精':specialization.canPurchase?'学习此专精':'等待成长解锁',()=>{
        if(specialization.purchased)this.purchase(MetaProgressionManager.equipSpecialization(this.operativeId,specialization.equipped?null:specialization.id),specialization.equipped?'已经收好这项专精。':`${specialization.name}已装进行囊。`);
        else this.purchase(MetaProgressionManager.purchaseSpecialization(specialization.id),`${specialization.name}已经学会，点击装备即可使用。`);
      },{disabled:!available,secondary:specialization.purchased,height:35,size:12});
    });
    label(this,302,631,'关卡首通与提星积累熟练度，每一种专精都有自己的取舍。',12,UI.muted);
  }

  private purchase(success:boolean,message:string):void{
    if(success)SoundManager.get().upgrade();
    this.refresh({notice:success?message:'这次还没完成，稍后再试。'});
  }
  private refresh(patch:WorkshopData):void{this.scene.restart({tab:this.tab,operativeId:this.operativeId,researchId:this.researchId,returnTo:this.returnTo,...patch});}
  private back():void{this.scene.start(this.returnTo?.scene??'MenuScene',this.returnTo?.data);}
}
