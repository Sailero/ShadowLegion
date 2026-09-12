import Phaser from 'phaser';
import { PostalJourneyManager } from '../systems/PostalJourneyManager';
import { JourneyProgressManager as Journey } from '../systems/JourneyProgressManager';
import { backdrop, button, heading, label, paperCard, shortcut, UI } from '../ui/theme';

export class JourneyMapScene extends Phaser.Scene {
  constructor() { super('JourneyMapScene'); }
  create(): void {
    const forest = PostalJourneyManager.getState(), journey = Journey.getState(), protection = Journey.getWriteProtection();
    const lake = Journey.getLakeCheckpoint(journey), mountain = Journey.getMountainCheckpoint(journey);
    backdrop(this, '晴日邮局  /  把心意送往远方');
    button(this, 923, 35, 132, '回邮局 ESC', () => this.scene.start('MenuScene'), { secondary: true, height: 33, size: 12 });
    heading(this, 45, 95, '你走的路，也成为了小暖的路。', 32);
    label(this, 47, 147, '从等一等，到分开行动，再到接着说完。每封信都让你们更懂对方。', 15, UI.muted);
    const cards = [
      { id: 'forest' as const, name: '01  风铃森林 · 栗笺', title: '先学着等一等。',
        text: '读懂树林里的住址。\n小暖扶桥，棉棉亲手送达。',
        progress: journey.deliveries.forest ? '栗笺已回信 · 下一封去湖边' : '地址已夹好 ' + forest.foundAddressIds.length + '/3',
        action: journey.deliveries.forest ? '再去栗笺家坐坐  →' : '寄往风铃森林  →',
        open: () => {
          const fresh = forest.foundAddressIds.length === 0 && !forest.deliveryCompleted;
          this.scene.start(fresh ? 'StoryScene' : 'DeliveryScene', fresh ? { storyId: 'prologue', returnTo: { scene: 'DeliveryScene' } } : undefined);
        } },
      { id: 'lake' as const, name: '02  圆镜湖 · 泡芙', title: '各站一边，也能帮忙。',
        text: '信坐叶舟，棉棉走岸路。\n小暖稳船，你绕岸调流。',
        progress: journey.deliveries.lake ? '泡芙已回信 · 湖心近路开放' : !Journey.isRegionUnlocked('lake') ? '先亲手把森林的信送达'
          : lake === 'start' ? '邀请在信袋里 · 第三片大荷叶' : '已保存到' + (lake === 'mid' ? '湖心码头' : '第三片大荷叶'),
        action: journey.deliveries.lake ? '去湖边坐坐  →' : '寄往圆镜湖  →', open: () => this.scene.start('LakeScene') },
      { id: 'mountain' as const, name: '03  云阶山 · 岚角', title: '把约定接着说完。',
        text: '小暖独自走向铃台。\n你们隔着山路，一人接一声。',
        progress: journey.deliveries.mountain ? '岚角已回信 · 小暖学会接力' : !Journey.isRegionUnlocked('mountain') ? '先亲手把湖边的信送达'
          : mountain === 'trailhead' ? '两只铜铃下 · 新的约定' : '已保存到' + (mountain === 'relayCamp' ? '山腰休息点' : '山口信箱'),
        action: journey.deliveries.mountain ? '再去听听山里的铃  →' : '寄往云阶山  →', open: () => this.scene.start('MountainScene') },
    ];
    for (const [index, card] of cards.entries()) {
      const x = 186 + index * 326, left = x - 136;
      paperCard(this, x, 340, 308, 287, UI.card);
      label(this, left, 221, card.name, 14, UI.amber, true);
      heading(this, left, 263, card.title, 23);
      label(this, left, 316, card.text, 16, UI.ink).setLineSpacing(9);
      label(this, left, 391, card.progress, 12, UI.green);
      button(this, x, 443, 270, card.action, card.open,
        { disabled: !Journey.isRegionUnlocked(card.id) || Boolean(protection), height: 40, size: 15 });
    }
    label(this, 47, 517, '回信提到的远方', 14, UI.amber, true);
    for (const [index, [name, friend, idea]] of [
      ['晒被沙原', '仙人掌团刺', '一起牵住一小片阴凉'], ['晴雪湾', '企鹅芝麻', '各自走一段，共同送到家'],
    ].entries()) {
      const x = 271 + index * 481;
      paperCard(this, x, 604, 448, 105, UI.paper);
      heading(this, x - 199, 566, name, 21);
      label(this, x - 199, 598, friend + ' · ' + idea, 13, UI.muted);
      label(this, x - 199, 625, '后续邮路正在准备', 12, UI.muted);
    }
    button(this, 768, 713, 395, '翻开已收到的回信  →', () => this.scene.start('LetterBookScene'), { secondary: true, height: 42, size: 16 });
    label(this, 49, 687, protection ? '本机记录受到保护，请回邮局查看备份。\n原记录会保留，暂不开始新旅程。'
      : '走累了随时暂停。\n地址、接力和回信会保存在本机。', 13, protection ? 0x956340 : UI.muted).setLineSpacing(7);
    shortcut(this, 'ESC', () => this.scene.start('MenuScene'));
  }
}
