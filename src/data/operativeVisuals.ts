import { getOperative, type OperativeId } from './operatives';

export interface OperativeVisual {
  heroTexture: string;
  portraitTexture: string;
  accessory: 'flower' | 'popcorn' | 'quilt' | 'beehive';
}

/** One appearance contract for the satchel, workshop, result letter and combat. */
export const OPERATIVE_VISUALS: Record<OperativeId, OperativeVisual> = {
  ranger: { heroTexture: 'hero-ranger', portraitTexture: 'portrait-ranger', accessory: 'flower' },
  gunner: { heroTexture: 'hero-gunner', portraitTexture: 'portrait-gunner', accessory: 'popcorn' },
  warden: { heroTexture: 'hero-warden', portraitTexture: 'portrait-warden', accessory: 'quilt' },
  engineer: { heroTexture: 'hero-engineer', portraitTexture: 'portrait-engineer', accessory: 'beehive' },
};

export function getOperativeVisual(id: string | null | undefined): OperativeVisual {
  return OPERATIVE_VISUALS[getOperative(id).id];
}
