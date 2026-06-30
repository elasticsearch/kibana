import type { Logger } from '@kbn/logging';
import type { RuleAction, RuleSystemAction } from '@kbn/alerting-types';
import type { RuleRunMetricsStore } from '../../../lib/rule_run_metrics_store';
import type { ActionsConfigMap } from '../../../lib/get_actions_config_map';
interface ShouldScheduleActionOpts {
    action: RuleAction | RuleSystemAction;
    actionsConfigMap: ActionsConfigMap;
    isActionExecutable(actionId: string, actionTypeId: string, options?: {
        notifyUsage: boolean;
    }): boolean;
    logger: Logger;
    ruleId: string;
    ruleRunMetricsStore: RuleRunMetricsStore;
}
export declare const shouldScheduleAction: (opts: ShouldScheduleActionOpts) => boolean;
export {};
