import { GAME_CONFIG, TerrainType } from '../config/gameConfig';
import { HexTile } from './HexTile';

export interface AxialCoord {
  q: number;
  r: number;
}

export interface PixelCoord {
  x: number;
  y: number;
}

const DIRECTIONS: AxialCoord[] = [
  { q: 1, r: 0 },
  { q: 1, r: -1 },
  { q: 0, r: -1 },
  { q: -1, r: 0 },
  { q: -1, r: 1 },
  { q: 0, r: 1 },
];

export class HexGrid {
  readonly cols: number;
  readonly rows: number;
  readonly radius: number;
  readonly offsetX: number;
  readonly offsetY: number;
  private tiles: Map<string, HexTile> = new Map();

  constructor() {
    this.cols = GAME_CONFIG.HEX.GRID_COLS;
    this.rows = GAME_CONFIG.HEX.GRID_ROWS;
    this.radius = GAME_CONFIG.HEX.RADIUS;
    this.offsetX = GAME_CONFIG.HEX.OFFSET_X;
    this.offsetY = GAME_CONFIG.HEX.OFFSET_Y;
  }

  static coordKey(q: number, r: number): string {
    return `${q},${r}`;
  }

  initialize(): void {
    this.tiles.clear();
    for (let r = 0; r < this.rows; r++) {
      for (let q = 0; q < this.cols; q++) {
        const terrain = this.generateTerrain(q, r);
        const tile = new HexTile(q, r, terrain);
        this.tiles.set(HexGrid.coordKey(q, r), tile);
      }
    }
  }

  private generateTerrain(q: number, r: number): TerrainType {
    const seed = Math.sin(q * 12.9898 + r * 78.233) * 43758.5453;
    const noise = seed - Math.floor(seed);

    if (noise < 0.08) return 'WATER';
    if (noise < 0.15) return 'HIGHLAND';
    if (noise < 0.25) return 'FOREST';
    if (noise < 0.30) return 'RESOURCE';
    return 'PLAIN';
  }

  getTile(q: number, r: number): HexTile | undefined {
    return this.tiles.get(HexGrid.coordKey(q, r));
  }

  getAllTiles(): HexTile[] {
    return Array.from(this.tiles.values());
  }

  isValidCoord(q: number, r: number): boolean {
    return q >= 0 && q < this.cols && r >= 0 && r < this.rows;
  }

  axialToPixel(q: number, r: number): PixelCoord {
    const size = this.radius;
    const x = size * (Math.sqrt(3) * q + (Math.sqrt(3) / 2) * r) + this.offsetX;
    const y = size * (1.5 * r) + this.offsetY;
    return { x, y };
  }

  pixelToAxial(px: number, py: number): AxialCoord {
    const size = this.radius;
    const x = px - this.offsetX;
    const y = py - this.offsetY;

    const q = (Math.sqrt(3) / 3 * x - 1 / 3 * y) / size;
    const r = (2 / 3 * y) / size;

    return this.axialRound(q, r);
  }

  private axialRound(q: number, r: number): AxialCoord {
    const s = -q - r;
    let rq = Math.round(q);
    let rr = Math.round(r);
    const rs = Math.round(s);

    const qDiff = Math.abs(rq - q);
    const rDiff = Math.abs(rr - r);
    const sDiff = Math.abs(rs - s);

    if (qDiff > rDiff && qDiff > sDiff) {
      rq = -rr - rs;
    } else if (rDiff > sDiff) {
      rr = -rq - rs;
    }

    return { q: rq, r: rr };
  }

  getNeighbors(q: number, r: number): AxialCoord[] {
    return DIRECTIONS
      .map(d => ({ q: q + d.q, r: r + d.r }))
      .filter(c => this.isValidCoord(c.q, c.r));
  }

  getDistance(a: AxialCoord, b: AxialCoord): number {
    return (Math.abs(a.q - b.q) + Math.abs(a.q + a.r - b.q - b.r) + Math.abs(a.r - b.r)) / 2;
  }

  getReachable(start: AxialCoord, moveRange: number, blockedSet?: Set<string>): AxialCoord[] {
    const visited = new Set<string>();
    const result: AxialCoord[] = [];
    const queue: { coord: AxialCoord; steps: number }[] = [{ coord: start, steps: 0 }];

    visited.add(HexGrid.coordKey(start.q, start.r));

    while (queue.length > 0) {
      const { coord, steps } = queue.shift()!;
      result.push(coord);

      if (steps >= moveRange) continue;

      for (const neighbor of this.getNeighbors(coord.q, coord.r)) {
        const key = HexGrid.coordKey(neighbor.q, neighbor.r);
        if (visited.has(key)) continue;

        const tile = this.getTile(neighbor.q, neighbor.r);
        if (!tile || tile.terrain === 'WATER') continue;
        if (blockedSet?.has(key)) continue;

        visited.add(key);
        queue.push({ coord: neighbor, steps: steps + 1 });
      }
    }

    return result;
  }

  getRing(center: AxialCoord, radius: number): AxialCoord[] {
    if (radius <= 0) return [center];

    const results: AxialCoord[] = [];
    let hex: AxialCoord = {
      q: center.q + DIRECTIONS[4].q * radius,
      r: center.r + DIRECTIONS[4].r * radius,
    };

    for (let i = 0; i < 6; i++) {
      for (let j = 0; j < radius; j++) {
        if (this.isValidCoord(hex.q, hex.r)) {
          results.push({ ...hex });
        }
        hex = { q: hex.q + DIRECTIONS[i].q, r: hex.r + DIRECTIONS[i].r };
      }
    }

    return results;
  }

  getRange(center: AxialCoord, range: number): AxialCoord[] {
    const results: AxialCoord[] = [];
    for (let dq = -range; dq <= range; dq++) {
      for (let dr = Math.max(-range, -dq - range); dr <= Math.min(range, -dq + range); dr++) {
        const q = center.q + dq;
        const r = center.r + dr;
        if (this.isValidCoord(q, r)) {
          results.push({ q, r });
        }
      }
    }
    return results;
  }

  drawHexagon(graphics: Phaser.GameObjects.Graphics, cx: number, cy: number, radius: number): void {
    const points: { x: number; y: number }[] = [];
    for (let i = 0; i < 6; i++) {
      const angle = (Math.PI / 3) * i - Math.PI / 6;
      points.push({
        x: cx + radius * Math.cos(angle),
        y: cy + radius * Math.sin(angle),
      });
    }

    graphics.beginPath();
    graphics.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < 6; i++) {
      graphics.lineTo(points[i].x, points[i].y);
    }
    graphics.closePath();
  }
}
