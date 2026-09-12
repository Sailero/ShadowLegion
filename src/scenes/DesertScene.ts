import Phaser from 'phaser';
import { PostalWalkScene, type WalkPoint } from './PostalWalkScene';
import {
  DESERT_WORLD, DESERT_CHECKPOINTS, DESERT_SPAWN, DESERT_NPC, DESERT_DISCOVERY,
  DESERT_ANCHORS, DESERT_PUZZLES, isDesertSafe,
  type DesertAnchorId, type DesertPuzzleId, type DesertCheckpoint,
} from '../data/desert';
import { PairedCover, COVER_GRIP_RADIUS, COVER_READ_RADIUS, type CoverError, type CoverEvent, type CoverReleaseReason } from '../systems/PairedCover';
import { JourneyProgressManager as Journey, type JourneyState, type JourneyNodeId } from '../systems/JourneyProgressManager';
import { SoundManager } from '../systems/SoundManager';
import { SettingsManager } from '../systems/SettingsManager';
import { desertFloor, drawDesertLandmarks } from '../ui/desertPaint';

const ANCHORS = Object.keys(DESERT_ANCHORS) as DesertAnchorId[];
const PUZZLES = Object.keys(DESERT_PUZZLES) as DesertPuzzleId[];
const NODE: Record<DesertPuzzleId, JourneyNodeId> = {
  lesson: 'desert.coverLearned', stones: 'desert.courtyardAligned', courtyard: 'desert.addressRead',
};
const LESSON: Record<DesertPuzzleId, string> = {
  lesson: '在 E 圈请小暖扶住棚脚，走近卷好的布角按 F 拿起。往门牌外侧走，把布展开，让整片卷叶都落进阴凉，再 F 读字。',
  stones: '西侧的棚脚朝着石堆，布会被挡住。E 召回小暖，沿石堆左边绕到上方，找另一处 E 圈，从另一侧展开当地的遮阳布。',
  courtyard: '门牌想乘凉，旁边的卷叶也想。请小暖站住棚脚，你调整布角，让门牌和软垫上的叶片同时变成勾，再靠近门牌 F 读地址。',
};

/** A spatial duet: the player's real walking rotates a cloth held by the actual echo. */
export class DesertScene extends PostalWalkScene {
  private cover!: PairedCover;
  private state!: JourneyState;
  private receipt = '';
  private pendingPuzzle: DesertPuzzleId | null = null;
  private clothArt!: Phaser.GameObjects.Graphics;
  private targetArt!: Phaser.GameObjects.Graphics;
  private targetLabels = new Map<string, Phaser.GameObjects.Text>();
  private gripLabels = new Map<DesertAnchorId, Phaser.GameObjects.Text>();
  private anchorLabels = new Map<DesertAnchorId, Phaser.GameObjects.Text>();
  private discoveryLabel!: Phaser.GameObjects.Text;

  constructor() { super('DesertScene'); }
  protected override get walkCopy() { return {
    pause: '读清每处门牌时保存。继续旅途会从最近确认的休息点出发。',
    blocked: '这边是蓬松的沙坡。沿奶油色小路和圆院子走，石堆需要绕过去。',
    returned: '脚下滑了一小下，回到踏稳的沙路。布角松开时，走近它按 F 就能再拿起。',
    idle: 'E 请小暖扶住棚脚 · F 拿起 / 放下布角、读门牌。卷叶全部落进阴凉会舒展开来，不用赶时间。',
    recall: '小暖：我先把这一角放好，沿刚才的小路来找你。布还留在这个院子里。',
  }; }

