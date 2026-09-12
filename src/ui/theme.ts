import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/gameConfig';
import { SoundManager } from '../systems/SoundManager';
import { SettingsManager } from '../systems/SettingsManager';

/** A travel picture book: painted space, printed ink and tactile paper objects. */
export const UI = {
  paper: 0xf2e5cb, card: 0xfff8e8, ink: 0x393e30, muted: 0x676553,
  green: 0x425d45, greenHover: 0x324836, pale: 0xe4e5c7, line: 0xcbbea0,
  amber: 0xad6b37, apricot: 0xe8bd78, lilac: 0xd7cddd, rose: 0xa65043,
  font: '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", Arial, sans-serif',
  titleFont: '"Noto Serif SC", "STSong", "SimSun", Georgia, serif',
};
export const hex = (color: number) => `#${color.toString(16).padStart(6, '0')}`;

export function label(scene: Phaser.Scene, x: number, y: number, value: string,
  size = 14, color = UI.ink, bold = false): Phaser.GameObjects.Text {
  return scene.add.text(x, y, value, {
    fontFamily: UI.font, fontSize: `${size}px`, color: hex(color),
    fontStyle: bold ? 'bold' : 'normal', lineSpacing: 6,
  });
}

export function paperCard(scene: Phaser.Scene, x: number, y: number, width: number,
  height: number, fill = UI.card, stroke = UI.line): Phaser.GameObjects.Graphics {
  const g = scene.add.graphics();
  const left = x - width / 2, top = y - height / 2;
  const points = [ { x: left + 4, y: top + 2 }, { x: left + width * .46, y: top },
    { x: left + width - 3, y: top + 3 }, { x: left + width, y: top + height * .48 },
    { x: left + width - 5, y: top + height - 2 }, { x: left + width * .42, y: top + height },
    { x: left + 1, y: top + height - 3 }, { x: left, y: top + height * .41 } ];
  g.fillStyle(0x594b33, .13).fillPoints(points.map(p => ({ x: p.x + 4, y: p.y + 6 })), true);
  g.fillStyle(fill).fillPoints(points, true);
  g.lineStyle(1, stroke, .65).strokePoints(points, true);
  g.lineStyle(1, 0xffffff, .45).lineBetween(left + 10, top + 7, left + width - 10, top + 7);
  if (scene.textures.exists('paper-grain')) scene.add.tileSprite(x, y, Math.max(1,width-14), Math.max(1,height-14), 'paper-grain').setAlpha(.08);
  return g;
}

export function heading(scene: Phaser.Scene, x: number, y: number, text: string, size = 32,
  color = UI.ink): Phaser.GameObjects.Text {
  return label(scene, x, y, text, size, color, true).setFontFamily(UI.titleFont);
}

export function paintedBackground(scene: Phaser.Scene, clarity: 'cover' | 'page' = 'page'): void {
  scene.cameras.main.setBackgroundColor(UI.paper);
  if (scene.textures.exists('journey-keyart')) {
    const art = scene.add.image(GAME_WIDTH / 2, GAME_HEIGHT / 2, 'journey-keyart');
    art.setScale(Math.max(GAME_WIDTH / art.width, GAME_HEIGHT / art.height));
    if (clarity === 'page') art.setAlpha(.28);
  } else {
    const wash = scene.add.graphics();
    wash.fillStyle(0xf0d7a4).fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    wash.fillStyle(0xb3bb91,.55).fillEllipse(850, 365, 810, 540);
    wash.fillStyle(0x80926b,.35).fillEllipse(930, 680, 1100, 470);
    wash.fillStyle(0xd7ad73,.35).fillEllipse(500, 765, 1000, 240);
  }
  const g = scene.add.graphics();
  if (clarity === 'cover') {
    for (let x = 0; x < 570; x += 8) g.fillStyle(0xfff1d4, Math.pow(1 - x / 570, 1.2) * .68).fillRect(x, 0, 8, GAME_HEIGHT);
  } else g.fillStyle(UI.paper,.48).fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
  for (let i = 0; i < 200; i++) g.fillStyle(0x9b855b, .065).fillCircle((i * 167 + 31) % GAME_WIDTH, (i * 103 + 17) % GAME_HEIGHT, i % 3 ? .6 : 1);
}

