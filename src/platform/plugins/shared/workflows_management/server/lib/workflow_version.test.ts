/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  applyWorkflowVersion,
  getNextWorkflowVersion,
  INITIAL_WORKFLOW_VERSION,
  maybeApplyWorkflowVersion,
} from './workflow_version';
import type { WorkflowProperties } from '../storage/workflow_storage';

const baseDocument = (): WorkflowProperties =>
  ({
    name: 'Test',
    enabled: true,
    tags: [],
    triggerTypes: [],
    yaml: 'name: Test',
    definition: null,
    createdBy: 'user',
    lastUpdatedBy: 'user',
    spaceId: 'default',
    valid: true,
    deleted_at: null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
  } as WorkflowProperties);

describe('getNextWorkflowVersion', () => {
  it('returns 1 when existing document has no version', () => {
    expect(getNextWorkflowVersion(undefined)).toBe(INITIAL_WORKFLOW_VERSION);
    expect(getNextWorkflowVersion({})).toBe(INITIAL_WORKFLOW_VERSION);
  });

  it('increments from the existing version', () => {
    expect(getNextWorkflowVersion({ version: 5 })).toBe(6);
  });
});

describe('applyWorkflowVersion', () => {
  it('sets version 1 on create when existing is undefined', () => {
    expect(applyWorkflowVersion(baseDocument(), undefined)).toEqual(
      expect.objectContaining({ version: 1 })
    );
  });

  it('bumps version from fresh existing on update', () => {
    const existing = { ...baseDocument(), version: 6 };
    expect(applyWorkflowVersion({ ...existing, tags: ['new'] }, existing)).toEqual(
      expect.objectContaining({ tags: ['new'], version: 7 })
    );
  });

  it('uses fresh existing version after concurrent writer wins OCC', () => {
    const staleExisting = { ...baseDocument(), version: 5 };
    const freshExisting = { ...baseDocument(), version: 6 };
    const document = { ...staleExisting, tags: ['patched'] };

    expect(applyWorkflowVersion(document, staleExisting).version).toBe(6);
    expect(applyWorkflowVersion(document, freshExisting).version).toBe(7);
  });
});

describe('maybeApplyWorkflowVersion', () => {
  it('bumps version when versioning is enabled', () => {
    const existing = { ...baseDocument(), version: 3 };
    expect(maybeApplyWorkflowVersion({ ...existing, name: 'Updated' }, existing, true)).toEqual(
      expect.objectContaining({ name: 'Updated', version: 4 })
    );
  });

  it('preserves existing version when versioning is disabled', () => {
    const existing = { ...baseDocument(), version: 3 };
    expect(maybeApplyWorkflowVersion({ ...existing, name: 'Updated' }, existing, false)).toEqual(
      expect.objectContaining({ name: 'Updated', version: 3 })
    );
  });

  it('preserves existing version when document omits it and versioning is disabled', () => {
    const existing = { ...baseDocument(), version: 3 };
    const { version: _version, ...documentWithoutVersion } = existing;
    expect(
      maybeApplyWorkflowVersion(documentWithoutVersion as WorkflowProperties, existing, false)
    ).toEqual(expect.objectContaining({ version: 3 }));
  });

  it('omits version on create when versioning is disabled', () => {
    expect(maybeApplyWorkflowVersion(baseDocument(), undefined, false)).not.toHaveProperty(
      'version'
    );
  });
});
