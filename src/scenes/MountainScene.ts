import Phaser from 'phaser';
import { PostalWalkScene, type WalkPoint } from './PostalWalkScene';
import {
  MOUNTAIN_WORLD, MOUNTAIN_CHECKPOINTS, MOUNTAIN_SPAWN, MOUNTAIN_STATIONS,
  MOUNTAIN_GATE, MOUNTAIN_NPC, MOUNTAIN_DISCOVERY, MOUNTAIN_PATHS,
  MOUNTAIN_NOTE_LABELS, MOUNTAIN_ACTOR_LABELS, isMountainSafe,
  type MountainStationId, type MountainNote,
} from '../data/mountain';
import { MountainRelay, type MountainRelayEvent, type MountainRelayError } from '../systems/MountainRelay';
import { JourneyProgressManager as Journey, type JourneyState, type JourneyNodeId } from '../systems/JourneyProgressManager';
import { SoundManager } from '../systems/SoundManager';
import { SettingsManager } from '../systems/SettingsManager';
import { mountainFloor, drawMountainLandmarks } from '../ui/mountainPaint';

const STATIONS: readonly MountainStationId[] = ['lesson', 'pass'];
const NOTES: readonly MountainNote[] = ['leaf', 'sun', 'bell'];
const NODE: Record<MountainStationId, JourneyNodeId> = { lesson: 'mountain.signalLearned', pass: 'mountain.passOpened' };
const INK: Record<MountainNote, number> = { leaf: 0x577f65, sun: 0xc18e45, bell: 0x8a7193 };
const WIND_FLAGS = [{ x: 1080, y: 990 }, { x: 1080, y: 800 }, { x: 1120, y: 660 }] as const;

/** Remember a signal, split up, and answer each other across a warm mountain path. */
export class MountainScene extends PostalWalkScene {
  private relay!: MountainRelay;
  private state!: JourneyState;
  private receipt = '';
  private pendingStation: MountainStationId | null = null;
  private staticChanges!: Phaser.GameObjects.Graphics;
  private bellArt!: Phaser.GameObjects.Graphics;
  private flags!: Phaser.GameObjects.Graphics;
  private bellLabels = new Map<string, Phaser.GameObjects.Text>();
  private stationLabels = new Map<MountainStationId, Phaser.GameObjects.Text>();
  private discoveryLabel!: Phaser.GameObjects.Text;
  private lastPaint = '';
  private ringing: { station: MountainStationId; actor: 'echo' | 'player'; note: MountainNote; until: number } | null = null;
  private windFlag: WalkPoint | null = null;
  private wasInWind = false;

  constructor() { super('MountainScene'); }
  protected override get walkCopy() { return {
    pause: '接力成功时保存。重来会从最近确认的休息点出发。',
    blocked: '那边是软软的云，走不过去。沿奶油色山路绕过石壁。',
    returned: '风替你托了一下，回到踏稳的山路。信和已经完成的接力都在。',
    idle: 'F 读铃谱，E 请小暖传话。轮到你时走近对应图形的铃按 F；它会一直等你。',
    recall: '小暖：我沿刚才走过的路回来。铃谱还记得，随时可以再试。',
  }; }

