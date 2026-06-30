import type { FindGapsResponseBodyV1 } from '../../../../../../../common/routes/gaps/apis/find';
import type { Gap } from '../../../../../../lib/rule_gaps/gap';
export declare const transformResponse: ({ page, perPage, total, data: gapsData, }: {
    page: number;
    perPage: number;
    total: number;
    data: Gap[];
}) => FindGapsResponseBodyV1;
