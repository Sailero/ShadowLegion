import Phaser from 'phaser';
import { PostalJourneyManager } from '../systems/PostalJourneyManager';
import { JourneyProgressManager as Journey } from '../systems/JourneyProgressManager';
import { backdrop, button, heading, label, paperCard, shortcut, UI } from '../ui/theme';

export class JourneyMapScene extends Phaser.Scene {
  constructor() { super('JourneyMapScene'); }
  create(): void {
    const forest = PostalJourneyManager.getState(), journey = Journey.getState(), protection = Journey.getWriteProtection();
    const delivered = Boolean(journey.deliveries.lake);
    backdrop(this, '晴日邮局  /  把心意送往远方');
    button(this, 923, 35, 132, '回邮局 ESC', () => this.scene.start('MenuScene'), { secondary: true, height: 33, size: 12 });
    heading(this, 45, 95, '你走的路，也成为了小暖的路。', 32);
    label(this, 47, 147, '每封信带来一位朋友、一种新分工，和下一处真实的地址。', 15, UI.muted);
    const ink = this.add.graphics();
    ink.lineStyle(4, UI.amber, .42).lineBetween(240, 312, 765, 312);
    paperCard(this, 266, 329, 438, 258, UI.card); paperCard(this, 758, 329, 438, 258, UI.card);
    label(this, 66, 222, '01  风铃森林 · 松鼠栗笺', 14, UI.amber, true);
    heading(this, 66, 259, '先学着等一等。', 29);
    label(this, 67, 310, '找回住址，读懂树林里的路。\n小暖扶着桥，棉棉把信亲手送达。', 17, UI.ink).setLineSpacing(9);
    label(this, 67, 381, forest.deliveryCompleted || journey.deliveries.forest ? '已收到栗笺的回信 · 湖泊邮路已开放' : `地址已夹好 ${forest.foundAddressIds.length}/3`, 13, UI.green);
    button(this, 266, 424, 365, forest.deliveryCompleted ? '再去栗笺家坐坐  →' : '寄往风铃森林  →', () => {
      const fresh = forest.foundAddressIds.length === 0 && !forest.deliveryCompleted;
      this.scene.start(fresh ? 'StoryScene' : 'DeliveryScene', fresh ? { storyId: 'prologue', returnTo: { scene: 'DeliveryScene' } } : undefined);
    }, { height: 40, size: 16 });
    label(this, 558, 222, '02  圆镜湖 · 小鱼泡芙', 14, UI.amber, true);
    heading(this, 558, 259, '站在不同的地方，也能帮忙。', 23);
    label(this, 559, 310, '信坐叶舟，你走岸路。\n小暖稳住船，你绕岸调好水流。', 17, UI.ink).setLineSpacing(9);
    const checkpoint = Journey.getLakeCheckpoint(journey);
    label(this, 559, 381, delivered ? '泡芙已收信 · 新回信与湖心近路已开放' : Journey.isRegionUnlocked('lake')
      ? checkpoint === 'start' ? '第三片大荷叶旁 · 邀请已经夹在信袋里' : `已保存到${checkpoint === 'mid' ? '湖心码头' : '第三片大荷叶'}` : '先亲手把森林的信交给栗笺', 13, UI.green);
    button(this, 758, 424, 365, delivered ? '去湖边坐坐  →' : '寄往圆镜湖  →', () => this.scene.start('LakeScene'),
      { disabled: !Journey.isRegionUnlocked('lake') || Boolean(protection), height: 40, size: 16 });
    label(this, 47, 497, '回信提到的远方', 14, UI.amber, true);
    for (const [index, [name, friend, idea]] of [['云阶山', '山羊岚角', '把信号传到风的另一边'], ['晒被沙原', '仙人掌团刺', '一起牵住一小片阴凉'], ['晴雪湾', '企鹅芝麻', '各自走一段，共同送到家']].entries()) {
      const x = 197 + index * 316;
      paperCard(this, x, 578, 298, 110, UI.paper);
      heading(this, x - 126, 543, name, 22); label(this, x - 126, 574, `${friend} · ${idea}`, 11, UI.muted);
      label(this, x - 126, 598, '后续邮路正在准备', 12, UI.muted);
    }
    button(this, 768, 691, 395, '翻开已收到的回信  →', () => this.scene.start('LetterBookScene'), { secondary: true, height: 42, size: 16 });
    label(this, 49, 680, protection ? '本机记录受到保护，请回邮局查看备份。\n原记录会保留，暂不开始新的湖泊旅程。'
      : '走累了随时暂停。\n已确认的地址、到站和回信都会保存在本机。', 13, protection ? 0x956340 : UI.muted).setLineSpacing(7);
    shortcut(this, 'ESC', () => this.scene.start('MenuScene'));
  }
}
