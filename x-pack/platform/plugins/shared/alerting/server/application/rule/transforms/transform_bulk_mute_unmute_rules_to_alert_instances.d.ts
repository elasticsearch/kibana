import type { MuteInstances } from '../../../alerts_service/alerts_service';
import type { BulkMuteUnmuteAlertsParams } from '../types';
export declare const transformParamsRulesToAlertInstances: (rules: BulkMuteUnmuteAlertsParams["rules"]) => MuteInstances;
