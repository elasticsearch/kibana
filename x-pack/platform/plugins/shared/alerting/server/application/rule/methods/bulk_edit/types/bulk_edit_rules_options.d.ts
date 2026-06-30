import type { TypeOf } from '@kbn/config-schema';
import type { KueryNode } from '@kbn/es-query';
import type { RuleChangeTracking } from '@kbn/alerting-types';
import type { ParamsModifier, ShouldIncrementRevision } from '../../../../../rules_client/common';
import type { bulkEditRuleSnoozeScheduleSchema, bulkEditOperationsSchema, bulkEditOperationSchema } from '../schemas';
import type { RuleParams, RuleDomain } from '../../../types';
import type { Rule } from '../../../../../../common';
export type BulkEditRuleSnoozeSchedule = TypeOf<typeof bulkEditRuleSnoozeScheduleSchema>;
export type BulkEditOperation = TypeOf<typeof bulkEditOperationSchema>;
export type BulkEditOperations = TypeOf<typeof bulkEditOperationsSchema>;
export type BulkEditFields = keyof Pick<RuleDomain, 'actions' | 'tags' | 'schedule' | 'throttle' | 'notifyWhen' | 'snoozeSchedule' | 'apiKey'>;
export interface BulkEditOptionsCommon<Params extends RuleParams> {
    operations: BulkEditOperation[];
    ignoreInternalRuleTypes?: boolean;
    paramsModifier?: ParamsModifier<Params>;
    shouldIncrementRevision?: ShouldIncrementRevision<Params>;
    changeTracking?: RuleChangeTracking;
}
export type BulkEditOptionsFilter<Params extends RuleParams> = BulkEditOptionsCommon<Params> & {
    filter?: string | KueryNode;
};
export type BulkEditOptionsIds<Params extends RuleParams> = BulkEditOptionsCommon<Params> & {
    ids?: string[];
};
export type BulkEditSkipReason = 'RULE_NOT_MODIFIED';
export interface BulkActionSkipResult {
    id: Rule['id'];
    name?: Rule['name'];
    skip_reason: BulkEditSkipReason;
}
export interface BulkOperationError {
    message: string;
    status?: number;
    rule: {
        id: string;
        name: string;
    };
}
