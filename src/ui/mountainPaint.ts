import type Phaser from 'phaser';
import {
  MOUNTAIN_NPC, MOUNTAIN_PATHS, MOUNTAIN_PLAZAS,
  MOUNTAIN_SPAWN, MOUNTAIN_STATIONS, MOUNTAIN_WORLD,
  type MountainPoint,
} from '../data/mountain';

/** Shared with the scene when it paints the unlocked wind trail and gate. */
export const MOUNTAIN_PALETTE = {
  path: '#f4e5c9', pathEdge: '#d6b79d', cliff: '#d4ae99',
  grass: '#b7bd8e', cloud: '#c7cdd0', copper: '#b58a59',
} as const;

const TAU = Math.PI * 2;
const { width: WIDTH, height: HEIGHT } = MOUNTAIN_WORLD;

function oval(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number,
  color: string, angle = 0): void {
  c.fillStyle = color; c.beginPath(); c.ellipse(x, y, rx, ry, angle, 0, TAU); c.fill();
}

function stroke(c: CanvasRenderingContext2D, points: readonly MountainPoint[], width: number, color: string): void {
  if (!points.length) return;
  c.strokeStyle = color; c.lineWidth = width; c.lineJoin = c.lineCap = 'round'; c.beginPath();
  points.forEach((p, index) => index ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.stroke();
}

/** One CanvasTexture per game, reused on every scene re-entry. */
function painting(scene: Phaser.Scene, key: string, width: number, height: number,
  draw: (c: CanvasRenderingContext2D) => void): string {
  if (scene.textures.exists(key)) return key;
  const texture = scene.textures.createCanvas(key, width, height);
  if (!texture) return key;
  const c = texture.context;
  c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; draw(c);
  if (scene.textures.exists('paper-grain')) {
    c.save(); c.globalCompositeOperation = 'source-atop'; c.globalAlpha = .065;
    const paper = scene.textures.get('paper-grain').getSourceImage() as HTMLCanvasElement;
    const grain = c.createPattern(paper, 'repeat');
    if (grain) { c.fillStyle = grain; c.fillRect(0, 0, width, height); }
    c.restore();
  }
  texture.refresh();
  return key;
}

/** Clockwise capsules match isMountainSafe's line-segment distance geometry. */
function capsule(path: Path2D, a: MountainPoint, b: MountainPoint, radius: number): void {
  const angle = Math.atan2(b.y - a.y, b.x - a.x);
  path.moveTo(a.x + Math.cos(angle - Math.PI / 2) * radius, a.y + Math.sin(angle - Math.PI / 2) * radius);
  path.lineTo(b.x + Math.cos(angle - Math.PI / 2) * radius, b.y + Math.sin(angle - Math.PI / 2) * radius);
  path.arc(b.x, b.y, radius, angle - Math.PI / 2, angle + Math.PI / 2);
  path.lineTo(a.x + Math.cos(angle + Math.PI / 2) * radius, a.y + Math.sin(angle + Math.PI / 2) * radius);
  path.arc(a.x, a.y, radius, angle + Math.PI / 2, angle + Math.PI * 1.5); path.closePath();
}

function groundShape(): Path2D {
  const shape = new Path2D();
  for (const path of MOUNTAIN_PATHS) {
    if (path.kind === 'wind') continue;
    for (let i = 1; i < path.waypoints.length; i++) capsule(shape, path.waypoints[i - 1], path.waypoints[i], path.width / 2);
  }
  for (const plaza of MOUNTAIN_PLAZAS) {
    if (plaza.kind === 'wind') continue;
    shape.moveTo(plaza.x + plaza.radius, plaza.y);
    shape.arc(plaza.x, plaza.y, plaza.radius, 0, TAU); shape.closePath();
  }
  return shape;
}

function cloud(c: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
  c.save(); c.translate(x, y);
  const wash = c.createLinearGradient(0, -height, 0, height * .45);
  wash.addColorStop(0, '#faf4e4b5'); wash.addColorStop(.65, '#e7e4d9c9'); wash.addColorStop(1, '#c7cccf45');
  c.fillStyle = wash; c.beginPath(); c.moveTo(-width * .49, height * .15);
  c.bezierCurveTo(-width * .58, -height * .16, -width * .34, -height * .49, -width * .22, -height * .35);
  c.bezierCurveTo(-width * .19, -height * .95, width * .10, -height * .99, width * .24, -height * .49);
  c.bezierCurveTo(width * .42, -height * .65, width * .62, -height * .1, width * .48, height * .15);
  c.bezierCurveTo(width * .32, height * .43, -width * .30, height * .43, -width * .49, height * .15); c.fill();
  c.strokeStyle = '#fff8e653'; c.lineWidth = 2; c.beginPath();
  c.moveTo(-width * .29, -height * .21); c.bezierCurveTo(-width * .12, -height * .02, width * .03, -height * .18, width * .15, -height * .26); c.stroke();
  c.restore();
}

function tuft(c: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  oval(c, x, y + 2, size * 1.5, size * .4, '#9d9f7023');
  for (let i = -2; i <= 2; i++) {
    c.strokeStyle = i % 2 ? '#adb888' : '#919f78'; c.lineWidth = 1.4; c.lineCap = 'round'; c.beginPath();
    c.moveTo(x + i * size * .34, y + 2);
    c.quadraticCurveTo(x + i * size * .41, y - size * .3, x + i * size * .67, y - size * (.68 - Math.abs(i) * .09)); c.stroke();
  }
}

function seedFlower(c: CanvasRenderingContext2D, x: number, y: number, scale = 1): void {
  stroke(c, [{ x, y: y + 9 * scale }, { x: x + 1, y }], 1.2, '#939f75');
  for (let i = 0; i < 5; i++) {
    const a = i * TAU / 5; oval(c, x + Math.cos(a) * 3 * scale, y + Math.sin(a) * 2.7 * scale,
      2.8 * scale, 1.8 * scale, '#fbf0d4', a);
  }
  oval(c, x, y, 1.8 * scale, 1.5 * scale, '#cba974');
}

function distantRidge(c: CanvasRenderingContext2D, x: number, y: number, size: number, tint: string): void {
  c.save(); c.translate(x, y); c.scale(size, size); c.fillStyle = tint;
  c.beginPath(); c.moveTo(-90, 90); c.bezierCurveTo(-77, 47, -57, 56, -47, 11);
  c.bezierCurveTo(-32, -26, -17, -37, 1, -19); c.bezierCurveTo(16, -8, 11, 8, 27, 11);
  c.bezierCurveTo(48, -13, 62, 45, 96, 87); c.closePath(); c.fill();
  c.fillStyle = '#f3e6d132'; c.beginPath(); c.moveTo(-47, 11); c.quadraticCurveTo(-14, -45, 1, -19);
  c.lineTo(16, 16); c.quadraticCurveTo(-13, 2, -21, 26); c.closePath(); c.fill(); c.restore();
}

/**
 * Full 2100×1500 static painting. Top surfaces use only the shared, permanent
 * capsules and circles; the unlockable wind trail and gate remain scene-owned.
 */
export function mountainFloor(scene: Phaser.Scene): string {
  return painting(scene, 'postal-mountain-floor-v1', WIDTH, HEIGHT, c => {
    const sky = c.createLinearGradient(0, 0, WIDTH * .75, HEIGHT);
    sky.addColorStop(0, '#eee4d1'); sky.addColorStop(.42, '#d5d7d2'); sky.addColorStop(1, '#bec7cb');
    c.fillStyle = sky; c.fillRect(0, 0, WIDTH, HEIGHT);
    const light = c.createRadialGradient(340, 160, 10, 340, 160, 700);
    light.addColorStop(0, '#fff3d270'); light.addColorStop(1, '#fff3d200'); c.fillStyle = light; c.fillRect(0, 0, 1080, 900);
    for (const [x, y, size] of [[150, 230, 2.4], [650, 220, 2], [950, 390, 2.5], [380, 590, 1.7], [1950, 1130, 2.6]]) {
      distantRidge(c, x, y, size, '#b5bcc255');
    }
    // Overlapping cotton banks and distant ridges read as height, not water.
    for (let i = 0; i < 32; i++) cloud(c, 45 + i * 347 % WIDTH, 100 + i * 263 % HEIGHT,
      225 + i % 5 * 37, 52 + i % 4 * 15);

    const ground = groundShape();
    for (const [drop, color] of [[34, '#8e98a12b'], [25, '#bdab9b'], [16, '#d3af9a'], [7, '#dfc0a8']] as const) {
      c.save(); c.translate(0, drop); c.fillStyle = color; c.fill(ground); c.restore();
    }
    const rock = c.createLinearGradient(0, 280, WIDTH, HEIGHT);
    rock.addColorStop(0, '#efdec2'); rock.addColorStop(.45, '#ead2b5'); rock.addColorStop(1, '#f1dcc0');
    c.fillStyle = rock; c.fill(ground);

    c.save(); c.clip(ground);
    // Several translucent mineral washes soften the exact collision silhouette.
    for (let i = 0; i < 55; i++) {
      const x = i * 293 % WIDTH, y = i * 181 % HEIGHT, radius = 72 + i % 7 * 14;
      const wash = c.createRadialGradient(x, y, 0, x, y, radius);
      wash.addColorStop(0, i % 3 ? '#cf9f8640' : '#eec4a85a'); wash.addColorStop(1, '#cf9f8600');
      c.fillStyle = wash; c.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    for (const path of MOUNTAIN_PATHS) {
      if (path.kind === 'wind') continue;
      stroke(c, path.waypoints, path.width * .69, '#eee0c0b3');
      stroke(c, path.waypoints, path.width * .57, MOUNTAIN_PALETTE.path);
      stroke(c, path.waypoints, path.width * .34, '#fff1d52b');
    }
    for (const plaza of MOUNTAIN_PLAZAS) {
      if (plaza.kind === 'wind') continue;
      const wash = c.createRadialGradient(plaza.x, plaza.y, plaza.radius * .17, plaza.x, plaza.y, plaza.radius);
      wash.addColorStop(0, '#f8eacfe0'); wash.addColorStop(.74, '#f2e1c3b0'); wash.addColorStop(1, '#eddbb900');
      c.fillStyle = wash; c.fillRect(plaza.x - plaza.radius, plaza.y - plaza.radius, plaza.radius * 2, plaza.radius * 2);
    }
    for (let i = 0; i < 1300; i++) {
      const x = 12 + i * 137 % (WIDTH - 24), y = 12 + i * 197 % (HEIGHT - 24);
      oval(c, x, y, .7 + i % 3 * .3, .55, i % 3 ? '#a5907030' : '#fff5dc75', i % 4);
    }
    // Plants stay in the outer quarter of the path. No raised props occupy its center.
    for (const path of MOUNTAIN_PATHS) {
      if (path.kind === 'wind') continue;
      for (let n = 1; n < path.waypoints.length; n++) {
        const a = path.waypoints[n - 1], b = path.waypoints[n];
        const dx = b.x - a.x, dy = b.y - a.y, length = Math.hypot(dx, dy);
        if (!length) continue;
        for (let distance = 45; distance < length; distance += 79) {
          const side = Math.floor(distance / 79) % 2 ? -1 : 1, edge = path.width * .42 * side;
          const x = a.x + dx * distance / length - dy / length * edge;
          const y = a.y + dy * distance / length + dx / length * edge;
          tuft(c, x, y, 6); if (Math.floor(distance) % 3 === 0) seedFlower(c, x + 8, y - 5, .9);
        }
      }
    }
    for (const station of Object.values(MOUNTAIN_STATIONS)) {
      const { x, y } = station.echo;
      oval(c, x, y + 3, 39, 24, '#b3b18b2f'); oval(c, x, y, 35, 22, '#bdc39693');
      for (let i = 0; i < 8; i++) stroke(c,
        [{ x: x - 25 + i * 7, y: y - 15 }, { x: x - 27 + i * 7, y: y + 15 }], .8, '#eef0d14d');
      for (const point of Object.values(station.playerBells)) {
        oval(c, point.x + 1, point.y + 4, 31, 23, '#947f6629');
        oval(c, point.x, point.y, 30, 22, '#d1bfa4'); oval(c, point.x - 1, point.y - 3, 27, 20, '#e9d9ba');
        c.strokeStyle = '#f9edce'; c.lineWidth = 1.5; c.beginPath(); c.ellipse(point.x - 1, point.y - 3, 22, 15, 0, 0, TAU); c.stroke();
      }
    }
    c.restore();
  });
}

function goatPortrait(scene: Phaser.Scene): string {
  return painting(scene, 'postal-mountain-lanjiao-v1', 144, 172, c => {
    oval(c, 74, 155, 47, 10, '#8d8b7420');
    // Soft upright silhouette, curling horns, cloven boots and a little mail cape.
    for (const x of [56, 89]) {
      stroke(c, [{ x, y: 130 }, { x: x - 1, y: 151 }], 13, '#e5d8bf');
      oval(c, x - 1, 152, 10, 6, '#9c8770'); stroke(c, [{ x: x - 1, y: 151 }, { x: x - 1, y: 157 }], 1.2, '#756653');
    }
    c.fillStyle = '#90a69a'; c.beginPath(); c.moveTo(46, 84); c.quadraticCurveTo(76, 72, 100, 87);
    c.quadraticCurveTo(113, 113, 108, 137); c.quadraticCurveTo(75, 148, 38, 135); c.quadraticCurveTo(35, 107, 46, 84); c.fill();
    oval(c, 72, 116, 28, 25, '#f1e6cb');
    oval(c, 42, 111, 10, 19, '#e5d9bf', .32); oval(c, 103, 109, 10, 19, '#eee1c6', -.36);
    c.save(); c.translate(105, 117); c.rotate(-.19); c.fillStyle = '#fdf3dc'; c.fillRect(-13, -9, 26, 19);
    stroke(c, [{ x: -12, y: -8 }, { x: 0, y: 1 }, { x: 12, y: -8 }], 1.1, '#c1ad87'); c.restore();
    for (const [x, direction] of [[52, -1], [92, 1]]) {
      c.strokeStyle = '#bba583'; c.lineWidth = 12; c.lineCap = 'round'; c.beginPath();
      c.moveTo(x, 44); c.bezierCurveTo(x + direction * 19, 25, x + direction * 14, 11, x + direction * 2, 20); c.stroke();
      c.strokeStyle = '#e0c8a3'; c.lineWidth = 4; c.beginPath();
      c.moveTo(x + direction * 2, 39); c.quadraticCurveTo(x + direction * 17, 19, x + direction * 5, 19); c.stroke();
    }
    oval(c, 37, 57, 18, 10, '#e5d7bd', -.47); oval(c, 108, 57, 18, 10, '#e9ddc3', .47);
    oval(c, 35, 58, 10, 4, '#d7b4a1', -.47); oval(c, 110, 58, 10, 4, '#dfbca5', .47);
    oval(c, 72, 64, 34, 36, '#f4e9cf');
    for (let i = 0; i < 5; i++) oval(c, 48 + i * 12, 36 + Math.abs(i - 2) * 2, 10, 9, '#f8efd9', i * .1);
    oval(c, 72, 86, 23, 14, '#e5d2b0');
    oval(c, 58, 65, 3.2, 4, '#646457'); oval(c, 86, 65, 3.2, 4, '#646457');
    oval(c, 57, 64, .95, 1.3, '#fff9e9'); oval(c, 85, 64, .95, 1.3, '#fff9e9');
    oval(c, 48, 77, 6, 3, '#e2b6a285'); oval(c, 96, 77, 6, 3, '#e2b6a285');
    oval(c, 72, 80, 4, 2.8, '#9d886e');
    c.strokeStyle = '#9a846b'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(64, 87); c.quadraticCurveTo(72, 92, 80, 87); c.stroke();
    c.fillStyle = '#eee2c6'; c.beginPath(); c.moveTo(64, 95); c.quadraticCurveTo(72, 116, 80, 95); c.fill();
    stroke(c, [{ x: 47, y: 93 }, { x: 63, y: 101 }, { x: 97, y: 93 }], 8, '#cba57d');
    oval(c, 73, 105, 5.5, 6, '#b99154'); oval(c, 72, 103, 3, 3, '#edd29a');
  });
}

function mountainPost(scene: Phaser.Scene): string {
  return painting(scene, 'postal-mountain-post-v1', 142, 176, c => {
    oval(c, 72, 161, 59, 10, '#95886e20');
    stroke(c, [{ x: 36, y: 67 }, { x: 34, y: 156 }], 9, '#b59d7f');
    stroke(c, [{ x: 106, y: 67 }, { x: 108, y: 156 }], 9, '#b59d7f');
    c.fillStyle = '#eee0c1'; c.beginPath(); c.roundRect(39, 75, 63, 66, 5); c.fill();
    c.fillStyle = '#bf9273'; c.beginPath(); c.moveTo(13, 78); c.quadraticCurveTo(36, 44, 73, 37);
    c.quadraticCurveTo(106, 47, 130, 78); c.quadraticCurveTo(69, 88, 13, 78); c.fill();
    c.fillStyle = '#dab08b'; c.beginPath(); c.moveTo(20, 74); c.quadraticCurveTo(43, 47, 73, 41);
    c.quadraticCurveTo(92, 53, 121, 74); c.quadraticCurveTo(70, 81, 20, 74); c.fill();
    for (let i = 0; i < 5; i++) stroke(c, [{ x: 41 + i * 13, y: 65 }, { x: 38 + i * 15, y: 77 }], 1.1, '#a8796047');
    c.fillStyle = '#fff5dd'; c.fillRect(51, 91, 39, 28);
    stroke(c, [{ x: 53, y: 94 }, { x: 70, y: 106 }, { x: 88, y: 94 }], 1.4, '#b7a386');
    stroke(c, [{ x: 33, y: 144 }, { x: 110, y: 144 }], 7, '#c3a886');
    stroke(c, [{ x: 72, y: 37 }, { x: 72, y: 15 }], 3, '#b09374');
    c.fillStyle = '#abb994'; c.beginPath(); c.moveTo(74, 16); c.quadraticCurveTo(91, 10, 108, 20);
    c.lineTo(101, 29); c.quadraticCurveTo(87, 20, 74, 25); c.closePath(); c.fill();
    seedFlower(c, 113, 148, 1.25); tuft(c, 27, 157, 9);
  });
}

function bellPennant(scene: Phaser.Scene): string {
  return painting(scene, 'postal-mountain-bell-pennant-v1', 88, 142, c => {
    oval(c, 44, 129, 26, 7, '#8d846b1f');
    stroke(c, [{ x: 33, y: 127 }, { x: 36, y: 17 }], 4.5, '#b49a7a');
    stroke(c, [{ x: 35, y: 30 }, { x: 67, y: 33 }], 3.4, '#b49a7a');
    c.fillStyle = '#bea7a3'; c.beginPath(); c.moveTo(40, 22); c.quadraticCurveTo(60, 15, 75, 22);
    c.lineTo(66, 44); c.quadraticCurveTo(54, 32, 40, 36); c.closePath(); c.fill();
    stroke(c, [{ x: 62, y: 35 }, { x: 61, y: 67 }], 1.2, '#ae9270');
    c.fillStyle = '#b58c57'; c.beginPath(); c.moveTo(52, 70); c.quadraticCurveTo(61, 59, 70, 70);
    c.quadraticCurveTo(69, 83, 75, 86); c.quadraticCurveTo(62, 94, 47, 87); c.quadraticCurveTo(53, 82, 52, 70); c.fill();
    c.fillStyle = '#d8b47b'; c.beginPath(); c.moveTo(55, 72); c.quadraticCurveTo(60, 65, 66, 72);
    c.lineTo(68, 85); c.quadraticCurveTo(60, 88, 54, 85); c.closePath(); c.fill();
    oval(c, 61, 88, 12, 3, '#a98253'); oval(c, 61, 92, 3, 4, '#c59b60');
    tuft(c, 32, 129, 9); seedFlower(c, 20, 123, 1.1);
  });
}

function letterBasket(scene: Phaser.Scene): string {
  return painting(scene, 'postal-mountain-letter-basket-v1', 112, 102, c => {
    oval(c, 57, 88, 43, 9, '#8d846b20');
    c.strokeStyle = '#ad8d66'; c.lineWidth = 4; c.beginPath(); c.ellipse(57, 52, 26, 31, -.14, Math.PI, TAU); c.stroke();
    c.fillStyle = '#c2a278'; c.beginPath(); c.moveTo(19, 51); c.lineTo(27, 82);
    c.quadraticCurveTo(57, 92, 88, 82); c.lineTo(96, 51); c.closePath(); c.fill();
    c.save(); c.clip();
    for (let y = 57; y < 88; y += 7) stroke(c, [{ x: 18, y }, { x: 95, y: y + 2 }], 2.2, '#e0c193');
    for (let x = 25; x < 95; x += 11) stroke(c, [{ x, y: 53 }, { x: x - 3, y: 89 }], 1.4, '#9f805a55');
    c.restore();
    oval(c, 57, 51, 38, 10, '#ae8c64');
    for (let i = 0; i < 3; i++) {
      c.save(); c.translate(40 + i * 17, 45 + i % 2 * 4); c.rotate((i - 1) * .17);
      c.fillStyle = i % 2 ? '#f1dfb9' : '#fff2d6'; c.fillRect(-15, -14, 30, 24);
      stroke(c, [{ x: -13, y: -12 }, { x: 0, y: -1 }, { x: 13, y: -12 }], 1.2, '#b6a184'); c.restore();
    }
    stroke(c, [{ x: 21, y: 54 }, { x: 45, y: 58 }, { x: 74, y: 58 }, { x: 93, y: 53 }], 4, '#d3b58a');
    c.fillStyle = '#a7b696'; c.beginPath(); c.moveTo(62, 61); c.lineTo(75, 64); c.lineTo(76, 82);
    c.lineTo(70, 77); c.lineTo(66, 83); c.closePath(); c.fill();
  });
}

/** Static images only: no text, input, physics, listeners, timers or state. */
export function drawMountainLandmarks(scene: Phaser.Scene): void {
  // The scene owns all station text, interactive bells, gate and wind-trail state.
  const post = mountainPost(scene), flag = bellPennant(scene), goat = goatPortrait(scene);
  scene.add.image(MOUNTAIN_SPAWN.x - 78, MOUNTAIN_SPAWN.y - 32, post).setOrigin(.5, .9).setDepth(4);
  const lesson = MOUNTAIN_STATIONS.lesson.instruction, pass = MOUNTAIN_STATIONS.pass.instruction;
  scene.add.image(lesson.x - 70, lesson.y - 75, flag).setOrigin(.5, .9).setDepth(3);
  scene.add.image(pass.x - 72, pass.y - 39, flag).setOrigin(.5, .9).setDepth(3).setFlipX(true);
  scene.add.image(MOUNTAIN_NPC.x - 105, MOUNTAIN_NPC.y + 43, flag).setOrigin(.5, .9).setDepth(3);
  scene.add.image(MOUNTAIN_NPC.x + 72, MOUNTAIN_NPC.y + 43, flag).setOrigin(.5, .9).setDepth(3).setFlipX(true);
  scene.add.image(MOUNTAIN_NPC.x, MOUNTAIN_NPC.y, goat).setOrigin(.5, .9).setDepth(5);
  scene.add.image(MOUNTAIN_NPC.x + 54, MOUNTAIN_NPC.y + 65, letterBasket(scene)).setOrigin(.5, .88).setDepth(4);
}
