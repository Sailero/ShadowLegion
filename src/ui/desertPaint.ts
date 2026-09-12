import type Phaser from 'phaser';
import {
  DESERT_DISCOVERY, DESERT_NPC, DESERT_OBSTACLES, DESERT_PATHS, DESERT_PLAZAS, DESERT_SPAWN, DESERT_WORLD,
  isDesertSafe, type DesertObstacle, type DesertPoint,
} from '../data/desert';

const TAU = Math.PI * 2;
const { width: WIDTH, height: HEIGHT } = DESERT_WORLD;

function oval(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number,
  color: string, angle = 0): void {
  c.fillStyle = color; c.beginPath(); c.ellipse(x, y, rx, ry, angle, 0, TAU); c.fill();
}

function line(c: CanvasRenderingContext2D, points: readonly DesertPoint[], width: number, color: string): void {
  c.strokeStyle = color; c.lineWidth = width; c.lineJoin = c.lineCap = 'round'; c.beginPath();
  points.forEach((p, i) => i ? c.lineTo(p.x, p.y) : c.moveTo(p.x, p.y)); c.stroke();
}

/** Cached per game texture manager, with no work on subsequent scene entries. */
function painting(scene: Phaser.Scene, key: string, width: number, height: number,
  draw: (c: CanvasRenderingContext2D) => void): string {
  if (scene.textures.exists(key)) return key;
  const texture = scene.textures.createCanvas(key, width, height);
  if (!texture) return key;
  const c = texture.context;
  c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; draw(c);
  if (scene.textures.exists('paper-grain')) {
    c.save(); c.globalCompositeOperation = 'source-atop'; c.globalAlpha = .075;
    const grain = c.createPattern(scene.textures.get('paper-grain').getSourceImage() as HTMLCanvasElement, 'repeat');
    if (grain) { c.fillStyle = grain; c.fillRect(0, 0, width, height); }
    c.restore();
  }
  texture.refresh();
  return key;
}

/** Exactly the shared safe-ground capsules and plazas, before subtracting the stone footprint. */
function groundShape(): Path2D {
  const shape = new Path2D();
  for (const path of DESERT_PATHS) {
    const radius = path.width / 2;
    for (let i = 1; i < path.waypoints.length; i++) {
      const a = path.waypoints[i - 1], b = path.waypoints[i];
      const angle = Math.atan2(b.y - a.y, b.x - a.x);
      shape.moveTo(a.x + Math.cos(angle - Math.PI / 2) * radius, a.y + Math.sin(angle - Math.PI / 2) * radius);
      shape.lineTo(b.x + Math.cos(angle - Math.PI / 2) * radius, b.y + Math.sin(angle - Math.PI / 2) * radius);
      shape.arc(b.x, b.y, radius, angle - Math.PI / 2, angle + Math.PI / 2);
      shape.lineTo(a.x + Math.cos(angle + Math.PI / 2) * radius, a.y + Math.sin(angle + Math.PI / 2) * radius);
      shape.arc(a.x, a.y, radius, angle + Math.PI / 2, angle + Math.PI * 1.5); shape.closePath();
    }
  }
  for (const plaza of DESERT_PLAZAS) {
    shape.moveTo(plaza.x + plaza.radius, plaza.y); shape.arc(plaza.x, plaza.y, plaza.radius, 0, TAU); shape.closePath();
  }
  return shape;
}

function dune(c: CanvasRenderingContext2D, x: number, y: number, width: number, height: number): void {
  c.save(); c.translate(x, y);
  const wash = c.createLinearGradient(0, -height, 0, height * .65);
  wash.addColorStop(0, '#fff0cc80'); wash.addColorStop(.54, '#e9ca9870'); wash.addColorStop(1, '#d9b58400');
  c.fillStyle = wash; c.beginPath(); c.moveTo(-width / 2, height * .45);
  c.bezierCurveTo(-width * .28, -height * .45, width * .05, -height * .96, width * .34, -height * .2);
  c.quadraticCurveTo(width * .45, height * .12, width / 2, height * .5);
  c.quadraticCurveTo(0, height, -width / 2, height * .45); c.fill();
  c.strokeStyle = '#fff3d667'; c.lineWidth = 3; c.beginPath(); c.moveTo(-width * .34, height * .09);
  c.quadraticCurveTo(-width * .06, -height * .61, width * .24, -height * .36); c.stroke(); c.restore();
}

