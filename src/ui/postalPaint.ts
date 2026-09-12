import type Phaser from 'phaser';

/** Immutable, scene-independent paintings. These helpers never touch collision or journey state. */
function painting(scene: Phaser.Scene, key: string, width: number, height: number,
  draw: (context: CanvasRenderingContext2D) => void): string {
  if (scene.textures.exists(key)) return key;
  const texture = scene.textures.createCanvas(key, width, height);
  if (!texture) return key;
  const c = texture.context;
  c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
  draw(c);
  // The existing watercolor paper provides the same grain as the cover and kitten.
  if (scene.textures.exists('paper-grain')) {
    c.save(); c.globalCompositeOperation = 'source-atop'; c.globalAlpha = .10;
    c.drawImage(scene.textures.get('paper-grain').getSourceImage() as HTMLCanvasElement, 0, 0, width, height); c.restore();
  }
  texture.refresh();
  return key;
}

function ellipse(c: CanvasRenderingContext2D, x: number, y: number, rx: number, ry: number, color: string, angle = 0): void {
  c.fillStyle = color; c.beginPath(); c.ellipse(x, y, rx, ry, angle, 0, Math.PI * 2); c.fill();
}

function stroke(c: CanvasRenderingContext2D, color: string, width: number, points: readonly (readonly number[])[]): void {
  c.strokeStyle = color; c.lineWidth = width; c.lineCap = c.lineJoin = 'round';
  c.beginPath(); points.forEach(([x, y], index) => index ? c.lineTo(x, y) : c.moveTo(x, y)); c.stroke();
}

function blossom(c: CanvasRenderingContext2D, x: number, y: number, size: number, color: string): void {
  stroke(c, '#789771', 1.1, [[x - 1, y + size * 2.8], [x, y]]);
  ellipse(c, x - size * .7, y + size * 1.5, size * .85, size * .3, '#a1b88b', -.5);
  for (let i = 0; i < 5; i++) {
    const a = i * Math.PI * .4;
    ellipse(c, x + Math.cos(a) * size * .62, y + Math.sin(a) * size * .56, size * .52, size * .36, color, a);
  }
  ellipse(c, x, y, size * .25, size * .23, '#c9a158');
}

function plantBed(c: CanvasRenderingContext2D, x: number, y: number, scale = 1): void {
  c.save(); c.translate(x, y); c.scale(scale, scale);
  ellipse(c, 0, 5, 59, 13, '#8da57d26');
  for (let i = 0; i < 27; i++) {
    const px = (i * 29 % 102) - 51, py = (i * 13 % 21) - 5;
    ellipse(c, px, py, 7 + i % 4, 2.8, i % 2 ? '#89a77a' : '#b0c195', (i % 5 - 2) * .4);
  }
  for (let i = 0; i < 13; i++) blossom(c, (i * 31 % 102) - 49, (i * 17 % 27) - 20, 4.4 + i % 3,
    ['#f8eed2', '#e7b59f', '#f4db9d', '#dacbcd'][i % 4]);
  c.restore();
}

