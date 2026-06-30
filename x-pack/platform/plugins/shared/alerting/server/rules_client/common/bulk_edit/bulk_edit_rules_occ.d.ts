import type { KueryNode } from '@kbn/es-query';
import type { RuleChangeTracking } from '@kbn/alerting-types';
import type { RuleParams } from '../../../application/rule/types';
import type { RulesClientContext } from '../../types';
import type { BulkEditOperationResult } from './retry_if_bulk_edit_conflicts';
import type { ParamsModifier, ShouldIncrementRevision, UpdateOperationOpts } from './types';
export interface BulkEditOccOptions<Params extends RuleParams> {
    filter: KueryNode | null;
    updateFn: (opts: UpdateOperationOpts) => Promise<void>;
    shouldValidateSchedule?: boolean;
    shouldInvalidateApiKeys: boolean;
    paramsModifier?: ParamsModifier<Params>;
    shouldIncrementRevision?: ShouldIncrementRevision<Params>;
    changeTracking?: RuleChangeTracking;
}
export declare function bulkEditRulesOcc<Params extends RuleParams>(context: RulesClientContext, options: BulkEditOccOptions<Params>): Promise<BulkEditOperationResult>;
