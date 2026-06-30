import { type KueryNode } from '@kbn/es-query';
import type { RuleChangeTracking } from '@kbn/alerting-types';
import type { RuleParams } from '../../../application/rule/types';
import type { RulesClientContext } from '../../types';
import { type RuleAuditAction } from '../audit_events';
import { ReadOperations, type WriteOperations } from '../../../authorization';
import type { BulkEditResult, ParamsModifier, ShouldIncrementRevision, UpdateOperationOpts } from './types';
export interface BulkEditOptions<Params extends RuleParams> {
    filter?: string | KueryNode;
    ids?: string[];
    name: string;
    updateFn: (opts: UpdateOperationOpts) => Promise<void>;
    auditAction: RuleAuditAction;
    shouldValidateSchedule?: boolean;
    shouldInvalidateApiKeys: boolean;
    requiredAuthOperation: ReadOperations | WriteOperations;
    paramsModifier?: ParamsModifier<Params>;
    shouldIncrementRevision?: ShouldIncrementRevision<Params>;
    ignoreInternalRuleTypes?: boolean;
    changeTracking?: RuleChangeTracking;
}
export declare function bulkEditRules<Params extends RuleParams>(context: RulesClientContext, options: BulkEditOptions<Params>): Promise<BulkEditResult<Params>>;
