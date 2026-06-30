/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { EsWorkflowExecution } from '../../../types/v1';

export type ManagedWorkflowFieldsSource = Pick<
  EsWorkflowExecution,
  'managed' | 'managedBy' | 'billable' | 'originManagedWorkflowId' | 'managedVersion'
>;

export interface ManagedWorkflowFields {
  managed?: true;
  managedBy?: string;
  billable?: boolean;
  originManagedWorkflowId?: string;
  managedVersion?: number;
}

/**
 * Strips null managed-workflow fields for execution, API, and persistence payloads.
 */
export const pickManagedWorkflowFields = (
  source: ManagedWorkflowFieldsSource | null | undefined
): Partial<ManagedWorkflowFields> => {
  if (!source) {
    return {};
  }

  return {
    ...(source.managed === true ? { managed: true } : {}),
    ...(source.managedBy != null ? { managedBy: source.managedBy } : {}),
    ...(source.billable != null ? { billable: source.billable } : {}),
    ...(source.originManagedWorkflowId != null
      ? { originManagedWorkflowId: source.originManagedWorkflowId }
      : {}),
    ...(source.managedVersion != null ? { managedVersion: source.managedVersion } : {}),
  };
};

export interface ManagedWorkflowTelemetryFields {
  isManaged: boolean;
  managedBy?: string;
  originManagedWorkflowId?: string;
  managedVersion?: number;
}

/**
 * Maps managed-workflow source fields to telemetry event shape.
 */
export const toManagedWorkflowTelemetryFields = (
  source: ManagedWorkflowFieldsSource | null | undefined
): ManagedWorkflowTelemetryFields => {
  const fields = pickManagedWorkflowFields(source);

  return {
    isManaged: fields.managed === true,
    ...(fields.managedBy !== undefined ? { managedBy: fields.managedBy } : {}),
    ...(fields.originManagedWorkflowId !== undefined
      ? { originManagedWorkflowId: fields.originManagedWorkflowId }
      : {}),
    ...(fields.managedVersion !== undefined ? { managedVersion: fields.managedVersion } : {}),
  };
};
