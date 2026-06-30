import type { SavedObjectReference } from '@kbn/core/server';
import type { RawRule } from '../../../types';
import type { RuleDomain } from '../types';
export declare function transformRawArtifactsToDomainArtifacts(id: string, rawArtifacts?: RawRule['artifacts'], references?: SavedObjectReference[]): Required<RuleDomain['artifacts']>;
