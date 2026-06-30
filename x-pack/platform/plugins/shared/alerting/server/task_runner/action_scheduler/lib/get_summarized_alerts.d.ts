import type { GetSummarizedAlertsParams, IAlertsClient } from '../../../alerts_client/types';
import type { AlertInstanceContext, AlertInstanceState, CombinedSummarizedAlerts, RuleAlertData } from '../../../types';
interface GetSummarizedAlertsOpts<State extends AlertInstanceState, Context extends AlertInstanceContext, ActionGroupIds extends string, RecoveryActionGroupId extends string, AlertData extends RuleAlertData> {
    alertsClient: IAlertsClient<AlertData, State, Context, ActionGroupIds, RecoveryActionGroupId>;
    queryOptions: GetSummarizedAlertsParams;
}
export declare const getSummarizedAlerts: <State extends AlertInstanceState, Context extends AlertInstanceContext, ActionGroupIds extends string, RecoveryActionGroupId extends string, AlertData extends RuleAlertData>({ alertsClient, queryOptions, }: GetSummarizedAlertsOpts<State, Context, ActionGroupIds, RecoveryActionGroupId, AlertData>) => Promise<CombinedSummarizedAlerts>;
export {};
