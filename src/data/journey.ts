/** Stable narrative IDs. Planned regions are never unlocked by old combat progress. */
export const JOURNEY_REGION_IDS = ['forest', 'lake', 'mountain', 'desert', 'snow'] as const;
export type JourneyRegionId = typeof JOURNEY_REGION_IDS[number];
export const JOURNEY_NODE_IDS = {
  forest: ['forest.recipient', 'forest.address', 'forest.landmark'],
  lake: ['lake.midDocked', 'lake.mailDocked'],
  mountain: [], desert: [], snow: [],
} as const;
export type JourneyNodeId = typeof JOURNEY_NODE_IDS[JourneyRegionId][number];
export const JOURNEY_DISCOVERY_IDS = ['lake.picnicCloth'] as const;
export type JourneyDiscoveryId = typeof JOURNEY_DISCOVERY_IDS[number];
export type LakeCheckpoint = 'start' | 'mid' | 'mail';
export const JOURNEY_REGION_NAMES: Record<JourneyRegionId, string> = {
  forest: '风铃森林', lake: '圆镜湖', mountain: '云阶山', desert: '晒被沙原', snow: '晴雪湾',
};
export interface JourneyState {
  version: 2;
  deliveries: Partial<Record<JourneyRegionId, { completionId: string }>>;
  regions: Record<JourneyRegionId, { completedNodeIds: JourneyNodeId[] }>;
  optionalDiscoveries: JourneyDiscoveryId[];
}

export function createJourneyState(): JourneyState {
  return { version: 2, deliveries: {}, regions: {
    forest: { completedNodeIds: [] }, lake: { completedNodeIds: [] }, mountain: { completedNodeIds: [] },
    desert: { completedNodeIds: [] }, snow: { completedNodeIds: [] },
  }, optionalDiscoveries: [] };
}

export function isJourneyRegion(value: unknown): value is JourneyRegionId {
  return typeof value === 'string' && (JOURNEY_REGION_IDS as readonly string[]).includes(value);
}

export function isJourneyRegionUnlocked(state: JourneyState, region: unknown): boolean {
  return region === 'forest' || region === 'lake' && Boolean(state.deliveries.forest);
}

/** Only confirmed landing nodes choose a safe restart; dynamic boat/player positions are never saved. */
export function deriveLakeCheckpoint(state: JourneyState): LakeCheckpoint {
  const nodes = state.regions.lake.completedNodeIds;
  return nodes.includes('lake.mailDocked') ? 'mail' : nodes.includes('lake.midDocked') ? 'mid' : 'start';
}