  create(): void {
    if (!Journey.isRegionUnlocked('mountain') || Journey.getWriteProtection()) { this.scene.start('JourneyMapScene'); return; }
    this.state = Journey.getState();
    const checkpoint = Journey.getMountainCheckpoint(this.state);
    const resume = checkpoint === 'mailbox' ? 'pass' : checkpoint === 'relayCamp' ? 'lesson' : 'start';
    this.relay = new MountainRelay(resume); this.pendingStation = null; this.lastPaint = ''; this.ringing = null;
    this.windFlag = null; this.wasInWind = false; this.bellLabels.clear(); this.stationLabels.clear();
    this.receipt = this.state.deliveries.mountain?.completionId ?? `mountain-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
    this.beginWalk('第三封信 · 云阶山', MOUNTAIN_CHECKPOINTS[resume], MOUNTAIN_WORLD);
    this.cameras.main.setBackgroundColor(0xe5e7e4);
    this.add.image(0, 0, mountainFloor(this)).setOrigin(0).setDepth(0); drawMountainLandmarks(this);
    this.staticChanges = this.add.graphics().setDepth(3);
    this.bellArt = this.add.graphics().setDepth(17); this.flags = this.add.graphics().setDepth(18);
    for (const id of STATIONS) {
      const s = MOUNTAIN_STATIONS[id];
      this.words(s.instruction.x, s.instruction.y - 83, `${s.label} · F 读铃谱`, 18).setOrigin(.5).setDepth(16);
      this.stationLabels.set(id, this.words(s.instruction.x, s.instruction.y - 50, '', 14).setOrigin(.5).setDepth(16));
      this.words(s.command.x, s.command.y + 32, 'E · 请小暖传话', 14).setOrigin(.5).setDepth(16);
      this.words(s.echo.x, s.echo.y - 46, '小暖的铃台', 14).setOrigin(.5).setDepth(16);
      for (const note of NOTES) {
        const p = s.playerBells[note];
        this.bellLabels.set(`${id}:${note}`, this.words(p.x, p.y + 37, `${MOUNTAIN_NOTE_LABELS[note]} · F`, 17).setOrigin(.5).setDepth(18));
      }
    }
    this.words(MOUNTAIN_SPAWN.x, MOUNTAIN_SPAWN.y + 65, '山脚邮亭 · F 回邮路图', 16).setOrigin(.5).setDepth(16);
    this.words(MOUNTAIN_NPC.x - 15, MOUNTAIN_NPC.y + 108, '岚角 · 两只铜铃下', 20).setOrigin(.5).setDepth(16);
    this.discoveryLabel = this.words(MOUNTAIN_DISCOVERY.x, MOUNTAIN_DISCOVERY.y + 57, '', 15).setOrigin(.5).setDepth(16);
    this.words(1610, 940, '宽缓山路 · 不必经过风口', 16).setOrigin(.5).setDepth(16);
    this.say(this.state.deliveries.mountain ? '岚角正画今天的天气。回信册里有团刺的地址，铜铃还在等你们合奏。'
      : resume === 'pass' ? '山口的铃声已经接上。走过开着的门，到两只铜铃下，按 F 把泡芙的信交给岚角。'
      : resume === 'lesson' ? '小暖已经学会记住约定。这里的第二张铃谱，需要你们在中间互相回应。先按 F 读一读。'
      : '泡芙说岚角住在“两只铜铃下”。沿山路去试铃台读铃谱，让小暖学会把一句话接着说完。', 11000);
    this.tickJourney(0);
  }

  private geometryOptions() { return { windOpen: this.state?.regions.mountain.completedNodeIds.includes(NODE.lesson), gateOpen: this.state?.regions.mountain.completedNodeIds.includes(NODE.pass) }; }
  protected isSafe(point: WalkPoint): boolean { return isMountainSafe(point, this.geometryOptions()); }
  private inWind(point: WalkPoint): boolean {
    // The circular lookout is a genuine resting place, including while reading its postcard.
    return this.geometryOptions().windOpen === true && Math.hypot(point.x - MOUNTAIN_DISCOVERY.x, point.y - MOUNTAIN_DISCOVERY.y) > 60
      && point.x >= 1020 && point.x <= 1160 && point.y > 700 && point.y < 965;
  }
  private windStrength(): number { const phase = this.clock % 6400; return phase >= 1500 && phase < 3400 ? 165 : 0; }
  protected override adjustWalkVelocity(velocity: WalkPoint): WalkPoint {
    if (this.inWind(this.cat)) return { x: velocity.x + this.windStrength() * (this.isDashing() ? .18 : 1), y: velocity.y };
    return velocity;
  }
  protected override recoveryPoint(): WalkPoint | null { return this.wasInWind ? this.windFlag : null; }

  protected command(): void {
    if (this.pendingStation) { this.say('接力已经成功，先按 F 确认这次保存，再安排下一步。'); return; }
    if (this.echoStays) { this.relay.cancel(); this.recallEcho(); return; }
    const id = STATIONS.find(id => this.near(MOUNTAIN_STATIONS[id].command, 85));
    if (!id) { this.say('走到铃谱旁标着 E 的分工点，再请小暖走向自己的铃台。'); return; }
    const result = this.relay.assign(id, this.cat);
    if (!result.ok || !result.route) { this.say(this.errorText(result.error)); return; }
    if (!this.sendEchoRoute(result.route.waypoints)) { this.relay.cancel(); this.say('再靠近分工点一点，小暖需要一条连续的山路。'); return; }
    this.say(id === 'lesson' ? '小暖去敲「叶、日」，你走到右边的「铃」回应。它会等你，不必赶拍子。'
      : '小暖沿布旗小径独自出发。它先敲「铃」，等你在上方回应「叶」，再把最后的「日」接上。', 11000);
  }

  private handleEvents(events: readonly MountainRelayEvent[]): void {
    for (const event of events) {
      if (event.type === 'matched') { this.saveRelay(event.station); continue; }
      this.ringing = { ...event, until: this.clock + 750 };
      SoundManager.get().postalCue(`bell-${event.note}`);
      this.say(`${MOUNTAIN_ACTOR_LABELS[event.actor]}：${MOUNTAIN_NOTE_LABELS[event.note]}。${event.actor === 'echo' ? '轮到棉棉时，小暖会等你走近对应的铃。' : '接上啦，小暖记住了你的回应。'}`, 5000);
    }
  }
  private saveRelay(id: MountainStationId): void {
    const result = Journey.completeNode('mountain', NODE[id]);
    if (!result.saved) { this.pendingStation = id; this.say('铃声已经接上，但本机还没有确认保存。按 F 重试，不需要重演。', 12000); return; }
    this.state = result.state; this.pendingStation = null; this.relay.confirmSaved(id);
    this.catAnimator.celebrate(); this.echoAnimator.celebrate();
    this.say(id === 'lesson' ? '第一句接上啦，已保存！小暖学会了记住约定。E 召回它，沿右边宽路上山；布旗风口是可选近路。'
      : '第二句也接上了，已保存。小暖会等你，也会自己把话说完。山口开了，走到右上方岚角家亲手交信。', 14000);
  }

  protected interact(): void {
    this.handleEvents(this.relay.update(0, this.echo, this.echoStays));
    if (this.pendingStation) { this.saveRelay(this.pendingStation); return; }
    if (this.near(MOUNTAIN_SPAWN, 85)) { this.leaveWalk(); return; }
    if (this.near(MOUNTAIN_NPC, 95)) {
      if (this.state.deliveries.mountain) { this.say('岚角：今天的云像两只慢半拍的猫。替我问候团刺吧，她住在晒被沙原，花盆旁晒着小被子。', 10000); return; }
      if (!this.relay.getSnapshot().confirmed.pass) { this.say('岚角听见你们啦。先把山口的三声铃接完整，再送来这封信。'); return; }
      const result = Journey.deliver('mountain', this.receipt);
      if (!result.saved) { this.say('岚角把信夹扶好了。本机还没确认保存，按 F 再试一次。'); return; }
      this.state = result.state; this.catAnimator.celebrate(); this.echoAnimator.celebrate(); SoundManager.get().postalCue('delivery');
      this.say('岚角收到了泡芙的信，也写下了今天的天气。回信册里有团刺的新地址；山脚邮亭和 Esc 都能带你回邮路图。', 14000); return;
    }
    if (this.near(MOUNTAIN_DISCOVERY, 65) && this.geometryOptions().windOpen) {
      const result = Journey.discover('mountain.sharedChime');
      if (!result.saved) { this.say('明信片夹在旗绳上。本机还没记下，按 F 重试。'); return; }
      this.state = result.state;
      if (!result.duplicate) { this.catAnimator.celebrate(); SoundManager.get().postalCue('address'); }
      this.say('云纹明信片的背面，岚角留了两格：一格画棉棉，一格画小暖。“慢半拍，也合得来。”', 10000); return;
    }
    for (const id of STATIONS) {
      const station = MOUNTAIN_STATIONS[id];
      if (this.near(station.instruction, 90)) {
        const result = this.relay.observe(id, this.cat);
        if (!result.ok) this.say(this.errorText(result.error));
        else this.say(id === 'lesson' ? '铃谱已夹好：小暖「叶、日」，棉棉「铃」。靠近 E 分工点请它先开始，再去右边的铃台。'
          : '铃谱已夹好：小暖「铃」→ 棉棉「叶」→ 小暖「日」。小暖走布旗小径，你沿宽路去上方的叶形铃。', 13000);
        return;
      }
      for (const note of NOTES) if (this.near(station.playerBells[note], 60)) {
        const result = this.relay.ringPlayer(id, note, this.cat);
        if (!result.ok) { SoundManager.get().postalCue(`bell-${note}`); this.say(this.errorText(result.error)); }
        else this.handleEvents(result.events);
        return;
      }
    }
    this.say('先在石碑前 F 读铃谱，再到 E 分工点请小暖传话。铃上的图形和上方提示对应，不需要靠听音记住。');
  }

  private errorText(error?: MountainRelayError): string {
    const messages: Partial<Record<MountainRelayError, string>> = {
      locked: '先在山脚试铃台完成第一句约定，小暖才知道怎样接力。',
      'not-observed': '先到旁边的石碑前按 F，把铃谱夹在信袋上。',
      'not-assigned': '先到 E 分工点，请小暖去自己的铃台。',
      'echo-not-ready': '小暖还在走向自己的铃台。等它站稳，图形会告诉你下一声。',
      'wrong-note': `这一声要回应「${this.relay.getSnapshot().next?.label ?? '图形'}」。走近那只铃再按 F；刚才接上的部分还在。`,
      'not-player-turn': '这一声由小暖来。等上方提示轮到棉棉，它会慢慢等你。',
      'other-station-active': '先按 E 召回小暖，再开始另一处接力。',
      'awaiting-save': '接力已经成功，按 F 确认保存即可，不必再敲一遍。',
      finished: '这句约定已经接好。带着小暖沿山路继续吧。',
    };
    return messages[error!] ?? '走近标着 F 的石碑或铃，标着 E 的地方可以安排分工。';
  }

  protected tickJourney(delta: number): void {
    this.handleEvents(this.relay.update(delta, this.echo, this.echoStays));
    const s = this.relay.getSnapshot();
    for (const flag of WIND_FLAGS) if (this.geometryOptions().windOpen && this.near(flag, 48) && this.isSafe(this.cat)) this.windFlag = { ...flag };
    this.wasInWind = this.inWind(this.cat);
    const id = s.activeStation ?? (s.confirmed.lesson ? 'pass' : 'lesson');
    const steps = s.stations[id].pattern.map((step, i) => `${MOUNTAIN_ACTOR_LABELS[step.actor]}${step.label}${s.activeStation === id && i < s.played ? '✓' : ''}`).join(' → ');
    this.objective.setText(this.pendingStation ? '接力成功 · 本机记录尚未确认，F 重试保存'
      : this.state.deliveries.mountain ? '岚角已收信 · 小暖学会接力，回信册里有下一处地址'
      : s.confirmed.pass ? '两段约定已接上 · 经过右侧山口，去岚角家 F 交信'
      : s.stations[id].observed ? `${steps} · ${s.playerWait ? `等你回应「${s.next?.label}」` : s.phase === 'echoPlaying' ? '小暖在传话' : s.phase === 'awaitingEcho' ? '小暖沿路去铃台' : 'E 请小暖开始'}`
      : s.confirmed.lesson ? '沿右侧宽路上山 · 山腰石碑 F 读第二段铃谱' : '山脚试铃台 · F 读铃谱，再 E 请小暖传话');
    const atBell = STATIONS.flatMap(id => NOTES.map(note => ({ id, note, point: MOUNTAIN_STATIONS[id].playerBells[note] }))).find(b => this.near(b.point, 60));
    this.hint.setText(this.pendingStation ? 'F · 只重试保存，不重演铃声'
      : this.near(MOUNTAIN_NPC, 95) ? 'F · 把泡芙的信交给岚角 / 聊聊天'
      : this.near(MOUNTAIN_SPAWN, 85) ? 'F · 回到邮路图'
      : this.near(MOUNTAIN_DISCOVERY, 65) && this.geometryOptions().windOpen ? 'F · 夹好云纹明信片（可选）'
      : this.inWind(this.cat) ? this.windStrength() ? '侧风来了 · 调整方向，SHIFT 轻跃；偏离会回到旗桩' : this.clock % 6400 >= 750 && this.clock % 6400 < 1500 ? '旗带抬起来了 · 侧风将至，可以先在圆平台停一停' : '风口是可选近路 · 右边宽路始终能上山'
      : atBell ? `F · 敲「${MOUNTAIN_NOTE_LABELS[atBell.note]}」；轮到你时回应，不用赶时间`
      : STATIONS.some(id => this.near(MOUNTAIN_STATIONS[id].instruction, 90)) ? 'F · 读 / 重读铃谱，图形会留在提示里'
      : this.echoStays ? '小暖在独立传话 · E 召回会取消未完成的这一遍'
      : '跟着奶油色山路走 · 布旗标着小暖认识的路');
    const key = [s.phase, s.activeStation, s.played, s.confirmed.lesson, s.confirmed.pass, Boolean(this.state.deliveries.mountain), this.state.optionalDiscoveries.length].join(':');
    if (key !== this.lastPaint) { this.lastPaint = key; this.repaintProgress(); }
    this.drawBells(); this.drawFlags();
  }

  private repaintProgress(): void {
    const g = this.staticChanges.clear(), s = this.relay.getSnapshot();
    if (s.confirmed.lesson) {
      const path = MOUNTAIN_PATHS.find(p => p.kind === 'wind')!;
      g.lineStyle(path.width, 0xf0dcc1, 1);
      for (let i = 1; i < path.waypoints.length; i++) g.lineBetween(path.waypoints[i - 1].x, path.waypoints[i - 1].y, path.waypoints[i].x, path.waypoints[i].y);
      g.fillStyle(0xf0dcc1); for (const p of path.waypoints) g.fillCircle(p.x, p.y, path.width / 2);
      g.fillCircle(MOUNTAIN_DISCOVERY.x, MOUNTAIN_DISCOVERY.y, 85);
      const d = MOUNTAIN_DISCOVERY;
      g.fillStyle(0xe2e8d0).fillCircle(d.x, d.y, 60);
      g.fillStyle(0xfff7df).fillRoundedRect(d.x - 23, d.y - 18, 46, 36, 4);
      g.lineStyle(2, 0xad946f).strokeRoundedRect(d.x - 23, d.y - 18, 46, 36, 4);
      g.lineStyle(1.5, 0x8aa99d).strokeCircle(d.x - 7, d.y - 1, 8).strokeCircle(d.x + 8, d.y - 1, 8);
    }
    if (!s.confirmed.pass) {
      const gate = MOUNTAIN_GATE; g.fillStyle(0xc7b49a).fillRoundedRect(gate.x, gate.y, gate.width, gate.height, 12);
      g.lineStyle(3, 0x947e60).strokeRoundedRect(gate.x + 4, gate.y + 4, gate.width - 8, gate.height - 8, 10);
      g.fillStyle(0xf8e8b4).fillCircle(gate.x + gate.width / 2, gate.y + gate.height / 2, 21);
    }
    for (const id of STATIONS) {
      const station = MOUNTAIN_STATIONS[id], p = station.instruction;
      g.fillStyle(0xd8c9b2).fillRoundedRect(p.x - 26, p.y - 19, 52, 38, 8);
      g.fillStyle(0xfff3d1).fillRect(p.x - 18, p.y - 12, 36, 24);
      g.lineStyle(2, 0xaa9167).lineBetween(p.x, p.y - 10, p.x, p.y + 10);
      g.lineStyle(2, 0x88a48b, .7).strokeCircle(station.command.x, station.command.y, 19);
      this.stationLabels.get(id)!.setText(s.stations[id].confirmed ? '这句约定已经接好 ✓'
        : s.stations[id].observed ? s.stations[id].pattern.map(p => `${MOUNTAIN_ACTOR_LABELS[p.actor]}·${p.label}`).join(' → ') : '把图形夹进信袋，小暖会记住');
    }
    this.discoveryLabel.setText(this.geometryOptions().windOpen ? this.state.optionalDiscoveries.includes('mountain.sharedChime') ? '云纹明信片 · 两格都留好了' : '云纹明信片 · F' : '试铃接好后，布旗近路会展开');
  }
  private drawBells(): void {
    const g = this.bellArt.clear(), s = this.relay.getSnapshot();
    const reduced = SettingsManager.get().reducedMotion;
    const paint = (p: WalkPoint, note: MountainNote, active: boolean, glow: boolean) => {
      if (active || glow) { g.fillStyle(glow ? 0xf0d78a : 0xd7e5ca, .65).fillCircle(p.x, p.y, glow && !reduced ? 35 + 3 * Math.sin(this.clock / 80) : 35); }
      g.fillStyle(0xc5a06b).fillRoundedRect(p.x - 16, p.y - 21, 32, 33, 11);
      g.lineStyle(2, 0x97754e).strokeRoundedRect(p.x - 16, p.y - 21, 32, 33, 11);
      g.fillStyle(0x94724e).fillCircle(p.x, p.y + 15, 4);
      g.lineStyle(2.5, INK[note]);
      if (note === 'leaf') g.strokeEllipse(p.x, p.y - 5, 17, 10).lineBetween(p.x - 9, p.y + 1, p.x + 9, p.y - 10);
      if (note === 'sun') { g.strokeCircle(p.x, p.y - 5, 6); for (let a = 0; a < 6; a++) { const angle = a * Math.PI / 3; g.lineBetween(p.x + Math.cos(angle) * 9, p.y - 5 + Math.sin(angle) * 9, p.x + Math.cos(angle) * 12, p.y - 5 + Math.sin(angle) * 12); } }
      if (note === 'bell') g.lineBetween(p.x - 8, p.y + 3, p.x, p.y - 13).lineBetween(p.x, p.y - 13, p.x + 8, p.y + 3).lineBetween(p.x + 8, p.y + 3, p.x - 8, p.y + 3);
    };
    for (const id of STATIONS) {
      for (const note of NOTES) paint(MOUNTAIN_STATIONS[id].playerBells[note], note, s.activeStation === id && s.playerWait && s.next?.note === note,
        this.ringing?.station === id && this.ringing.actor === 'player' && this.ringing.note === note && this.clock < this.ringing.until);
      const echoRing = this.ringing?.station === id && this.ringing.actor === 'echo' && this.clock < this.ringing.until;
      paint(MOUNTAIN_STATIONS[id].echo, echoRing ? this.ringing!.note : s.activeStation === id && s.next?.actor === 'echo' ? s.next.note : 'bell', s.activeStation === id && s.echoPresent, echoRing);
    }
  }
  private drawFlags(): void {
    const g = this.flags.clear(); if (!this.geometryOptions().windOpen) return;
    const phase = this.clock % 6400, warning = phase >= 750 && phase < 1500, windy = this.windStrength() > 0;
    const reduced = SettingsManager.get().reducedMotion;
    for (const p of WIND_FLAGS) {
      g.lineStyle(3, 0x927859).lineBetween(p.x - 46, p.y + 20, p.x - 46, p.y - 40);
      const flutter = reduced ? 0 : Math.sin(this.clock / 160 + p.y) * 3;
      g.fillStyle(windy ? 0xd2a174 : warning ? 0xebcb7a : 0xa7cbb7).fillTriangle(p.x - 46, p.y - 40, p.x - (windy ? 9 : 21), p.y - 31 + flutter, p.x - 46, p.y - 20);
    }
  }
}