function sprig(c: CanvasRenderingContext2D, x: number, y: number, size: number): void {
  oval(c, x, y + 2, size * 1.5, size * .42, '#9f9d6720');
  for (let i = -2; i <= 2; i++) {
    c.strokeStyle = i % 2 ? '#b0b787' : '#949f79'; c.lineWidth = 1.7; c.lineCap = 'round'; c.beginPath();
    c.moveTo(x + i * size * .24, y); c.quadraticCurveTo(x + i * size * .33, y - size * .7,
      x + i * size * .64, y - size * (.95 - Math.abs(i) * .19)); c.stroke();
  }
}

function pot(c: CanvasRenderingContext2D, x: number, y: number, size: number, flowering = false): void {
  c.save(); c.translate(x, y); c.scale(size, size);
  oval(c, 2, 4, 24, 7, '#a78d6925');
  const clay = c.createLinearGradient(-19, -18, 23, 0);
  clay.addColorStop(0, '#d9ac83'); clay.addColorStop(.4, '#efc5a1'); clay.addColorStop(1, '#cfa07c');
  c.fillStyle = clay; c.beginPath(); c.moveTo(-21, -23); c.quadraticCurveTo(-21, -2, -13, 2);
  c.quadraticCurveTo(1, 9, 15, 2); c.quadraticCurveTo(20, -7, 22, -23); c.closePath(); c.fill();
  oval(c, 0, -23, 22, 6, '#e9bd94'); oval(c, 0, -24, 17, 3.5, '#ae9d70');
  for (let i = -2; i <= 2; i++) oval(c, i * 7, -31 - (2 - Math.abs(i)) * 4, 5.2, 14 - Math.abs(i) * 2,
    i % 2 ? '#b9c294' : '#9daa82', i * .24);
  if (flowering) for (let i = -1; i <= 1; i++) {
    for (let p = 0; p < 5; p++) oval(c, i * 11 + Math.cos(p * TAU / 5) * 3,
      -44 + Math.abs(i) * 4 + Math.sin(p * TAU / 5) * 3, 3.6, 2.1, '#f5d4bd', p * TAU / 5);
    oval(c, i * 11, -44 + Math.abs(i) * 4, 2, 1.7, '#c89f65');
  }
  line(c, [{ x: -15, y: -12 }, { x: 1, y: -10 }, { x: 16, y: -13 }], 1.4, '#f9dbb6'); c.restore();
}

function stoneBed(c: CanvasRenderingContext2D, box: DesertObstacle): void {
  const { x, y, width, height } = box;
  // The whole rectangle reads as a solid stone bed, including collider corners.
  c.fillStyle = '#ac916b27'; c.fillRect(x + 5, y + 7, width, height);
  c.fillStyle = '#c8ad88'; c.fillRect(x, y, width, height);
  c.save(); c.beginPath(); c.rect(x, y, width, height); c.clip();
  for (let row = 0; row < 4; row++) for (let col = 0; col < 3; col++) {
    const px = x + width * (.17 + col * .33) + (row % 2 ? 9 : -7), py = y + height * (.14 + row * .25);
    const rx = width * (.24 - row % 2 * .025), ry = height * .18;
    oval(c, px + 3, py + 7, rx, ry, '#b19370');
    const wash = c.createLinearGradient(px - rx, py - ry, px + rx * .2, py + ry);
    wash.addColorStop(0, '#efdbb9'); wash.addColorStop(.6, '#ddc29d'); wash.addColorStop(1, '#c6a982');
    c.fillStyle = wash; c.beginPath(); c.ellipse(px, py, rx, ry, -.12 + col * .09, 0, TAU); c.fill();
    c.strokeStyle = '#f8e8cb8c'; c.lineWidth = 2; c.beginPath(); c.ellipse(px - 3, py - 4, rx * .72, ry * .7, -.12, 3.5, 5.2); c.stroke();
    line(c, [{ x: px + rx * .12, y: py - ry * .3 }, { x: px + rx * .48, y: py },
      { x: px + rx * .36, y: py + ry * .5 }], 1.2, '#bda1816b');
  }
  c.restore();
}

