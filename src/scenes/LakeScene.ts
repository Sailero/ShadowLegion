import Phaser from 'phaser';
import { PostalWalkScene, type WalkPoint } from './PostalWalkScene';
import { LakeVoyage, LAKE_WORLD, LAKE_DOCKS, LAKE_ANCHORS, LAKE_LEAVES, LAKE_ROUTES, type LakeLeafId, type LakeVoyageError } from '../systems/LakeVoyage';
import { JourneyProgressManager as Journey, type JourneyState, type JourneyNodeId } from '../systems/JourneyProgressManager';
import { lakeFloor, drawLakeLandmarks, LAKE_WATER_OUTLINE, LAKE_BOARDWALKS } from '../ui/lakePaint';
import { SoundManager } from '../systems/SoundManager';

const PICNIC = { x: 520, y: 220 };
const HOME = { x: 340, y: 1030 };
const RETURN_BRIDGE = { x: 936, y: 668, width: 760, height: 64 };
const ARROWS = { east: '→', west: '←', north: '↑', south: '↓' };

/** A shore-and-letter journey: the cat never rides the carrier. */
export class LakeScene extends PostalWalkScene {
  private voyage!: LakeVoyage;
  private state!: JourneyState;
  private receipt = '';
  private pendingNode: JourneyNodeId | null = null;
  private boat!: Phaser.GameObjects.Container;
  private envelope!: Phaser.GameObjects.Graphics;
  private routeArt!: Phaser.GameObjects.Graphics;
  private bridgeArt!: Phaser.GameObjects.Graphics;
  private anchorArt!: Phaser.GameObjects.Graphics;
  private leafLabels = new Map<LakeLeafId, Phaser.GameObjects.Text>();
  private picnicLabel!: Phaser.GameObjects.Text;
  private paintedState = '';

