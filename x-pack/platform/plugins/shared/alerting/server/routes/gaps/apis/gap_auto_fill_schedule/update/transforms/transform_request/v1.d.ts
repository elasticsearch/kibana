import type { KibanaRequest } from '@kbn/core/server';
import type { GetGapAutoFillSchedulerParamsV1, UpdateGapAutoFillSchedulerRequestBodyV1 } from '../../../../../../../../common/routes/gaps/apis/gap_auto_fill_scheduler';
import type { UpdateGapAutoFillSchedulerParams } from '../../../../../../../application/gaps/auto_fill_scheduler/methods/update/types';
export declare const transformRequest: (request: KibanaRequest<GetGapAutoFillSchedulerParamsV1, unknown, UpdateGapAutoFillSchedulerRequestBodyV1, "put">) => UpdateGapAutoFillSchedulerParams;
