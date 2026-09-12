import Phaser from 'phaser';
import { GAME_WIDTH as WIDTH, GAME_HEIGHT as HEIGHT } from '../config/gameConfig';
import { CatAnimator } from '../systems/CatAnimator';
import { SoundManager } from '../systems/SoundManager';
import { SettingsManager } from '../systems/SettingsManager';

export interface WalkPoint { x: number; y: number }
const FONT = '"Microsoft YaHei", "PingFang SC", sans-serif';

/** Shared exploration controls. Regions supply interactions and safe walking geometry. */
export abstract class PostalWalkScene extends Phaser.Scene {
  protected cat!: Phaser.Physics.Arcade.Sprite;
  protected echo!: Phaser.GameObjects.Sprite;
  protected catAnimator!: CatAnimator;
  protected echoAnimator!: CatAnimator;
  protected echoStays = false;
  protected echoTarget: WalkPoint = { x: 0, y: 0 };
  protected clock = 0;
  protected closed = false;
  protected paused = false;
  protected objective!: Phaser.GameObjects.Text;
  protected hint!: Phaser.GameObjects.Text;
  private notice!: Phaser.GameObjects.Text;
  private noticeUntil = 0;
  private worldSize = { width: 1800, height: 1300 };
  private safePoint: WalkPoint = { x: 0, y: 0 };
  private facing: WalkPoint = { x: 0, y: -1 };
  private dashVelocity: WalkPoint = { x: 0, y: 0 };
  private dashUntil = 0;
  private nextDashAt = 0;
  private keys: Record<string, Phaser.Input.Keyboard.Key> = {};
  private requests = new Set<'dash' | 'command' | 'interact'>();
  private bindings: Array<{ key: Phaser.Input.Keyboard.Key; handler: (key: Phaser.Input.Keyboard.Key, event: KeyboardEvent) => void }> = [];
  private pointerHandler?: (pointer: Phaser.Input.Pointer, over?: Phaser.GameObjects.GameObject[]) => void;
  private blurHandler?: () => void;
  private walkTarget: WalkPoint | null = null;
  private marker!: Phaser.GameObjects.Arc;
  private lastDistance = Infinity;
  private stalledMs = 0;
  private panel?: Phaser.GameObjects.Container;
  // Actual player footsteps guide the follower around the same shoreline. No water shortcut.
  private trail: WalkPoint[] = [];
  private echoApproach: WalkPoint[] = [];
  private echoDispatch: { toLaunch: number; walked: WalkPoint[] } | null = null;
  protected get walkCopy() { return {
    pause: '到站时保存进度。重来会从最近确认的码头出发。',
    blocked: '这边走不通。沿奶黄色岸路或木栈道绕一绕。',
    returned: '爪尖沾了点水，回到刚才的岸边。信件和已保存的进度都好好的。',
    idle: '信走水路，你走岸路。小暖会沿着你的脚印跟来；它留守时，你可以去远处调流。',
    recall: '小暖：来啦！我沿着你刚走过的岸路跟上。',
  }; }

