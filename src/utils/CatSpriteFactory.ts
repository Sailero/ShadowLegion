import type Phaser from 'phaser';
import { CAT_FRAME_COUNTS, CAT_FRAME_SIZE, CAT_IDLE_DURATIONS, getCatPose, type CatMotionName, type CatPose } from '../data/catMotion';
import { OPERATIVE_VISUALS } from '../data/operativeVisuals';
import type { OperativeId } from '../data/operatives';
import { catAnimationKey, catAtlasKey, type CatAppearance } from '../systems/CatAnimator';

type PartName = 'head' | 'body' | 'tail' | 'bag' | 'leftArm' | 'rightArm' | 'leftLeg' | 'rightLeg';
type Parts = Record<PartName, HTMLCanvasElement>;
// Measured from the alpha components of puppet-v2, not an assumed equal-cell grid.
const PARTS: Record<PartName, { rect: [number, number, number, number]; seed: [number, number] }> = {
  head: { rect: [20, 90, 410, 396], seed: [230, 280] },
  body: { rect: [416, 150, 450, 367], seed: [630, 330] },
  tail: { rect: [830, 74, 365, 443], seed: [1000, 300] },
  bag: { rect: [1216, 214, 272, 255], seed: [1360, 330] },
  leftArm: { rect: [119, 618, 239, 297], seed: [220, 780] },
  rightArm: { rect: [496, 611, 216, 267], seed: [610, 730] },
  leftLeg: { rect: [866, 587, 222, 350], seed: [980, 750] },
  rightLeg: { rect: [1242, 586, 217, 331], seed: [1340, 750] },
};

function canvas(width: number, height: number): HTMLCanvasElement {
  const result = document.createElement('canvas'); result.width = width; result.height = height; return result;
}

/** Keep the seeded part, its soft edge, and alpha; adjacent body/whisker fragments are excluded. */
function extractPart(source: CanvasImageSource, name: PartName): HTMLCanvasElement {
  const { rect: [x, y, width, height], seed } = PARTS[name];
  const result = canvas(width, height), c = result.getContext('2d')!;
  c.drawImage(source, x, y, width, height, 0, 0, width, height);
  const pixels = c.getImageData(0, 0, width, height), data = pixels.data;
  const connected = new Uint8Array(width * height), queue = new Uint32Array(width * height);
  let read = 0, write = 0;
  const start = (seed[1] - y) * width + seed[0] - x;
  connected[start] = 1; queue[write++] = start;
  while (read < write) {
    const pixel = queue[read++], px = pixel % width;
    for (const next of [px > 0 ? pixel - 1 : -1, px < width - 1 ? pixel + 1 : -1, pixel - width, pixel + width]) {
      if (next < 0 || next >= connected.length || connected[next] || data[next * 4 + 3] <= 16) continue;
      connected[next] = 1; queue[write++] = next;
    }
  }
  for (let pixel = 0; pixel < connected.length; pixel++) {
    if (data[pixel * 4 + 3] <= 4) { data[pixel * 4 + 3] = 0; continue; }
    if (connected[pixel]) continue;
    let edge = false;
    const px = pixel % width, py = Math.floor(pixel / width);
    for (let dy = -2; dy <= 2 && !edge; dy++) for (let dx = -2; dx <= 2 && !edge; dx++) {
      if (px + dx >= 0 && px + dx < width && py + dy >= 0 && py + dy < height && connected[(py + dy) * width + px + dx]) edge = true;
    }
    if (!edge) data[pixel * 4 + 3] = 0;
  }
  c.putImageData(pixels, 0, 0);
  return result;
}

/** Four small postal seals, placed on the cat's actual cape clasp or satchel. */
function badge(c: CanvasRenderingContext2D, role: OperativeId, x: number, y: number, radius: number): void {
  const colors = { ranger: '#c58451', gunner: '#b79844', warden: '#9a86aa', engineer: '#65968a' };
  c.save(); c.translate(x, y); c.fillStyle = colors[role]; c.strokeStyle = '#fff0cd'; c.lineWidth = radius * .15;
  c.beginPath();
  if (role === 'warden') { c.moveTo(0, -radius); c.quadraticCurveTo(radius * 1.6, -radius * .4, 0, radius); c.quadraticCurveTo(-radius * 1.6, -radius * .4, 0, -radius); }
  else if (role === 'engineer') for (let i = 0; i <= 6; i++) { const a = i * Math.PI / 3; c.lineTo(Math.cos(a) * radius, Math.sin(a) * radius); }
  else if (role === 'ranger') for (let i = 0; i <= 10; i++) { const a = i * Math.PI / 5 - Math.PI / 2, r = radius * (i % 2 ? .65 : 1); c.lineTo(Math.cos(a) * r, Math.sin(a) * r); }
  else c.roundRect(-radius * .85, -radius * .85, radius * 1.7, radius * 1.7, radius * .4);
  c.closePath(); c.fill(); c.stroke();
  c.strokeStyle = '#fff5df'; c.lineWidth = radius * .18; c.beginPath();
  c.moveTo(-radius * .5, -radius * .18); c.lineTo(0, radius * .15); c.lineTo(radius * .5, -radius * .18); c.stroke(); c.restore();
}

