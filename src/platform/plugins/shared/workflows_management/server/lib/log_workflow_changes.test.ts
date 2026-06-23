/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { loggingSystemMock } from '@kbn/core/server/mocks';

import { logWorkflowChanges } from './log_workflow_changes';
import {
  WORKFLOW_CHANGE_HISTORY_OBJECT_TYPE,
  WorkflowChangeHistoryAction,
} from '../services/workflow_change_history_constants';
import type { IScopedWorkflowChangeHistoryService } from '../services/workflow_change_history_types';
import type { WorkflowProperties } from '../storage/workflow_storage';

jest.mock('@kbn/occ', () => {
  const actual = jest.requireActual('@kbn/occ');
  return {
    ...actual,
    delayMs: jest.fn().mockResolvedValue(undefined),
  };
});

const { delayMs } = jest.requireMock('@kbn/occ') as { delayMs: jest.Mock };

const REFERENCE_TIMESTAMP_MS = Date.UTC(2026, 0, 15, 12, 30, 45, 678);
const REFERENCE_TIMESTAMP_ISO = new Date(REFERENCE_TIMESTAMP_MS).toISOString();

const makeDocument = (overrides: Partial<WorkflowProperties> = {}): WorkflowProperties =>
  ({
    name: 'Test workflow',
    description: '',
    enabled: true,
    tags: [],
    triggerTypes: [],
    yaml: 'name: Test workflow',
    definition: null,
    createdBy: 'user',
    lastUpdatedBy: 'user',
    spaceId: 'default',
    valid: true,
    deleted_at: null,
    created_at: '2024-01-01T00:00:00.000Z',
    updated_at: '2024-01-01T00:00:00.000Z',
    version: 3,
    ...overrides,
  } as WorkflowProperties);

