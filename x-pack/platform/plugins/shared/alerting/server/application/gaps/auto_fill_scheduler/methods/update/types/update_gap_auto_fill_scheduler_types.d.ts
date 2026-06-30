import type { TypeOf } from '@kbn/config-schema';
import type { KibanaRequest } from '@kbn/core/server';
import type { updateGapAutoFillSchedulerSchema } from '../schemas';
export type UpdateGapAutoFillSchedulerBase = TypeOf<typeof updateGapAutoFillSchedulerSchema>;
export interface UpdateGapAutoFillSchedulerParams extends Omit<UpdateGapAutoFillSchedulerBase, 'request'> {
    request: KibanaRequest;
}