export function titleRule(scene: Phaser.Scene, x: number, y: number, width: number, color = UI.line): void {
  const g = scene.add.graphics();
  g.lineStyle(1, color).lineBetween(x, y, x + width, y);
  g.fillStyle(color).fillTriangle(x + width / 2, y - 3, x + width / 2 - 4, y, x + width / 2, y + 3);
}

export function stamp(scene: Phaser.Scene, x: number, y: number, text: string, radius = 28, color = UI.amber): void {
  const g = scene.add.graphics();
  g.lineStyle(2, color, .72).strokeCircle(x, y, radius);
  g.lineStyle(.8, color, .58).strokeCircle(x, y, radius - 5);
  label(scene, x, y, text, radius > 30 ? 14 : 11, color, true).setOrigin(.5).setAngle(-8);
}

export function portrait(scene: Phaser.Scene, x: number, y: number, operativeId: string, size = 82): void {
  const key = scene.textures.exists(`portrait-${operativeId}`) ? `portrait-${operativeId}`
    : scene.textures.exists('traveler-portrait') ? 'traveler-portrait' : 'hero';
  const image = scene.add.image(x, y, key);
  const actualSize = key === 'hero' && image.width < 96 ? Math.min(size, 66) : size;
  image.setScale(actualSize / Math.max(image.width, image.height));
}

export function backdrop(scene: Phaser.Scene, eyebrow: string): void {
  paintedBackground(scene);
  const g = scene.add.graphics();
  g.fillStyle(UI.card,.82).fillRect(0, 0, GAME_WIDTH, 67);
  label(scene, 39, 27, eyebrow, 12, UI.green, true).setLetterSpacing(2);
  g.lineStyle(1, UI.line,.7).lineBetween(36, 66, GAME_WIDTH - 36, 66);
}

export function drawFlower(g: Phaser.GameObjects.Graphics, x: number, y: number,
  radius: number, color = UI.apricot): void {
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * 2 / 5 - Math.PI / 2;
    g.fillStyle(color).fillCircle(x + Math.cos(a) * radius * 0.58,
      y + Math.sin(a) * radius * 0.58, radius * 0.47);
  }
  g.fillStyle(0xffeab2).fillCircle(x, y, radius * 0.33);
}