function drawPose(c: CanvasRenderingContext2D, parts: Parts, pose: CatPose, role: OperativeId): void {
  const part = (name: PartName, x: number, y: number, width: number, anchorX: number, anchorY: number, rotation = 0, extra?: (width: number, height: number) => void) => {
    const source = parts[name], height = width * source.height / source.width;
    c.save(); c.translate(x, y); c.rotate(rotation); c.translate(-width * anchorX, -height * anchorY);
    c.drawImage(source, 0, 0, width, height); extra?.(width, height); c.restore();
  };
  const dy = pose.bodyY;
  part('tail', 24, 45 + dy * .35, 17.6, .83, .88, pose.tail);
  part('leftLeg', 26.3, 41.4 + pose.leftFootY + dy * .25, 7.3, .45, .08, pose.leftLeg);
  part('rightLeg', 34.4, 41.5 + pose.rightFootY + dy * .25, 7.1, .5, .08, pose.rightLeg);
  part('body', 31, 27 + dy, 26.4, .5, .11, pose.bodyAngle);
  // Strap and bag hang behind the foreground paw and lag the torso's step.
  c.strokeStyle = '#a5844b'; c.lineWidth = 1.1; c.beginPath(); c.moveTo(35, 29 + dy); c.lineTo(22, 43 + dy); c.stroke();
  part('bag', 22.3, 40.5 + dy * .6, 12.7, .5, .3, pose.bag);
  part('leftArm', 24, 32 + dy, 9.3, .37, .12, pose.leftArm);
  part('rightArm', 37, 31.6 + dy, 10.7, .28, .12, pose.rightArm);
  badge(c, role, 29.9, 34.2 + dy, 2.25);
  // The neck stays attached; head articulation and blink are local to this part.
  part('head', 31.5, 28.8 + dy * .6 + pose.headY, 27.8, .5, .88, pose.headAngle, (width, height) => {
    if (!pose.blink) return;
    for (const [nx, ny, angle] of [[.405, .616, -.15], [.699, .494, -.2]]) {
      c.save(); c.translate(width * nx, height * ny); c.rotate(angle);
      c.fillStyle = '#e9d8c1'; c.beginPath(); c.ellipse(0, 0, width * .067, height * .067, 0, 0, Math.PI * 2); c.fill();
      c.strokeStyle = '#807367'; c.lineWidth = .45; c.beginPath(); c.moveTo(-width * .05, -.2);
      c.quadraticCurveTo(0, height * .035, width * .05, -.2); c.stroke(); c.restore();
    }
  });
}

function copyTexture(scene: Phaser.Scene, key: string, source: CanvasImageSource, width: number, height: number): void {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const texture = scene.textures.createCanvas(key, width, height);
  if (!texture) return;
  texture.context.imageSmoothingEnabled = true; texture.context.imageSmoothingQuality = 'high';
  texture.context.drawImage(source, 0, 0, width, height); texture.refresh();
}

export class CatSpriteFactory {
  static createAll(scene: Phaser.Scene): boolean {
    if (!scene.textures.exists('mailcat-puppet') || !scene.textures.exists('mailcat-portrait')) return false;
    const source = scene.textures.get('mailcat-puppet').getSourceImage() as HTMLImageElement;
    const parts = Object.fromEntries((Object.keys(PARTS) as PartName[]).map(name => [name, extractPart(source, name)])) as Parts;
    const appearances: CatAppearance[] = [...Object.keys(OPERATIVE_VISUALS) as OperativeId[], 'echo', 'mirror'];
    for (const appearance of appearances) {
      const role: OperativeId = appearance === 'echo' || appearance === 'mirror' ? 'ranger' : appearance;
      this.bake(scene, parts, appearance, role, CAT_FRAME_SIZE, false);
      if (appearance !== 'echo' && appearance !== 'mirror') this.bake(scene, parts, appearance, role, 112, true);
    }
    this.portraits(scene);
    return true;
  }