describe('logWorkflowChanges', () => {
  let scopedChangeHistory: jest.Mocked<IScopedWorkflowChangeHistoryService>;
  let logger: ReturnType<typeof loggingSystemMock.createLogger>;

  beforeEach(() => {
    jest.clearAllMocks();
    scopedChangeHistory = {
      log: jest.fn().mockResolvedValue(undefined),
      logBulk: jest.fn().mockResolvedValue(undefined),
      getHistory: jest.fn(),
    };
    logger = loggingSystemMock.createLogger();
  });

  const logChanges = (overrides: Partial<Parameters<typeof logWorkflowChanges>[0]> = {}) =>
    logWorkflowChanges({
      workflows: [{ id: 'wf-1', document: makeDocument() }],
      changeHistoryService: { isInitialized: () => true },
      scopedChangeHistory,
      workflowVersioningEnabled: true,
      action: WorkflowChangeHistoryAction.workflowUpdate,
      spaceId: 'default',
      timestamp: new Date(REFERENCE_TIMESTAMP_MS),
      logger,
      ...overrides,
    });

  it('does not call logBulk when workflow versioning is disabled', async () => {
    await logChanges({ workflowVersioningEnabled: false });

    expect(scopedChangeHistory.logBulk).not.toHaveBeenCalled();
  });

  it('does not call logBulk when change history is not initialized', async () => {
    await logChanges({
      changeHistoryService: { isInitialized: () => false },
    });

    expect(scopedChangeHistory.logBulk).not.toHaveBeenCalled();
  });

  it('does not call logBulk when scoped change history is missing', async () => {
    await logChanges({ scopedChangeHistory: undefined });

    expect(scopedChangeHistory.logBulk).not.toHaveBeenCalled();
  });

  it('does not call logBulk when change history service is missing', async () => {
    await logChanges({ changeHistoryService: undefined });

    expect(scopedChangeHistory.logBulk).not.toHaveBeenCalled();
  });

  it('does not call logBulk when workflows is empty', async () => {
    await logChanges({ workflows: [] });

    expect(scopedChangeHistory.logBulk).not.toHaveBeenCalled();
  });

  it('logs changes with sequence from document.version', async () => {
    await logChanges({
      workflows: [{ id: 'wf-1', document: makeDocument({ version: 7 }) }],
    });

    expect(scopedChangeHistory.logBulk).toHaveBeenCalledWith(
      [
        {
          timestamp: REFERENCE_TIMESTAMP_ISO,
          objectId: 'wf-1',
          objectType: WORKFLOW_CHANGE_HISTORY_OBJECT_TYPE,
          sequence: 7,
          snapshot: { yaml: 'name: Test workflow' },
        },
      ],
      {
        action: WorkflowChangeHistoryAction.workflowUpdate,
        spaceId: 'default',
      }
    );
  });

  it('normalizes a string timestamp to ISO format', async () => {
    await logChanges({ timestamp: REFERENCE_TIMESTAMP_ISO });

    expect(scopedChangeHistory.logBulk).toHaveBeenCalledWith(
      [
        expect.objectContaining({
          timestamp: REFERENCE_TIMESTAMP_ISO,
          objectId: 'wf-1',
        }),
      ],
      expect.any(Object)
    );
  });

  it('retries transient failures and succeeds on the third attempt', async () => {
    scopedChangeHistory.logBulk
      .mockRejectedValueOnce({ statusCode: 503 })
      .mockRejectedValueOnce({ statusCode: 503 })
      .mockResolvedValueOnce(undefined);

    await logChanges({ maxRetries: 3, retryDelayMs: 25 });

    expect(scopedChangeHistory.logBulk).toHaveBeenCalledTimes(3);
    expect(delayMs).toHaveBeenCalledTimes(2);
    expect(delayMs).toHaveBeenCalledWith(25);
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('logs debug when retrying a transient failure', async () => {
    scopedChangeHistory.logBulk
      .mockRejectedValueOnce({ statusCode: 503 })
      .mockResolvedValueOnce(undefined);

    await logChanges({ maxRetries: 2, retryDelayMs: 10 });

    expect(logger.debug).toHaveBeenCalledWith(
      expect.stringContaining(
        `Change-history write failed for action "${WorkflowChangeHistoryAction.workflowUpdate}", retrying (attempt 1/3)`
      )
    );
    expect(logger.error).not.toHaveBeenCalled();
  });

  it('logs an error and does not throw when all retry attempts fail', async () => {
    scopedChangeHistory.logBulk.mockRejectedValue({ statusCode: 503 });

    await expect(logChanges({ maxRetries: 2, retryDelayMs: 10 })).resolves.toBeUndefined();

    expect(scopedChangeHistory.logBulk).toHaveBeenCalledTimes(3);
    expect(logger.error).toHaveBeenCalledWith(
      expect.stringContaining(
        `Unable to log workflow changes for action "${WorkflowChangeHistoryAction.workflowUpdate}"`
      ),
      expect.objectContaining({ error: expect.objectContaining({ statusCode: 503 }) })
    );
  });

  it('does not retry non-retryable errors', async () => {
    scopedChangeHistory.logBulk.mockRejectedValue({ statusCode: 400 });

    await logChanges({ maxRetries: 3 });

    expect(scopedChangeHistory.logBulk).toHaveBeenCalledTimes(1);
    expect(delayMs).not.toHaveBeenCalled();
    expect(logger.error).toHaveBeenCalled();
  });

  it('passes correlationId for bulk operations', async () => {
    await logChanges({ correlationId: 'bulk-123' });

    expect(scopedChangeHistory.logBulk).toHaveBeenCalledWith(expect.any(Array), {
      action: WorkflowChangeHistoryAction.workflowUpdate,
      spaceId: 'default',
      correlationId: 'bulk-123',
    });
  });

  it('logs without sequence when document.version is missing', async () => {
    const { version: _version, ...withoutVersion } = makeDocument({ version: 5 });

    await logChanges({
      workflows: [
        { id: 'wf-1', document: makeDocument({ version: 2 }) },
        { id: 'wf-2', document: withoutVersion as WorkflowProperties },
      ],
    });

    expect(scopedChangeHistory.logBulk).toHaveBeenCalledWith(
      [
        {
          timestamp: REFERENCE_TIMESTAMP_ISO,
          objectId: 'wf-1',
          objectType: WORKFLOW_CHANGE_HISTORY_OBJECT_TYPE,
          sequence: 2,
          snapshot: { yaml: 'name: Test workflow' },
        },
        {
          timestamp: REFERENCE_TIMESTAMP_ISO,
          objectId: 'wf-2',
          objectType: WORKFLOW_CHANGE_HISTORY_OBJECT_TYPE,
          snapshot: { yaml: 'name: Test workflow' },
        },
      ],
      {
        action: WorkflowChangeHistoryAction.workflowUpdate,
        spaceId: 'default',
      }
    );
    expect(scopedChangeHistory.logBulk.mock.calls[0][0][1]).not.toHaveProperty('sequence');
    expect(logger.warn).toHaveBeenCalledWith(
      expect.stringContaining("Logging workflow change history for 'wf-2' without object.sequence")
    );
  });
});
