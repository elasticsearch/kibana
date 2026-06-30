import type { RulesSettingsAlertDeleteProperties } from '@kbn/alerting-types';
import { type AlertDeletionContext } from '../alert_deletion_client';
export declare const deleteAlertsForSpace: (context: AlertDeletionContext, settings: RulesSettingsAlertDeleteProperties, spaceId: string, abortController: AbortController) => Promise<{
    numAlertsDeleted: number;
    errors?: string[];
}>;
