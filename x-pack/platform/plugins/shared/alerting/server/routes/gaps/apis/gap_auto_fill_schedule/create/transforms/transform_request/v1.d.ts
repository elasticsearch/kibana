import type { KibanaRequest } from '@kbn/core/server';
import type { CreateGapAutoFillSchedulerParams } from '../../../../../../../application/gaps/auto_fill_scheduler/methods/create/types';
export declare const transformRequest: (request: KibanaRequest<unknown, unknown, unknown, "post">) => CreateGapAutoFillSchedulerParams;
