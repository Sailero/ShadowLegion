import type Phaser from 'phaser';
import { flowerBed } from './postalPaint';
import { LAKE_DOCKS, LAKE_LEAVES, LAKE_WORLD } from '../systems/LakeVoyage';

/** Shared visual geometry: the scene can use these exact shapes for its water test. */
export const LAKE_WATER_OUTLINE = [
  { x: 535, y: 325 }, { x: 690, y: 250 }, { x: 1070, y: 220 }, { x: 1330, y: 245 },
  { x: 1510, y: 340 }, { x: 1570, y: 525 }, { x: 1560, y: 940 }, { x: 1470, y: 1110 },
  { x: 1200, y: 1160 }, { x: 825, y: 1110 }, { x: 565, y: 1000 }, { x: 500, y: 790 },
  { x: 505, y: 535 },
] as const;

export const LAKE_BOARDWALKS = [
  { id: 'start', x: 300, y: 890, width: 245, height: 80 },
  { id: 'mid', x: 410, y: 668, width: 526, height: 64 },
  { id: 'mail', x: 1352, y: 310, width: 344, height: 64 },
  { id: 'west-leaf', x: 410, y: 390, width: 310, height: 60 },
  { id: 'north-leaf', x: 1015, y: 125, width: 70, height: 160 },
] as const;

const { width: WIDTH, height: HEIGHT } = LAKE_WORLD;
const FONT = '"Microsoft YaHei", "PingFang SC", sans-serif';
type Point = { readonly x: number; readonly y: number };
type Rect = { readonly x: number; readonly y: number; readonly width: number; readonly height: number };

function oval(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string, angle = 0): void {
  c.fillStyle = color; c.beginPath(); c.ellipse(x, y, rx, ry, angle, 0, Math.PI * 2); c.fill();
}

function line(c: CanvasRenderingContext2D, points: readonly Point[], width: number, color: string): void {
  c.strokeStyle = color; c.lineWidth = width; c.lineCap = c.lineJoin = 'round'; c.beginPath();
  points.forEach((point, index) => index ? c.lineTo(point.x, point.y) : c.moveTo(point.x, point.y)); c.stroke();
}

function polygon(c: CanvasRenderingContext2D, points: readonly Point[]): void {
  c.beginPath(); points.forEach((point, index) => index ? c.lineTo(point.x, point.y) : c.moveTo(point.x, point.y)); c.closePath();
}

function inside(point: Point): boolean {
  let result = false;
  for (let i = 0, j = LAKE_WATER_OUTLINE.length - 1; i < LAKE_WATER_OUTLINE.length; j = i++) {
    const a = LAKE_WATER_OUTLINE[i], b = LAKE_WATER_OUTLINE[j];
    if ((a.y > point.y) !== (b.y > point.y) && point.x < (b.x - a.x) * (point.y - a.y) / (b.y - a.y) + a.x) result = !result;
  }
  return result;
}

/** Generate only once per Game texture manager; scene restarts reuse the same bitmap. */
function painted(scene: Phaser.Scene, key: string, width: number, height: number,
  draw: (context: CanvasRenderingContext2D) => void): string {
  if (scene.textures.exists(key)) return key;
  const texture = scene.textures.createCanvas(key, width, height);
  if (!texture) return key;
  const c = texture.context;
  c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
  draw(c);
  if (scene.textures.exists('paper-grain')) {
    c.save(); c.globalCompositeOperation = 'source-atop'; c.globalAlpha = .075;
    c.drawImage(scene.textures.get('paper-grain').getSourceImage() as HTMLCanvasElement, 0, 0, width, height); c.restore();
  }
  texture.refresh();
  return key;
}

function lily(c: CanvasRenderingContext2D, x: number, y: number, radius: number, turn = 0, pale = false): void {
  c.save(); c.translate(x, y); c.rotate(turn);
  oval(c, 2, 4, radius * 1.04, radius * .62, '#659b9424');
  c.fillStyle = pale ? '#b8cfa0' : '#96bc99'; c.beginPath(); c.moveTo(0, 0);
  c.ellipse(0, 0, radius, radius * .58, 0, .2, Math.PI * 2 - .18); c.closePath(); c.fill();
  c.strokeStyle = pale ? '#dce1b8' : '#c6d9af'; c.lineWidth = 1; c.globalAlpha = .7;
  for (let i = 1; i < 7; i++) {
    const a = i * Math.PI * .27;
    c.beginPath(); c.moveTo(-1, 0); c.lineTo(Math.cos(a) * radius * .85, Math.sin(a) * radius * .5); c.stroke();
  }
  c.restore();
}

