import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/gameConfig';
import { getStory, resolveStoryRequest, turnStoryPage, type StoryDef, type StoryMotif, type StoryRequest } from '../data/story';
import { CampaignProgressionManager } from '../systems/CampaignProgressionManager';
import { JourneyProgressManager } from '../systems/JourneyProgressManager';
import { button, heading, label, paperCard, shortcut, UI } from '../ui/theme';
import { wrapProse } from '../ui/wrapProse';

const MOTIF_COLORS: Record<StoryMotif, number> = {
  post: 0xe8bd78, forest: 0xbbcaa0, lake: 0xaed5d8, mountain: 0xc7c9d7, desert: 0xe7c193, snow: 0xcce0db,
};

/** A freely skippable reading scene. It never records rewards, progress or a separate seen flag. */
export class StoryScene extends Phaser.Scene {
  private request!: StoryRequest;
  private story!: StoryDef;
  private pageIndex = 0;
  private leaving = false;
  private pageTitle!: Phaser.GameObjects.Text;
  private pageEyebrow!: Phaser.GameObjects.Text;
  private pageBody!: Phaser.GameObjects.Text;
  private pageSignature!: Phaser.GameObjects.Text;
  private pageNumber!: Phaser.GameObjects.Text;
  private pageHint!: Phaser.GameObjects.Text;
  private illustration!: Phaser.GameObjects.Graphics;

  constructor() { super('StoryScene'); }

  init(input: unknown = {}): void {
    this.request = resolveStoryRequest(input, CampaignProgressionManager.getState(), JourneyProgressManager.getState());
    this.story = getStory(this.request.storyId)!;
    this.pageIndex = 0;
    this.leaving = false;
  }

  create(): void {
    this.cameras.main.setBackgroundColor(UI.paper);
    if (this.textures.exists('paper-grain')) {
      this.add.tileSprite(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 'paper-grain').setAlpha(.12);
    }
    label(this, 41, 31, '晴日邮局  /  邮袋里的故事', 13, UI.green, true);
    button(this, 899, 36, 166, '合上 / 跳过  ESC', () => this.leave(), { secondary: true, height: 36, size: 12 });
    heading(this, 46, 86, this.story.title, 29);
    this.pageNumber = label(this, 975, 96, '', 14, UI.amber, true).setOrigin(1, 0);

    paperCard(this, 512, 388, 932, 498);
    this.illustration = this.add.graphics();
    if (this.textures.exists('mailcat-portrait')) {
      const portrait = this.add.image(249, 368, 'mailcat-portrait');
      portrait.setScale(223 / Math.max(portrait.width, portrait.height));
    } else {
      // A postal emblem is the honest fallback until the kitten portrait has loaded.
      // Never substitute an old operative / fox portrait for the protagonist.
      const envelope = this.add.graphics();
      envelope.fillStyle(UI.card).fillRoundedRect(169, 317, 160, 105, 5);
      envelope.lineStyle(2, UI.amber, .8).strokeRoundedRect(169, 317, 160, 105, 5);
      envelope.lineBetween(170, 320, 249, 377).lineBetween(249, 377, 328, 320);
      envelope.lineBetween(171, 419, 223, 370).lineBetween(327, 419, 275, 370);
    }
    heading(this, 250, 510, '棉棉 & 小暖', 24, UI.green).setOrigin(.5);
    label(this, 250, 550, '一袋回信，两位小邮差', 12, UI.muted).setOrigin(.5);
    const seam = this.add.graphics();
    seam.lineStyle(1, UI.line, .7).lineBetween(425, 173, 425, 601);
    this.pageEyebrow = label(this, 455, 175, '', 12, UI.amber, true).setWordWrapWidth(463, true);
    this.pageTitle = heading(this, 455, 216, '', 27).setWordWrapWidth(463, true);
    this.pageBody = label(this, 455, 282, '', 20).setLineSpacing(9);
    // Phaser synchronizes this context's font before invoking the custom wrapper.
    this.pageBody.setWordWrapCallback((text, object) =>
      wrapProse(text, value => object.context.measureText(value).width, 460));
    this.pageSignature = label(this, 455, 557, '', 13, UI.green, true).setWordWrapWidth(460, true);
    this.pageHint = label(this, 512, 615, '', 11, UI.muted).setOrigin(.5);

    // Create controls once: rebuilding them on each page would leave stale focus registrations.
    button(this, 206, 678, 225, '← 上一页', () => this.turn('previous'), { secondary: true });
    button(this, 512, 678, 225, '从头重看  R', () => this.turn('restart'), { secondary: true });
    button(this, 818, 678, 225, '下一页 / 读完 →', () => this.turn('next'));
    label(this, 512, 729, '← → 翻页  ·  R / HOME 重读  ·  ESC 合上  ·  TAB + ENTER 选择', 12, UI.muted).setOrigin(.5);
    shortcut(this, 'LEFT', () => this.turn('previous'));
    shortcut(this, 'RIGHT', () => this.turn('next'));
    shortcut(this, 'R', () => this.turn('restart'));
    shortcut(this, 'HOME', () => this.turn('restart'));
    shortcut(this, 'ESC', () => this.leave());
    this.renderPage();
  }

