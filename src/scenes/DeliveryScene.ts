import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/gameConfig';
import { SettingsManager } from '../systems/SettingsManager';
import { SoundManager } from '../systems/SoundManager';
import { CatAnimator } from '../systems/CatAnimator';
import { flowerBed, forestFloor, mossStone, postalCottage } from '../ui/postalPaint';
import { PostalJourneyManager, type PostalAddressId, type PostalJourneyError, type PostalJourneyState } from '../systems/PostalJourneyManager';

const WORLD = { width: 1600, height: 1200 };
const RIVER = { left: 760, right: 920 };
const BRIDGE = { top: 560, bottom: 680 };
const SHORTCUT = { top: 930, bottom: 1020 };
const BELL = { x: 660, y: 620 };
const MAILBOX = { x: 1240, y: 650 };
const POST = { x: 230, y: 1030 };
const ADDRESS: Array<{ id: PostalAddressId; x: number; y: number; text: string; clue: string }> = [
  { id: 'recipient', x: 355, y: 810, text: '栗笺 收', clue: '花丛旁的纸片' },
  { id: 'address', x: 205, y: 410, text: '风铃森林', clue: '老橡树旁的纸片' },
  { id: 'landmark', x: 580, y: 265, text: '浅溪东岸，榛子小屋', clue: '苔石旁的纸片' },
];
const FONT = '"Microsoft YaHei", "PingFang SC", sans-serif';
type Action = 'dash' | 'command' | 'interact';

/** One self-contained, non-combat letter. It only writes the postal journey key. */
export class DeliveryScene extends Phaser.Scene {
  private cat!: Phaser.Physics.Arcade.Sprite;
  private echo!: Phaser.GameObjects.Sprite;
  private catAnimator!: CatAnimator;
  private echoAnimator!: CatAnimator;
  private keys: Record<string, Phaser.Input.Keyboard.Key> = {};
  private keyBindings: Array<{ key: Phaser.Input.Keyboard.Key; handler: (key: Phaser.Input.Keyboard.Key, event: KeyboardEvent) => void }> = [];
  private requests = new Set<Action>();
  private solids!: Phaser.Physics.Arcade.StaticGroup;
  private bridgeBlocker!: Phaser.GameObjects.Rectangle;
  private bridgeArt!: Phaser.GameObjects.Graphics;
  private shortcutArt!: Phaser.GameObjects.Graphics;
  private bellArt!: Phaser.GameObjects.Graphics;
  private objective!: Phaser.GameObjects.Text;
  private instruction!: Phaser.GameObjects.Text;
  private hint!: Phaser.GameObjects.Text;
  private notice!: Phaser.GameObjects.Text;
  private pieceIcons = new Map<PostalAddressId, Phaser.GameObjects.Container>();
  private pausePanel?: Phaser.GameObjects.Container;
  private state!: PostalJourneyState;
  private completionId = '';
  private paused = false;
  private closed = false;
  private clock = 0;
  private noticeUntil = 0;
  private dashUntil = 0;
  private nextDashAt = 0;
  private facing = { x: 0, y: -1 };
  private dashVelocity = { x: 0, y: 0 };
  private safePoint = { x: POST.x, y: POST.y };
  private echoStays = false;
  private echoTarget = { x: POST.x - 48, y: POST.y + 14 };
  private bridgeOpen = false;
  private paintedBridgeOpen: boolean | undefined;
  private walkTarget: { x: number; y: number } | null = null;
  private walkMarker?: Phaser.GameObjects.Arc;
  private lastTargetDistance = Infinity;
  private targetStallMs = 0;
  private blurHandler?: () => void;
  private pointerHandler?: (pointer: Phaser.Input.Pointer, over?: Phaser.GameObjects.GameObject[]) => void;

  constructor() { super('DeliveryScene'); }

