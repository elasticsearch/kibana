/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EcsEvent } from '@kbn/core/server';
import type { AuditEvent } from '@kbn/security-plugin/server';
import type { ArrayElement } from '@kbn/utility-types';
import { ReadOperations, WriteOperations } from '../authorization/types';

export enum AlertAuditAction {
  GET = 'alert_get',
  UPDATE = 'alert_update',
  FIND = 'alert_find',
  DELETE = 'alert_delete',
  SCHEDULE_DELETE = 'alert_schedule_delete',
  ACKNOWLEDGE = 'alert_acknowledge',
  UNACKNOWLEDGE = 'alert_unacknowledge',
  SNOOZE = 'alert_snooze',
  UNSNOOZE = 'alert_unsnooze',
  AUTO_UNSNOOZE = 'alert_auto_unsnooze',
}

export const operationAlertAuditActionMap = {
  [WriteOperations.Update]: AlertAuditAction.UPDATE,
  [WriteOperations.Delete]: AlertAuditAction.DELETE,
  [ReadOperations.Find]: AlertAuditAction.FIND,
  [ReadOperations.Get]: AlertAuditAction.GET,
};

/**
 * Maps workflow status values to specific audit actions.
 * Falls back to the generic UPDATE action for unmapped statuses.
 */
export const workflowStatusAuditActionMap: Record<string, AlertAuditAction> = {
  acknowledged: AlertAuditAction.ACKNOWLEDGE,
  open: AlertAuditAction.UNACKNOWLEDGE,
};

type VerbsTuple = [string, string, string];

const eventVerbs: Record<AlertAuditAction, VerbsTuple> = {
  alert_get: ['access', 'accessing', 'accessed'],
  alert_update: ['update', 'updating', 'updated'],
  alert_find: ['access', 'accessing', 'accessed'],
  alert_delete: ['delete', 'deleting', 'deleted'],
  alert_schedule_delete: [
    'schedule deletion task for',
    'scheduling deletion task for',
    'scheduled deletion task for',
  ],
  alert_acknowledge: ['acknowledge', 'acknowledging', 'acknowledged'],
  alert_unacknowledge: ['unacknowledge', 'unacknowledging', 'unacknowledged'],
  alert_snooze: ['snooze', 'snoozing', 'snoozed'],
  alert_unsnooze: ['unsnooze', 'unsnoozing', 'unsnoozed'],
  alert_auto_unsnooze: ['auto-unsnooze', 'auto-unsnoozing', 'auto-unsnoozed'],
};

const eventTypes: Record<AlertAuditAction, ArrayElement<EcsEvent['type']>> = {
  alert_get: 'access',
  alert_update: 'change',
  alert_find: 'access',
  alert_delete: 'deletion',
  alert_schedule_delete: 'deletion',
  alert_acknowledge: 'change',
  alert_unacknowledge: 'change',
  alert_snooze: 'change',
  alert_unsnooze: 'change',
  alert_auto_unsnooze: 'change',
};

export interface AlertAuditEventParams {
  action: AlertAuditAction;
  actor?: string;
  outcome?: EcsEvent['outcome'];
  id?: string;
  error?: Error;
  bulk?: boolean;
  /** Optional reason appended to success messages, e.g. 'ttl_expired', 'condition_met'. */
  reason?: string;
  /**
   * Optional rule SO reference. When provided, the event message includes the rule context
   * (`alert [id=...] of rule [id=...] [name=...]`) and the SO is attached to `kibana.saved_object`
   * so the security plugin can space-scope the audit event.
   */
  ruleSavedObject?: NonNullable<AuditEvent['kibana']>['saved_object'];
}

export function alertAuditEvent({
  action,
  id,
  outcome,
  error,
  actor = 'User',
  bulk = false,
  reason,
  ruleSavedObject,
}: AlertAuditEventParams): AuditEvent {
  let doc: string;
  if (id) {
    doc = `alert [id=${id}]`;
  } else {
    doc = bulk ? 'alerts' : 'an alert';
  }
  if (ruleSavedObject) {
    const ruleDoc = [
      `rule [id=${ruleSavedObject.id}]`,
      ruleSavedObject.name && `and [name=${ruleSavedObject.name}]`,
    ]
      .filter(Boolean)
      .join(' ');
    doc = `${doc} of ${ruleDoc}`;
  }
  const [present, progressive, past] = eventVerbs[action];
  const reasonSuffix = reason ? ` (reason: ${reason})` : '';
  const message = error
    ? `Failed attempt to ${present} ${doc}`
    : outcome === 'unknown'
    ? `${actor} is ${progressive} ${doc}`
    : `${actor} has ${past} ${doc}${reasonSuffix}`;
  const type = eventTypes[action];

  return {
    message,
    event: {
      action,
      category: ['database'],
      type: type ? [type] : undefined,
      outcome: outcome ?? (error ? 'failure' : 'success'),
    },
    ...(ruleSavedObject ? { kibana: { saved_object: ruleSavedObject } } : {}),
    error: error && {
      code: error.name,
      message: error.message,
    },
  };
}

export function alertAuditSystemEvent({
  action,
  id,
  outcome,
  error,
  reason,
  ruleSavedObject,
}: AlertAuditEventParams): AuditEvent {
  return alertAuditEvent({
    action,
    id,
    outcome,
    error,
    actor: 'System',
    reason,
    ruleSavedObject,
  });
}