/** A deliberately hand-built illustration: warm daylight, map terrain and two gardeners. */
export function gardenPostcard(scene: Phaser.Scene, x: number, y: number, width: number, height: number): void {
  paperCard(scene, x + width / 2, y + height / 2, width, height, 0xe5ead4);
  const g = scene.add.graphics();
  g.fillStyle(0xf9e7b9).fillCircle(x + width - 70, y + 61, 31);
  g.fillStyle(0xd2ddbf).fillEllipse(x + width / 2, y + height * 0.68, width - 28, height * 0.48);
  g.lineStyle(39, 0xf4edce, 0.9);
  g.beginPath(); g.moveTo(x + 43, y + height - 39);
  g.lineTo(x + width * 0.43, y + height * 0.56);
  g.lineTo(x + width * 0.7, y + height * 0.64);
  g.lineTo(x + width - 40, y + 88); g.strokePath();
  g.lineStyle(19, 0xb8d9d5, 0.85);
  g.beginPath(); g.moveTo(x + 23, y + 102); g.lineTo(x + 107, y + 117);
  g.lineTo(x + 129, y + 201); g.lineTo(x + 103, y + height - 21); g.strokePath();
  // Tiny wooden bridge; waterways visibly belong to the game's terrain vocabulary.
  g.fillStyle(0xc49d73).fillRoundedRect(x + 105, y + 168, 45, 28, 3);
  g.lineStyle(2, 0xe7cba0);
  for (let i = 0; i < 4; i++) g.lineBetween(x + 111 + i * 10, y + 171, x + 111 + i * 10, y + 193);
  const tree = (tx: number, ty: number, radius: number) => {
    g.fillStyle(0x72846b, 0.13).fillEllipse(tx + 5, ty + 18, radius * 2.2, radius * 0.8);
    g.fillStyle(0xac8c61).fillRoundedRect(tx - 4, ty, 8, 24, 2);
    g.fillStyle(0x97b68a).fillCircle(tx - radius * 0.36, ty - 4, radius * 0.75);
    g.fillStyle(0x749d75).fillCircle(tx + radius * 0.36, ty - 5, radius * 0.72);
    g.fillStyle(0xa9c391).fillCircle(tx, ty - radius * 0.6, radius * 0.72);
  };
  tree(x + 53, y + 73, 29); tree(x + 116, y + 56, 23);
  tree(x + width - 50, y + height - 68, 33);
  // Patchwork tent / defended home, with a little flag.
  const tx = x + width * 0.61, ty = y + height * 0.45;
  g.fillStyle(0x8c8f68, 0.13).fillEllipse(tx, ty + 53, 110, 23);
  g.fillStyle(0xe4aa6e).fillTriangle(tx, ty - 30, tx - 52, ty + 49, tx + 53, ty + 49);
  g.fillStyle(0xf9dca3).fillTriangle(tx, ty - 30, tx + 14, ty + 49, tx + 53, ty + 49);
  g.fillStyle(0x637d61).fillTriangle(tx - 8, ty + 11, tx - 27, ty + 49, tx + 13, ty + 49);
  g.lineStyle(3, 0x8c7558).lineBetween(tx, ty - 31, tx, ty - 53);
  g.fillStyle(0xd58c74).fillTriangle(tx + 1, ty - 53, tx + 26, ty - 45, tx + 1, ty - 37);
  for (let i = 0; i < 14; i++) {
    const fx = x + 30 + ((i * 79) % (width - 60));
    const fy = y + height - 32 - ((i * 17) % 66);
    drawFlower(g, fx, fy, 5, i % 2 ? 0xecb49c : 0xfff5cd);
  }
  // A translucent companion is visually distinct from the player.
  const hero = scene.add.image(x + width * 0.46, y + height * 0.71, 'hero').setScale(1.45);
  const echo = scene.add.image(x + width * 0.65, y + height * 0.76, 'hero').setScale(1.2).setTint(0x89afa0).setAlpha(0.74);
  label(scene, hero.x - 4, hero.y + 33, '今天的你', 11, UI.ink, true).setOrigin(0.5);
  label(scene, echo.x, echo.y + 29, '昨天的影子', 11, UI.green, true).setOrigin(0.5);
  g.lineStyle(2, UI.green, 0.4);
  for (let i = 0; i < 4; i++) g.lineBetween(hero.x + 30 + i * 8, hero.y + i * 2, hero.x + 33 + i * 8, hero.y + i * 2);
  label(scene, x + 21, y + 17, 'OUR LITTLE EXPEDITION', 10, UI.green, true).setLetterSpacing(1.5);
  label(scene, x + width - 19, y + height - 19, '01 / 同行日记', 10, UI.muted).setOrigin(1, 1);
}

interface Focusable { focus: (value: boolean) => void; activate: () => void; enabled: boolean }
const navigation = new WeakMap<Phaser.Scene, { items: Focusable[]; index: number }>();

function registerFocus(scene: Phaser.Scene, item: Focusable): void {
  let nav = navigation.get(scene);
  if (!nav) {
    nav = { items: [], index: -1 };
    navigation.set(scene, nav);
    const keyboard = scene.input.keyboard;
    const onKey = (event: KeyboardEvent) => {
      const current = navigation.get(scene);
      if (!current || !scene.sys.isActive()) return;
      if (event.code === 'Tab') {
        event.preventDefault();
        current.items[current.index]?.focus(false);
        const direction = event.shiftKey ? -1 : 1;
        if (current.index < 0 && direction < 0) current.index = 0;
        for (let tries = 0; tries < current.items.length; tries++) {
          current.index = Phaser.Math.Wrap(current.index + direction, 0, current.items.length);
          if (current.items[current.index].enabled) break;
        }
        current.items[current.index]?.focus(true);
      } else if ((event.code === 'Enter' || event.code === 'Space') && current.index >= 0) {
        event.preventDefault();
        const active = current.items[current.index];
        if (active.enabled && !event.repeat) active.activate();
      }
    };
    keyboard?.on('keydown', onKey);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      keyboard?.off('keydown', onKey);
      navigation.delete(scene);
    });
  }
  nav.items.push(item);
}