  private static bake(scene: Phaser.Scene, parts: Parts, appearance: CatAppearance, role: OperativeId, size: number, avatar: boolean): void {
    const key = catAtlasKey(appearance, avatar);
    if (scene.textures.exists(key)) scene.textures.remove(key);
    const rows = Math.ceil(Object.values(CAT_FRAME_COUNTS).reduce((sum, count) => sum + count, 0) / 8);
    const texture = scene.textures.createCanvas(key, size * 8, size * rows);
    if (!texture) return;
    const scratch = canvas(224, 224), c = scratch.getContext('2d')!;
    let offset = 0;
    for (const motion of Object.keys(CAT_FRAME_COUNTS) as CatMotionName[]) {
      const frames: Phaser.Types.Animations.AnimationFrame[] = [];
      for (let frame = 0; frame < CAT_FRAME_COUNTS[motion]; frame++, offset++) {
        c.clearRect(0, 0, 224, 224); c.save(); c.scale(4, 4);
        drawPose(c, parts, getCatPose(motion, frame), role); c.restore();
        if (appearance === 'echo' || appearance === 'mirror') {
          c.save(); c.globalCompositeOperation = 'source-atop'; c.globalAlpha = appearance === 'echo' ? .3 : .16;
          c.fillStyle = appearance === 'echo' ? '#a0d6c5' : '#e8b677'; c.fillRect(0, 0, 224, 224); c.restore();
        }
        const x = offset % 8 * size, y = Math.floor(offset / 8) * size;
        texture.context.imageSmoothingEnabled = true; texture.context.imageSmoothingQuality = 'high';
        texture.context.drawImage(scratch, x, y, size, size);
        const name = `${motion}-${frame}`;
        texture.add(name, 0, x, y, size, size);
        frames.push({ key, frame: name, ...(motion === 'idle' || motion === 'hold' ? { duration: CAT_IDLE_DURATIONS[frame] - 100 } : {}) });
        if (offset === 0 && !avatar) {
          const legacy = appearance === 'echo' ? 'shadow_fox' : appearance === 'mirror' ? 'shadow_cat_rival' : OPERATIVE_VISUALS[role].heroTexture;
          copyTexture(scene, legacy, scratch, CAT_FRAME_SIZE, CAT_FRAME_SIZE);
          if (appearance === 'ranger') copyTexture(scene, 'hero', scratch, CAT_FRAME_SIZE, CAT_FRAME_SIZE);
        }
      }
      const animation = catAnimationKey(appearance, motion, avatar);
      if (scene.anims.exists(animation)) scene.anims.remove(animation);
      scene.anims.create({ key: animation, frames, frameRate: motion === 'idle' || motion === 'hold' ? 10 : motion === 'run' || motion === 'carry' ? 1000 / 85 : motion === 'dash' ? 4 / .18 : 6,
        repeat: motion === 'idle' || motion === 'run' || motion === 'hold' || motion === 'carry' ? -1 : 0 });
    }
    texture.refresh();
  }

  private static portraits(scene: Phaser.Scene): void {
    const source = scene.textures.get('mailcat-portrait').getSourceImage() as HTMLImageElement;
    const ratio = 272 / source.height, width = source.width * ratio;
    for (const role of Object.keys(OPERATIVE_VISUALS) as OperativeId[]) {
      const picture = canvas(280, 280), c = picture.getContext('2d')!;
      c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
      c.drawImage(source, (280 - width) / 2, 4, width, 272);
      badge(c, role, (280 - width) / 2 + width * .65, 4 + 272 * .418, 7);
      copyTexture(scene, OPERATIVE_VISUALS[role].portraitTexture, picture, 280, 280);
      if (role === 'ranger') for (const key of ['traveler-portrait', 'portrait_hero']) copyTexture(scene, key, picture, 280, 280);
    }
    const echo = canvas(280, 280), c = echo.getContext('2d')!;
    c.drawImage(scene.textures.get('traveler-portrait').getSourceImage() as HTMLCanvasElement, 0, 0);
    c.globalCompositeOperation = 'source-atop'; c.globalAlpha = .28; c.fillStyle = '#a0d6c5'; c.fillRect(0, 0, 280, 280);
    copyTexture(scene, 'portrait_shadow', echo, 280, 280);
  }
}