export function forestFloor(scene: Phaser.Scene, width: number, height: number, riverLeft: number, riverRight: number): string {
  return painting(scene, 'postal-forest-floor-v1', width, height, c => {
    c.fillStyle = '#e4ebd2'; c.fillRect(0, 0, width, height);
    if (scene.textures.exists('ground-1')) {
      c.save(); c.globalAlpha = .23;
      const source = scene.textures.get('ground-1').getSourceImage() as HTMLCanvasElement;
      for (let y = 0; y < height; y += 768) for (let x = 0; x < width; x += 768) c.drawImage(source, x, y, 768, 768);
      c.restore();
    }
    for (let i = 0; i < 95; i++) {
      const x = i * 137 % width, y = i * 89 % height;
      const wash = c.createRadialGradient(x, y, 0, x, y, 60 + i % 35);
      wash.addColorStop(0, i % 3 ? '#b2c69435' : '#f5dfa940'); wash.addColorStop(1, '#b2c69400');
      c.fillStyle = wash; c.fillRect(x - 96, y - 96, 192, 192);
    }
    // The original path center lines and traversable widths are unchanged.
    const paths = [
      { width: 76, points: [[230, 1070], [360, 820], [300, 580], [610, 620], [1230, 620], [1300, 790], [1050, 975]] },
      { width: 46, points: [[300, 580], [205, 420], [350, 240], [590, 270], [625, 560]] },
    ];
    for (const path of paths) {
      stroke(c, '#dddec186', path.width + 15, path.points);
      stroke(c, '#ede4c8', path.width + 5, path.points);
      stroke(c, '#f3ebd2', path.width, path.points);
      stroke(c, '#f8efd940', path.width * .48, path.points);
    }
    c.fillStyle = '#afd0c6'; c.fillRect(riverLeft, 0, riverRight - riverLeft, height);
    const water = c.createLinearGradient(riverLeft, 0, riverRight, 0);
    water.addColorStop(0, '#d4e7cf'); water.addColorStop(.22, '#b7d8ca'); water.addColorStop(.7, '#afd0c8'); water.addColorStop(1, '#d2e2c9');
    c.fillStyle = water; c.fillRect(riverLeft, 0, riverRight - riverLeft, height);
    for (let y = 24; y < height; y += 52) {
      c.strokeStyle = '#e7eee085'; c.lineWidth = 1.7; c.beginPath();
      c.moveTo(riverLeft + 20, y); c.bezierCurveTo(riverLeft + 40, y + 6, riverLeft + 45, y - 4, riverLeft + 65, y); c.stroke();
      stroke(c, '#e1e9d765', 1.3, [[riverRight - 58, y + 19], [riverRight - 25, y + 22]]);
    }
    for (let i = 0; i < 72; i++) {
      const x = i % 2 ? riverLeft - 8 : riverRight + 8, y = 15 + i * 47 % height;
      // Keep the two existing bridge approaches visually open.
      if ((y > 490 && y < 715) || (y > 890 && y < 1060)) continue;
      ellipse(c, x, y + 3, 8, 3, '#aebfa175');
      stroke(c, '#8eae8875', 1.4, [[x - 4, y], [x - 7, y - 13], [x - 3, y - 7]]);
      stroke(c, '#8eae8875', 1.4, [[x + 2, y], [x + 5, y - 18]]);
    }
    for (let i = 0; i < 180; i++) {
      const x = 25 + i * 113 % (width - 50), y = 25 + i * 167 % (height - 50);
      if (x > riverLeft - 20 && x < riverRight + 20) continue;
      ellipse(c, x, y, 2.7, 1.2, i % 3 ? '#829d7055' : '#c9b48266', i % 4);
      if (i % 9 === 0) blossom(c, x, y - 4, 3.1, '#f4eed0');
    }
  });
}

export function flowerBed(scene: Phaser.Scene): string {
  return painting(scene, 'postal-flower-bed-v1', 152, 100, c => plantBed(c, 76, 65, 1.17));
}

export function mossStone(scene: Phaser.Scene): string {
  return painting(scene, 'postal-moss-stone-v1', 146, 114, c => {
    ellipse(c, 77, 91, 58, 13, '#86967b27');
    c.fillStyle = '#a5ada1'; c.beginPath(); c.moveTo(21, 76); c.bezierCurveTo(27, 46, 39, 24, 72, 22);
    c.bezierCurveTo(100, 16, 122, 35, 127, 67); c.quadraticCurveTo(137, 91, 92, 97); c.quadraticCurveTo(36, 101, 21, 76); c.fill();
    c.fillStyle = '#c6c9b7'; c.beginPath(); c.moveTo(30, 63); c.quadraticCurveTo(45, 24, 74, 27); c.quadraticCurveTo(102, 19, 113, 46);
    c.quadraticCurveTo(74, 65, 30, 63); c.fill();
    stroke(c, '#858e8045', 2, [[74, 60], [83, 77], [82, 92]]);
    for (let i = 0; i < 24; i++) ellipse(c, 32 + i * 17 % 87, 38 + i * 13 % 24, 7 + i % 5, 3 + i % 3,
      ['#91a677a0', '#a9b98c', '#bccc98a0'][i % 3], i * .3);
    plantBed(c, 31, 86, .38); blossom(c, 100, 38, 4, '#f1e8c9');
  });
}