function lotus(c: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  for (let i = -2; i <= 2; i++) oval(c, x + i * size * .35, y - Math.abs(i % 2) * size * .13,
    size * .33, size * .78, i % 2 ? '#ebc0b7' : '#f4dbca', i * .31);
  oval(c, x, y + size * .32, size * .4, size * .19, '#d6b974');
}

function deck(c: CanvasRenderingContext2D, rect: Rect): void {
  const { x, y, width, height } = rect, vertical = height > width;
  c.fillStyle = '#6f8b7625'; c.fillRect(x + 4, y + 5, width, height);
  c.fillStyle = '#d7bd92'; c.fillRect(x, y, width, height);
  const length = vertical ? height : width;
  for (let offset = 0; offset < length; offset += 19) {
    const px = vertical ? x : x + offset, py = vertical ? y + offset : y;
    const w = vertical ? width : Math.min(17.5, width - offset), h = vertical ? Math.min(17.5, height - offset) : height;
    c.fillStyle = offset % 38 ? '#e4cdab' : '#e9d6b4'; c.fillRect(px + .5, py + .5, w, h);
    line(c, vertical ? [{ x: px + 8, y: py + 8 }, { x: px + w - 11, y: py + 10 }]
      : [{ x: px + 8, y: py + 8 }, { x: px + 9, y: py + h - 9 }], .8, '#a98f6850');
  }
  // Low edge beams read as a boardwalk, while every confirmed approach stays open.
  if (vertical) {
    line(c, [{ x: x + 2, y }, { x: x + 2, y: y + height }], 3, '#b49973');
    line(c, [{ x: x + width - 2, y }, { x: x + width - 2, y: y + height }], 3, '#b49973');
  } else {
    line(c, [{ x, y: y + 2 }, { x: x + width, y: y + 2 }], 3, '#b49973');
    line(c, [{ x, y: y + height - 2 }, { x: x + width, y: y + height - 2 }], 3, '#b49973');
  }
}

