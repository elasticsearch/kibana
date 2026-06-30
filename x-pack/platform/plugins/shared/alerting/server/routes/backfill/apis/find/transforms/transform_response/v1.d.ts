import type { FindBackfillResult } from '../../../../../../application/backfill/methods/find/types';
import type { FindBackfillResponseBodyV1 } from '../../../../../../../common/routes/backfill/apis/find';
export declare const transformResponse: ({ page, perPage, total, data: backfillData, }: FindBackfillResult) => FindBackfillResponseBodyV1;
