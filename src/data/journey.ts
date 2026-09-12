/** Stable narrative IDs. Planned regions are never unlocked by old combat progress. */
export const JOURNEY_REGION_IDS = ['forest', 'lake', 'mountain', 'desert', 'snow'] as const;
export type JourneyRegionId = typeof JOURNEY_REGION_IDS[number];
export const JOURNEY_VERSION = 3;
export const JOURNEY_NODE_IDS = {
  forest: ['forest.recipient', 'forest.address', 'forest.landmark'],
  lake: ['lake.midDocked', 'lake.mailDocked'],
  mountain: ['mountain.signalLearned', 'mountain.passOpened'], desert: [], snow: [],
} as const;
export type JourneyNodeId = typeof JOURNEY_NODE_IDS[JourneyRegionId][number];
export const JOURNEY_DISCOVERY_IDS = ['lake.picnicCloth', 'mountain.sharedChime'] as const;
export type JourneyDiscoveryId = typeof JOURNEY_DISCOVERY_IDS[number];
export type LakeCheckpoint = 'start' | 'mid' | 'mail';
export type MountainCheckpoint = 'trailhead' | 'relayCamp' | 'mailbox';
export const JOURNEY_REGION_NAMES: Record<JourneyRegionId, string> = {
  forest: '风铃森林', lake: '圆镜湖', mountain: '云阶山', desert: '晒被沙原', snow: '晴雪湾',
};
export interface JourneyState {
  version: typeof JOURNEY_VERSION;
  deliveries: Partial<Record<JourneyRegionId, { completionId: string }>>;
  regions: Record<JourneyRegionId, { completedNodeIds: JourneyNodeId[] }>;
  optionalDiscoveries: JourneyDiscoveryId[];
}

export function createJourneyState(): JourneyState {
  return { version: JOURNEY_VERSION, deliveries: {}, regions: {
    forest: { completedNodeIds: [] }, lake: { completedNodeIds: [] }, mountain: { completedNodeIds: [] },
    desert: { completedNodeIds: [] }, snow: { completedNodeIds: [] },
  }, optionalDiscoveries: [] };
}

export function isJourneyRegion(value: unknown): value is JourneyRegionId {
  return typeof value === 'string' && (JOURNEY_REGION_IDS as readonly string[]).includes(value);
}

export function isJourneyRegionUnlocked(state: JourneyState, region: unknown): boolean {
  return region === 'forest' || region === 'lake' && Boolean(state.deliveries.forest)
    || region === 'mountain' && Boolean(state.deliveries.lake);
}

/** Only confirmed landing nodes choose a safe restart; dynamic boat/player positions are never saved. */
export function deriveLakeCheckpoint(state: JourneyState): LakeCheckpoint {
  const nodes = state.regions.lake.completedNodeIds;
  return nodes.includes('lake.mailDocked') ? 'mail' : nodes.includes('lake.midDocked') ? 'mid' : 'start';
}

/** Rebuild at a confirmed safe ledge, never at a saved midair or moving-platform position. */
export function deriveMountainCheckpoint(state: JourneyState): MountainCheckpoint {
  const nodes = state.regions.mountain.completedNodeIds;
  return nodes.includes('mountain.passOpened') ? 'mailbox' : nodes.includes('mountain.signalLearned') ? 'relayCamp' : 'trailhead';
}