/** 1800×1300 immutable watercolor ground; contains no actors, input, or collision changes. */
export function lakeFloor(scene: Phaser.Scene): string {
  return painted(scene, 'postal-lake-floor-v1', WIDTH, HEIGHT, c => {
    c.fillStyle = '#efe7c9'; c.fillRect(0, 0, WIDTH, HEIGHT);
    if (scene.textures.exists('ground-1')) {
      const source = scene.textures.get('ground-1').getSourceImage() as HTMLCanvasElement;
      c.save(); c.globalAlpha = .15;
      for (let y = 0; y < HEIGHT; y += 768) for (let x = 0; x < WIDTH; x += 768) c.drawImage(source, x, y, 768, 768);
      c.restore();
    }
    for (let i = 0; i < 70; i++) {
      const x = i * 233 % WIDTH, y = i * 179 % HEIGHT;
      const wash = c.createRadialGradient(x, y, 0, x, y, 110 + i % 51);
      wash.addColorStop(0, i % 2 ? '#c4ce9b40' : '#f8daa23a'); wash.addColorStop(1, '#c4ce9b00');
      c.fillStyle = wash; c.fillRect(x - 162, y - 162, 324, 324);
    }
    // A continuous, generous shore path connects southwest, north bank and east bank.
    const path = [{ x: 340, y: 1150 }, { x: 345, y: 930 }, { x: 350, y: 700 }, { x: 350, y: 420 },
      { x: 400, y: 140 }, { x: 850, y: 130 }, { x: 1270, y: 130 }, { x: 1655, y: 170 },
      { x: 1670, y: 340 }, { x: 1680, y: 730 }, { x: 1610, y: 1150 }];
    line(c, path, 91, '#d9d9b76b'); line(c, path, 77, '#f4eacc'); line(c, path, 44, '#fbf0d54d');
    for (const y of [420, 700]) line(c, [{ x: 350, y }, { x: 410, y }], 48, '#f4eacc');
    polygon(c, LAKE_WATER_OUTLINE); c.strokeStyle = '#c8d7b5'; c.lineWidth = 19; c.lineJoin = 'round'; c.stroke();
    const water = c.createLinearGradient(520, 240, 1440, 1180);
    water.addColorStop(0, '#c4e0d8'); water.addColorStop(.42, '#afd2d2'); water.addColorStop(.8, '#b8d9d4'); water.addColorStop(1, '#d0e2d8');
    c.fillStyle = water; c.fill();
    c.save(); c.clip();
    for (let i = 0; i < 25; i++) {
      const x = 545 + i * 197 % 990, y = 255 + i * 151 % 870;
      const glow = c.createRadialGradient(x, y, 0, x, y, 110 + i % 40);
      glow.addColorStop(0, '#e9f0dc22'); glow.addColorStop(1, '#e9f0dc00'); c.fillStyle = glow; c.fillRect(x - 150, y - 150, 300, 300);
    }
    for (let i = 0; i < 120; i++) {
      const x = 530 + i * 137 % 1020, y = 260 + i * 109 % 880;
      c.strokeStyle = i % 2 ? '#edf2e45e' : '#f5f2d84f'; c.lineWidth = i % 3 ? 1.3 : 2.1;
      c.beginPath(); c.moveTo(x, y); c.bezierCurveTo(x + 13, y + 4, x + 30, y - 4, x + 48, y); c.stroke();
    }
    // Decorative lilies stay away from the dock-count markers and the future return crossing.
    for (const [x, y, radius] of [[625, 555, 23], [660, 584, 16], [1145, 380, 24], [1190, 405, 16],
      [1420, 850, 27], [1462, 872, 19], [730, 985, 25], [767, 1010, 17], [1305, 1055, 23]]) lily(c, x, y, radius, .12, x % 2 === 0);
    lotus(c, 1140, 369, 10); lotus(c, 1420, 838, 12); lotus(c, 729, 972, 9);
    c.restore();
    for (let i = 0; i < LAKE_WATER_OUTLINE.length; i++) {
      const a = LAKE_WATER_OUTLINE[i], b = LAKE_WATER_OUTLINE[(i + 1) % LAKE_WATER_OUTLINE.length];
      for (let j = 0; j < 5; j++) {
        const t = (j + .4) / 5, x = a.x + (b.x - a.x) * t, y = a.y + (b.y - a.y) * t;
        if (LAKE_BOARDWALKS.some(r => x > r.x - 22 && x < r.x + r.width + 22 && y > r.y - 30 && y < r.y + r.height + 30)) continue;
        for (let k = 0; k < 3; k++) line(c, [{ x: x + k * 4, y: y + 6 }, { x: x + k * 6 - 3, y: y - 11 - k * 4 }], 1.5, '#93b18a90');
      }
    }
    for (let i = 0; i < 120; i++) {
      const x = 28 + i * 193 % (WIDTH - 56), y = 24 + i * 131 % (HEIGHT - 48);
      if (!inside({ x, y })) oval(c, x, y, 3.5, 1.2, '#a3ad8160', i % 4);
    }
    for (const walkway of LAKE_BOARDWALKS) deck(c, walkway);
  });
}

function dockMarker(scene: Phaser.Scene, count: number): string {
  return painted(scene, `postal-lake-dock-${count}-v1`, 128, 106, c => {
    oval(c, 63, 85, 54, 12, '#6f958e19');
    const positions = count === 1 ? [[64, 65]] : count === 2 ? [[40, 65], [87, 65]] : [[22, 67], [64, 65], [106, 67]];
    for (const [x, y] of positions) lily(c, x, y, 19.5, -.08, count === 1);
    // One small blossom accents the marker without adding another countable leaf.
    lotus(c, positions[0][0], positions[0][1] - 10, 8);
  });
}

