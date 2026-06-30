import type { TypeOf } from '@kbn/config-schema';
import type { KibanaRequest } from '@kbn/core/server';
import type { createGapAutoFillSchedulerSchema } from '../schemas';
export type CreateGapAutoFillSchedulerBase = TypeOf<typeof createGapAutoFillSchedulerSchema>;
export interface CreateGapAutoFillSchedulerParams extends Omit<CreateGapAutoFillSchedulerBase, 'request'> {
    request: KibanaRequest;
}