export function postalCottage(scene: Phaser.Scene, roofColor: number): string {
  const key = `postal-cottage-${roofColor.toString(16)}-v1`;
  return painting(scene, key, 320, 280, c => {
    const roof = `#${roofColor.toString(16).padStart(6, '0')}`;
    ellipse(c, 169, 249, 123, 17, '#7f806326');
    c.fillStyle = '#e5d4b1'; c.beginPath(); c.moveTo(70, 120); c.quadraticCurveTo(159, 99, 250, 122);
    c.lineTo(248, 238); c.quadraticCurveTo(158, 253, 72, 239); c.closePath(); c.fill();
    c.fillStyle = '#f3e3c3'; c.beginPath(); c.moveTo(76, 130); c.lineTo(238, 129); c.lineTo(239, 233); c.quadraticCurveTo(158, 243, 78, 232); c.closePath(); c.fill();
    c.fillStyle = '#b58e72'; c.beginPath(); c.roundRect(218, 47, 24, 60, 5); c.fill();
    stroke(c, '#d8bd96', 5, [[216, 51], [244, 51]]);
    // A softly sagging, layered tile roof instead of a geometric triangle.
    c.fillStyle = '#9d765b'; c.beginPath(); c.moveTo(36, 130); c.quadraticCurveTo(84, 66, 149, 36);
    c.quadraticCurveTo(170, 26, 185, 47); c.quadraticCurveTo(219, 95, 283, 134); c.quadraticCurveTo(163, 147, 36, 130); c.fill();
    c.fillStyle = roof; c.beginPath(); c.moveTo(44, 123); c.quadraticCurveTo(101, 51, 156, 36);
    c.quadraticCurveTo(201, 84, 274, 125); c.quadraticCurveTo(160, 139, 44, 123); c.fill();
    c.save(); c.clip();
    for (let row = 0; row < 7; row++) for (let col = 0; col < 11; col++) {
      const x = 32 + col * 26 + row % 2 * 13, y = 37 + row * 15;
      c.strokeStyle = row % 2 ? '#f7d0a337' : '#815e482c'; c.lineWidth = 1.4; c.beginPath();
      c.moveTo(x, y); c.quadraticCurveTo(x + 11, y + 9, x + 23, y + 1); c.stroke();
    }
    c.restore();
    stroke(c, '#b69772', 5, [[68, 135], [69, 233]]); stroke(c, '#bea381', 4, [[248, 137], [247, 232]]);
    for (const x of [105, 214]) {
      ellipse(c, x, 171, 21, 24, '#b49974'); ellipse(c, x, 170, 17, 20, '#eed69d');
      ellipse(c, x - 4, 163, 9, 11, '#f8e9bd'); stroke(c, '#b39b73', 2.2, [[x, 151], [x, 189]]);
      stroke(c, '#b39b73', 2.2, [[x - 15, 172], [x + 15, 172]]);
      stroke(c, '#bfa681', 5, [[x - 22, 193], [x + 23, 193]]);
    }
    c.fillStyle = '#aa8c67'; c.beginPath(); c.moveTo(138, 239); c.lineTo(138, 196); c.bezierCurveTo(138, 169, 181, 169, 181, 196);
    c.lineTo(181, 239); c.closePath(); c.fill();
    for (let x = 145; x < 181; x += 9) stroke(c, '#d1b08665', 1, [[x, 192], [x, 235]]);
    ellipse(c, 171, 215, 2.6, 2.6, '#f3d59a');
    stroke(c, '#d2c7ad', 9, [[134, 244], [185, 244]]);
    // Flower boxes and climbing leaves give both homes the atlas tree's garden palette.
    plantBed(c, 96, 215, .46); plantBed(c, 227, 227, .55);
    stroke(c, '#859771', 1.6, [[74, 225], [66, 192], [76, 169], [67, 141]]);
    for (let i = 0; i < 9; i++) ellipse(c, 65 + i % 2 * 13, 149 + i * 8, 7, 3.2, i % 2 ? '#a4b688' : '#859e79', i % 2 ? -.5 : .5);
    blossom(c, 67, 156, 4.5, '#f1dfb9'); blossom(c, 78, 195, 4, '#ecd6bb');
  });
}