function guideBase(scene: Phaser.Scene): string {
  return painted(scene, 'postal-lake-guide-base-v1', 94, 84, c => {
    oval(c, 48, 60, 41, 15, '#789d8d27'); oval(c, 47, 50, 37, 19, '#a6b5a0');
    oval(c, 45, 45, 33, 16, '#d5d5b7');
    c.strokeStyle = '#eee1ae'; c.lineWidth = 2; c.beginPath(); c.ellipse(46, 44, 23, 10, 0, 0, Math.PI * 2); c.stroke();
    for (let i = 0; i < 9; i++) oval(c, 22 + i * 11 % 52, 49 + i * 7 % 12, 5.5, 2.3, '#95b2878c', i);
    // The scene owns the moving leaf / direction arrow; this is only its stone socket.
  });
}

function fishPortrait(scene: Phaser.Scene): string {
  return painted(scene, 'postal-lake-puff-v1', 120, 110, c => {
    oval(c, 61, 82, 51, 14, '#e2efe480');
    c.strokeStyle = '#f2f0d9'; c.lineWidth = 1.5; c.beginPath(); c.ellipse(61, 82, 43, 10, 0, 0, Math.PI * 2); c.stroke();
    c.fillStyle = '#8fb9b3'; c.beginPath(); c.moveTo(89, 58); c.quadraticCurveTo(119, 32, 114, 60);
    c.quadraticCurveTo(120, 90, 88, 73); c.closePath(); c.fill();
    oval(c, 61, 56, 35, 32, '#accbc0'); oval(c, 52, 59, 29, 28, '#f3e4c4');
    oval(c, 64, 33, 21, 9, '#bed4bf', -.16);
    oval(c, 76, 67, 9, 14, '#9ebfb5', .4); line(c, [{ x: 78, y: 58 }, { x: 80, y: 73 }], 1, '#d5dfc4');
    oval(c, 40, 56, 3, 4, '#5e6051'); oval(c, 64, 54, 3, 4, '#5e6051');
    oval(c, 39, 55, .9, 1.2, '#fff9e4'); oval(c, 63, 53, .9, 1.2, '#fff9e4');
    oval(c, 34, 65, 6, 3, '#e4b7a1a6'); oval(c, 67, 64, 6, 3, '#e4b7a1a6');
    c.strokeStyle = '#887763'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(46, 68); c.quadraticCurveTo(51, 73, 57, 67); c.stroke();
    for (const [x, y, radius] of [[23, 33, 5], [18, 16, 3.5], [38, 12, 2.5]]) {
      c.strokeStyle = '#b6d4c4'; c.lineWidth = 1.5; c.beginPath(); c.arc(x, y, radius, 0, Math.PI * 2); c.stroke();
    }
    lotus(c, 67, 22, 7.5);
  });
}

function postKiosk(scene: Phaser.Scene): string {
  return painted(scene, 'postal-lake-kiosk-v1', 164, 202, c => {
    oval(c, 84, 184, 73, 13, '#8b9c7827');
    c.fillStyle = '#bcaa82'; c.fillRect(36, 69, 8, 114); c.fillRect(120, 69, 8, 114);
    c.fillStyle = '#f4e8c8'; c.beginPath(); c.roundRect(43, 76, 78, 81, 6); c.fill();
    c.fillStyle = '#bd9b71'; c.beginPath(); c.moveTo(15, 82); c.quadraticCurveTo(41, 29, 83, 20);
    c.quadraticCurveTo(119, 41, 150, 83); c.quadraticCurveTo(84, 96, 15, 82); c.fill();
    line(c, [{ x: 20, y: 79 }, { x: 63, y: 33 }, { x: 82, y: 24 }], 3, '#dfc9a4');
    line(c, [{ x: 34, y: 160 }, { x: 130, y: 160 }], 9, '#c3aa7d');
    for (let i = 0; i < 3; i++) {
      c.save(); c.translate(64 + i * 17, 106 + i % 2 * 16); c.rotate((i - 1) * .08);
      c.fillStyle = '#fffae6'; c.fillRect(-12, -8, 25, 17);
      line(c, [{ x: -11, y: -6 }, { x: 0, y: 1 }, { x: 12, y: -6 }], .9, '#b7b19a'); c.restore();
    }
    c.fillStyle = '#a3ba8a'; c.beginPath(); c.roundRect(108, 160, 26, 23, 5); c.fill();
    lotus(c, 120, 154, 8);
  });
}

