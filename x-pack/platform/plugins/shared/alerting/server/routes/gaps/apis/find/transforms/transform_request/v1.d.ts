import type { FindGapsRequestBodyV1 } from '../../../../../../../common/routes/gaps/apis/find';
import type { FindGapsParams } from '../../../../../../application/gaps/types';
export declare const transformRequest: ({ page, per_page, rule_id, start, end, sort_field, sort_order, statuses, excluded_reasons, }: FindGapsRequestBodyV1) => FindGapsParams;
