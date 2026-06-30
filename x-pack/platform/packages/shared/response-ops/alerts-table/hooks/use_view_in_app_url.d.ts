import type { Alert } from '@kbn/alerting-types';
import type { AlertFormatter } from '@kbn/alerts-ui-shared';
/**
 * Computes a "View in app" deep-link URL for an alert by calling the rule type's formatter.
 * Returns the final href (with base path prepended when needed), or null if no link can be resolved.
 */
export declare const useViewInAppUrl: (alert: Alert, getAlertFormatter: ((ruleTypeId: string) => AlertFormatter | undefined) | undefined) => string | null;
