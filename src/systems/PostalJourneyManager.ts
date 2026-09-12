export const POSTAL_JOURNEY_STORAGE_KEY = 'sunlit-postal-journey-v1';
export const POSTAL_ADDRESS_IDS = ['recipient', 'address', 'landmark'] as const;
export type PostalAddressId = typeof POSTAL_ADDRESS_IDS[number];
export interface PostalJourneyState {
  version: 1;
  foundAddressIds: PostalAddressId[];
  deliveryCompleted: boolean;
  completionId: string | null;
}
export type PostalJourneyError = 'future-version' | 'invalid-save' | 'storage-unavailable' | 'write-failed' | 'save-changed' | 'invalid-address' | 'incomplete-address' | 'invalid-completion';
export interface PostalJourneyResult { saved: boolean; duplicate: boolean; state: PostalJourneyState; error?: PostalJourneyError; }
const MAX_LENGTH = 4096;
const validId = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z0-9:_-]{1,120}$/.test(value);
const emptyState = (): PostalJourneyState => ({ version: 1, foundAddressIds: [], deliveryCompleted: false, completionId: null });

/** A completed letter must have a whole address and a durable receipt. */
export function sanitizePostalJourney(value: unknown): PostalJourneyState | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const input = value as Record<string, unknown>;
  if (input.version !== 1 || !Array.isArray(input.foundAddressIds) || input.foundAddressIds.length > 3 ||
    !input.foundAddressIds.every(id => POSTAL_ADDRESS_IDS.includes(id as PostalAddressId)) ||
    typeof input.deliveryCompleted !== 'boolean') return null;
  const foundAddressIds = POSTAL_ADDRESS_IDS.filter(id => (input.foundAddressIds as unknown[]).includes(id));
  if (input.deliveryCompleted ? foundAddressIds.length !== 3 || !validId(input.completionId) : input.completionId !== null) return null;
  return { version: 1, foundAddressIds, deliveryCompleted: input.deliveryCompleted, completionId: input.completionId as string | null };
}

interface ReadResult { raw: string | null; state: PostalJourneyState; error?: PostalJourneyError; }

/** One local story record. This manager never reads campaign progress or spends currency. */
export class PostalJourneyManager {
  private static read(): ReadResult {
    try {
      const raw = localStorage.getItem(POSTAL_JOURNEY_STORAGE_KEY);
      if (raw === null) return { raw, state: emptyState() };
      if (raw.length > MAX_LENGTH) return { raw, state: emptyState(), error: 'invalid-save' };
      let value: unknown;
      try { value = JSON.parse(raw); } catch { return { raw, state: emptyState(), error: 'invalid-save' }; }
      if (value && typeof value === 'object' && typeof (value as { version?: unknown }).version === 'number' && (value as { version: number }).version > 1) {
        return { raw, state: emptyState(), error: 'future-version' };
      }
      const state = sanitizePostalJourney(value);
      return state ? { raw, state } : { raw, state: emptyState(), error: 'invalid-save' };
    } catch { return { raw: null, state: emptyState(), error: 'storage-unavailable' }; }
  }

  static getState(): PostalJourneyState { return this.read().state; }
  static getWriteProtection(): PostalJourneyError | null { return this.read().error ?? null; }

  static findAddress(id: PostalAddressId): PostalJourneyResult {
    const previous = this.read();
    if (previous.error) return { saved: false, duplicate: false, state: previous.state, error: previous.error };
    if (!POSTAL_ADDRESS_IDS.includes(id)) return { saved: false, duplicate: false, state: previous.state, error: 'invalid-address' };
    if (previous.state.foundAddressIds.includes(id)) return { saved: true, duplicate: true, state: previous.state };
    return this.write(previous, { ...previous.state, foundAddressIds: POSTAL_ADDRESS_IDS.filter(candidate => candidate === id || previous.state.foundAddressIds.includes(candidate)) });
  }

  static completeDelivery(completionId: string): PostalJourneyResult {
    const previous = this.read();
    const failure = (error: PostalJourneyError): PostalJourneyResult => ({ saved: false, duplicate: false, state: previous.state, error });
    if (previous.error) return failure(previous.error);
    if (!validId(completionId)) return failure('invalid-completion');
    if (previous.state.deliveryCompleted) return { saved: true, duplicate: true, state: previous.state };
    if (previous.state.foundAddressIds.length !== POSTAL_ADDRESS_IDS.length) return failure('incomplete-address');
    return this.write(previous, { ...previous.state, deliveryCompleted: true, completionId });
  }

  private static write(previous: ReadResult, state: PostalJourneyState): PostalJourneyResult {
    const latest = this.read();
    if (latest.error || latest.raw !== previous.raw) {
      return { saved: false, duplicate: false, state: latest.state, error: latest.error ?? 'save-changed' };
    }
    try {
      const serialized = JSON.stringify(state);
      localStorage.setItem(POSTAL_JOURNEY_STORAGE_KEY, serialized);
      if (localStorage.getItem(POSTAL_JOURNEY_STORAGE_KEY) !== serialized) throw new Error('Postal save was not retained');
      return { saved: true, duplicate: false, state };
    } catch { return { saved: false, duplicate: false, state: previous.state, error: 'write-failed' }; }
  }
}
