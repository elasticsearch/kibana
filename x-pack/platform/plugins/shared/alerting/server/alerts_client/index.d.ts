export { type LegacyAlertsClientParams, LegacyAlertsClient } from './legacy_alerts_client';
export { AlertsClient } from './alerts_client';
export type { AlertRuleData } from './types';
export { sanitizeBulkErrorResponse, initializeAlertsClient, shouldCreateAlertsInAllSpaces, } from './lib';
export { AlertsClientError } from './alerts_client_error';
