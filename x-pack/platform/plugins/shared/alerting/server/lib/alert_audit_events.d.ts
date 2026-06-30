import type { EcsEvent } from '@kbn/core/server';
import type { AuditEvent } from '@kbn/security-plugin/server';
export declare enum AlertAuditAction {
    GET = "alert_get",
    UPDATE = "alert_update",
    FIND = "alert_find",
    DELETE = "alert_delete",
    SCHEDULE_DELETE = "alert_schedule_delete",
    ACKNOWLEDGE = "alert_acknowledge",
    UNACKNOWLEDGE = "alert_unacknowledge"
}
export declare const operationAlertAuditActionMap: {
    update: AlertAuditAction;
    delete: AlertAuditAction;
    find: AlertAuditAction;
    get: AlertAuditAction;
};
/**
 * Maps workflow status values to specific audit actions.
 * Falls back to the generic UPDATE action for unmapped statuses.
 */
export declare const workflowStatusAuditActionMap: Record<string, AlertAuditAction>;
export interface AlertAuditEventParams {
    action: AlertAuditAction;
    actor?: string;
    outcome?: EcsEvent['outcome'];
    id?: string;
    error?: Error;
    bulk?: boolean;
}
export declare function alertAuditEvent({ action, id, outcome, error, actor, bulk, }: AlertAuditEventParams): AuditEvent;
export declare function alertAuditSystemEvent({ action, id, outcome, error, }: AlertAuditEventParams): AuditEvent;
