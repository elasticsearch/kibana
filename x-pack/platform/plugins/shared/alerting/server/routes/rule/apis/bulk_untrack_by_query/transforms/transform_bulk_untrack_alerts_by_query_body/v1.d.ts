import type { BulkUntrackByQueryRequestBodyV1 } from '../../../../../../../common/routes/rule/apis/bulk_untrack_by_query';
export declare const transformBulkUntrackAlertsByQueryBody: ({ query, rule_type_ids: ruleTypeIds, }: BulkUntrackByQueryRequestBodyV1) => {
    query: any[];
    ruleTypeIds: string[];
};
