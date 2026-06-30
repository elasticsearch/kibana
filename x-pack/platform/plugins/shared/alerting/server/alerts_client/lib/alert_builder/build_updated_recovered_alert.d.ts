import type { Alert } from '@kbn/alerts-as-data-utils';
import type { RawAlertInstance } from '@kbn/alerting-state-types';
import type { RuleAlertData } from '../../../types';
import type { AlertRule } from '../../types';
interface BuildUpdatedRecoveredAlertOpts<AlertData extends RuleAlertData> {
    alert: Alert & AlertData;
    legacyRawAlert: RawAlertInstance;
    runTimestamp?: string;
    timestamp: string;
    rule: AlertRule;
}
/**
 * Updates an existing recovered alert document with latest flapping
 * information
 */
export declare const buildUpdatedRecoveredAlert: <AlertData extends RuleAlertData>({ alert, legacyRawAlert, runTimestamp, timestamp, }: BuildUpdatedRecoveredAlertOpts<AlertData>) => Alert & AlertData;
export {};