  protected beginWalk(title: string, start: WalkPoint, world: { width: number; height: number }): void {
    this.worldSize = world; this.safePoint = { ...start };
    this.closed = this.paused = this.echoStays = false;
    this.clock = this.noticeUntil = this.dashUntil = this.nextDashAt = 0;
    this.facing = { x: 0, y: -1 }; this.requests.clear(); this.bindings = [];
    this.walkTarget = null; this.lastDistance = Infinity; this.stalledMs = 0; this.panel = undefined;
    this.physics.world.setBounds(0, 0, world.width, world.height); this.physics.resume();
    this.cat = this.physics.add.sprite(start.x, start.y, 'hero-ranger').setDepth(30).setScale(1.22);
    this.cat.setCollideWorldBounds(true);
    (this.cat.body as Phaser.Physics.Arcade.Body).setCircle(10, this.cat.width / 2 - 10, this.cat.height / 2 - 10);
    this.echo = this.add.sprite(start.x - 26, start.y, 'shadow_fox').setDepth(29).setScale(1.22).setAlpha(.74).setTint(0xb8dbd0);
    this.echoTarget = { x: this.echo.x, y: this.echo.y }; this.trail = [{ ...start }]; this.echoApproach = []; this.echoDispatch = null;
    this.catAnimator = new CatAnimator(this.cat, 'ranger'); this.echoAnimator = new CatAnimator(this.echo, 'echo');
    this.marker = this.add.circle(0, 0, 9, 0xe5bd7b, .25).setStrokeStyle(2, 0xab8759, .8).setDepth(15).setVisible(false);
    this.cameras.main.setBounds(0, 0, world.width, world.height).startFollow(this.cat, true, .12, .12).setDeadzone(180, 120);
    this.add.rectangle(WIDTH / 2, 51, WIDTH, 102, 0xfff8e6, .96).setScrollFactor(0).setDepth(1000);
    this.words(24, 14, title, 24).setScrollFactor(0).setDepth(1001);
    this.objective = this.words(24, 53, '', 17).setScrollFactor(0).setDepth(1001);
    const pause = this.words(WIDTH - 22, 20, 'Esc · 歇一歇', 17).setOrigin(1, 0).setScrollFactor(0).setDepth(1001).setInteractive({ useHandCursor: true });
    pause.on('pointerdown', () => this.pauseWalk());
    this.add.rectangle(WIDTH / 2, HEIGHT - 79, WIDTH - 32, 118, 0xfff8e6, .96).setScrollFactor(0).setDepth(1000);
    this.hint = this.words(30, HEIGHT - 127, '', 17).setScrollFactor(0).setDepth(1001);
    this.notice = this.words(30, HEIGHT - 96, '', 15, '#835c38').setWordWrapWidth(WIDTH - 65).setScrollFactor(0).setDepth(1001);
    this.words(30, HEIGHT - 29, 'WASD / 方向键 / 点地行走 · SHIFT / 右键轻跃 · E 分工 / 召回 · F 互动', 13).setScrollFactor(0).setDepth(1001);
    this.bindControls();
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.closeWalk, this);
  }

  protected words(x: number, y: number, text: string, size = 17, color = '#3f5947'): Phaser.GameObjects.Text {
    return this.add.text(x, y, text, { fontFamily: FONT, fontSize: `${size}px`, color, lineSpacing: 5 });
  }
  protected near(point: WalkPoint, radius = 80): boolean { return Math.hypot(this.cat.x - point.x, this.cat.y - point.y) <= radius; }
  protected say(text: string, duration = 6000): void { this.notice.setText(text); this.noticeUntil = this.clock + duration; }
  protected leaveWalk(): void { this.closed = true; this.clearControls(); this.scene.start('JourneyMapScene'); }
  protected abstract isSafe(point: WalkPoint): boolean;
  protected abstract interact(): void;
  protected abstract command(): void;
  protected abstract tickJourney(delta: number): void;
  protected adjustWalkVelocity(velocity: WalkPoint, _delta: number): WalkPoint { return velocity; }
  protected recoveryPoint(): WalkPoint | null { return null; }
  protected isDashing(): boolean { return this.clock < this.dashUntil; }

  protected sendEcho(point: WalkPoint): void {
    this.echoDispatch = null;
    this.echoStays = true; this.echoTarget = { ...point };
    // Preserve the path up to the player's command position for a distant follower.
    const last = this.trail[this.trail.length - 1];
    if (!last || Math.hypot(last.x - this.cat.x, last.y - this.cat.y) > 8) this.trail.push({ x: this.cat.x, y: this.cat.y });
    this.echoApproach = [...this.trail, { ...point }];
    this.trail = [{ ...point }, { x: this.cat.x, y: this.cat.y }];
    SoundManager.get().postalCue('command');
  }
  /** A region's known route is walked continuously; recalling reverses only its travelled part. */
  protected sendEchoRoute(route: readonly WalkPoint[]): boolean {
    if (!route.length) return false;
    let from: WalkPoint = this.cat;
    for (const point of route) {
      if (!Number.isFinite(point.x) || !Number.isFinite(point.y) || !this.safeSegment(from, point)) return false;
      from = point;
    }
    const launch = { x: this.cat.x, y: this.cat.y };
    const prefix = [...this.trail.map(point => ({ ...point })), launch];
    this.echoStays = true; this.echoTarget = { ...route[route.length - 1] };
    this.echoApproach = [...prefix, ...route.map(point => ({ ...point }))];
    this.echoDispatch = { toLaunch: prefix.length, walked: [launch] };
    this.trail = [launch];
    SoundManager.get().postalCue('command');
    return true;
  }
  protected recallEcho(): void {
    if (this.echoDispatch) {
      const path = this.echoDispatch.toLaunch > 0 ? this.echoApproach.slice(0, this.echoDispatch.toLaunch)
        : [...this.echoDispatch.walked].reverse();
      this.trail = [...path, ...this.trail];
    } else if (this.echoApproach.length) this.trail = [...this.echoApproach, ...this.trail];
    this.echoDispatch = null;
    this.echoApproach = [];
    this.echoStays = false;
    SoundManager.get().postalCue('command');
    this.say(this.walkCopy.recall);
  }

  private bindControls(): void {
    const keyboard = this.input.keyboard!;
    this.keys = keyboard.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>;
    const bind = (name: string, callback: () => void) => {
      const key = keyboard.addKey(name, false);
      // Phaser rescans its DOM event queue until POST_STEP. Clearing keys while
      // pausing can emit an earlier keydown again; consume that event only once.
      const handled = new WeakSet<KeyboardEvent>();
      const handler = (_key: Phaser.Input.Keyboard.Key, event: KeyboardEvent) => {
        if (this.closed || event.repeat || handled.has(event)) return;
        handled.add(event); callback();
      };
      key.on('down', handler); this.bindings.push({ key, handler });
    };
    for (const [key, action] of [['SHIFT', 'dash'], ['E', 'command'], ['F', 'interact']] as const) bind(key, () => { if (this.canAct()) this.requests.add(action); });
    bind('ESC', () => { if (this.paused) this.leaveWalk(); else this.pauseWalk(); });
    bind('ENTER', () => { if (this.paused) this.resumeWalk(); });
    this.input.mouse?.disableContextMenu();
    this.pointerHandler = (pointer, over = []) => {
      if (!this.canAct() || pointer.y <= 102 || pointer.y >= HEIGHT - 140 || over.some(item => item.input?.enabled)) return;
      if (pointer.rightButtonDown()) { this.requests.add('dash'); return; }
      if (!pointer.leftButtonDown()) return;
      const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      this.walkTarget = { x: Phaser.Math.Clamp(point.x, 18, this.worldSize.width - 18), y: Phaser.Math.Clamp(point.y, 18, this.worldSize.height - 18) };
      this.lastDistance = Infinity; this.stalledMs = 0;
      this.marker.setPosition(this.walkTarget.x, this.walkTarget.y).setVisible(true);
    };
    this.input.on('pointerdown', this.pointerHandler);
    this.blurHandler = () => this.pauseWalk();
    this.game.events.on(Phaser.Core.Events.BLUR, this.blurHandler); this.game.events.on(Phaser.Core.Events.HIDDEN, this.blurHandler);
  }
  private canAct(): boolean { return !this.closed && !this.paused && this.sys.isActive() && this.game.hasFocus; }
  private clearTarget(): void { this.walkTarget = null; this.lastDistance = Infinity; this.stalledMs = 0; this.marker?.setVisible(false); }
  private clearControls(): void {
    this.requests.clear(); this.clearTarget(); this.dashUntil = 0;
    this.input.keyboard?.resetKeys(); this.catAnimator?.resetTransient(); this.echoAnimator?.resetTransient();
    if (this.cat?.body) this.cat.setVelocity(0, 0);
  }
  private pauseWalk(): void {
    if (this.closed || this.paused) return;
    this.paused = true; this.clearControls(); this.physics.pause();
    const shade = this.add.rectangle(WIDTH / 2, HEIGHT / 2, WIDTH, HEIGHT, 0x516d58, .55);
    const paper = this.add.rectangle(WIDTH / 2, HEIGHT / 2, 630, 260, 0xfff8e6);
    const title = this.words(WIDTH / 2, HEIGHT / 2 - 83, '把信袋放稳，歇一小会儿', 25).setOrigin(.5);
    const info = this.words(WIDTH / 2, HEIGHT / 2 - 34, this.walkCopy.pause, 16).setOrigin(.5);
    const resume = this.words(WIDTH / 2, HEIGHT / 2 + 24, 'Enter · 继续送信', 21).setOrigin(.5).setInteractive({ useHandCursor: true });
    const leave = this.words(WIDTH / 2, HEIGHT / 2 + 77, 'Esc · 回到邮路图', 19).setOrigin(.5).setInteractive({ useHandCursor: true });
    resume.on('pointerdown', () => this.resumeWalk()); leave.on('pointerdown', () => this.leaveWalk());
    this.panel = this.add.container(0, 0, [shade, paper, title, info, resume, leave]).setScrollFactor(0).setDepth(2000);
  }
  private resumeWalk(): void {
    if (this.closed || !this.game.hasFocus) return;
    this.clearControls(); this.panel?.destroy(); this.panel = undefined; this.paused = false; this.physics.resume();
  }
  private closeWalk(): void {
    this.closed = true; this.clearControls();
    for (const { key, handler } of this.bindings) key.off('down', handler);
    this.bindings = [];
    if (this.pointerHandler) this.input.off('pointerdown', this.pointerHandler);
    if (this.blurHandler) { this.game.events.off(Phaser.Core.Events.BLUR, this.blurHandler); this.game.events.off(Phaser.Core.Events.HIDDEN, this.blurHandler); }
    this.trail = []; this.echoApproach = []; this.echoDispatch = null; this.panel = undefined;
  }

  private safeSegment(a: WalkPoint, b: WalkPoint): boolean {
    const steps = Math.max(1, Math.ceil(Math.hypot(b.x - a.x, b.y - a.y) / 8));
    for (let i = 0; i <= steps; i++) if (!this.isSafe({ x: a.x + (b.x - a.x) * i / steps, y: a.y + (b.y - a.y) * i / steps })) return false;
    return true;
  }

  private recordFootstep(point: WalkPoint): void {
    const last = this.trail[this.trail.length - 1];
    if (last && Math.hypot(last.x - point.x, last.y - point.y) < 25) return;
    // Erase a closed detour only where the new footprint really rejoins its old path.
    const rejoin = this.trail.findIndex((old, index) => index < this.trail.length - 2
      && Math.hypot(old.x - point.x, old.y - point.y) <= 12 && this.safeSegment(old, point));
    if (rejoin >= 0) this.trail.splice(rejoin + 1);
    const a = this.trail[this.trail.length - 2], b = this.trail[this.trail.length - 1];
    if (a && b) {
      const vx = point.x - a.x, vy = point.y - a.y, length = Math.hypot(vx, vy);
      const offLine = length ? Math.abs(vx * (b.y - a.y) - vy * (b.x - a.x)) / length : Infinity;
      const forwards = (b.x - a.x) * (point.x - b.x) + (b.y - a.y) * (point.y - b.y) > 0;
      if (forwards && offLine < 3 && this.safeSegment(a, point)) this.trail.pop();
    }
    this.trail.push({ ...point });
    // Never enforce a size cap by discarding an unwalked corner: that crosses water.
    // If a long prefix is actually connected by safe ground, it may be shortened.
    if (this.trail.length > 600) for (let index = Math.min(32, this.trail.length - 2); index > 1; index--) {
      if (this.safeSegment(this.trail[0], this.trail[index])) { this.trail.splice(1, index - 1); break; }
    }
  }

  update(_time: number, delta: number): void {
    if (this.closed) return;
    if (!this.game.hasFocus) this.pauseWalk();
    if (this.paused) { this.requests.clear(); return; }
    delta = Number.isFinite(delta) ? Math.max(0, Math.min(50, delta)) : 0; this.clock += delta;
    if (this.requests.delete('command')) this.command();
    if (this.requests.delete('interact')) this.interact();
    if (this.closed) return;
    let x = Number(this.keys.D.isDown || this.keys.RIGHT.isDown) - Number(this.keys.A.isDown || this.keys.LEFT.isDown);
    let y = Number(this.keys.S.isDown || this.keys.DOWN.isDown) - Number(this.keys.W.isDown || this.keys.UP.isDown);
    if (Object.values(this.keys).some(key => key.isDown)) this.clearTarget();
    else if (this.walkTarget) {
      x = this.walkTarget.x - this.cat.x; y = this.walkTarget.y - this.cat.y;
      const distance = Math.hypot(x, y);
      if (distance < 9) { this.clearTarget(); x = y = 0; }
      else {
        this.stalledMs = this.lastDistance - distance < .4 && this.clock >= this.dashUntil ? this.stalledMs + delta : 0;
        this.lastDistance = distance;
        if (this.stalledMs >= 400) { this.clearTarget(); x = y = 0; this.say(this.walkCopy.blocked); }
      }
    }
    const length = Math.hypot(x, y); if (length) { x /= length; y /= length; this.facing = { x, y }; }
    if (this.requests.delete('dash') && this.clock >= this.nextDashAt) {
      this.dashUntil = this.clock + 170; this.nextDashAt = this.clock + 700;
      this.dashVelocity = { x: this.facing.x * 470, y: this.facing.y * 470 };
      this.catAnimator.dash(170); SoundManager.get().postalCue('dash');
    }
    const velocity = this.adjustWalkVelocity(this.isDashing() ? this.dashVelocity : { x: x * 220, y: y * 220 }, delta);
    this.cat.setVelocity(velocity.x, velocity.y);
    if (Math.abs(this.cat.body!.velocity.x) > 1) this.cat.setFlipX(this.cat.body!.velocity.x < 0);
    if (!this.isSafe(this.cat)) {
      const recovery = this.recoveryPoint() ?? this.safePoint;
      this.clearControls(); (this.cat.body as Phaser.Physics.Arcade.Body).reset(recovery.x, recovery.y);
      this.say(this.walkCopy.returned);
    } else this.safePoint = { x: this.cat.x, y: this.cat.y };
    this.recordFootstep({ x: this.cat.x, y: this.cat.y });
    const target = this.echoStays ? this.echoApproach[0] ?? this.echoTarget : this.trail[0] ?? this.cat;
    const ex = target.x - this.echo.x, ey = target.y - this.echo.y, distance = Math.hypot(ex, ey);
    const travel = Math.min(Math.max(0, distance - (this.echoStays || this.trail.length > 1 ? 0 : 38)), delta * .31);
    if (distance > .1 && travel > 0) this.echo.setPosition(this.echo.x + ex / distance * travel, this.echo.y + ey / distance * travel);
    if (!this.echoStays && distance < 8 && this.trail.length > 1) this.trail.shift();
    if (this.echoStays && distance < 8 && this.echoApproach.length) {
      const reached = this.echoApproach.shift()!;
      if (this.echoDispatch) {
        if (this.echoDispatch.toLaunch > 0) this.echoDispatch.toLaunch--;
        else this.echoDispatch.walked.push({ ...reached });
      }
    }
    if (Math.abs(ex) > 1) this.echo.setFlipX(ex < 0);
    const reducedMotion = SettingsManager.get().reducedMotion;
    this.catAnimator.update(delta, { speed: this.cat.body!.velocity.length(), reducedMotion });
    this.echoAnimator.update(delta, { speed: delta > 0 ? travel * 1000 / delta : 0, reducedMotion });
    if (this.clock > this.noticeUntil) this.notice.setText(this.walkCopy.idle);
    this.tickJourney(delta);
  }
}
