import type { AsApiContract } from '@kbn/actions-plugin/common';
import type { RuleExecutionStatus, Rule, RuleLastRun, RuleAction, RuleType } from '../../common';
type ApiRuleExecutionStatus = Omit<AsApiContract<RuleExecutionStatus>, 'last_execution_date'> & {
    last_execution_date: string;
};
export type ApiRule = Omit<AsApiContract<Rule>, 'execution_status' | 'actions' | 'created_at' | 'updated_at' | 'alert_type_id' | 'muted_instance_ids' | 'last_run' | 'next_run'> & {
    execution_status: ApiRuleExecutionStatus;
    actions: Array<AsApiContract<RuleAction>>;
    created_at: string;
    updated_at: string;
    rule_type_id: string;
    muted_alert_ids: string[];
    last_run?: AsApiContract<RuleLastRun>;
    next_run?: string;
};
export declare function transformRule(input: ApiRule): Rule;
export declare function transformRuleType(input: AsApiContract<RuleType>): RuleType;
export {};
