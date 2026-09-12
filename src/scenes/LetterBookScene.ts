import Phaser from 'phaser';
import { getStoryLibrary } from '../data/story';
import { CampaignProgressionManager } from '../systems/CampaignProgressionManager';
import { JourneyProgressManager } from '../systems/JourneyProgressManager';
import { backdrop, button, heading, label, paperCard, shortcut, UI } from '../ui/theme';

/** Re-reading letters never replays a reward or writes a second progress record. */
export class LetterBookScene extends Phaser.Scene {
  constructor() { super('LetterBookScene'); }

  create(): void {
    const journey = JourneyProgressManager.getState();
    const library = getStoryLibrary(CampaignProgressionManager.getState(), journey);
    backdrop(this, '棉棉的回信册  /  A LITTLE MAILBAG OF MEMORIES');
    button(this, 916, 35, 145, '回到邮局  ESC', () => this.scene.start('MenuScene'), { secondary: true, height: 33, size: 12 });
    heading(this, 44, 91, '每一句回信，都有一个人在等。', 33);
    label(this, 46, 145, '可以随时重读，也可以跳过。邮路上的成长会好好留在行囊里。', 13, UI.muted);
    library.forEach((story, index) => {
      const x = index < 4 ? 265 : 753;
      const y = 244 + (index < 4 ? index : index - 4) * 126;
      paperCard(this, x, y, 454, 110, story.unlocked ? UI.card : UI.paper);
      label(this, x - 207, y - 39, story.recipient ? `远方来信 · ${story.recipient}` : index === 0 ? '旅程的开始' : '寄给棉棉', 11, UI.amber, true);
      heading(this, x - 207, y - 15, story.title, 20, story.unlocked ? UI.ink : UI.muted);
      const delivered = story.id.startsWith('letter-') && Boolean(journey.deliveries[story.id.slice(7) as keyof typeof journey.deliveries]);
      label(this, x - 207, y + 21, story.unlocked ? `${story.pageCount} 页 · ${delivered ? '亲手送达后的回信' : story.id === 'prologue' ? '慢慢读，随时停' : '旧练习旅途可回看'}`
        : story.id === 'letter-forest' ? '在风铃森林交信后拆开' : story.id === 'letter-lake' ? '在圆镜湖把信交给泡芙后拆开' : '等邮路通向那里，再亲手带回回信', 11, UI.muted);
      button(this, x + 161, y + 25, 92, story.unlocked ? '翻开  →' : '待送达', () => this.scene.start('StoryScene', {
        storyId: story.id, returnTo: { scene: 'LetterBookScene' },
      }), { disabled: !story.unlocked, secondary: true, height: 29, size: 12 });
    });
    label(this, 752, 641, '小暖把这些信记在心里。\n你想起谁，就再翻开那一页。', 15, UI.green).setOrigin(.5).setAlign('center').setLineSpacing(10);
    shortcut(this, 'ESC', () => this.scene.start('MenuScene'));
  }
}
