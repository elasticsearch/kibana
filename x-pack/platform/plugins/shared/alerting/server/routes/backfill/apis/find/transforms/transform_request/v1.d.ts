import type { FindBackfillRequestQueryV1 } from '../../../../../../../common/routes/backfill/apis/find';
import type { FindBackfillParams } from '../../../../../../application/backfill/methods/find/types';
export declare const transformRequest: ({ end, page, per_page, rule_ids, start, sort_field, sort_order, initiator, }: FindBackfillRequestQueryV1) => FindBackfillParams;