export function choiceHit(scene: Phaser.Scene, x: number, y: number, width: number, height: number,
  activate: () => void): void {
  const ring = scene.add.graphics();
  let hovered = false, focused = false;
  const draw = () => {
    ring.clear();
    if (hovered || focused) ring.lineStyle(focused ? 3 : 2, focused ? UI.amber : UI.green)
      .strokeRect(x - width / 2 - 2, y - height / 2 - 2, width + 4, height + 4);
  };
  const run = () => { SoundManager.get().buttonClick(); activate(); };
  scene.add.rectangle(x, y, width, height, 0, 0).setInteractive({ useHandCursor: true })
    .on('pointerover', () => { hovered = true; draw(); SoundManager.get().buttonHover(); })
    .on('pointerout', () => { hovered = false; draw(); })
    .on('pointerdown', run);
  registerFocus(scene, { enabled: true, focus: value => { focused = value; draw(); }, activate: run });
}

export function button(scene: Phaser.Scene, x: number, y: number, width: number, text: string,
  activate: () => void, options: { secondary?: boolean; disabled?: boolean; height?: number; size?: number } = {}): void {
  const height = options.height ?? 48;
  const g = scene.add.graphics();
  const disabled = Boolean(options.disabled);
  let hovered = false, focused = false;
  const draw = () => {
    const active = hovered || focused;
    const fill = disabled ? 0xe7e7dc : options.secondary ? (active ? 0xe2e9d5 : UI.card) : (active ? UI.greenHover : UI.green);
    g.clear();
    if (!disabled) g.fillStyle(0x594b33, 0.17).fillRect(x - width / 2 + 3, y - height / 2 + 4, width, height);
    g.fillStyle(fill).fillPoints([{x:x-width/2+4,y:y-height/2},{x:x+width/2,y:y-height/2+2},
      {x:x+width/2-3,y:y+height/2},{x:x-width/2,y:y+height/2-2}],true);
    g.lineStyle(focused ? 3 : 1, focused ? UI.amber : options.secondary ? UI.line : fill);
    g.strokeRect(x - width / 2 - (focused ? 3 : 0), y - height / 2 - (focused ? 3 : 0), width + (focused ? 6 : 0), height + (focused ? 6 : 0));
  };
  draw();
  label(scene, x, y, text, options.size ?? 15,
    disabled ? UI.muted : options.secondary ? UI.ink : UI.card, true).setOrigin(0.5);
  const run = () => { if (!disabled) { SoundManager.get().buttonClick(); activate(); } };
  const hit = scene.add.rectangle(x, y, width, height, 0, 0);
  if (!disabled) {
    hit.setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => { hovered = true; draw(); SoundManager.get().buttonHover(); });
    hit.on('pointerout', () => { hovered = false; draw(); });
    hit.on('pointerdown', run);
  }
  registerFocus(scene, { enabled: !disabled, focus: value => { focused = value; draw(); }, activate: run });
}

export function menuEntry(scene: Phaser.Scene, x: number, y: number, number: string, title: string,
  subtitle: string, activate: () => void, prominent = false): void {
  const g = scene.add.graphics();
  let hovered = false, focused = false;
  const draw = () => {
    g.clear();
    if (hovered || focused) g.fillStyle(UI.card, .72).fillPoints([
      {x:x-16,y:y-8},{x:x+348,y:y-4},{x:x+341,y:y+58},{x:x-20,y:y+61}],true);
    g.lineStyle(focused ? 2 : 1, focused ? UI.amber : UI.green, focused ? 1 : .35)
      .lineBetween(x + 37, y + 57, x + 325, y + 57);
  };
  draw();
  label(scene, x, y + 8, number, 12, UI.amber, true);
  const titleText = heading(scene, x + 38, y, title, prominent ? 25 : 22, UI.green).setStroke('#fff2d8', 1);
  label(scene, x + 40, y + 34, subtitle, 12, UI.ink).setStroke('#fff2d8', 2);
  label(scene, x + 317, y + 9, '›', 25, UI.green).setOrigin(.5);
  const run = () => { SoundManager.get().buttonClick(); activate(); };
  scene.add.rectangle(x + 160, y + 24, 360, 68, 0, 0).setInteractive({ useHandCursor: true })
    .on('pointerover', () => { hovered = true; titleText.setColor(hex(UI.amber)); draw(); SoundManager.get().buttonHover(); })
    .on('pointerout', () => { hovered = false; titleText.setColor(hex(UI.green)); draw(); })
    .on('pointerdown', run);
  registerFocus(scene, { enabled: true, focus: value => { focused = value; draw(); }, activate: run });
}

