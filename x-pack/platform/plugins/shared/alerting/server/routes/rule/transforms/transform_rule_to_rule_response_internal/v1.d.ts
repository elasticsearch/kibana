import type { RuleResponseInternalV1, RuleParamsV1, RuleLastRunV1, MonitoringV1 } from '../../../../../common/routes/rule/response';
import type { Rule, RuleLastRun, RuleParams, Monitoring } from '../../../../application/rule/types';
export declare const transformRuleLastRun: (lastRun: RuleLastRun) => RuleLastRunV1;
export declare const transformMonitoring: (monitoring: Monitoring) => MonitoringV1;
export declare const transformRuleActions: (actions?: Rule["actions"], systemActions?: Rule["systemActions"]) => RuleResponseInternalV1["actions"];
export declare const transformFlapping: (flapping: Rule["flapping"]) => {
    enabled: boolean | undefined;
    look_back_window: number;
    status_change_threshold: number;
} | null | undefined;
export declare const transformRuleToRuleResponseInternal: <Params extends RuleParams = never>(rule: Rule<Params>) => RuleResponseInternalV1<RuleParamsV1>;
