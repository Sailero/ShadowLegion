import Phaser from 'phaser';
import { CHAPTERS, getChapter } from '../data/chapters';
import { getStage, getStagesForChapter, StageDef } from '../data/stages';
import { CampaignProgressionManager } from '../systems/CampaignProgressionManager';
import { backdrop, button, choiceHit, heading, label, paperCard, shortcut, stamp, titleRule, UI } from '../ui/theme';

const ROUTE = [
  [253, 604], [357, 572], [296, 484], [438, 486], [376, 393],
  [481, 334], [371, 257], [501, 225], [590, 309], [600, 420],
];

export class CampaignScene extends Phaser.Scene {
  private chapter = 1;
  private selectedStage = 1;
  constructor() { super('CampaignScene'); }
  init(data: { chapter?: number; stageId?: number } = {}) {
    const next = CampaignProgressionManager.getNextUnlockedStage();
    this.selectedStage = data.stageId ?? next.id;
    this.chapter = data.chapter ?? getStage(this.selectedStage).chapter;
    if (getStage(this.selectedStage).chapter !== this.chapter) this.selectedStage = (this.chapter - 1) * 10 + 1;
  }

  create() {
    CampaignProgressionManager.reconcilePendingRewards();
    const state = CampaignProgressionManager.getState();
    const chapter = getChapter(this.chapter);
    backdrop(this, '旅行地图  /  LETTERS FROM THE ROAD');
    button(this, 921, 35, 137, '回到营地  ESC', () => this.scene.start('MenuScene'), { secondary: true, height: 33, size: 12 });
    heading(this, 39, 93, '给远方的五十封信', 35);
    label(this, 43, 143, '每一封都是独立旅程。送达后回到地图，带上收获，再决定去哪里。', 13, UI.muted);
    label(this, 978, 119, `星章 ${state.totalStars} / 150`, 14, UI.amber, true).setOrigin(1, 0);

    for (let index = 0; index < 5; index++) {
      const id = index + 1, y = 222 + index * 91;
      const map = CHAPTERS[index];
      const selected = this.chapter === id;
      const clears = getStagesForChapter(id).filter(stage => CampaignProgressionManager.getStageRecord(stage.id, state)?.stars).length;
      const g = this.add.graphics();
      g.fillStyle(selected ? UI.green : UI.card, selected ? 1 : .88).fillPoints([
        {x:30,y:y-36},{x:169,y:y-36},{x:161,y:y+37},{x:103,y:y+30},{x:35,y:y+37}],true);
      label(this, 46, y - 23, `CHAPTER 0${id}`, 10, selected ? UI.apricot : UI.amber, true).setLetterSpacing(1);
      heading(this, 45, y - 4, map?.name ?? `第 ${id} 章`, 19, selected ? UI.card : UI.ink);
      label(this, 46, y + 22, `${clears} / 10 封已送达`, 10, selected ? UI.card : UI.muted);
      choiceHit(this, 100, y, 139, 74, () => this.scene.restart({ chapter: id }));
    }

    paperCard(this, 442, 441, 506, 528, 0xf5ebd1);
    this.paintMap(chapter.colors.accent);
    const route = this.add.graphics();
    route.lineStyle(14, 0xdfc697, .65);
    route.beginPath(); ROUTE.forEach(([x,y],index) => index ? route.lineTo(x,y) : route.moveTo(x,y)); route.strokePath();
    route.lineStyle(1.5, UI.amber, .55);
    for (let i = 1; i < ROUTE.length; i++) {
      const [ax,ay] = ROUTE[i-1], [bx,by] = ROUTE[i];
      const distance = Math.hypot(bx-ax, by-ay);
      for (let t = 5; t < distance; t += 13) {
        route.fillStyle(UI.amber,.65).fillCircle(ax+(bx-ax)*t/distance, ay+(by-ay)*t/distance, 1.5);
      }
    }
    const stages = getStagesForChapter(this.chapter);
    stages.forEach((stage, index) => this.drawNode(stage, index));
    label(this, 214, 669, '● 已送达     ○ 可出发     · 待解锁', 11, UI.muted);
    this.showStage(getStage(this.selectedStage));
    label(this, 512, 746, '点击路线上的邮戳选择关卡  ·  每章十关  ·  三颗星章分别记录通关与两项委托', 11, UI.muted).setOrigin(.5);
    shortcut(this, 'ESC', () => this.scene.start('MenuScene'));
  }