export function shortcut(scene: Phaser.Scene, key: string, action: () => void): void {
  const keyName = ['ZERO', 'ONE', 'TWO', 'THREE', 'FOUR', 'FIVE', 'SIX', 'SEVEN', 'EIGHT', 'NINE'][Number(key)];
  const eventName = `keydown-${/^\d$/.test(key) ? keyName : key}`;
  const handler = (event: KeyboardEvent) => { if (!event.repeat) action(); };
  scene.input.keyboard?.on(eventName, handler);
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.input.keyboard?.off(eventName, handler));
}

export function openSettings(scene: Phaser.Scene): void {
  if (document.querySelector('.settings-dialog')) return;
  const settings = SettingsManager.get();
  const dialog = document.createElement('dialog');
  dialog.className = 'settings-dialog';
  dialog.setAttribute('aria-labelledby', 'settings-title');
  dialog.innerHTML = `<form method="dialog"><div class="settings-eyebrow">让旅途更合心意</div>
    <h2 id="settings-title">旅途设置</h2><p>随时调整，本设备会记住你的选择。</p>
    <label class="setting-volume" for="sound-volume">声音音量 <output id="sound-value"></output></label>
    <input id="sound-volume" type="range" min="0" max="100" step="5" aria-label="声音音量">
    <label class="setting-toggle"><span><strong>自动开火</strong><small>持续射击，仍由鼠标控制瞄准方向。</small></span><input id="auto-fire" type="checkbox"></label>
    <label class="setting-toggle"><span><strong>减少动态效果</strong><small>减轻镜头晃动、闪光和界面动效。</small></span><input id="reduce-motion" type="checkbox"></label>
    <div class="settings-note">WASD 移动 · 鼠标瞄准 · SHIFT 闪避<br>SPACE 技能 · Q 切换技能 · E 安排影伴 · ESC 暂停</div>
    <button class="settings-done" autofocus>完成设置</button></form>`;
  const volume = dialog.querySelector<HTMLInputElement>('#sound-volume')!;
  const value = dialog.querySelector<HTMLOutputElement>('#sound-value')!;
  const auto = dialog.querySelector<HTMLInputElement>('#auto-fire')!;
  const motion = dialog.querySelector<HTMLInputElement>('#reduce-motion')!;
  volume.value = String(Math.round(settings.volume * 100));
  value.value = `${volume.value}%`;
  auto.checked = settings.autoFire;
  motion.checked = settings.reducedMotion;
  volume.addEventListener('input', () => {
    const nextVolume = Number(volume.value) / 100;
    value.value = `${volume.value}%`;
    SettingsManager.update({ volume: nextVolume });
    SoundManager.get().setVolume(nextVolume);
  });
  auto.addEventListener('change', () => SettingsManager.update({ autoFire: auto.checked }));
  motion.addEventListener('change', () => SettingsManager.update({ reducedMotion: motion.checked }));
  showDialog(scene, dialog);
}

/** Shared native-modal boundary for settings and local playtest records. */
export function showDialog(scene: Phaser.Scene, dialog: HTMLDialogElement): void {
  if (document.querySelector('.settings-dialog')) return;
  // Keep Phaser's global keyboard capture from swallowing native dialog controls.
  dialog.addEventListener('keydown', event => event.stopPropagation());
  dialog.addEventListener('keyup', event => event.stopPropagation());
  document.body.append(dialog);
  const previousInputEnabled = scene.input.enabled;
  const previousKeyboardEnabled = scene.input.keyboard?.enabled;
  scene.input.keyboard?.resetKeys();
  scene.input.enabled = false;
  if (scene.input.keyboard) scene.input.keyboard.enabled = false;
  const shutdown = () => { if (dialog.open) dialog.close(); };
  dialog.addEventListener('close', () => {
    scene.events.off(Phaser.Scenes.Events.SHUTDOWN, shutdown);
    dialog.remove();
    scene.input.enabled = previousInputEnabled;
    if (scene.input.keyboard) {
      scene.input.keyboard.resetKeys();
      scene.input.keyboard.enabled = previousKeyboardEnabled ?? true;
    }
  }, { once: true });
  scene.events.once(Phaser.Scenes.Events.SHUTDOWN, shutdown);
  dialog.showModal();
}
