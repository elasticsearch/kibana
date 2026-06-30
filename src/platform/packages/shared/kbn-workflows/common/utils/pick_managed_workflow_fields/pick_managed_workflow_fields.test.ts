/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  pickManagedWorkflowFields,
  toManagedWorkflowTelemetryFields,
} from './pick_managed_workflow_fields';

describe('pickManagedWorkflowFields', () => {
  it('returns managed workflow fields when present', () => {
    expect(
      pickManagedWorkflowFields({
        managed: true,
        managedBy: 'security',
        billable: true,
        originManagedWorkflowId: 'system-parent',
        managedVersion: 2,
      })
    ).toEqual({
      managed: true,
      managedBy: 'security',
      billable: true,
      originManagedWorkflowId: 'system-parent',
      managedVersion: 2,
    });
  });

  it('omits null and undefined managed workflow fields', () => {
    expect(
      pickManagedWorkflowFields({
        managed: false,
        managedBy: null,
        billable: null,
        originManagedWorkflowId: undefined,
        managedVersion: null,
      })
    ).toEqual({});
  });

  it('returns an empty object for missing source', () => {
    expect(pickManagedWorkflowFields(undefined)).toEqual({});
  });
});

describe('toManagedWorkflowTelemetryFields', () => {
  it('maps managed workflow fields to telemetry shape', () => {
    expect(
      toManagedWorkflowTelemetryFields({
        managed: true,
        managedBy: 'security',
        billable: false,
        originManagedWorkflowId: 'system-parent',
        managedVersion: 2,
      })
    ).toEqual({
      isManaged: true,
      managedBy: 'security',
      originManagedWorkflowId: 'system-parent',
      managedVersion: 2,
    });
  });

  it('omits nullable telemetry fields', () => {
    expect(
      toManagedWorkflowTelemetryFields({
        managed: true,
        managedBy: null,
        originManagedWorkflowId: null,
        managedVersion: null,
      })
    ).toEqual({
      isManaged: true,
    });
  });
});