  private paintMap(accent: number): void {
    const g = this.add.graphics();
    g.fillStyle(accent,.09).fillEllipse(443,430,438,418);
    g.fillStyle(0xaccac2,.35).fillEllipse(548,582,225,114);
    g.lineStyle(4,0xbed7cc,.7).lineBetween(546,530,623,633);
    // Small cartographic marks sit behind the route, with enough open paper for labels.
    [[246,266],[269,295],[553,483],[571,510],[322,369],[249,411]].forEach(([x,y]) => {
      g.fillStyle(accent,.23).fillTriangle(x,y-18,x-13,y+10,x+13,y+10);
      g.lineStyle(1,UI.green,.2).lineBetween(x,y+7,x,y+17);
    });
    label(this, 218, 195, `第 ${this.chapter} 章`, 10, UI.amber, true).setLetterSpacing(2);
    stamp(this, 627, 636, '旅途\n日记', 32, UI.amber);
  }

  private drawNode(stage: StageDef, index: number): void {
    const [x,y] = ROUTE[index];
    const state = CampaignProgressionManager.getState();
    const record = CampaignProgressionManager.getStageRecord(stage.id,state);
    const unlocked = CampaignProgressionManager.isStageUnlocked(stage.id,state);
    const selected = stage.id === this.selectedStage;
    const radius = stage.kind === 'boss' ? 27 : 22;
    const g = this.add.graphics();
    g.fillStyle(0x817252,.15).fillCircle(x+2,y+4,radius+2);
    g.fillStyle(record?.stars ? UI.green : unlocked ? UI.card : 0xe0d9c5).fillCircle(x,y,radius);
    g.lineStyle(selected ? 3 : 1.5, selected ? UI.amber : unlocked ? UI.green : UI.line).strokeCircle(x,y,radius+ (selected ? 4 : 0));
    label(this,x,y,stage.kind === 'boss' ? '♜' : String(index+1),stage.kind==='boss'?23:17,
      record?.stars ? UI.card : unlocked ? UI.ink : UI.muted,true).setOrigin(.5);
    label(this,x,y+35,stage.name,11,UI.ink,true).setOrigin(.5).setStroke('#f5ebd1',3);
    if (record?.stars) label(this,x,y-37,'★'.repeat(record.stars),11,UI.amber,true).setOrigin(.5);
    choiceHit(this,x,y,radius*2+8,radius*2+8,() => this.scene.restart({chapter:this.chapter,stageId:stage.id}));
  }

  private showStage(stage: StageDef): void {
    const state = CampaignProgressionManager.getState();
    const record = CampaignProgressionManager.getStageRecord(stage.id,state);
    const unlocked = CampaignProgressionManager.isStageUnlocked(stage.id,state);
    paperCard(this,851,441,286,528);
    label(this,731,201,`LETTER ${stage.label}`,11,UI.amber,true).setLetterSpacing(2);
    heading(this,730,236,stage.name,26).setWordWrapWidth(240,true);
    label(this,732,279,stage.description,13,UI.muted).setWordWrapWidth(238,true).setLineSpacing(6);
    titleRule(this,732,350,238);
    label(this,732,369,`地形 · ${stage.mapVariant.name}`,13,UI.green,true).setWordWrapWidth(238,true);
    label(this,732,399,`${stage.waves.length} 波挑战  ·  ${stage.kind === 'boss' ? '章节守关者' : stage.kind === 'elite' ? '精英委托' : '旅途委托'}`,12,UI.muted);
    label(this,732,438,'这一封信的三颗星章',13,UI.ink,true);
    const objectives = ['守住营地，完成本关',stage.objective.label,stage.bonusObjective.label];
    objectives.forEach((text,index) => {
      label(this,733,470+index*42,'☆',17,UI.amber,true);
      label(this,757,470+index*42,text,12,UI.muted).setWordWrapWidth(209,true);
    });
    const status = record?.stars ? `最佳 ${record.stars} / 3 星章 · 已送达 ${record.clears} 次` : unlocked ? '路已经铺好，随时可以出发。' : `先送达第 ${stage.id-1} 封信，再来到这里。`;
    label(this,733,607,status,11,UI.muted).setWordWrapWidth(233,true);
    button(this,852,657,235,unlocked?'整理行囊，准备出发  →':'这条路还在等你',() => this.scene.start('LoadoutScene',{mode:'campaign',stageId:stage.id}),{disabled:!unlocked,height:44,size:14});
  }
}
