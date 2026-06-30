import type { ConcreteTaskInstance } from '@kbn/task-manager-plugin/server';
import type { SanitizedRule, RuleTaskState, RuleTaskParams, RuleTypeParams } from '../../common';
export interface AlertTaskInstance extends ConcreteTaskInstance {
    state: RuleTaskState;
    params: RuleTaskParams;
}
export declare function taskInstanceToAlertTaskInstance<Params extends RuleTypeParams>(taskInstance: ConcreteTaskInstance, alert?: SanitizedRule<Params>): AlertTaskInstance;