  create(): void {
    if (!Journey.isRegionUnlocked('desert') || Journey.getWriteProtection()) { this.scene.start('JourneyMapScene'); return; }
    this.state = Journey.getState();
    const resume: DesertCheckpoint = { trailhead: 'start', stoneCamp: 'lesson', courtyard: 'stones', mailbox: 'courtyard' }[Journey.getDesertCheckpoint(this.state)] as DesertCheckpoint;
    this.cover = new PairedCover(resume); this.pendingPuzzle = null; this.targetLabels.clear(); this.gripLabels.clear(); this.anchorLabels.clear();
    this.receipt = this.state.deliveries.desert?.completionId ?? `desert-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
    this.beginWalk('第四封信 · 晒被沙原', DESERT_CHECKPOINTS[resume], DESERT_WORLD);
    this.cameras.main.setBackgroundColor(0xefd9ad);
    this.add.image(0, 0, desertFloor(this)).setOrigin(0).setDepth(0); drawDesertLandmarks(this);
    this.clothArt = this.add.graphics().setDepth(12); this.targetArt = this.add.graphics().setDepth(16);
    for (const id of ANCHORS) {
      const a = DESERT_ANCHORS[id];
      this.anchorLabels.set(id, this.words(a.command.x, a.command.y + 54, '', 14).setOrigin(.5).setDepth(18));
      this.gripLabels.set(id, this.words(a.foldedGrip.x, a.foldedGrip.y - 40, '', 14).setOrigin(.5).setDepth(18));
    }
    for (const id of PUZZLES) for (const t of DESERT_PUZZLES[id].targets) {
      this.targetLabels.set(t.id, this.words(t.x, t.y + 42, '', 15).setOrigin(.5).setDepth(18));
    }
    this.words(690, 1090, '卷叶小院 · 先把阴凉展开', 19).setOrigin(.5).setDepth(18);
    this.words(1210, 1140, '晾石小院 · 棚脚不止一处', 19).setOrigin(.5).setDepth(18);
    this.words(1870, 345, '并排小院 · 一起乘凉', 19).setOrigin(.5).setDepth(18);
    this.words(DESERT_SPAWN.x, DESERT_SPAWN.y + 65, '沙原邮亭 · F 回邮路图', 16).setOrigin(.5).setDepth(18);
    this.words(DESERT_NPC.x, DESERT_NPC.y + 70, '团刺 · F 交信 / 聊天', 18).setOrigin(.5).setDepth(18);
    this.discoveryLabel = this.words(DESERT_DISCOVERY.x, DESERT_DISCOVERY.y + 50, '', 15).setOrigin(.5).setDepth(18);
    this.say(this.state.deliveries.desert ? '团刺把五块软垫排好了，又往旁边挪了挪：第六块，是留给谁的呢？回信册里有团刺的新信。'
      : resume === 'courtyard' ? '条纹棚下，住着戴歪帽子的团刺。地址已经读清，走到团刺身边按 F，亲手交出岚角的信。'
      : resume === 'stones' ? '石堆后的字已经看清。前面门牌和软垫上的两片卷叶，都想待在同一块阴凉里。'
      : resume === 'lesson' ? '小暖已经学会和你牵住同一块布。晾石小院有两处棚脚，试着从石头另一边把阴凉展开。'
      : '岚角的信封上，地址晒得卷起来了。团刺在各处留了遮阳布——一只猫扶棚脚，另一只猫牵布角，让卷叶在阴凉里舒展开。', 14000);
    this.tickJourney(0);
  }

  protected isSafe(point: WalkPoint): boolean { return isDesertSafe(point); }
  private refreshCover(delta = 0): boolean {
    const events = this.cover.update(delta, { player: this.cat, echo: this.echo, echoStays: this.echoStays });
    this.handleEvents(events);
    return events.some(event => event.type === 'released');
  }

  protected command(): void {
    this.refreshCover();
    if (this.pendingPuzzle) { this.say('这处门牌已经读清，先按 F 确认保存，再请小暖出发。'); return; }
    if (this.echoStays) {
      const result = this.cover.cancel();
      if (!result.ok) { this.say(this.errorText(result.error)); return; }
      this.recallEcho(); this.syncHolding(); return;
    }
    const id = ANCHORS.find(id => this.near(DESERT_ANCHORS[id].command, 85));
    if (!id) { this.say('每个小院都有自己的遮阳布。走近地上的 E 圈，请小暖扶住这一处的棚脚。'); return; }
    const result = this.cover.assign(id, this.cat);
    if (!result.ok || !result.route) { this.say(this.errorText(result.error)); return; }
    if (!this.sendEchoRoute(result.route.waypoints)) { this.cover.cancel(); this.say('再靠近 E 圈一点，小暖需要沿连着的沙路走到棚脚。'); return; }
    this.say(id === 'stones-west' ? '小暖去西侧棚脚了。石堆会挡住布面；如果方向不合适，E 召回它，沿左侧小路去另一处棚脚。'
      : `小暖沿小路去扶住这一角。等它站稳，走近卷好的布角按 F 拿起。${id === 'courtyard' ? '这次要让两片卷叶同时乘凉。' : '布角跟着你的脚步走，展开后再靠近卷叶读字。'}`, 12000);
  }

  protected interact(): void {
    const released = this.refreshCover();
    if (this.pendingPuzzle) { this.savePuzzle(this.pendingPuzzle); return; }
    // A press which discovers a broken span must not immediately pick it up again.
    if (released) { this.syncHolding(); return; }
    if (this.near(DESERT_SPAWN, 85)) { this.leaveWalk(); return; }
    if (this.near(DESERT_NPC, 95)) { this.deliverLetter(); return; }
    if (this.near(DESERT_DISCOVERY, 65)) { this.collectCushion(); return; }
    const s = this.cover.getSnapshot();
    // A dropped corner may be beside a sign: picking it back up has priority there.
    if (!s.playerHolding && s.grip && this.near(s.grip, COVER_GRIP_RADIUS)) {
      const result = this.cover.grip(this.cat);
      if (!result.ok) this.say(this.errorText(result.error));
      else { SoundManager.get().postalCue('command'); this.say('布角拿稳啦。慢慢往外走，把阴凉铺开；卷叶旁出现勾后，靠近它按 F 读字。'); }
      this.syncHolding(); return;
    }
    const puzzle = PUZZLES.find(id => this.near(DESERT_PUZZLES[id].targets.find(t => t.id === DESERT_PUZZLES[id].readTargetId)!, COVER_READ_RADIUS));
    if (puzzle) {
      const result = this.cover.read(puzzle, this.cat);
      if (!result.ok) this.say(this.errorText(result.error)); else this.handleEvents(result.events);
      this.syncHolding(); return;
    }
    if (s.playerHolding) {
      const result = this.cover.release();
      if (!result.ok) this.say(this.errorText(result.error)); else this.say('布角轻轻放在脚边。小暖继续扶着另一端，走近布角 F 就能再拿起。');
      this.syncHolding(); return;
    }
    const anchor = ANCHORS.find(id => this.near(DESERT_ANCHORS[id].command, 90));
    this.say(anchor ? LESSON[DESERT_ANCHORS[anchor].puzzle] : this.walkCopy.idle, 13000);
  }

  private handleEvents(events: readonly CoverEvent[]): void {
    for (const event of events) {
      if (event.type === 'matched') this.savePuzzle(event.puzzle);
      else this.say(this.releaseText(event.reason), 9000);
    }
  }
  private savePuzzle(id: DesertPuzzleId): void {
    const result = Journey.completeNode('desert', NODE[id]);
    if (!result.saved) { this.pendingPuzzle = id; this.say('卷叶上的字已经读清，但本机还没确认保存。按 F 重试，不需要重新拉布。', 13000); return; }
    this.state = result.state; this.pendingPuzzle = null; this.cover.confirmSaved(id); this.syncHolding();
    this.catAnimator.celebrate(); this.echoAnimator.celebrate(); SoundManager.get().postalCue('address');
    this.say(id === 'lesson' ? '卷叶舒展开啦，已保存！上面写着“晾石小院”。E 召回小暖，沿右上方的路去找石堆后的下一片卷叶。'
      : id === 'stones' ? '换一边就读清了，已保存！上面画着条纹棚，旁边还挤着一块软垫。E 召回小暖，沿右上方的小路继续。'
      : '两片卷叶一起舒展开了，地址已保存：“条纹棚下，歪帽子的团刺”。E 召回小暖，去右上方亲手交信吧。', 14000);
  }
  private deliverLetter(): void {
    if (this.state.deliveries.desert) { this.say('团刺：岚角说山上的云也有条纹！请把这块软垫捎给晴雪湾的芝麻，地址是画着太阳的蓝信箱。回信里还夹着一张小纸条。', 11000); return; }
    if (!this.cover.getSnapshot().confirmed.courtyard) { this.say('团刺把帽檐抬起来：先帮门前的两片卷叶一起乘凉吧，展开的地址上，还有收信人的小印章。'); return; }
    const result = Journey.deliver('desert', this.receipt);
    if (!result.saved) { this.say('团刺扶住了信封，本机还没确认保存。留在团刺身边按 F 再试一次。'); return; }
    this.state = result.state; this.catAnimator.celebrate(); this.echoAnimator.celebrate(); SoundManager.get().postalCue('delivery');
    this.say('团刺收到岚角的信啦：“两个人的阴凉，也可以再留一个位置。”回信已夹进回信册。旁边的第六块软垫，留给一直陪你走路的小暖。', 15000);
  }
  private collectCushion(): void {
    if (!this.cover.getSnapshot().confirmed.courtyard) { this.say('五块软垫旁边，还叠着一块小小的。先把门前两片卷叶一起展开，再来看看团刺留下的话。'); return; }
    const result = Journey.discover('desert.sixthCushion');
    if (!result.saved) { this.say('软垫上的纸条已经夹好，本机还没记下。按 F 重试。'); return; }
    this.state = result.state;
    if (!result.duplicate) { this.catAnimator.celebrate(); SoundManager.get().postalCue('address'); }
    this.say('纸条写着：“影子也可以有自己的座位。”小暖认真试坐了一下，又把软垫朝你挪近了一点。', 12000);
  }

  private releaseText(reason: CoverReleaseReason): string {
    return reason === 'overstretched' ? '布角拉得太远，轻轻松开了。它留在刚才的位置；走近 F 拿起，靠小暖近一点再展开。'
      : reason === 'echo-left' ? '小暖离开棚脚，布角放下了。先请它站稳，再走近布角按 F。'
      : '布面碰到了石头，轻轻松开了。布角留在刚才能站稳的位置；E 召回小暖，可以换另一处棚脚。';
  }
  private errorText(error?: CoverError): string {
    const messages: Partial<Record<CoverError, string>> = {
      locked: '先读清前一处卷叶上的字，再一起展开这里的布。',
      finished: '这处卷叶已经读清并保存了。E 召回小暖，沿沙路继续吧。',
      'not-assigned': '先到这处的 E 圈，请小暖扶住棚脚，再 F 拿起另一端。',
      'echo-not-ready': '小暖还在走向棚脚。等它站稳，再靠近卷好的布角按 F。',
      'not-holding': '走近地上卷好的布角，按 F 拿起。阴凉跟着你的脚步展开。',
      'far-from-grip': '再靠近地上的布角一点，按 F 就能拿起。',
      'not-taut': '再往外走一点，把布展开。布边变成实线后，调整方向让卷叶完整落进阴凉。',
      'not-covered': this.cover.getSnapshot().activePuzzle === 'courtyard' ? '两片卷叶需要同时乘凉。试着往门牌右侧退一点，再调整上下位置，让两处都出现勾。' : '整片卷叶都需要留在阴凉里。试着往门牌外侧退一点，让布边越过卷叶，再微调上下方向。',
      'far-from-target': '阴凉铺好了。牵着布角走到门牌旁，再按 F 读字。',
      'other-anchor-active': '先按 E 放下这一处的布并召回小暖，再去另一处棚脚分工。',
      'awaiting-save': '字已经读清，按 F 重试保存即可，不需要重新拉布。',
      obstructed: this.releaseText('obstructed'), overstretched: this.releaseText('overstretched'),
    };
    return messages[error!] ?? '沿沙路靠近 E 分工圈或 F 布角，再试一次。';
  }

  private syncHolding(): void {
    const s = this.cover.getSnapshot(), holding = s.playerHolding && !this.pendingPuzzle;
    this.catAnimator.setHolding(holding); this.echoAnimator.setHolding(holding && s.echoPresent);
    if (holding && s.echoTarget) {
      this.cat.setFlipX(this.cat.x > s.echoTarget.x); this.echo.setFlipX(this.echo.x > this.cat.x);
    }
    if (holding) {
      const reducedMotion = SettingsManager.get().reducedMotion;
      this.catAnimator.update(0, { speed: this.cat.body!.velocity.length(), reducedMotion });
      this.echoAnimator.update(0, { speed: 0, reducedMotion });
    }
  }

  protected tickJourney(delta: number): void {
    this.refreshCover(delta); this.syncHolding();
    const s = this.cover.getSnapshot();
    const puzzle = s.activePuzzle ?? (!s.confirmed.lesson ? 'lesson' : !s.confirmed.stones ? 'stones' : 'courtyard');
    const targets = DESERT_PUZZLES[puzzle].targets;
    const coverage = targets.map(t => `${t.label}${s.coveredTargets[t.id] ? ' ✓' : ' ○'}`).join(' · ');
    this.objective.setText(this.pendingPuzzle ? '门牌已读清 · 本机记录尚未确认，F 重试保存'
      : this.state.deliveries.desert ? '团刺已收信 · 小暖学会与你牵住同一块布，回信已夹进册子'
      : s.confirmed.courtyard ? '地址已读清 · 去右上方条纹棚下，F 把岚角的信交给团刺'
      : s.playerHolding ? `${coverage} · ${s.taut ? '阴凉已展开，调整走位后 F 读字' : '再往外走一点，把布展开'}`
      : s.phase === 'awaitingEcho' ? '小暖沿沙路去棚脚 · 走近布角，等它站稳后 F 拿起'
      : s.activeAnchor ? '小暖扶好这一端了 · 找地上标着 F 的布角，一起展开阴凉'
      : `${DESERT_PUZZLES[puzzle].label} · E 请小暖扶棚脚，F 拿起布角`);
    const nearSign = PUZZLES.find(id => this.near(DESERT_PUZZLES[id].targets.find(t => t.id === DESERT_PUZZLES[id].readTargetId)!, COVER_READ_RADIUS));
    this.hint.setText(this.pendingPuzzle ? 'F · 只重试保存，不需要重新拉布'
      : this.near(DESERT_NPC, 95) ? 'F · 把岚角的信交给团刺 / 聊聊天'
      : this.near(DESERT_SPAWN, 85) ? 'F · 回到邮路图'
      : this.near(DESERT_DISCOVERY, 65) ? 'F · 看看第六块软垫上的纸条（可选）'
      : !s.playerHolding && s.grip && this.near(s.grip, COVER_GRIP_RADIUS) ? s.echoPresent ? 'F · 拿起布角；拿稳后往外走' : '小暖正在赶来 · 它站稳后 F 拿起布角'
      : nearSign ? 'F · 读卷叶门牌；整个叶片落进阴凉后会出现勾'
      : s.playerHolding ? '走位调整阴凉 · F 放下布角 · E 放下并召回小暖'
      : this.echoStays ? '小暖留在棚脚 · E 召回，再去另一处棚脚分工'
      : '沿奶油色沙路走 · E 圈分工，F 读提示');
    this.discoveryLabel.setText(this.state.optionalDiscoveries.includes('desert.sixthCushion') ? '第六块软垫 · 小暖也有座位了' : '第六块软垫 · F');
    this.drawCover();
  }

  private drawCover(): void {
    const g = this.clothArt.clear(), t = this.targetArt.clear(), s = this.cover.getSnapshot();
    for (const id of ANCHORS) {
      const a = DESERT_ANCHORS[id], finished = s.confirmed[a.puzzle];
      g.lineStyle(2, finished ? 0xa4bba0 : 0x8f9e85, .85).strokeCircle(a.command.x, a.command.y, 21);
      g.fillStyle(0xc1a075).fillCircle(a.echo.x, a.echo.y, 10);
      g.lineStyle(2, 0xfff4d5).strokeCircle(a.echo.x, a.echo.y, 7);
      const grip = s.grips[id];
      this.anchorLabels.get(id)!.setText(`${a.label}\n${finished ? '卷叶已读清 ✓' : 'E · 分工  /  F · 看提示'}`);
      this.gripLabels.get(id)!.setPosition(grip.x, grip.y - 37).setText(finished ? '' : s.activeAnchor === id && this.pendingPuzzle ? 'F · 确认保存' : s.activeAnchor !== id ? '先 E 分工'
        : s.playerHolding ? '' : s.echoPresent ? 'F · 布角' : '等小暖站稳');
      if (finished || s.activeAnchor === id && s.playerHolding) continue;
      g.lineStyle(3, 0xa7bda9, .6).lineBetween(a.echo.x, a.echo.y, grip.x, grip.y);
      g.fillStyle(0xffedc8).fillRoundedRect(grip.x - 16, grip.y - 10, 32, 20, 8);
      g.lineStyle(2, 0xc79e75).strokeRoundedRect(grip.x - 16, grip.y - 10, 32, 20, 8);
      g.lineBetween(grip.x - 7, grip.y - 8, grip.x - 7, grip.y + 8).lineBetween(grip.x + 6, grip.y - 8, grip.x + 6, grip.y + 8);
    }
    if (s.shadowPolygon.length === 4) {
      const shape = s.shadowPolygon.map(p => new Phaser.Math.Vector2(p.x, p.y));
      g.fillStyle(s.taut ? 0x97b6a2 : 0xd4bea0, s.taut ? .42 : .25).fillPoints(shape, true);
      g.lineStyle(s.taut ? 3 : 1.5, s.taut ? 0x617f70 : 0xb89c7b, .9).strokePoints(shape, true, true);
      const [a, b, c, d] = shape;
      g.lineStyle(6, 0xfff3cf, .7);
      for (const amount of [.25, .5, .75]) g.lineBetween(a.x + (d.x - a.x) * amount, a.y + (d.y - a.y) * amount, b.x + (c.x - b.x) * amount, b.y + (c.y - b.y) * amount);
      // Short ties visibly meet both cats' paws; the shaded footprint stays exact.
      if (s.echoPosition && s.playerPosition) for (const p of [s.echoPosition, s.playerPosition]) {
        g.lineStyle(3, 0x7e9276).lineBetween(p.x, p.y, p.x, p.y - 15);
        g.fillStyle(0xf9e4b7).fillCircle(p.x, p.y, 5);
      }
    }
    for (const id of PUZZLES) for (const target of DESERT_PUZZLES[id].targets) {
      const done = s.confirmed[id], covered = Boolean(s.coveredTargets[target.id]), pending = this.pendingPuzzle === id;
      t.fillStyle(done || covered ? 0xd6e5bb : pending ? 0xffe1ad : 0xffefc9).fillCircle(target.x, target.y, target.radius);
      t.lineStyle(2, done || covered ? 0x62886a : 0xb89660).strokeCircle(target.x, target.y, target.radius);
      if (done || covered || pending) t.lineStyle(2.5, pending ? 0xb89660 : 0x62886a).lineBetween(target.x - 7, target.y, target.x - 1, target.y + 6).lineBetween(target.x - 1, target.y + 6, target.x + 9, target.y - 6);
      else t.lineStyle(2, 0xbc9667).strokeEllipse(target.x, target.y, 12, 20);
      this.targetLabels.get(target.id)!.setText(`${target.label}${done ? ' · 已读清 ✓' : pending ? ' · 字已读清，待保存' : covered ? ' · 阴凉 ✓' : ' · 等阴凉'}`);
    }
  }
}
