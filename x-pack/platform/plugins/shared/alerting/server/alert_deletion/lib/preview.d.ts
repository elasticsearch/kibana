import type { RulesSettingsAlertDeleteProperties } from '@kbn/alerting-types';
import { type AlertDeletionContext } from '../alert_deletion_client';
export declare const previewTask: (context: AlertDeletionContext, settings: RulesSettingsAlertDeleteProperties, spaceId: string) => Promise<number>;