  private renderPage(): void {
    const page = this.story.pages[this.pageIndex];
    this.pageNumber.setText(`${this.pageIndex + 1} / ${this.story.pages.length}`);
    this.pageEyebrow.setText(page.eyebrow);
    this.pageTitle.setText(page.title);
    this.pageBody.setText(page.body);
    this.pageSignature.setText(page.signature);
    this.pageHint.setText(this.request.fallback === 'locked-story'
      ? '那封回信还在路上。先翻开故事的第一页；合上后回到原来的页面。'
      : this.pageIndex === this.story.pages.length - 1
        ? '这一小节已到最后一页；继续将合上绘本。' : '可以慢慢读，也可以随时合上；跳过不会影响旅程。');
    this.drawLetterIllustration(page.motif);
  }

  private drawLetterIllustration(motif: StoryMotif): void {
    const g = this.illustration;
    g.clear();
    g.fillStyle(MOTIF_COLORS[motif], .6).fillEllipse(250, 372, 302, 262);
    g.fillStyle(0xffefd0, .8).fillCircle(338, 230, 30);
    g.lineStyle(1.5, UI.amber, .45).strokeCircle(159, 219, 24).strokeCircle(159, 219, 19);
    // Letter paper, botanical marks and a warm echo; these illustrate correspondence, not an unbuilt map.
    g.fillStyle(UI.card, .8).fillTriangle(111, 457, 126, 424, 147, 455);
    g.lineStyle(1, UI.amber, .65).lineBetween(126, 424, 132, 451);
    g.fillStyle(UI.apricot, .66).fillCircle(354, 449, 19).fillTriangle(341, 438, 343, 420, 355, 436)
      .fillTriangle(356, 436, 367, 421, 368, 443);
    g.lineStyle(1.5, UI.green, .7).lineBetween(349, 450, 350, 452).lineBetween(360, 450, 361, 452);
    for (let i = 0; i < 3; i++) g.fillStyle(UI.amber, .2).fillEllipse(292 + i * 14, 468 - i * 3, 5, 3);
    if (motif === 'forest') {
      g.lineStyle(2, UI.green, .65).lineBetween(110, 267, 146, 297);
      g.fillStyle(0x87a574, .7).fillEllipse(113, 275, 16, 9).fillEllipse(133, 279, 10, 17).fillEllipse(135, 294, 18, 8);
    } else if (motif === 'lake' || motif === 'snow') {
      g.lineStyle(2, 0x699c9d, .6);
      for (let i = 0; i < 3; i++) g.lineBetween(332 - i * 5, 283 + i * 8, 373 + i * 5, 283 + i * 8);
      if (motif === 'snow') g.lineBetween(116, 252, 134, 270).lineBetween(116, 270, 134, 252).lineBetween(125, 248, 125, 274);
    } else if (motif === 'mountain') {
      g.lineStyle(2, UI.green, .5).strokeTriangle(320, 290, 342, 260, 363, 290).strokeTriangle(342, 290, 364, 246, 388, 290);
    } else if (motif === 'desert') {
      g.lineStyle(2, UI.green, .55).lineBetween(365, 264, 365, 298).lineBetween(353, 272, 353, 284)
        .lineBetween(353, 284, 365, 284).lineBetween(365, 280, 376, 280).lineBetween(376, 280, 376, 270);
    }
  }

  private turn(action: 'previous' | 'next' | 'restart'): void {
    if (this.leaving) return;
    const page = turnStoryPage(this.story.pages.length, this.pageIndex, action);
    if (page.finished) { this.leave(); return; }
    this.pageIndex = page.index;
    this.renderPage();
  }

  private leave(): void {
    if (this.leaving) return;
    this.leaving = true;
    this.scene.start(this.request.returnTo.scene, this.request.returnTo.data);
  }
}
