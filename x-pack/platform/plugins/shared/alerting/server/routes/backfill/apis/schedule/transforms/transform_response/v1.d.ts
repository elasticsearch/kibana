import type { ScheduleBackfillResults } from '../../../../../../application/backfill/methods/schedule/types';
import type { ScheduleBackfillResponseBodyV1 } from '../../../../../../../common/routes/backfill/apis/schedule';
export declare const transformResponse: (results: ScheduleBackfillResults) => ScheduleBackfillResponseBodyV1;
