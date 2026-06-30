import type { BulkUntrackRequestBodyV1 } from '../../../../../../../common/routes/rule/apis/bulk_untrack';
export declare const transformBulkUntrackAlertsBody: ({ indices, alert_uuids: alertUuids, }: BulkUntrackRequestBodyV1) => {
    indices: string[];
    alertUuids: string[];
};
