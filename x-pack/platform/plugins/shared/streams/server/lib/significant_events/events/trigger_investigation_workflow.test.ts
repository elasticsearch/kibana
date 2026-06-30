/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest, Logger } from '@kbn/core/server';
import type { SignificantEvent } from '@kbn/significant-events-schema';
import { triggerInvestigationWorkflow } from './trigger_investigation_workflow';

const createEvent = (overrides: Partial<SignificantEvent> = {}): SignificantEvent => ({
  '@timestamp': '2026-01-01T00:00:00.000Z',
  created_at: '2026-01-01T00:00:00.000Z',
  event_id: 'event-1',
  discovery_slug: 'checkout-latency-breach',
  status: 'promoted',
  stream_names: ['logs.checkout', 'metrics.checkout'],
  title: 'Checkout latency breach',
  summary: 'P99 latency climbed above 2s.',
  root_cause: 'Connection pool exhaustion.',
  criticality: 80,
  confidence: 0.9,
  recommendations: ['Increase pool size'],
  ...overrides,
});

const createWorkflowsManagement = ({
  workflowExists = true,
  executionId = 'exec-abc',
}: {
  workflowExists?: boolean;
  executionId?: string;
} = {}) => ({
  management: {
    getWorkflow: jest
      .fn()
      .mockResolvedValue(
        workflowExists ? { id: 'system-streams-investigation', definition: 'yaml: ...' } : null
      ),
    runWorkflow: jest.fn().mockResolvedValue(executionId),
  },
});

const createSpaces = (spaceId = 'default') => ({
  spacesService: {
    getSpaceId: jest.fn().mockReturnValue(spaceId),
  },
});

const createRequest = () => ({} as KibanaRequest);
const createLogger = () =>
  ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  } as unknown as Logger);

describe('triggerInvestigationWorkflow', () => {
  it('returns the execution id when the workflow starts successfully', async () => {
    const event = createEvent();
    const workflowsManagement = createWorkflowsManagement();
    const spaces = createSpaces();

    const result = await triggerInvestigationWorkflow({
      workflowsManagement: workflowsManagement as never,
      spaces: spaces as never,
      request: createRequest(),
      logger: createLogger(),
      event,
    });

    expect(result).toBe('exec-abc');
    expect(workflowsManagement.management.runWorkflow).toHaveBeenCalledTimes(1);
  });

  it('builds the message from event title, summary, and root_cause', async () => {
    const event = createEvent({
      title: 'High error rate',
      summary: 'Error rate spiked.',
      root_cause: 'Bad deploy.',
    });
    const workflowsManagement = createWorkflowsManagement();

    await triggerInvestigationWorkflow({
      workflowsManagement: workflowsManagement as never,
      spaces: createSpaces() as never,
      request: createRequest(),
      logger: createLogger(),
      event,
    });

    const [, , inputs] = workflowsManagement.management.runWorkflow.mock.calls[0];
    expect(inputs.message).toBe(
      'High error rate\n\nError rate spiked.\n\nProbable cause: Bad deploy.'
    );
  });

  it('uses discovery_slug as the concurrency_key', async () => {
    const event = createEvent({ discovery_slug: 'my-slug' });
    const workflowsManagement = createWorkflowsManagement();

    await triggerInvestigationWorkflow({
      workflowsManagement: workflowsManagement as never,
      spaces: createSpaces() as never,
      request: createRequest(),
      logger: createLogger(),
      event,
    });

    const [, , inputs] = workflowsManagement.management.runWorkflow.mock.calls[0];
    expect(inputs.concurrency_key).toBe('my-slug');
  });

  it('includes event_id in the context so the workflow can attach investigations', async () => {
    const event = createEvent({ event_id: 'event-42' });
    const workflowsManagement = createWorkflowsManagement();

    await triggerInvestigationWorkflow({
      workflowsManagement: workflowsManagement as never,
      spaces: createSpaces() as never,
      request: createRequest(),
      logger: createLogger(),
      event,
    });

    const [, , inputs] = workflowsManagement.management.runWorkflow.mock.calls[0];
    expect(inputs.context.event_id).toBe('event-42');
    expect(inputs.context.source).toBe('significant_event');
  });

  it('returns undefined when workflowsManagement is not available', async () => {
    const result = await triggerInvestigationWorkflow({
      workflowsManagement: undefined,
      spaces: createSpaces() as never,
      request: createRequest(),
      logger: createLogger(),
      event: createEvent(),
    });

    expect(result).toBeUndefined();
  });

  it('returns undefined when the managed workflow is not installed', async () => {
    const workflowsManagement = createWorkflowsManagement({ workflowExists: false });

    const result = await triggerInvestigationWorkflow({
      workflowsManagement: workflowsManagement as never,
      spaces: createSpaces() as never,
      request: createRequest(),
      logger: createLogger(),
      event: createEvent(),
    });

    expect(result).toBeUndefined();
    expect(workflowsManagement.management.runWorkflow).not.toHaveBeenCalled();
  });

  it('uses DEFAULT_SPACE_ID when spaces plugin is not available', async () => {
    const event = createEvent();
    const workflowsManagement = createWorkflowsManagement();

    await triggerInvestigationWorkflow({
      workflowsManagement: workflowsManagement as never,
      spaces: undefined,
      request: createRequest(),
      logger: createLogger(),
      event,
    });

    const [, spaceId] = workflowsManagement.management.runWorkflow.mock.calls[0];
    expect(spaceId).toBe('default');
  });
});