  constructor() { super('LakeScene'); }
  create(): void {
    if (!Journey.isRegionUnlocked('lake') || Journey.getWriteProtection()) { this.scene.start('JourneyMapScene'); return; }
    this.state = Journey.getState(); this.pendingNode = null; this.paintedState = ''; this.leafLabels.clear();
    const checkpoint = Journey.getLakeCheckpoint(this.state);
    this.voyage = new LakeVoyage(checkpoint);
    this.receipt = this.state.deliveries.lake?.completionId ?? `lake-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
    this.beginWalk('第二封信 · 圆镜湖', checkpoint === 'start' ? HOME : checkpoint === 'mid' ? { x: 845, y: 700 } : { x: 1490, y: 340 }, LAKE_WORLD);
    this.cameras.main.setBackgroundColor(0xe9edd8);
    this.add.image(0, 0, lakeFloor(this)).setOrigin(0).setDepth(0); drawLakeLandmarks(this);
    this.routeArt = this.add.graphics().setDepth(3); this.bridgeArt = this.add.graphics().setDepth(4); this.anchorArt = this.add.graphics().setDepth(12);
    for (const [id, leaf] of Object.entries(LAKE_LEAVES) as Array<[LakeLeafId, typeof LAKE_LEAVES.west]>) {
      this.leafLabels.set(id, this.words(leaf.x, leaf.y + 26, '', 18).setOrigin(.5).setDepth(16));
      this.words(leaf.x, leaf.y - 52, `${leaf.label} · 对齐 ${ARROWS[leaf.required]}`, 15).setOrigin(.5).setDepth(16);
    }
    const hull = this.add.graphics();
    hull.fillStyle(0x5f9d8c).fillEllipse(0, 0, 70, 36); hull.lineStyle(2, 0x417d71).strokeEllipse(0, 0, 70, 36);
    hull.lineStyle(2, 0xb6d4a4).lineBetween(-29, 0, 29, 0).lineBetween(-3, 0, 16, -12).lineBetween(-11, 0, 5, 13);
    this.envelope = this.add.graphics();
    this.envelope.fillStyle(0xfff3cb).fillRoundedRect(-17, -21, 34, 23, 3);
    this.envelope.lineStyle(1.5, 0xb99062).strokeRoundedRect(-17, -21, 34, 23, 3).lineBetween(-17, -20, 0, -9).lineBetween(0, -9, 17, -20);
    this.boat = this.add.container(0, 0, [hull, this.envelope]).setDepth(20);
    this.picnicLabel = this.words(PICNIC.x, PICNIC.y + 54, '', 15).setOrigin(.5).setDepth(16);
    this.words(1600, 750, '回信到手后，湖心近路会展开', 15).setOrigin(.5).setDepth(16);
    this.say(this.state.deliveries.lake ? '泡芙还在第三片大荷叶旁。湖心近路开着，野餐垫也可以再坐坐。'
      : checkpoint === 'start' ? '栗笺的邀请要送到第三片大荷叶。信走水路，你和小暖走岸路；先去西南叶舟码头。'
      : checkpoint === 'mid' ? '信已停在湖心。让小暖守住码头，再去西、北两处导流叶：向东、向北。'
      : '信已抵达第三片大荷叶。沿栈道走近泡芙，按 F 亲手交给她。', 9000);
    this.tickJourney(0);
  }

  protected isSafe(point: WalkPoint): boolean {
    const inRect = (r: { x: number; y: number; width: number; height: number }) => point.x >= r.x + 12 && point.x <= r.x + r.width - 12 && point.y >= r.y + 12 && point.y <= r.y + r.height - 12;
    if (LAKE_BOARDWALKS.some(inRect) || this.state?.deliveries.lake && inRect({ x: 410, y: 668, width: 1286, height: 64 })) return true;
    // Same polygon paints the lake and controls wet paws, including the shore's curves.
    let inside = false;
    for (let i = 0, j = LAKE_WATER_OUTLINE.length - 1; i < LAKE_WATER_OUTLINE.length; j = i++) {
      const a = LAKE_WATER_OUTLINE[i], b = LAKE_WATER_OUTLINE[j];
      if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) inside = !inside;
    }
    return !inside;
  }

  protected command(): void {
    if (this.echoStays) { this.recallEcho(); this.voyage.update(0, this.echo, false); return; }
    const request = this.voyage.command(this.cat);
    if (!request.ok || !request.target) { this.say(this.errorText(request.error)); return; }
    this.sendEcho(request.target);
    this.say('小暖正走向系船石。等它站稳，再按 F 安排叶舟；岸边调流时让它留在这里。');
  }

  private saveLanding(node: JourneyNodeId): boolean {
    const result = Journey.completeNode('lake', node);
    if (!result.saved) { this.pendingNode = node; this.say('到站了，但本机还没有确认保存。按 F 重试；先不启动下一段。', 12000); return false; }
    this.pendingNode = null; this.state = result.state;
    SoundManager.get().postalCue('address');
    this.say(node === 'lake.midDocked' ? '叶舟到湖心啦，已保存。先召回小暖，走西岸中栈道到湖心，再让它稳住这座码头。'
      : '第三片大荷叶，到站！已保存。你可以走北岸再绕到右边栈道，亲手把邀请交给泡芙。', 11000);
    return true;
  }

  protected interact(): void {
    this.voyage.update(0, this.echo, this.echoStays);
    if (this.pendingNode) { this.saveLanding(this.pendingNode); return; }
    if (this.near(PICNIC, 80)) {
      const result = Journey.discover('lake.picnicCloth');
      if (!result.saved) { this.say('野餐垫先留在这里。记录还没保存，按 F 可以重试。'); return; }
      this.state = result.state;
      if (!result.duplicate) { this.catAnimator.celebrate(); SoundManager.get().postalCue('address'); }
      this.say('你把野餐垫的一角铺到岸边。这样泡芙不用离开水，也能和栗笺坐在一起。小暖的那一角，也留好了。', 10000); return;
    }
    if (this.near(HOME, 90)) { this.leaveWalk(); return; }
    const snapshot = this.voyage.getSnapshot();
    if (this.near(LAKE_DOCKS.mail, 105)) {
      if (this.state.deliveries.lake) { this.say('泡芙：下次带岚角一起呀。我给他写好了地址——云阶山，两只铜铃下。', 9000); return; }
      if (!snapshot.mailDocked) { this.say('泡芙在等叶舟。请先从湖心调好两片导流叶，让信抵达第三片大荷叶。'); return; }
      const result = Journey.deliver('lake', this.receipt);
      if (!result.saved) { this.say('信在泡芙面前等你。本机还没确认保存，按 F 再试一次。'); return; }
      this.state = result.state; this.catAnimator.celebrate(); this.echoAnimator.celebrate(); SoundManager.get().postalCue('delivery');
      this.say('泡芙收到了邀请，也托你把回信送给山上的岚角。湖心近路展开了；按 Esc 回邮路图可以拆开回信。', 14000); return;
    }
    for (const id of ['west', 'north'] as const) {
      if (!this.near(LAKE_LEAVES[id], 80)) continue;
      const directions = LAKE_LEAVES[id].directions;
      const next = directions[(directions.indexOf(snapshot.leaves[id]) + 1) % directions.length];
      const result = this.voyage.setLeaf(id, next, this.cat);
      if (!result.ok) this.say(this.errorText(result.error));
      else { SoundManager.get().postalCue('command'); this.say(`${LAKE_LEAVES[id].label}转向 ${ARROWS[next]}。${next === LAKE_LEAVES[id].required ? '和岸边的路标对上了。' : '再看看路标上的方向。'}`); }
      return;
    }
    if (snapshot.phase === 'sailing') { this.say('叶舟正在走水路。你可以沿岸出发，不用在原地等它。'); return; }
    const result = snapshot.loaded ? this.voyage.depart(this.cat) : this.voyage.loadLetter(this.cat);
    if (!result.ok) { this.say(this.errorText(result.error)); return; }
    SoundManager.get().postalCue('command');
    this.say(snapshot.loaded ? '叶舟出发了！按 E 召回小暖，再沿岸路走到下一站。' : '信已经放上叶舟。小暖稳住船了，再按 F 就可以启航。', 8500);
  }

  private errorText(error?: LakeVoyageError): string {
    const messages: Partial<Record<LakeVoyageError, string>> = {
      'not-anchored': '小暖还没有稳住当前码头。回码头附近按 E，请它站到系船石上；已经留守时别召回。',
      'far-from-dock': '要在叶舟当前停靠的码头安排分工。沿奶黄色岸路或木栈道走近它。',
      'wrong-dock': '先把信送到湖心码头，再让小暖留在那里，才能调整两片导流叶。',
      'route-not-ready': '第二段需要西叶向东 →、北叶向北 ↑。让小暖稳住湖心，你走岸路到两处叶片按 F。',
      sailing: '叶舟已经启航。按 E 可以召回留守的小暖；下一站再安排分工。',
      finished: '叶舟已经到达第三片大荷叶。走近泡芙，按 F 把信亲手交给她。',
      'no-letter': '先让小暖稳住船，按 F 把邀请放上去。',
    };
    return messages[error!] ?? '走近岸边的码头或路标，再安排这一步。';
  }

  protected tickJourney(delta: number): void {
    for (const event of this.voyage.update(delta, this.echo, this.echoStays)) this.saveLanding(event === 'midDocked' ? 'lake.midDocked' : 'lake.mailDocked');
    const s = this.voyage.getSnapshot();
    this.boat.setPosition(s.boat.x, s.boat.y); this.envelope.setVisible(s.loaded && !this.state.deliveries.lake);
    const key = [s.phase, s.dock, s.anchored, s.leaves.west, s.leaves.north, Boolean(this.state.deliveries.lake), this.state.optionalDiscoveries.length].join(':');
    if (key !== this.paintedState) { this.paintedState = key; this.repaintWorld(); }
    this.objective.setText(this.pendingNode ? '到站记录尚未确认 · F 重试保存'
      : this.state.deliveries.lake ? '泡芙已收信 · 湖心近路展开，回信册里有新的地址'
      : s.phase === 'sailing' ? `叶舟前往${s.destination === 'mid' ? '湖心码头' : '第三片大荷叶'} · ${Math.floor(s.progress * 100)}% · 你走岸路`
      : s.mailDocked ? '信已抵达 · 沿北岸绕到右侧栈道，走近泡芙 F 交信'
      : s.midDocked ? `湖心分工 · 西叶 ${ARROWS[s.leaves.west]} / 目标 → · 北叶 ${ARROWS[s.leaves.north]} / 目标 ↑`
      : '叶舟码头在西南岸 · E 请小暖稳船，F 装信，再 F 启航');
    this.hint.setText(this.pendingNode ? 'F · 重新确认这次真实到站'
      : this.near(PICNIC) ? 'F · 把野餐垫铺到岸边（可选）'
      : this.near(HOME, 90) ? 'F · 回到邮路图'
      : this.near(LAKE_DOCKS.mail, 105) ? 'F · 和泡芙说说话 / 交信'
      : this.near(LAKE_LEAVES.west) || this.near(LAKE_LEAVES.north) ? 'F · 转动这片导流叶，和上方路标对齐'
      : this.echoStays ? s.anchored ? '小暖正在稳船 · 你可以去调流；E 会召回它' : '小暖留在系船石 · E 召回后，它沿岸跟上'
      : s.dock && this.near(LAKE_DOCKS[s.dock], 105) ? 'E · 请小暖稳住这里的叶舟' : '奶黄色岸路绕湖相连 · 西岸中栈道通向湖心');
  }

  private repaintWorld(): void {
    const s = this.voyage.getSnapshot(); this.routeArt.clear(); this.anchorArt.clear(); this.bridgeArt.clear();
    for (const [id, route] of Object.entries(LAKE_ROUTES)) {
      this.routeArt.lineStyle(2, id === 'start-mid' || s.routeReady || s.mailDocked ? 0xf7f1cf : 0x7aabac, .6);
      for (let i = 1; i < route.waypoints.length; i++) this.routeArt.lineBetween(route.waypoints[i - 1].x, route.waypoints[i - 1].y, route.waypoints[i].x, route.waypoints[i].y);
    }
    for (const anchor of Object.values(LAKE_ANCHORS)) {
      const active = s.anchored && s.anchorTarget?.x === anchor.x;
      this.anchorArt.fillStyle(active ? 0xeed78a : 0xd5dfbc).fillEllipse(anchor.x, anchor.y, 32, 24);
      this.anchorArt.lineStyle(2, 0x6d9684).strokeEllipse(anchor.x, anchor.y, 32, 24);
    }
    for (const [id, label] of this.leafLabels) label.setText(`${ARROWS[s.leaves[id]]}  F 转向`).setColor(s.leaves[id] === LAKE_LEAVES[id].required ? '#3f775e' : '#926447');
    this.picnicLabel.setText(this.state.optionalDiscoveries.includes('lake.picnicCloth') ? '岸边留了四个位置' : '还没铺好的野餐垫 · F');
    if (this.state.deliveries.lake) {
      const r = RETURN_BRIDGE; this.bridgeArt.fillStyle(0xd8b788).fillRect(r.x, r.y, r.width, r.height);
      this.bridgeArt.lineStyle(2, 0xaa8d67, .6);
      for (let x = r.x; x < r.x + r.width; x += 24) this.bridgeArt.lineBetween(x, r.y + 3, x, r.y + r.height - 3);
    }
  }
}
