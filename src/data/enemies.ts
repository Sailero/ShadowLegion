export interface WaveSpawn {
  type: string;
  min: number;
  max: number;
  elite?: boolean;
}

export interface WaveDef {
  spawns: WaveSpawn[];
  isBoss?: boolean;
  bossType?: string;
}

const S = (type: string, min: number, max: number, elite = false): WaveSpawn =>
  ({ type, min, max, elite });

const W = (...spawns: WaveSpawn[]): WaveDef => ({ spawns });

const Boss = (bossType: string, ...spawns: WaveSpawn[]): WaveDef =>
  ({ spawns, isBoss: true, bossType });

export const LEVEL_WAVES: WaveDef[][] = [
  // Level 1 — gentle introduction
  [
    W(S('slime', 3, 4)),
    W(S('slime', 4, 5), S('bat', 1, 2)),
    W(S('slime', 4, 6), S('bat', 2, 3)),
    W(S('slime', 5, 6), S('bat', 2, 4), S('archer', 1, 1)),
    W(S('slime', 5, 7), S('bat', 3, 4), S('archer', 1, 2)),
    W(S('slime', 5, 7), S('bat', 3, 5), S('archer', 2, 3)),
    W(S('slime', 6, 8), S('bat', 4, 5), S('archer', 2, 3), S('tank', 1, 1)),
    W(S('slime', 6, 8), S('bat', 4, 6), S('archer', 2, 3), S('tank', 1, 2)),
    W(S('slime', 7, 9), S('bat', 4, 6), S('archer', 3, 4), S('tank', 1, 2)),
    Boss('tank', S('slime', 4, 4), S('bat', 3, 3), S('archer', 2, 2)),
  ],
  // Level 2 — harder with elites
  [
    W(S('slime', 6, 8), S('bat', 3, 5), S('archer', 2, 3)),
    W(S('slime', 7, 9), S('bat', 4, 6), S('archer', 2, 4), S('tank', 1, 1)),
    W(S('slime', 7, 9), S('bat', 4, 6), S('archer', 3, 4), S('tank', 1, 2)),
    W(S('slime', 8, 10), S('bat', 5, 7), S('archer', 3, 5), S('tank', 2, 2)),
    W(S('slime', 8, 10), S('bat', 5, 7), S('archer', 3, 5), S('tank', 2, 3), S('bat', 1, 1, true)),
    W(S('slime', 9, 11), S('bat', 6, 8), S('archer', 4, 5), S('tank', 2, 3), S('slime', 1, 2, true)),
    W(S('slime', 9, 12), S('bat', 6, 8), S('archer', 4, 6), S('tank', 2, 3), S('archer', 1, 1, true)),
    W(S('slime', 10, 12), S('bat', 7, 9), S('archer', 4, 6), S('tank', 3, 4), S('tank', 1, 1, true)),
    W(S('slime', 10, 13), S('bat', 7, 9), S('archer', 5, 7), S('tank', 3, 4), S('bat', 1, 2, true)),
    Boss('archer', S('slime', 6, 6), S('bat', 4, 4), S('archer', 3, 3), S('tank', 2, 2), S('slime', 1, 1, true)),
  ],
  // Level 3 — full challenge
  [
    W(S('slime', 8, 10), S('bat', 5, 7), S('archer', 3, 5), S('tank', 2, 3)),
    W(S('slime', 9, 11), S('bat', 6, 8), S('archer', 4, 5), S('tank', 2, 3), S('slime', 1, 2, true)),
    W(S('slime', 10, 12), S('bat', 7, 9), S('archer', 4, 6), S('tank', 3, 4), S('bat', 1, 2, true)),
    W(S('slime', 10, 13), S('bat', 7, 9), S('archer', 5, 6), S('tank', 3, 4), S('archer', 1, 2, true)),
    W(S('slime', 11, 14), S('bat', 8, 10), S('archer', 5, 7), S('tank', 3, 4), S('tank', 1, 2, true)),
    W(S('slime', 12, 14), S('bat', 8, 10), S('archer', 5, 7), S('tank', 4, 5), S('slime', 2, 3, true)),
    W(S('slime', 12, 15), S('bat', 9, 11), S('archer', 6, 8), S('tank', 4, 5), S('bat', 2, 3, true)),
    W(S('slime', 13, 16), S('bat', 9, 12), S('archer', 6, 8), S('tank', 4, 5), S('archer', 2, 3, true)),
    W(S('slime', 14, 16), S('bat', 10, 12), S('archer', 7, 9), S('tank', 5, 6), S('tank', 2, 3, true)),
    Boss('tank', S('slime', 8, 8), S('bat', 6, 6), S('archer', 5, 5), S('tank', 3, 3), S('slime', 2, 2, true), S('archer', 1, 1, true)),
  ],
];
