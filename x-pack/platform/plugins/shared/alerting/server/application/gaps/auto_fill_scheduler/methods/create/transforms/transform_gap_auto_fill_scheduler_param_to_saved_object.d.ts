import type { CreateGapAutoFillSchedulerParams } from '../types';
import type { RawGapAutoFillSchedulerAttributesV2 } from '../../../../../../saved_objects/schemas/raw_gap_auto_fill_scheduler/v2';
export declare const transformGapAutoFillSchedulerCreateParamToSavedObject: (params: CreateGapAutoFillSchedulerParams, { createdBy, createdAt, updatedAt, updatedBy, }: {
    createdBy: string | null;
    createdAt: string;
    updatedAt: string;
    updatedBy: string | null;
}) => RawGapAutoFillSchedulerAttributesV2;
