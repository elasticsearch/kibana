import type { Logger } from '@kbn/core/server';
import type { IAlertsClient } from '../types';
import type { AlertsService } from '../../alerts_service';
import type { UntypedNormalizedRuleType } from '../../rule_type_registry';
import type { AlertInstanceContext, AlertInstanceState, RuleAlertData, RuleTypeParams, SanitizedRule } from '../../types';
import type { RuleTaskInstance, RuleTypeRunnerContext } from '../../task_runner/types';
export type RuleData<Params extends RuleTypeParams> = Pick<SanitizedRule<Params>, 'id' | 'name' | 'tags' | 'consumer' | 'revision' | 'alertDelay' | 'params' | 'muteAll' | 'mutedInstanceIds'>;
interface InitializeAlertsClientOpts<Params extends RuleTypeParams> {
    alertsService: AlertsService | null;
    context: RuleTypeRunnerContext;
    executionId: string;
    logger: Logger;
    maxAlerts: number;
    rule: RuleData<Params>;
    ruleType: UntypedNormalizedRuleType;
    runTimestamp?: Date;
    startedAt: Date | null;
    taskInstance: RuleTaskInstance;
}
export declare const initializeAlertsClient: <Params extends RuleTypeParams, AlertData extends RuleAlertData, State extends AlertInstanceState, Context extends AlertInstanceContext, ActionGroupIds extends string, RecoveryActionGroupId extends string>({ alertsService, context, executionId, logger, maxAlerts, rule, ruleType, runTimestamp, startedAt, taskInstance, }: InitializeAlertsClientOpts<Params>) => Promise<IAlertsClient<AlertData, State, Context, ActionGroupIds, RecoveryActionGroupId>>;
export {};