function picnic(scene: Phaser.Scene): string {
  return painted(scene, 'postal-lake-picnic-v1', 182, 108, c => {
    c.save(); c.translate(91, 53); c.rotate(-.06);
    c.fillStyle = '#eddbb5'; c.beginPath(); c.roundRect(-75, -35, 150, 75, 5); c.fill();
    c.save(); c.clip();
    for (let x = -70; x < 80; x += 23) { c.fillStyle = '#c59f8840'; c.fillRect(x, -40, 9, 90); }
    for (let y = -32; y < 45; y += 22) { c.fillStyle = '#e6ba9b70'; c.fillRect(-80, y, 160, 8); }
    c.restore();
    oval(c, 16, 4, 20, 13, '#fffae4'); oval(c, 16, 3, 14, 9, '#ede5ca');
    oval(c, 11, 2, 5, 3.8, '#d1ac76'); oval(c, 22, 4, 5, 3.8, '#d1ac76');
    c.fillStyle = '#bca077'; c.beginPath(); c.roundRect(-51, -23, 35, 25, 4); c.fill();
    c.strokeStyle = '#a88960'; c.lineWidth = 3; c.beginPath(); c.arc(-34, -22, 11, Math.PI, 0); c.stroke();
    line(c, [{ x: -45, y: -10 }, { x: -23, y: -10 }], 1.2, '#e0c898'); c.restore();
  });
}

/** Static landmarks only: no interaction binding, physics, tweens, timers or dynamic leaf state. */
export function drawLakeLandmarks(scene: Phaser.Scene): void {
  const treeSpots = [[105, 268, 177], [108, 565, 161], [112, 835, 180], [81, 1137, 164],
    [265, 64, 142], [590, 59, 150], [1290, 62, 141], [1574, 64, 154],
    [1744, 541, 165], [1741, 842, 170], [1645, 1235, 180], [690, 1255, 169]];
  if (scene.textures.exists('garden_tree')) treeSpots.forEach(([x, y, size], index) =>
    scene.add.image(x, y, 'garden_tree').setOrigin(.5, .85).setDisplaySize(size, size).setFlipX(index % 3 === 0).setDepth(3));
  const flowers = flowerBed(scene);
  for (const [x, y, size] of [[208, 1150, 108], [436, 255, 101], [596, 195, 80], [1611, 238, 93], [1720, 430, 88], [460, 1120, 78]]) {
    scene.add.image(x, y, flowers).setDisplaySize(size, size * 100 / 152).setDepth(3);
  }
  scene.add.image(250, 1060, postKiosk(scene)).setDepth(5);
  scene.add.image(520, 220, picnic(scene)).setDepth(2);
  scene.add.image(1450, 300, fishPortrait(scene)).setDepth(8);
  const label = (x: number, y: number, value: string, size = 15) => scene.add.text(x, y, value, {
    fontFamily: FONT, fontSize: `${size}px`, color: '#476962', stroke: '#f5efd7', strokeThickness: 3,
  }).setOrigin(.5).setDepth(9);
  label(250, 1170, '湖畔邮亭', 16); label(1450, 241, '泡芙 · 在这里等信', 15);
  const docks = [
    { x: 470, y: 885, count: 1, markerX: 625, markerY: 1000, name: '一叶 · 出发码头' },
    { x: LAKE_DOCKS.mid.x, y: LAKE_DOCKS.mid.y + 59, count: 2, markerX: 882, markerY: 612, name: '二叶 · 歇脚码头' },
    { x: LAKE_DOCKS.mail.x, y: LAKE_DOCKS.mail.y + 59, count: 3, markerX: 1352, markerY: 237, name: '三叶 · 回信码头' },
  ];
  for (const dock of docks) {
    scene.add.image(dock.markerX, dock.markerY, dockMarker(scene, dock.count)).setOrigin(.5, .5).setDepth(4);
    label(dock.x, dock.y, dock.name, 14);
  }
  const base = guideBase(scene);
  for (const leaf of Object.values(LAKE_LEAVES)) {
    scene.add.image(leaf.x, leaf.y, base).setOrigin(.5, .56).setDepth(4);
    label(leaf.x, leaf.y + 50, leaf.label, 14);
  }
}
