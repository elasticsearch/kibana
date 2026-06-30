import type { BulkEditOperation } from '../../../../../../application/rule/methods/bulk_edit';
import type { BulkEditRulesRequestBodyV1 } from '../../../../../../../common/routes/rule/apis/bulk_edit';
export declare const transformOperations: ({ operations, isSystemAction, }: {
    operations?: BulkEditRulesRequestBodyV1["operations"];
    isSystemAction: (connectorId: string) => boolean;
}) => BulkEditOperation[];
