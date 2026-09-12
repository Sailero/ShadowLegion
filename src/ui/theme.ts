import Phaser from 'phaser';
import { GAME_WIDTH, GAME_HEIGHT } from '../config/gameConfig';
import { SoundManager } from '../systems/SoundManager';
import { SettingsManager } from '../systems/SettingsManager';

/** Shared paper-and-garden language. Every functional colour has a text label. */
export const UI = {
  paper: 0xf7f1e4, card: 0xfffcf4, ink: 0x30483e, muted: 0x5f695d,
  green: 0x3e7057, greenHover: 0x2f5c46, pale: 0xe6ecda, line: 0xd6d8c3,
  amber: 0xcb8141, apricot: 0xf2cca0, lilac: 0xe4dded, rose: 0xb96251,
  font: '"Microsoft YaHei", "PingFang SC", "Noto Sans SC", Arial, sans-serif',
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
  g.fillStyle(0x6d7355, 0.07).fillRoundedRect(x - width / 2, y - height / 2 + 5, width, height, 16);
  g.fillStyle(fill).fillRoundedRect(x - width / 2, y - height / 2, width, height, 16);
  g.lineStyle(1, stroke).strokeRoundedRect(x - width / 2, y - height / 2, width, height, 16);
  return g;
}

export function backdrop(scene: Phaser.Scene, eyebrow: string): void {
  scene.cameras.main.setBackgroundColor(UI.paper);
  const g = scene.add.graphics();
  // A deterministic grain pattern avoids animated visual noise and random layout shifts.
  for (let i = 0; i < 210; i++) {
    const x = (i * 167 + 31) % GAME_WIDTH;
    const y = (i * 103 + 17) % GAME_HEIGHT;
    g.fillStyle(0x9f966d, 0.095).fillCircle(x, y, i % 3 === 0 ? 1 : 0.55);
  }
  g.fillStyle(UI.pale, 0.8).fillEllipse(925, 32, 260, 160);
  g.fillStyle(UI.apricot, 0.3).fillEllipse(20, 756, 260, 170);
  drawFlower(g, 49, 41, 11, UI.amber);
  label(scene, 71, 31, eyebrow, 12, UI.green, true).setLetterSpacing(2);
  g.lineStyle(1, UI.line).lineBetween(40, 69, GAME_WIDTH - 40, 69);
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
      .strokeRoundedRect(x - width / 2 - 2, y - height / 2 - 2, width + 4, height + 4, 17);
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
    if (!disabled) g.fillStyle(0x657356, 0.13).fillRoundedRect(x - width / 2, y - height / 2 + 3, width, height, 10);
    g.fillStyle(fill).fillRoundedRect(x - width / 2, y - height / 2, width, height, 10);
    g.lineStyle(focused ? 3 : 1, focused ? UI.amber : options.secondary ? UI.line : fill);
    g.strokeRoundedRect(x - width / 2 - (focused ? 3 : 0), y - height / 2 - (focused ? 3 : 0), width + (focused ? 6 : 0), height + (focused ? 6 : 0), 12);
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