/** Cream packed-sand paths contrast with apricot dunes; physics uses the same authored geometry. */
export function desertFloor(scene: Phaser.Scene): string {
  return painting(scene, 'postal-desert-floor-v1', WIDTH, HEIGHT, c => {
    const sand = c.createLinearGradient(0, 0, WIDTH * .4, HEIGHT);
    sand.addColorStop(0, '#e7cda4'); sand.addColorStop(.48, '#edd5ad'); sand.addColorStop(1, '#e5c497');
    c.fillStyle = sand; c.fillRect(0, 0, WIDTH, HEIGHT);
    for (let i = 0; i < 38; i++) dune(c, i * 419 % WIDTH, i * 263 % HEIGHT, 250 + i % 4 * 73, 70 + i % 5 * 20);
    for (let i = 0; i < 125; i++) {
      const x = 20 + i * 197 % (WIDTH - 40), y = 25 + i * 313 % (HEIGHT - 50);
      c.strokeStyle = i % 2 ? '#cba97837' : '#f9e8c64d'; c.lineWidth = 1.2; c.beginPath();
      c.moveTo(x - 20, y); c.quadraticCurveTo(x, y - 6, x + 23, y - 2); c.stroke();
    }
    const ground = groundShape();
    c.save(); c.translate(0, 5); c.fillStyle = '#cdb38e'; c.fill(ground); c.restore();
    c.fillStyle = '#f6e8cd'; c.fill(ground);
    c.save(); c.clip(ground);
    for (let i = 0; i < 82; i++) {
      const x = i * 277 % WIDTH, y = i * 193 % HEIGHT, radius = 31 + i % 29;
      const wash = c.createRadialGradient(x, y, 0, x, y, radius);
      wash.addColorStop(0, i % 2 ? '#fff5e13d' : '#d8bd8c14'); wash.addColorStop(1, '#fff4db00');
      c.fillStyle = wash; c.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
    for (let i = 0; i < 740; i++) {
      const x = i * 331 % WIDTH, y = i * 127 % HEIGHT;
      oval(c, x, y, 1 + i % 2, .65, i % 3 ? '#c4a37625' : '#fff9e780');
    }
    c.restore();
    for (const obstacle of DESERT_OBSTACLES) stoneBed(c, obstacle);
    // Plantings remain off the safe path, including their full decorative footprint.
    for (let i = 0; i < 78; i++) {
      const x = 85 + i * 347 % (WIDTH - 170), y = 100 + i * 263 % (HEIGHT - 200);
      if ([-48, 0, 48].some(dx => [-48, 0, 48].some(dy => isDesertSafe({ x: x + dx, y: y + dy }, 0)))) continue;
      if (DESERT_OBSTACLES.some(box => x > box.x - 60 && x < box.x + box.width + 60 && y > box.y - 60 && y < box.y + box.height + 60)) continue;
      sprig(c, x, y, 10 + i % 8);
      if (i % 5 === 0) pot(c, x + 17, y + 7, .75 + i % 3 * .1, i % 2 === 0);
    }
  });
}

function cactusFriend(scene: Phaser.Scene): string {
  return painting(scene, 'postal-desert-tuanci-v1', 152, 184, c => {
    oval(c, 78, 170, 49, 9, '#9d896d24');
    // Rounded branches, hand-sewn hat and a broad pot make a readable cactus silhouette.
    line(c, [{ x: 53, y: 110 }, { x: 30, y: 100 }, { x: 25, y: 79 }], 18, '#9dab7d');
    line(c, [{ x: 109, y: 106 }, { x: 130, y: 89 }, { x: 129, y: 67 }], 17, '#a7b58a');
    line(c, [{ x: 27, y: 96 }, { x: 25, y: 80 }], 3, '#cbd4a6');
    line(c, [{ x: 130, y: 86 }, { x: 129, y: 68 }], 3, '#d3dcb1');
    const green = c.createLinearGradient(40, 47, 116, 121);
    green.addColorStop(0, '#b9c794'); green.addColorStop(.45, '#c9d3a5'); green.addColorStop(1, '#9dac81');
    c.fillStyle = green; c.beginPath(); c.moveTo(43, 131); c.bezierCurveTo(39, 108, 40, 53, 60, 45);
    c.bezierCurveTo(83, 28, 113, 48, 116, 80); c.quadraticCurveTo(125, 113, 111, 135); c.closePath(); c.fill();
    for (const x of [55, 73, 95, 109]) {
      c.strokeStyle = x === 73 ? '#e0e3b952' : '#879b7138'; c.lineWidth = 1.8; c.beginPath();
      c.moveTo(x, 56); c.bezierCurveTo(x - 8, 77, x + 4, 99, x - 2, 128); c.stroke();
    }
    for (const [x, y] of [[48, 70], [109, 62], [46, 112], [105, 119], [61, 58], [31, 84], [127, 71]]) {
      line(c, [{ x: x - 2, y: y - 3 }, { x, y }, { x: x + 3, y: y - 2 }], 1.15, '#eef0c9');
    }
    oval(c, 67, 88, 3.1, 4.1, '#536451'); oval(c, 94, 88, 3.1, 4.1, '#536451');
    oval(c, 66, 87, 1, 1.3, '#fff7e3'); oval(c, 93, 87, 1, 1.3, '#fff7e3');
    oval(c, 55, 99, 7, 3.3, '#dda88b77'); oval(c, 105, 99, 7, 3.3, '#dda88b77');
    c.strokeStyle = '#65755a'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(74, 101);
    c.quadraticCurveTo(80, 107, 87, 101); c.stroke();
    c.save(); c.translate(78, 45); c.rotate(-.19);
    oval(c, 0, 4, 52, 9, '#bb996f');
    c.fillStyle = '#e5c796'; c.beginPath(); c.moveTo(-30, 2); c.quadraticCurveTo(-33, -17, -21, -26);
    c.quadraticCurveTo(0, -34, 21, -24); c.quadraticCurveTo(32, -14, 30, 3); c.closePath(); c.fill();
    line(c, [{ x: -29, y: -3 }, { x: -9, y: 0 }, { x: 13, y: 0 }, { x: 29, y: -4 }], 6, '#ba8c74');
    oval(c, 20, -2, 6, 6, '#7e8e79'); oval(c, 20, -2, 3.8, 3.8, '#b9b991');
    oval(c, 18.7, -2.8, .85, .85, '#6d775e'); oval(c, 21.3, -.9, .85, .85, '#6d775e');
    c.strokeStyle = '#f8dfb3'; c.lineWidth = 1.2; c.beginPath(); c.ellipse(0, 3, 46, 6, 0, .1, 3.1); c.stroke(); c.restore();
    const clay = c.createLinearGradient(39, 132, 119, 162);
    clay.addColorStop(0, '#d6a27e'); clay.addColorStop(.4, '#e7b999'); clay.addColorStop(1, '#be8f71');
    c.fillStyle = clay; c.beginPath(); c.moveTo(37, 130); c.lineTo(48, 166);
    c.quadraticCurveTo(79, 177, 110, 166); c.lineTo(120, 130); c.closePath(); c.fill();
    oval(c, 79, 130, 42, 9, '#edc4a3'); oval(c, 79, 132, 34, 4.8, '#bd927250');
    line(c, [{ x: 47, y: 150 }, { x: 78, y: 155 }, { x: 111, y: 150 }], 2.2, '#f8d8b7');
    oval(c, 79, 150, 8, 7, '#fae4bf');
    line(c, [{ x: 75, y: 147 }, { x: 83, y: 153 }], 1, '#b28e6e');
    line(c, [{ x: 83, y: 147 }, { x: 75, y: 153 }], 1, '#b28e6e');
  });
}

function cushion(c: CanvasRenderingContext2D, x: number, y: number, color: string, angle: number): void {
  c.save(); c.translate(x, y); c.rotate(angle);
  oval(c, 0, 4, 25, 11, '#9f8e7020');
  c.fillStyle = color; c.beginPath(); c.moveTo(-24, -9); c.quadraticCurveTo(0, -20, 24, -9);
  c.quadraticCurveTo(29, 4, 23, 12); c.quadraticCurveTo(0, 18, -23, 12); c.quadraticCurveTo(-30, 2, -24, -9); c.fill();
  c.strokeStyle = '#fff0d68c'; c.lineWidth = 1; c.beginPath(); c.roundRect(-20, -7, 40, 17, 6); c.stroke();
  oval(c, 0, 0, 2, 1.5, '#967f634d'); c.restore();
}

function courtyardHome(scene: Phaser.Scene): string {
  return painting(scene, 'postal-desert-striped-home-v1', 380, 280, c => {
    oval(c, 194, 242, 169, 24, '#a2927120');
    // Posts sit beyond the mail plaza edges; the open front never hides the recipient.
    for (const x of [29, 349]) {
      line(c, [{ x, y: 70 }, { x: x + (x < 100 ? -2 : 2), y: 252 }], 8, '#b39c77');
      line(c, [{ x: x - 1, y: 73 }, { x: x - 2, y: 245 }], 2, '#e7d0a6');
    }
    const roof = new Path2D(); roof.moveTo(50, 24); roof.quadraticCurveTo(184, 4, 329, 24);
    roof.lineTo(365, 87); roof.quadraticCurveTo(189, 110, 15, 87); roof.closePath();
    c.fillStyle = '#f6e5c0'; c.fill(roof); c.save(); c.clip(roof);
    for (let i = 0; i < 9; i++) {
      c.fillStyle = i % 2 ? '#efd5ab' : '#b9ba93'; c.beginPath();
      c.moveTo(41 + i * 35, 12); c.lineTo(68 + i * 35, 12); c.lineTo(57 + i * 40, 111); c.lineTo(25 + i * 40, 111); c.closePath(); c.fill();
    }
    c.restore();
    c.strokeStyle = '#fbecd28c'; c.lineWidth = 2; c.beginPath(); c.moveTo(53, 27); c.quadraticCurveTo(188, 9, 326, 27); c.stroke();
    for (let i = 0; i < 10; i++) {
      c.fillStyle = i % 2 ? '#ebcfa6' : '#acb28e'; c.beginPath(); c.moveTo(16 + i * 35, 86);
      c.lineTo(51 + i * 35, 86); c.quadraticCurveTo(40 + i * 35, 116, 16 + i * 35, 94); c.closePath(); c.fill();
    }
    // Five visible cushions support the separate sixth-cushion discovery down the path.
    const seats = [[69, 215, -.15], [116, 242, .1], [267, 242, -.1], [318, 211, .15], [189, 249, -.05]];
    seats.forEach(([x, y, angle], i) => cushion(c, x, y, ['#d9baa3', '#bfc9a4', '#e9cfa6', '#c7b8ad', '#b8c6b0'][i], angle));
    pot(c, 44, 242, .9, true); pot(c, 337, 246, .82);
  });
}

function washingLine(scene: Phaser.Scene): string {
  return painting(scene, 'postal-desert-washing-v1', 278, 156, c => {
    for (const x of [19, 257]) {
      oval(c, x, 145, 15, 5, '#ae947020'); line(c, [{ x, y: 29 }, { x: x - 2, y: 143 }], 5, '#b69d79');
    }
    c.strokeStyle = '#ae9370'; c.lineWidth = 1.8; c.beginPath(); c.moveTo(19, 40); c.quadraticCurveTo(138, 57, 257, 39); c.stroke();
    for (let i = 0; i < 3; i++) {
      const x = 42 + i * 70, y = 44 + (i % 2 ? 6 : 1);
      c.fillStyle = ['#edcfaa', '#b9c7ad', '#e6baaa'][i]; c.beginPath(); c.moveTo(x, y); c.lineTo(x + 52, y + 2);
      c.quadraticCurveTo(x + 47, y + 35, x + 54, y + 60); c.quadraticCurveTo(x + 28, y + 69, x - 2, y + 58);
      c.quadraticCurveTo(x + 5, y + 31, x, y); c.fill();
      for (let stripe = 1; stripe < 5; stripe++) line(c,
        [{ x: x + stripe * 10, y: y + 7 }, { x: x + stripe * 10 - 2, y: y + 53 }], 2, '#fcf0d76b');
      for (const pin of [x + 8, x + 44]) line(c, [{ x: pin, y: y - 3 }, { x: pin - 1, y: y + 9 }], 3, '#b18a68');
      if (i === 1) { oval(c, x + 26, y + 33, 10, 8, '#e6d5ad'); oval(c, x + 23, y + 31, 1, 1, '#95996f'); oval(c, x + 29, y + 31, 1, 1, '#95996f'); }
    }
    sprig(c, 30, 143, 10); sprig(c, 251, 143, 9);
  });
}

function desertPost(scene: Phaser.Scene): string {
  return painting(scene, 'postal-desert-post-v1', 132, 170, c => {
    oval(c, 65, 154, 46, 9, '#9e896b25');
    line(c, [{ x: 64, y: 58 }, { x: 65, y: 149 }], 9, '#b89d7b');
    c.fillStyle = '#d9b58c'; c.beginPath(); c.roundRect(24, 62, 82, 54, 8); c.fill();
    c.fillStyle = '#e9d0a5'; c.beginPath(); c.moveTo(16, 64); c.quadraticCurveTo(65, 34, 114, 64);
    c.quadraticCurveTo(65, 71, 16, 64); c.fill();
    c.fillStyle = '#fff0d0'; c.beginPath(); c.roundRect(42, 75, 44, 27, 3); c.fill();
    line(c, [{ x: 44, y: 78 }, { x: 64, y: 90 }, { x: 84, y: 78 }], 1.3, '#b69b77');
    line(c, [{ x: 64, y: 44 }, { x: 64, y: 20 }], 2.3, '#b59970');
    c.fillStyle = '#b7be97'; c.beginPath(); c.moveTo(66, 21); c.quadraticCurveTo(85, 12, 103, 22);
    c.lineTo(96, 34); c.quadraticCurveTo(79, 24, 66, 31); c.closePath(); c.fill();
    pot(c, 89, 151, .72, true); sprig(c, 40, 151, 8);
  });
}

function sixthCushion(scene: Phaser.Scene): string {
  return painting(scene, 'postal-desert-sixth-cushion-v1', 96, 84, c => {
    c.save(); c.translate(47, 44); c.scale(1.35, 1.35);
    cushion(c, 0, 0, '#b8c8b0', -.05); c.restore();
    // A stitched kitten outline makes this seat visibly different from the five at home.
    c.strokeStyle = '#6d89738c'; c.lineWidth = 1.6; c.lineJoin = c.lineCap = 'round'; c.beginPath();
    c.moveTo(36, 45); c.lineTo(35, 33); c.lineTo(42, 37); c.quadraticCurveTo(48, 34, 54, 37);
    c.lineTo(61, 32); c.lineTo(62, 45); c.quadraticCurveTo(48, 57, 36, 45); c.stroke();
    oval(c, 43, 43, 1.2, 1.2, '#6d8973'); oval(c, 55, 43, 1.2, 1.2, '#6d8973');
    c.save(); c.translate(78, 52); c.rotate(.15); c.fillStyle = '#fff0d1';
    c.beginPath(); c.roundRect(-9, -7, 18, 16, 2); c.fill();
    line(c, [{ x: -5, y: -2 }, { x: 4, y: -2 }], 1, '#b6a17c');
    line(c, [{ x: -5, y: 3 }, { x: 1, y: 3 }], 1, '#b6a17c'); c.restore();
  });
}

/** Static scenery only. The scene owns all puzzle cloth, targets, shade, text and discovery state. */
export function drawDesertLandmarks(scene: Phaser.Scene): void {
  scene.add.image(DESERT_SPAWN.x - 77, DESERT_SPAWN.y - 34, desertPost(scene)).setOrigin(.5, .9).setDepth(4);
  const laundry = washingLine(scene);
  scene.add.image(936, 1390, laundry).setOrigin(.5, .9).setDepth(3);
  scene.add.image(1848, 933, laundry).setOrigin(.5, .9).setDepth(3).setFlipX(true);
  scene.add.image(DESERT_NPC.x, DESERT_NPC.y, courtyardHome(scene)).setOrigin(.5, .81).setDepth(3);
  scene.add.image(DESERT_NPC.x, DESERT_NPC.y, cactusFriend(scene)).setOrigin(.5, .9).setDisplaySize(114, 138).setDepth(5);
  scene.add.image(DESERT_DISCOVERY.x, DESERT_DISCOVERY.y, sixthCushion(scene)).setOrigin(.5, .65).setDepth(3);
}
