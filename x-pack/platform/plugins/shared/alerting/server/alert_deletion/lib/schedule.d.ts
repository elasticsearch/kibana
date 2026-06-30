import type { RulesSettingsAlertDeleteProperties } from '@kbn/alerting-types';
import type { KibanaRequest } from '@kbn/core/server';
import { type AlertDeletionContext } from '../alert_deletion_client';
export declare const scheduleTask: (context: AlertDeletionContext, request: KibanaRequest, settings: RulesSettingsAlertDeleteProperties, spaceIds: string[]) => Promise<string | undefined>;
