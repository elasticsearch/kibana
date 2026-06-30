import type { SavedObjectReference } from '@kbn/core/server';
import type { Artifacts } from '../../types';
import type { DenormalizedArtifacts } from '../types';
export declare function denormalizeArtifacts(ruleArtifacts: Artifacts | undefined): {
    artifacts: Required<DenormalizedArtifacts>;
    references: SavedObjectReference[];
};