  create(): void {
    this.state = PostalJourneyManager.getState();
    this.completionId = this.state.completionId ?? `forest-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
    this.paused = this.closed = this.echoStays = this.bridgeOpen = false;
    this.paintedBridgeOpen = undefined; // A restarted scene owns new, initially blank Graphics.
    this.clock = this.noticeUntil = this.dashUntil = this.nextDashAt = 0;
    this.safePoint = { ...POST };
    this.facing = { x: 0, y: -1 };
    this.echoTarget = { x: POST.x - 48, y: POST.y + 14 };
    this.requests.clear(); this.pieceIcons.clear(); this.keyBindings = [];
    this.walkTarget = null; this.lastTargetDistance = Infinity; this.targetStallMs = 0;
    this.physics.world.setBounds(0, 0, WORLD.width, WORLD.height);
    this.physics.resume();
    this.solids = this.physics.add.staticGroup();
    this.paintForest();
    const catTexture = this.textures.exists('hero-ranger') ? 'hero-ranger' : 'hero';
    const echoTexture = this.textures.exists('shadow_fox') ? 'shadow_fox' : catTexture;
    this.cat = this.physics.add.sprite(POST.x, POST.y, catTexture).setDepth(30);
    this.cat.setCollideWorldBounds(true);
    (this.cat.body as Phaser.Physics.Arcade.Body).setCircle(12, this.cat.width / 2 - 12, this.cat.height / 2 - 12);
    this.echo = this.add.sprite(this.echoTarget.x, this.echoTarget.y, echoTexture).setDepth(29).setAlpha(.7).setTint(0xb8dbd0);
    this.catAnimator = new CatAnimator(this.cat, 'ranger');
    this.echoAnimator = new CatAnimator(this.echo, 'echo');
    this.walkMarker = this.add.circle(0, 0, 9, 0xe5bd7b, .25).setStrokeStyle(2, 0xab8759, .8).setDepth(15).setVisible(false);
    this.physics.add.collider(this.cat, this.solids);
    this.cameras.main.setBounds(0, 0, WORLD.width, WORLD.height);
    this.cameras.main.startFollow(this.cat, true, .12, .12);
    this.cameras.main.setDeadzone(180, 120);
    this.createHud();
    this.bindInput();
    this.syncSavedWorld();
    const protection = PostalJourneyManager.getWriteProtection();
    this.say(protection ? this.saveError(protection) : this.state.deliveryCompleted
      ? '栗笺的回信已在信袋里。南边的近路开着，可以再去和她打个招呼。'
      : '第一封信的地址被风吹散了。找回三片纸，再一起去拜访松鼠栗笺。', 6500);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, this.closeInput, this);
  }

  private text(x: number, y: number, value: string, size = 18, color = '#3f5947'): Phaser.GameObjects.Text {
    return this.add.text(x, y, value, { fontFamily: FONT, fontSize: `${size}px`, color, lineSpacing: 5 });
  }

  private solid(x: number, y: number, width: number, height: number): Phaser.GameObjects.Rectangle {
    const block = this.add.rectangle(x, y, width, height, 0xffffff, 0);
    this.physics.add.existing(block, true);
    this.solids.add(block);
    return block;
  }

  private paintForest(): void {
    this.cameras.main.setBackgroundColor(0xe4ebd2);
    const ground = forestFloor(this, WORLD.width, WORLD.height, RIVER.left, RIVER.right);
    this.add.image(0, 0, ground).setOrigin(0).setDepth(0);
    this.bridgeArt = this.add.graphics().setDepth(2);
    this.shortcutArt = this.add.graphics().setDepth(2);
    this.bellArt = this.add.graphics().setDepth(4);
    this.bridgeBlocker = this.solid(840, 620, 180, BRIDGE.bottom - BRIDGE.top);
    this.text(840, 507, '风铃栈桥', 23).setOrigin(.5).setDepth(5);
    this.text(BELL.x, BELL.y + 55, '风铃石 · E 请小暖帮忙', 16).setOrigin(.5).setDepth(5);
    this.text(1055, 1045, '栗笺家的返程近路', 18).setOrigin(.5).setDepth(5);

    const trees = [[90, 210], [270, 110], [470, 120], [640, 110], [90, 590], [110, 740], [500, 460],
      [460, 1000], [620, 850], [615, 1080], [1080, 180], [1300, 170], [1470, 310], [1050, 435],
      [1470, 745], [1370, 950], [1200, 1110], [1450, 1100]];
    for (const [index, [x, y]] of trees.entries()) {
      if (this.textures.exists('garden_tree')) {
        const size = 169 + index % 4 * 9;
        this.add.image(x, y + 49, 'garden_tree').setOrigin(.5, .91).setDisplaySize(size, size)
          .setFlipX(index % 3 === 0).setDepth(4);
      } else {
        const art = this.add.graphics().setDepth(4);
        art.fillStyle(0x729677, .13).fillEllipse(x + 10, y + 40, 105, 32);
        art.fillStyle(0xa68661).fillRoundedRect(x - 10, y - 5, 20, 58, 7);
        for (let i = 0; i < 12; i++) {
          const angle = i * Math.PI / 6;
          art.fillStyle(i % 2 ? 0xa3b58b : 0x93aa81, .78).fillEllipse(x + Math.cos(angle) * 33, y - 39 + Math.sin(angle) * 25, 65, 51);
        }
      }
      this.solid(x, y + 25, 35, 40);
    }
    // Landmarks are decoration beside the existing pickups, never new obstacles.
    const flowers = flowerBed(this), stone = mossStone(this);
    this.add.image(335, 779, flowers).setDisplaySize(182, 120).setDepth(4);
    this.add.image(405, 804, flowers).setDisplaySize(103, 68).setFlipX(true).setDepth(4);
    if (this.textures.exists('garden_tree')) {
      this.add.image(136, 378, 'garden_tree').setOrigin(.5, .9).setDisplaySize(244, 244).setDepth(4);
      const roots = this.add.graphics().setDepth(5);
      roots.lineStyle(2, 0x8d7958, .55).lineBetween(130, 350, 123, 370).lineBetween(139, 350, 151, 368);
    }
    this.add.image(584, 213, stone).setDisplaySize(132, 103).setDepth(4);
    this.add.image(543, 235, flowers).setDisplaySize(65, 43).setDepth(4);
    this.paintHouse(230, 930, '森林邮局', 0xc68e65);
    this.paintHouse(1290, 500, '栗笺的榛子小屋', 0xc6a36f);
    const squirrel = this.add.graphics().setDepth(20);
    squirrel.fillStyle(0xc69b74).fillEllipse(1355, 624, 51, 67);
    squirrel.lineStyle(3, 0x9e7859).strokeEllipse(1355, 624, 51, 67);
    squirrel.fillStyle(0xc3976c).fillCircle(1320, 610, 21).fillEllipse(1320, 643, 32, 42);
    squirrel.fillCircle(1305, 591, 9).fillCircle(1335, 591, 9);
    squirrel.fillStyle(0xf4e2c8).fillEllipse(1320, 648, 21, 28);
    squirrel.fillStyle(0x51493c).fillCircle(1312, 609, 2.5).fillCircle(1328, 609, 2.5).fillCircle(1320, 618, 2);
    this.text(1320, 680, '松鼠 · 栗笺', 17).setOrigin(.5).setDepth(25);
    const mailbox = this.add.graphics().setDepth(12);
    mailbox.fillStyle(0x8b795b).fillRect(1235, 632, 10, 40);
    mailbox.fillStyle(0xd39c73).fillRoundedRect(1218, 600, 45, 36, 8);
    mailbox.lineStyle(3, 0x87694e).strokeRoundedRect(1218, 600, 45, 36, 8).lineBetween(1229, 617, 1251, 617);
    for (const piece of ADDRESS) {
      const art = this.add.graphics();
      art.fillStyle(0xf3d489, .4).fillCircle(0, 0, 31);
      art.fillStyle(0xfffbec).fillPoints([{ x: -18, y: -13 }, { x: 16, y: -18 }, { x: 20, y: 11 }, { x: -13, y: 16 }], true);
      art.lineStyle(2, 0xa88d64).lineBetween(-8, -4, 10, -6).lineBetween(-6, 3, 7, 2);
      const tag = this.text(0, 34, '地址纸片', 15).setOrigin(.5);
      this.pieceIcons.set(piece.id, this.add.container(piece.x, piece.y, [art, tag]).setDepth(10));
    }
  }

  private paintHouse(x: number, y: number, name: string, roof: number): void {
    this.add.image(x, y - 36, postalCottage(this, roof)).setDepth(8);
    this.solid(x, y - 4, 178, 120);
    this.text(x, y - 95, name, 19, '#fff8e6').setOrigin(.5).setDepth(9);
  }

  private createHud(): void {
    this.add.rectangle(GAME_WIDTH / 2, 51, GAME_WIDTH, 102, 0xfff8e6, .96).setScrollFactor(0).setDepth(1000);
    this.text(24, 14, '第一封信 · 风铃森林', 24).setScrollFactor(0).setDepth(1001);
    this.objective = this.text(24, 51, '', 18).setScrollFactor(0).setDepth(1001);
    const pause = this.text(GAME_WIDTH - 22, 20, 'Esc · 歇一歇', 17).setOrigin(1, 0).setScrollFactor(0).setDepth(1001).setInteractive({ useHandCursor: true });
    pause.on('pointerdown', () => this.pauseJourney());
    this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT - 79, GAME_WIDTH - 32, 118, 0xfff8e6, .96).setScrollFactor(0).setDepth(1000);
    this.hint = this.text(30, GAME_HEIGHT - 127, '', 18).setScrollFactor(0).setDepth(1001);
    this.notice = this.text(30, GAME_HEIGHT - 95, '', 16, '#835c38').setWordWrapWidth(GAME_WIDTH - 65).setScrollFactor(0).setDepth(1001);
    this.instruction = this.text(30, GAME_HEIGHT - 29, 'WASD / 点地行走 · SHIFT / 右键轻跃 · E 分工 · F 互动（方向键也可移动）', 14).setScrollFactor(0).setDepth(1001);
  }

  private bindInput(): void {
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>;
    const bind = (name: string, callback: () => void) => {
      const key = kb.addKey(name, false);
      const handler = (_key: Phaser.Input.Keyboard.Key, event: KeyboardEvent) => { if (!event.repeat) callback(); };
      key.on('down', handler); this.keyBindings.push({ key, handler });
    };
    for (const [name, action] of [['SHIFT', 'dash'], ['E', 'command'], ['F', 'interact']] as const) {
      bind(name, () => { if (this.canAct()) this.requests.add(action); });
    }
    bind('ESC', () => { if (this.paused) this.returnToPostOffice(); else this.pauseJourney(); });
    bind('ENTER', () => { if (this.paused) this.resumeJourney(); });
    this.input.mouse?.disableContextMenu();
    this.pointerHandler = (pointer, over) => this.handlePointerDown(pointer, over);
    this.input.on('pointerdown', this.pointerHandler);
    this.blurHandler = () => this.pauseJourney();
    this.game.events.on(Phaser.Core.Events.BLUR, this.blurHandler);
    this.game.events.on(Phaser.Core.Events.HIDDEN, this.blurHandler);
  }

  private canAct(): boolean { return !this.closed && !this.paused && this.sys.isActive() && this.game.hasFocus; }

  private handlePointerDown(pointer: Phaser.Input.Pointer, over: Phaser.GameObjects.GameObject[] = []): void {
    if (!this.canAct() || pointer.y <= 102 || pointer.y >= GAME_HEIGHT - 140 || over.some(object => object.input?.enabled)) return;
    if (pointer.rightButtonDown()) { this.requests.add('dash'); return; }
    if (!pointer.leftButtonDown()) return;
    const point = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
    this.walkTarget = { x: Phaser.Math.Clamp(point.x, 18, WORLD.width - 18), y: Phaser.Math.Clamp(point.y, 18, WORLD.height - 18) };
    this.lastTargetDistance = Infinity; this.targetStallMs = 0;
    this.walkMarker?.setPosition(this.walkTarget.x, this.walkTarget.y).setVisible(true);
  }

  private clearWalkTarget(): void {
    this.walkTarget = null; this.lastTargetDistance = Infinity; this.targetStallMs = 0;
    this.walkMarker?.setVisible(false);
  }

  private movementIntent(delta: number): { x: number; y: number } {
    let x = Number(this.keys.D.isDown || this.keys.RIGHT.isDown) - Number(this.keys.A.isDown || this.keys.LEFT.isDown);
    let y = Number(this.keys.S.isDown || this.keys.DOWN.isDown) - Number(this.keys.W.isDown || this.keys.UP.isDown);
    if (Object.values(this.keys).some(key => key.isDown)) this.clearWalkTarget();
    else if (this.walkTarget) {
      x = this.walkTarget.x - this.cat.x; y = this.walkTarget.y - this.cat.y;
      const distance = Math.hypot(x, y);
      if (distance <= 9) { this.clearWalkTarget(); return { x: 0, y: 0 }; }
      if (this.lastTargetDistance - distance < .4 && this.clock >= this.dashUntil) this.targetStallMs += delta;
      else this.targetStallMs = 0;
      this.lastTargetDistance = distance;
      if (this.targetStallMs >= 400) {
        this.clearWalkTarget(); this.say('前面被挡住了。换个落脚点，或用方向键绕一绕；风铃栈桥需要小暖帮忙。');
        return { x: 0, y: 0 };
      }
    }
    const length = Math.hypot(x, y);
    return length > 0 ? { x: x / length, y: y / length } : { x: 0, y: 0 };
  }

  private clearInput(): void {
    this.requests.clear(); this.dashUntil = 0;
    this.clearWalkTarget();
    this.catAnimator?.resetTransient(); this.echoAnimator?.resetTransient();
    this.input.keyboard?.resetKeys();
    if (this.cat?.body) this.cat.setVelocity(0, 0);
  }

  private pauseJourney(): void {
    if (this.closed || this.paused) return;
    this.paused = true; this.clearInput(); this.physics.pause();
    const shade = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT, 0x516d58, .55);
    const panel = this.add.rectangle(GAME_WIDTH / 2, GAME_HEIGHT / 2, 600, 260, 0xfff8e6);
    const title = this.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 83, '把信袋放稳，歇一小会儿', 25).setOrigin(.5);
    const info = this.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 - 33, '已确认保存的地址和回信会留在本机。', 17).setOrigin(.5);
    const resume = this.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 24, 'Enter · 继续送信', 21).setOrigin(.5).setInteractive({ useHandCursor: true });
    const leave = this.text(GAME_WIDTH / 2, GAME_HEIGHT / 2 + 77, 'Esc · 回到邮局菜单', 19).setOrigin(.5).setInteractive({ useHandCursor: true });
    resume.on('pointerdown', () => this.resumeJourney()); leave.on('pointerdown', () => this.returnToPostOffice());
    this.pausePanel = this.add.container(0, 0, [shade, panel, title, info, resume, leave]).setScrollFactor(0).setDepth(2000);
  }

  private resumeJourney(): void {
    if (this.closed || !this.game.hasFocus) return;
    this.clearInput(); this.pausePanel?.destroy(); this.pausePanel = undefined;
    this.paused = false; this.physics.resume();
  }

  private returnToPostOffice(): void {
    this.closed = true; this.clearInput(); this.scene.start('MenuScene');
  }

  private closeInput(): void {
    this.closed = true; this.clearInput();
    for (const { key, handler } of this.keyBindings) key.off('down', handler);
    this.keyBindings = [];
    if (this.pointerHandler) this.input.off('pointerdown', this.pointerHandler);
    if (this.blurHandler) {
      this.game.events.off(Phaser.Core.Events.BLUR, this.blurHandler);
      this.game.events.off(Phaser.Core.Events.HIDDEN, this.blurHandler);
    }
    this.pausePanel = undefined;
  }

  private say(value: string, duration = 5500): void { this.notice.setText(value); this.noticeUntil = this.clock + duration; }

  private saveError(error?: PostalJourneyError): string {
    if (error === 'future-version') return '这段邮路来自更新版本，已保留原存档。请使用对应版本继续。';
    if (error === 'invalid-save') return '本机邮路记录暂时无法读取，原记录已保留；请先回邮局检查备份。';
    if (error === 'incomplete-address') return '还缺几片地址。先把完整住址夹进信袋吧。';
    return '这次没有确认保存到本机，纸片或信件仍可重试。请按 F 再试一次。';
  }

  private near(point: { x: number; y: number }, radius = 75): boolean {
    return Phaser.Math.Distance.Between(this.cat.x, this.cat.y, point.x, point.y) <= radius;
  }

  private interact(): void {
    const piece = ADDRESS.find(item => !this.state.foundAddressIds.includes(item.id) && this.near(item, 65));
    if (piece) {
      const result = PostalJourneyManager.findAddress(piece.id);
      if (!result.saved) { this.say(this.saveError(result.error)); return; }
      this.state = result.state; this.syncSavedWorld(); this.catAnimator.celebrate();
      SoundManager.get().postalCue('address');
      this.say(`夹好了：「${piece.text}」。地址 ${this.state.foundAddressIds.length}/3，已保存。`);
    } else if (this.near(MAILBOX, 105)) {
      if (this.state.deliveryCompleted) { this.say('栗笺：坚果饼有一点焦，也可以邀请朋友。谢谢你的信！南边的小路送你回家。'); return; }
      const result = PostalJourneyManager.completeDelivery(this.completionId);
      if (!result.saved) { this.say(this.saveError(result.error)); return; }
      this.state = result.state; this.syncSavedWorld(); this.catAnimator.celebrate(); this.echoAnimator.celebrate();
      SoundManager.get().postalCue('delivery');
      this.say('栗笺收到了信，也交给你一封回信：「圆镜湖，第三片大荷叶旁，泡芙收。」回信已保存，南边近路开了！', 10000);
    } else if (this.near(BELL, 100)) {
      this.say('风铃石想找个愿意等一等的朋友。站在附近按 E，小暖会留在石上，让栈桥保持平稳。');
    } else if (this.cat.x > RIVER.right && this.near({ x: 975, y: 620 }, 100) && !this.bridgeOpen) {
      this.returnToSafety(true); this.say('小暖牵着一片大叶子，把你送回西岸。信袋里的东西一样没少。');
    } else if (this.near(POST, 90)) {
      if (this.state.deliveryCompleted) this.returnToPostOffice();
      else this.say('邮局便条：花丛、老橡树、苔石旁都有地址纸片。找齐后去溪边，小暖会帮你过桥。');
    } else this.say('走近纸片、风铃石或松鼠信箱，再按 F。');
  }

  private commandEcho(): void {
    this.echoStays = !this.echoStays;
    SoundManager.get().postalCue('command');
    if (this.echoStays) {
      this.echoTarget = this.near(BELL, 115) ? { ...BELL } : { x: this.echo.x, y: this.echo.y };
      this.say(this.near(BELL, 115) ? '小暖：我来照看风铃石，你安心过桥。' : '小暖留在这里等你。再按 E 就会继续同行。');
    } else this.say(this.state.deliveryCompleted ? '小暖跟上来啦。带着回信走南边近路回邮局。' : '小暖又跟上来啦。需要过桥时，请让它留在风铃石上。');
  }

  private syncSavedWorld(): void {
    for (const [id, icon] of this.pieceIcons) icon.setVisible(!this.state.foundAddressIds.includes(id));
    this.shortcutArt.clear();
    if (this.state.deliveryCompleted) this.paintBridge(this.shortcutArt, SHORTCUT.top, SHORTCUT.bottom, true);
    else {
      this.shortcutArt.lineStyle(5, 0xc5aa7e).lineBetween(945, SHORTCUT.top, 945, SHORTCUT.bottom);
      this.shortcutArt.lineStyle(3, 0xc5aa7e).lineBetween(945, SHORTCUT.top + 20, 965, SHORTCUT.top + 40);
    }
    this.updateBridge();
  }

  private paintBridge(g: Phaser.GameObjects.Graphics, top: number, bottom: number, open: boolean): void {
    g.fillStyle(open ? 0xdcb785 : 0xc6b79b, open ? 1 : .4);
    for (let x = RIVER.left - 13; x < RIVER.right + 13; x += 24) {
      if (!open && x > RIVER.left + 20 && x < RIVER.right - 20) continue;
      g.fillRoundedRect(x, top, 21, bottom - top, 3);
    }
    g.lineStyle(4, open ? 0x9c805a : 0xb0a38c).lineBetween(RIVER.left - 20, top + 5, RIVER.right + 20, top + 5)
      .lineBetween(RIVER.left - 20, bottom - 5, RIVER.right + 20, bottom - 5);
  }

  private updateBridge(): void {
    this.bridgeOpen = this.echoStays && Phaser.Math.Distance.Between(this.echo.x, this.echo.y, BELL.x, BELL.y) < 24;
    (this.bridgeBlocker.body as Phaser.Physics.Arcade.StaticBody).enable = !this.bridgeOpen;
    if (this.paintedBridgeOpen === this.bridgeOpen) return;
    this.paintedBridgeOpen = this.bridgeOpen;
    this.bridgeArt.clear(); this.paintBridge(this.bridgeArt, BRIDGE.top, BRIDGE.bottom, this.bridgeOpen);
    this.bellArt.clear();
    this.bellArt.fillStyle(this.bridgeOpen ? 0xeedb8e : 0xc3d0b1).fillEllipse(BELL.x, BELL.y, 69, 41);
    this.bellArt.lineStyle(3, 0x89a386).strokeEllipse(BELL.x, BELL.y, 69, 41);
    this.bellArt.fillStyle(0xb2935f).fillCircle(BELL.x, BELL.y - 32, 9);
    this.bellArt.lineStyle(2, 0xb2935f).lineBetween(BELL.x, BELL.y - 22, BELL.x, BELL.y - 6);
  }

  private returnToSafety(west = false): void {
    const point = west ? { x: 685, y: 715 } : this.safePoint;
    this.clearInput();
    this.cat.setPosition(point.x, point.y);
    (this.cat.body as Phaser.Physics.Arcade.Body).reset(point.x, point.y);
    if (!this.echoStays) this.echo.setPosition(point.x - 40, point.y + 15);
  }

  private updateHint(): void {
    const piece = ADDRESS.find(item => !this.state.foundAddressIds.includes(item.id) && this.near(item, 65));
    this.objective.setText(this.state.deliveryCompleted ? '回信已收好 · 南边近路已打开，带回邮局吧'
      : this.state.foundAddressIds.length < 3 ? `找回地址 ${this.state.foundAddressIds.length}/3 · 花丛 / 老橡树 / 苔石`
        : this.bridgeOpen ? '栈桥已稳住 · 过桥到栗笺门前，按 F 交信'
          : '地址完整 · 让小暖守住风铃石，过桥到栗笺门前 F 交信');
    if (piece) this.hint.setText('F · 把这片地址夹进信袋');
    else if (this.near(MAILBOX, 105)) this.hint.setText(this.state.deliveryCompleted ? 'F · 和栗笺说说话' : 'F · 把信交给栗笺，收下她的回信');
    else if (this.near(BELL, 115)) this.hint.setText(this.bridgeOpen ? '栈桥稳稳的 · 小暖正在等你，安心向东走'
      : this.echoStays && Math.hypot(this.echoTarget.x - BELL.x, this.echoTarget.y - BELL.y) < 1
        ? '小暖正走向风铃石 · 等它站稳，栈桥就会展开'
        : 'E · 请小暖留在风铃石上，维持栈桥');
    else if (this.cat.x > RIVER.right && this.near({ x: 975, y: 620 }, 100) && !this.bridgeOpen) this.hint.setText('桥收起来了 · F 请小暖送你回西岸');
    else if (this.near(POST, 90)) this.hint.setText(this.state.deliveryCompleted ? 'F · 带回信回到邮局菜单' : 'F · 看看邮局的寻片便条');
    else {
      const targets = ADDRESS.filter(item => !this.state.foundAddressIds.includes(item.id));
      const target = targets.sort((a, b) => Phaser.Math.Distance.Between(this.cat.x, this.cat.y, a.x, a.y) - Phaser.Math.Distance.Between(this.cat.x, this.cat.y, b.x, b.y))[0];
      if (target) {
        const direction = `${target.y < this.cat.y - 40 ? '北' : target.y > this.cat.y + 40 ? '南' : ''}${target.x < this.cat.x - 40 ? '西' : target.x > this.cat.x + 40 ? '东' : ''}`;
        this.hint.setText(`${direction || '附近'}边有${target.clue} · 走近后按 F`);
      } else this.hint.setText(this.state.deliveryCompleted ? this.cat.x < RIVER.left
        ? '回信已收好 · 邮局在西南方，门前按 F 回营' : '沿溪向南找木板近路 · 信袋里多了一句谢谢'
        : this.bridgeOpen ? '沿栈桥向东走 · 栗笺在榛子小屋门前' : '去溪边的风铃石 · E 让小暖留守');
    }
    if (this.clock > this.noticeUntil) this.notice.setText('轻跃能让脚步轻快一点；树干和房屋需要绕行，踩进浅溪会回到岸边，不会丢东西。');
  }

  update(_time: number, delta: number): void {
    if (this.closed) return;
    if (!this.game.hasFocus) this.pauseJourney();
    if (this.paused) { this.requests.clear(); return; }
    delta = Math.max(0, Math.min(50, delta)); this.clock += delta;
    if (this.requests.delete('command')) this.commandEcho();
    if (this.requests.delete('interact')) this.interact();
    if (this.closed) return;
    const { x, y } = this.movementIntent(delta);
    if (x || y) this.facing = { x, y };
    if (this.requests.delete('dash') && this.clock >= this.nextDashAt) {
      this.dashUntil = this.clock + 170; this.nextDashAt = this.clock + 700;
      this.dashVelocity = { x: this.facing.x * 490, y: this.facing.y * 490 };
      this.catAnimator.dash(170);
      SoundManager.get().postalCue('dash');
    }
    if (this.clock < this.dashUntil) this.cat.setVelocity(this.dashVelocity.x, this.dashVelocity.y);
    else this.cat.setVelocity(x * 215, y * 215);
    if (Math.abs(this.cat.body!.velocity.x) > 1) this.cat.setFlipX(this.cat.body!.velocity.x < 0);

    if (!this.echoStays) this.echoTarget = { x: this.cat.x - this.facing.x * 48, y: this.cat.y - this.facing.y * 48 };
    const ex = this.echoTarget.x - this.echo.x, ey = this.echoTarget.y - this.echo.y;
    const distance = Math.hypot(ex, ey), travel = Math.min(distance, delta * .3);
    if (distance > .1) {
      this.echo.setPosition(this.echo.x + ex / distance * travel, this.echo.y + ey / distance * travel);
      if (Math.abs(ex) > 1) this.echo.setFlipX(ex < 0);
    }
    this.updateBridge();
    const onBridge = this.bridgeOpen && this.cat.y > BRIDGE.top + 13 && this.cat.y < BRIDGE.bottom - 13;
    const onShortcut = this.state.deliveryCompleted && this.cat.y > SHORTCUT.top + 13 && this.cat.y < SHORTCUT.bottom - 13;
    if (this.cat.x > RIVER.left && this.cat.x < RIVER.right && !onBridge && !onShortcut) {
      this.returnToSafety(); this.say('爪尖沾到一点溪水。回到安全岸边，信件和进度都还在。');
    } else if (this.cat.x < RIVER.left - 35 || this.state.deliveryCompleted && this.cat.x > RIVER.right + 35) {
      this.safePoint = { x: this.cat.x, y: this.cat.y };
    }
    const reducedMotion = SettingsManager.get().reducedMotion;
    this.catAnimator.update(delta, { speed: this.cat.body!.velocity.length(), reducedMotion });
    this.echoAnimator.update(delta, { speed: delta > 0 ? travel * 1000 / delta : 0, reducedMotion });
    this.updateHint();
  }
}
