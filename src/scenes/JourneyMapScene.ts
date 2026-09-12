import Phaser from 'phaser';
import { PostalJourneyManager } from '../systems/PostalJourneyManager';
import { JourneyProgressManager as Journey } from '../systems/JourneyProgressManager';
import { backdrop, button, heading, label, paperCard, shortcut, UI } from '../ui/theme';

export class JourneyMapScene extends Phaser.Scene {
  constructor() { super('JourneyMapScene'); }
  create(): void {
    const forest = PostalJourneyManager.getState(), journey = Journey.getState(), protection = Journey.getWriteProtection();
    const lake = Journey.getLakeCheckpoint(journey), mountain = Journey.getMountainCheckpoint(journey);
    const desert = Journey.getDesertCheckpoint(journey);
    backdrop(this, '晴日邮局  /  把心意送往远方');
    button(this, 923, 35, 132, '回邮局 ESC', () => this.scene.start('MenuScene'), { secondary: true, height: 33, size: 12 });
    heading(this, 45, 86, '你走的路，也成为了小暖的路。', 30);
    label(this, 47, 132, '等一等、分头走、接一声，再一起牵住阴凉。每封信，都有两个人的办法。', 14, UI.muted);
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
        progress: journey.deliveries.mountain ? '岚角已回信 · 下一封去沙原' : !Journey.isRegionUnlocked('mountain') ? '先亲手把湖边的信送达'
          : mountain === 'trailhead' ? '两只铜铃下 · 新的约定' : '已保存到' + (mountain === 'relayCamp' ? '山腰休息点' : '山口信箱'),
        action: journey.deliveries.mountain ? '再去听听山里的铃  →' : '寄往云阶山  →', open: () => this.scene.start('MountainScene') },
      { id: 'desert' as const, name: '04  晒被沙原 · 团刺', title: '一起牵住一片阴凉。',
        text: '小暖牵住一角，棉棉绕石换边。\n把阴凉送到卷起的地址旁。',
        progress: journey.deliveries.desert ? '团刺已回信 · 小院里有你的软垫' : !Journey.isRegionUnlocked('desert') ? '先亲手把山里的信送达'
          : desert === 'trailhead' ? '歪帽子的主人 · 在条纹棚下等你'
          : desert === 'stoneCamp' ? '已保存到石堆旁 · 换一边牵布'
          : desert === 'courtyard' ? '已保存到小院 · 一片阴凉照顾两处'
          : '地址已读懂 · 等你亲手交信',
        action: journey.deliveries.desert ? '去团刺的小院喝杯果茶  →' : '寄往晒被沙原  →', open: () => this.scene.start('DesertScene') },
    ];
    for (const [index, card] of cards.entries()) {
      const x = 267 + index % 2 * 489, top = 169 + Math.floor(index / 2) * 224, left = x - 199;
      const unlocked = Journey.isRegionUnlocked(card.id);
      paperCard(this, x, top + 103, 448, 206, UI.card);
      label(this, left, top + 13, card.name, 14, UI.amber, true);
      label(this, x + 197, top + 13, journey.deliveries[card.id] ? '已回信' : unlocked ? '待投递' : '待启程', 12,
        journey.deliveries[card.id] ? UI.green : UI.muted).setOrigin(1, 0);
      heading(this, left, top + 39, card.title, 22);
      label(this, left, top + 76, card.text, 14, UI.ink).setLineSpacing(6);
      label(this, left, top + 126, card.progress, 12, unlocked ? UI.green : UI.muted);
      button(this, x, top + 174, 398, card.action, card.open,
        { disabled: !unlocked || Boolean(protection), height: 36, size: 14 });
    }
    paperCard(this, 512, 643, 937, 56, UI.paper);
    heading(this, 66, 626, '05  晴雪湾 · 企鹅芝麻', 18, UI.muted);
    label(this, 379, 630, '回信提到的远方 · 后续邮路准备中，暂不可进入', 13, UI.muted);
    button(this, 769, 718, 399, '翻开已收到的回信  →', () => this.scene.start('LetterBookScene'), { secondary: true, height: 42, size: 16 });
    label(this, 49, 691, protection ? '本机记录受到保护，请回邮局查看备份。\n原记录会保留，暂不开始新旅程。'
      : '走累了随时暂停，已确认的进度保存在本机。\nTAB 选择 · ENTER 出发 · ESC 回邮局', 12, protection ? 0x956340 : UI.muted).setLineSpacing(7);
    shortcut(this, 'ESC', () => this.scene.start('MenuScene'));
  }
}
