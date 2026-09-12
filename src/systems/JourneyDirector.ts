export type JourneyEvent = 'dash' | 'skill' | 'command' | 'terrainHit' | 'shadowDefeat';
export interface JourneyObjective {
  id: string;
  title: string;
  description: string;
  progress: number;
  target: number;
  completed: boolean;
}

/** Small chapter goals reinforce combat decisions; progress never interrupts play. */
export class JourneyDirector {
  private counts: Record<JourneyEvent, number> = { dash: 0, skill: 0, command: 0, terrainHit: 0, shadowDefeat: 0 };
  private guardedWaves = 0;
  private claimed = new Set<string>();

  constructor(private chapterId: number, private shadowTrial = false) {}

  record(event: JourneyEvent, count = 1): void {
    if (Number.isFinite(count) && count > 0) this.counts[event] += Math.floor(count);
  }

  finishWave(coreRatio: number): void {
    if (Number.isFinite(coreRatio) && coreRatio >= 0.6) this.guardedWaves++;
  }

  getObjectives(): JourneyObjective[] {
    const make = (id: string, title: string, description: string, progress: number, target: number): JourneyObjective =>
      ({ id, title, description, progress: Math.min(target, progress), target, completed: progress >= target });
    const result = [
      make('together', '默契开张', '按 E 切换一次影伴的同行 / 守营安排', this.counts.command, 1),
      make('camp', '留一盏灯', '在营地生命不低于 60% 时完成 3 波', this.guardedWaves, 3),
    ];
    if (this.shadowTrial) result.push(make('mirror', '和昨天击个掌', '完成本章第 3 波的镜像切磋', this.counts.shadowDefeat, 1));
    else if (this.chapterId === 1) result.push(make('dash', '轻快脚步', '使用 3 次闪避，熟悉穿行与回防', this.counts.dash, 3));
    else if (this.chapterId === 4) result.push(make('terrain', '借一束烟花', '让灯带脉冲命中 3 次对手', this.counts.terrainHit, 3));
    else if (this.chapterId === 2) result.push(make('terrain', '软沙慢半拍', '攻击软沙带中的对手 3 次，借减速截击', this.counts.terrainHit, 3));
    else result.push(make('terrain', '潮水帮帮忙', '攻击涨潮水道中的对手 3 次，借潮水截击', this.counts.terrainHit, 3));
    return result;
  }

  /** Consume exactly once. Arena grants +15 charge and 5% camp repair per stamp. */
  claimRewards(): number {
    let earned = 0;
    for (const objective of this.getObjectives()) {
      if (objective.completed && !this.claimed.has(objective.id)) {
        this.claimed.add(objective.id);
        earned++;
      }
    }
    return earned;
  }

  get completedCount(): number { return this.getObjectives().filter(item => item.completed).length; }
}
