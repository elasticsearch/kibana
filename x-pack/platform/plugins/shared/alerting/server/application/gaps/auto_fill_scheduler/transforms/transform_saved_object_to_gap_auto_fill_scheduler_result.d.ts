import type { SavedObject } from '@kbn/core/server';
import type { GapAutoFillSchedulerResponse } from '../result/types';
import type { GapAutoFillSchedulerSO } from '../../../../data/gap_auto_fill_scheduler/types/gap_auto_fill_scheduler';
type BaseGapAutoFillSchedulerSO = Omit<GapAutoFillSchedulerSO, 'id'>;
export interface TransformSavedObjectToGapAutoFillSchedulerResultOpts {
    savedObject: SavedObject<BaseGapAutoFillSchedulerSO>;
}
export declare const transformSavedObjectToGapAutoFillSchedulerResult: ({ savedObject, }: TransformSavedObjectToGapAutoFillSchedulerResultOpts) => GapAutoFillSchedulerResponse;
export {};
