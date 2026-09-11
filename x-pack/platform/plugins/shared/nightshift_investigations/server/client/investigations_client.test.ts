/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest, Logger } from '@kbn/core/server';
import { ExecutionStatus } from '@kbn/workflows';
import {
  DEDUCTIVE_INVESTIGATION_WORKFLOW_ID,
  SIGNIFICANT_EVENTS_INVESTIGATION_WORKFLOW_ID,
} from '@kbn/workflows/managed';
import type { WorkflowsServerPluginSetup } from '@kbn/workflows-management-plugin/server';
import type { AgentBuilderPluginStart } from '@kbn/agent-builder-server';
import type { InvestigationStatus } from '../../common';
import { freeFormContextSchema } from '../../common/schemas';
import { installInvestigationAgent } from '../lib/install_investigation_agent';
import { installDeductiveInvestigationAgent } from '../lib/install_deductive_investigation_agent';
import type {
  FindInvestigationsResult,
  InvestigationAttributes,
  InvestigationRecord,
  InvestigationRepository,
} from '../storage';
import { InvestigationAlreadyExistsError, InvestigationStaleWriteError } from '../storage';
import {
  InvestigationConflictError,
  InvalidInvestigationContextError,
  InvestigationNotFoundError,
  InvestigationSubjectMissingError,
  InvestigationUnavailableError,
} from './errors';
import { NightshiftInvestigationsClient } from './investigations_client';

jest.mock('../lib/install_investigation_agent', () => ({
  installInvestigationAgent: jest.fn().mockResolvedValue(undefined),
}));

jest.mock('../lib/install_deductive_investigation_agent', () => ({
  installDeductiveInvestigationAgent: jest.fn().mockResolvedValue(undefined),
}));

const installInvestigationAgentMock = installInvestigationAgent as jest.MockedFunction<
  typeof installInvestigationAgent
>;

const installDeductiveInvestigationAgentMock =
  installDeductiveInvestigationAgent as jest.MockedFunction<
    typeof installDeductiveInvestigationAgent
  >;

const SPACE_ID = 'test-space';

const mockManagement = {
  getWorkflowExecution: jest.fn(),
  getWorkflow: jest.fn(),
  runWorkflow: jest.fn(),
};

const mockWorkflowsManagement = {
  management: mockManagement,
} as unknown as WorkflowsServerPluginSetup;

const mockAgentBuilder = {} as unknown as AgentBuilderPluginStart;

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
} as unknown as Logger;

const mockRequest = {} as KibanaRequest;

let repository: jest.Mocked<InvestigationRepository>;

const makeClient = (
  overrides: Partial<ConstructorParameters<typeof NightshiftInvestigationsClient>[0]> = {}
) =>
  new NightshiftInvestigationsClient({
    request: mockRequest,
    workflowsManagement: mockWorkflowsManagement,
    logger: mockLogger,
    spaceIdOverride: SPACE_ID,
    agentBuilder: mockAgentBuilder,
    investigationRepository: repository,
    isAvailable: jest.fn().mockResolvedValue(true),
    ...overrides,
  });

const makeAttrs = (overrides: Partial<InvestigationAttributes> = {}): InvestigationAttributes => ({
  status: 'completed',
  subject_type: 'alert',
  subject_id: 'alert-42',
  trigger_type: 'automatic',
  concurrency_key: undefined,
  executed_by: 'test-user',
  created_at: '2024-01-01T00:00:00Z',
  started_at: '2024-01-01T00:00:00Z',
  completed_at: '2024-01-01T01:00:00Z',
  summary: 'All clear.',
  conclusion: 'No issues found.',
  hypotheses: [{ candidate: 'h1', confidence: 0.9, status: 'confirmed' }],
  recommendations: [{ title: 'Keep monitoring', confidence: 0.7 }],
  blind_spots: [{ title: 'Blind spot', confidence: 0.6, description: 'desc' }],
  trigger_feedback: [],
  ...overrides,
});

const makeRecord = (
  overrides: Partial<InvestigationAttributes> = {},
  { id = 'inv-1', version = '1' }: { id?: string; version?: string } = {}
): InvestigationRecord => ({
  id,
  version,
  ...makeAttrs(overrides),
});

const findResult = (records: InvestigationRecord[]): FindInvestigationsResult => ({
  results: records,
  page: 1,
  size: 20,
  total: records.length,
});

const createMockRepository = (): jest.Mocked<InvestigationRepository> => ({
  create: jest.fn().mockResolvedValue(undefined),
  get: jest.fn().mockResolvedValue(undefined),
  update: jest.fn().mockResolvedValue(undefined),
  find: jest.fn().mockResolvedValue(findResult([])),
  countBySeverity: jest
    .fn()
    .mockResolvedValue({ '80-critical': 0, '60-high': 0, '40-medium': 0, '20-low': 0 }),
});

beforeEach(() => {
  jest.clearAllMocks();
  installInvestigationAgentMock.mockResolvedValue(undefined);
  installDeductiveInvestigationAgentMock.mockResolvedValue(undefined);
  repository = createMockRepository();
});

describe('NightshiftInvestigationsClient.get()', () => {
  it('throws InvestigationNotFoundError when the record does not exist', async () => {
    await expect(makeClient().get('inv-123')).rejects.toThrow(InvestigationNotFoundError);
  });

  it('returns full structured output from the store', async () => {
    repository.get.mockResolvedValue(
      makeRecord({
        conversation_id: 'conv-1',
        impact: { entities: [{ name: 'checkout-service' }] },
      })
    );
    const result = await makeClient().get('inv-1');

    expect(result).toEqual({
      investigation_id: 'inv-1',
      subject: { type: 'alert', id: 'alert-42' },
      trigger_type: 'automatic',
      status: 'completed',
      created_at: '2024-01-01T00:00:00Z',
      started_at: '2024-01-01T00:00:00Z',
      completed_at: '2024-01-01T01:00:00Z',
      concurrency_key: undefined,
      executed_by: 'test-user',
      error: undefined,
      summary: 'All clear.',
      conclusion: 'No issues found.',
      severity: undefined,
      hypotheses: [{ candidate: 'h1', confidence: 0.9, status: 'confirmed' }],
      recommendations: [{ title: 'Keep monitoring', confidence: 0.7 }],
      blind_spots: [{ title: 'Blind spot', confidence: 0.6, description: 'desc' }],
      trigger_feedback: [],
      conversation_id: 'conv-1',
      impact: { entities: [{ name: 'checkout-service' }] },
    });
  });

  it('omits historical recommendation and blind-spot arrays without confidence', async () => {
    repository.get.mockResolvedValue({
      ...makeRecord(),
      recommendations: [{ title: 'Keep monitoring' }],
      blind_spots: [{ title: 'Blind spot', description: 'desc' }],
    } as unknown as InvestigationRecord);

    const result = await makeClient().get('inv-1');

    expect(result.summary).toBe('All clear.');
    expect(result.recommendations).toBeUndefined();
    expect(result.blind_spots).toBeUndefined();
  });

  it('returns subject.summary from the stored subject_summary attribute', async () => {
    const long = `${'x'.repeat(400)} and a trailing clause that must not be cut mid-sentence.`;
    repository.get.mockResolvedValue(
      makeRecord({
        subject_type: 'significant_event',
        subject_id: 'event-42',
        subject_summary: long,
      })
    );

    const result = await makeClient().get('inv-1');

    expect(result.subject).toEqual({
      type: 'significant_event',
      id: 'event-42',
      summary: long,
    });
  });

  it('omits subject.summary when subject_summary is absent', async () => {
    repository.get.mockResolvedValue(makeRecord());
    const result = await makeClient().get('inv-1');
    expect(result.subject).toEqual({ type: 'alert', id: 'alert-42' });
  });

  it('returns the stored running status without consulting the workflow engine', async () => {
    repository.get.mockResolvedValue(makeRecord({ status: 'running', completed_at: undefined }));

    const result = await makeClient().get('inv-1');

    expect(result.status).toBe('running');
    expect(mockManagement.getWorkflowExecution).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('returns the stored started_at', async () => {
    repository.get.mockResolvedValue(
      makeRecord({ started_at: '2024-01-01T00:05:00Z', created_at: '2024-01-01T00:00:00Z' })
    );

    const result = await makeClient().get('inv-1');

    expect(result.started_at).toBe('2024-01-01T00:05:00Z');
  });

  it('returns created_at with started_at unset for a pending record', async () => {
    repository.get.mockResolvedValue(
      makeRecord({
        status: 'pending',
        started_at: undefined,
        completed_at: undefined,
        created_at: '2024-01-01T00:00:00Z',
      })
    );

    const result = await makeClient().get('inv-1');

    expect(result.status).toBe('pending');
    expect(result.created_at).toBe('2024-01-01T00:00:00Z');
    expect(result.started_at).toBeUndefined();
  });

  it('returns the stored severity', async () => {
    repository.get.mockResolvedValue(makeRecord({ severity: '60-high' }));
    const result = await makeClient().get('inv-1');
    expect(result.severity).toBe('60-high');
  });

  it('leaves severity unset when the record has none', async () => {
    repository.get.mockResolvedValue(makeRecord());
    const result = await makeClient().get('inv-1');
    expect(result.severity).toBeUndefined();
  });
});

describe('NightshiftInvestigationsClient.list()', () => {
  it('uses default page=1 and perPage=20', async () => {
    await makeClient().list();
    expect(repository.find).toHaveBeenCalledWith(expect.objectContaining({ page: 1, perPage: 20 }));
  });

  it('passes statuses filter', async () => {
    await makeClient().list({ statuses: ['running', 'completed'] });
    expect(repository.find).toHaveBeenCalledWith(
      expect.objectContaining({ statuses: ['running', 'completed'] })
    );
  });

  it('passes sort_field=completed_at through as sortField', async () => {
    await makeClient().list({ sort_field: 'completed_at' });
    expect(repository.find).toHaveBeenCalledWith(
      expect.objectContaining({ sortField: 'completed_at' })
    );
  });

  it('maps started_* filters onto started_at, leaving created_at unfiltered', async () => {
    await makeClient().list({
      started_after: '2024-01-01T00:00:00Z',
      started_before: '2024-01-31T00:00:00Z',
    });
    expect(repository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        startedAfter: '2024-01-01T00:00:00Z',
        startedBefore: '2024-01-31T00:00:00Z',
        createdAfter: undefined,
        createdBefore: undefined,
      })
    );
  });

  it('maps created_* filters onto created_at so pending runs are matchable', async () => {
    await makeClient().list({
      created_after: '2024-01-01T00:00:00Z',
      created_before: '2024-01-31T00:00:00Z',
    });
    expect(repository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        createdAfter: '2024-01-01T00:00:00Z',
        createdBefore: '2024-01-31T00:00:00Z',
        startedAfter: undefined,
        startedBefore: undefined,
      })
    );
  });

  it('maps concurrency_key onto the stored investigation filter', async () => {
    await makeClient().list({ concurrency_key: 'alert-1' });
    expect(repository.find).toHaveBeenCalledWith(
      expect.objectContaining({ concurrencyKey: 'alert-1' })
    );
  });

  it('omits sortField when sort_field is not given so the store default applies', async () => {
    await makeClient().list({});
    expect(repository.find).toHaveBeenCalledWith(expect.objectContaining({ sortField: undefined }));
  });

  it('returns a slim list item without structured output', async () => {
    repository.find.mockResolvedValue(
      findResult([makeRecord({ concurrency_key: 'key-1' }, { id: 'inv-42' })])
    );

    const result = await makeClient().list({});
    expect(result.results[0]).toEqual({
      investigation_id: 'inv-42',
      status: 'completed',
      created_at: '2024-01-01T00:00:00Z',
      started_at: '2024-01-01T00:00:00Z',
      completed_at: '2024-01-01T01:00:00Z',
      severity: undefined,
      concurrency_key: 'key-1',
      executed_by: 'test-user',
      subject: { type: 'alert', id: 'alert-42' },
      // Rendered by the list row: the AI headline and the entity chips.
      summary: 'All clear.',
      impact: undefined,
    });
    expect(result.results[0]).not.toHaveProperty('trigger_type');
    expect(result.results[0]).not.toHaveProperty('error');
    expect(result.results[0]).not.toHaveProperty('conclusion');
    expect(result.results[0]).not.toHaveProperty('hypotheses');
    expect(result.results[0]).not.toHaveProperty('recommendations');
    expect(result.results[0]).not.toHaveProperty('blind_spots');
    expect(result.results[0]).not.toHaveProperty('conversation_id');
  });

  it('returns stored running items without consulting the workflow engine', async () => {
    repository.find.mockResolvedValue(
      findResult([
        makeRecord({ status: 'running', completed_at: undefined }, { id: 'inv-running' }),
      ])
    );

    const result = await makeClient().list({});

    expect(result.results[0].status).toBe('running');
    expect(mockManagement.getWorkflowExecution).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('returns severity on list items when stored', async () => {
    repository.find.mockResolvedValue(
      findResult([makeRecord({ severity: '80-critical' }, { id: 'inv-42' })])
    );

    const result = await makeClient().list({});
    expect(result.results[0].severity).toBe('80-critical');
  });
});

describe('NightshiftInvestigationsClient.start()', () => {
  const WORKFLOW_ID = SIGNIFICANT_EVENTS_INVESTIGATION_WORKFLOW_ID;
  const mockWorkflow = { id: WORKFLOW_ID, enabled: true, valid: true, definition: { steps: [] } };

  const alertContext = {
    alerts: [
      {
        id: 'alert-1',
        rule_id: 'rule-1',
        rule_name: 'Latency is too high',
        rule_type_id: 'apm.transaction_duration',
        rule_category: 'Latency threshold',
        reason: 'Latency is 2.5s for service checkout',
        status: 'active',
        start: '2026-08-24T12:00:00.000Z',
        flapping: false,
      },
    ],
  };

  beforeEach(() => {
    repository.get.mockResolvedValue(undefined);
  });

  it('calls runWorkflow with the correct inputs and returns investigation_id', async () => {
    mockManagement.getWorkflow.mockResolvedValue(mockWorkflow);
    mockManagement.runWorkflow.mockResolvedValue('exec-123');

    const result = await makeClient().start({
      subject: { type: 'alert', id: 'alert-1' },
      context: alertContext,
    });

    expect(mockManagement.runWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ id: WORKFLOW_ID }),
      SPACE_ID,
      expect.objectContaining({
        context: expect.objectContaining({
          source: 'alert',
          alert_id: 'alert-1',
          trigger_type: 'manual',
        }),
      }),
      expect.anything(),
      'nightshift-investigations'
    );
    expect(result).toEqual({ investigation_id: 'exec-123' });
  });

  it('starts manual runs on the deductive investigation workflow', async () => {
    const deductiveWorkflow = {
      id: DEDUCTIVE_INVESTIGATION_WORKFLOW_ID,
      enabled: true,
      valid: true,
      definition: { steps: [] },
    };
    mockManagement.getWorkflow.mockResolvedValue(deductiveWorkflow);
    mockManagement.runWorkflow.mockResolvedValue('exec-manual');

    const result = await makeClient().start({
      subject: { type: 'manual', id: 'manual' },
      message: 'Why did payment timeouts increase?',
    });

    expect(mockManagement.getWorkflow).toHaveBeenCalledWith(
      DEDUCTIVE_INVESTIGATION_WORKFLOW_ID,
      SPACE_ID
    );
    // The deductive workflow calls its own agent, so the pre-install must follow the split.
    expect(installDeductiveInvestigationAgentMock).toHaveBeenCalledWith({
      agentBuilder: mockAgentBuilder,
      spaceId: SPACE_ID,
    });
    expect(installInvestigationAgentMock).not.toHaveBeenCalled();
    expect(mockManagement.runWorkflow).toHaveBeenCalledWith(
      expect.objectContaining({ id: DEDUCTIVE_INVESTIGATION_WORKFLOW_ID }),
      SPACE_ID,
      expect.objectContaining({
        message: 'Why did payment timeouts increase?',
        context: expect.objectContaining({ source: 'manual', manual_id: 'manual' }),
      }),
      expect.anything(),
      'nightshift-investigations'
    );
    expect(result).toEqual({ investigation_id: 'exec-manual' });
  });

  it('keeps significant event runs on the significant events investigation workflow', async () => {
    mockManagement.getWorkflow.mockResolvedValue(mockWorkflow);
    mockManagement.runWorkflow.mockResolvedValue('exec-sig');

    await makeClient().start({ subject: { type: 'significant_event', id: 'event-1' } });

    expect(mockManagement.getWorkflow).toHaveBeenCalledWith(WORKFLOW_ID, SPACE_ID);
  });

  it('persists an explicit trigger_type into the workflow context', async () => {
    mockManagement.getWorkflow.mockResolvedValue(mockWorkflow);
    mockManagement.runWorkflow.mockResolvedValue('exec-124');

    await makeClient().start({
      subject: { type: 'alert', id: 'alert-2' },
      trigger_type: 'automatic',
      context: alertContext,
    });

    expect(mockManagement.runWorkflow).toHaveBeenCalledWith(
      expect.anything(),
      SPACE_ID,
      expect.objectContaining({
        context: expect.objectContaining({ trigger_type: 'automatic' }),
      }),
      expect.anything(),
      'nightshift-investigations'
    );
  });

  it('persists the subject summary into the workflow context', async () => {
    mockManagement.getWorkflow.mockResolvedValue(mockWorkflow);
    mockManagement.runWorkflow.mockResolvedValue('exec-123');

    await makeClient().start({
      subject: { type: 'alert', id: 'alert-1', summary: 'CPU saturation on checkout-api' },
      context: alertContext,
    });

    const [, , inputs] = mockManagement.runWorkflow.mock.calls[0];
    expect(inputs.context.summary).toBe('CPU saturation on checkout-api');
  });

  it('omits the context summary when none was supplied', async () => {
    mockManagement.getWorkflow.mockResolvedValue(mockWorkflow);
    mockManagement.runWorkflow.mockResolvedValue('exec-123');

    await makeClient().start({ subject: { type: 'alert', id: 'alert-1' }, context: alertContext });

    const [, , inputs] = mockManagement.runWorkflow.mock.calls[0];
    expect(inputs.context).not.toHaveProperty('summary');
  });

  it('includes concurrency_key in inputs when provided', async () => {
    mockManagement.getWorkflow.mockResolvedValue(mockWorkflow);
    mockManagement.runWorkflow.mockResolvedValue('exec-456');

    await makeClient().start({
      subject: { type: 'significant_event', id: 'se-99' },
      concurrency_key: 'key-abc',
    });

    expect(mockManagement.runWorkflow).toHaveBeenCalledWith(
      expect.anything(),
      SPACE_ID,
      expect.objectContaining({ concurrency_key: 'key-abc' }),
      expect.anything(),
      'nightshift-investigations'
    );
  });

  it('uses the caller-supplied message and stream_names when provided', async () => {
    mockManagement.getWorkflow.mockResolvedValue(mockWorkflow);
    mockManagement.runWorkflow.mockResolvedValue('exec-789');

    await makeClient().start({
      subject: { type: 'significant_event', id: 'se-1' },
      message: 'Checkout latency breach\n\nP99 latency climbed above 2s.',
      stream_names: ['logs.checkout'],
    });

    const [, , inputs] = mockManagement.runWorkflow.mock.calls[0];
    expect(inputs.message).toBe('Checkout latency breach\n\nP99 latency climbed above 2s.');
    expect(inputs.stream_names).toEqual(['logs.checkout']);
  });

  // Uses a significant event subject: an alert investigation cannot reach the generic fallback
  // any more, because it is rejected without the alert data the brief is composed from.
  it('falls back to a generic message and empty stream_names when omitted', async () => {
    mockManagement.getWorkflow.mockResolvedValue(mockWorkflow);
    mockManagement.runWorkflow.mockResolvedValue('exec-999');

    await makeClient().start({ subject: { type: 'significant_event', id: 'se-1' } });

    const [, , inputs] = mockManagement.runWorkflow.mock.calls[0];
    expect(inputs.message).toBe('Investigation requested for significant_event se-1');
    expect(inputs.stream_names).toEqual([]);
  });

  it('ensures the investigation agent exists in the space before running the workflow', async () => {
    mockManagement.getWorkflow.mockResolvedValue(mockWorkflow);
    mockManagement.runWorkflow.mockResolvedValue('exec-123');

    await makeClient().start({ subject: { type: 'alert', id: 'alert-1' }, context: alertContext });

    expect(installInvestigationAgentMock).toHaveBeenCalledWith({
      agentBuilder: mockAgentBuilder,
      spaceId: SPACE_ID,
    });
    expect(installInvestigationAgentMock.mock.invocationCallOrder[0]).toBeLessThan(
      mockManagement.runWorkflow.mock.invocationCallOrder[0]
    );
  });

  it('throws InvestigationUnavailableError when the workflow is not installed', async () => {
    mockManagement.getWorkflow.mockResolvedValue(null);

    await expect(
      makeClient().start({ subject: { type: 'significant_event', id: 'se-1' } })
    ).rejects.toThrow(InvestigationUnavailableError);
  });

  it('throws InvestigationUnavailableError when agentBuilder is not available', async () => {
    const client = new NightshiftInvestigationsClient({
      request: mockRequest,
      workflowsManagement: mockWorkflowsManagement,
      logger: mockLogger,
      spaceIdOverride: SPACE_ID,
      investigationRepository: repository,
      isAvailable: jest.fn().mockResolvedValue(true),
    });

    await expect(client.start({ subject: { type: 'alert', id: 'alert-1' } })).rejects.toThrow(
      InvestigationUnavailableError
    );
  });

  it('throws InvestigationUnavailableError when a start requirement is unavailable', async () => {
    await expect(
      makeClient({ isAvailable: jest.fn().mockResolvedValue(false) }).start({
        subject: { type: 'significant_event', id: 'se-1' },
      })
    ).rejects.toThrow(InvestigationUnavailableError);
    expect(mockManagement.runWorkflow).not.toHaveBeenCalled();
  });

  // The route schema also enforces this, but the workflow step definition and the plugin start
  // contract reach start() directly, and the step types its context as a plain record.
  describe('alert context validation', () => {
    it.each([
      ['no context at all', undefined],
      ['a context with no alerts key', { source: 'alert' }],
      ['an empty alerts array', { alerts: [] }],
      ['an alert missing required fields', { alerts: [{ id: 'alert-1' }] }],
      ['an alert whose evaluation is the wrong shape', { alerts: [{ evaluation: { value: {} } }] }],
    ])('rejects an alert investigation with %s', async (_label, context) => {
      mockManagement.getWorkflow.mockResolvedValue(mockWorkflow);

      await expect(
        makeClient().start({ subject: { type: 'alert', id: 'alert-1' }, context })
      ).rejects.toThrow(InvalidInvestigationContextError);
      expect(mockManagement.runWorkflow).not.toHaveBeenCalled();
    });

    // Without this, `event_uuid` reaches the workflow's attach steps and files an alert's findings
    // against a significant event.
    it.each([['event_uuid'], ['stream_names'], ['source']])(
      'rejects an alert investigation whose context also carries %s',
      async (key) => {
        mockManagement.getWorkflow.mockResolvedValue(mockWorkflow);

        await expect(
          makeClient().start({
            subject: { type: 'alert', id: 'alert-1' },
            context: { ...alertContext, [key]: 'whatever' },
          })
        ).rejects.toThrow(InvalidInvestigationContextError);
        expect(mockManagement.runWorkflow).not.toHaveBeenCalled();
      }
    );

    it('names the offending keys and fields so the caller can see what was rejected', async () => {
      mockManagement.getWorkflow.mockResolvedValue(mockWorkflow);

      await expect(
        makeClient().start({
          subject: { type: 'alert', id: 'alert-1' },
          context: { ...alertContext, event_uuid: 'se-1', severity: 'high' },
        })
      ).rejects.toThrow(/event_uuid[\s\S]*severity/);
    });

    it('reports which snapshot field was wrong rather than a bare rejection', async () => {
      mockManagement.getWorkflow.mockResolvedValue(mockWorkflow);

      await expect(
        makeClient().start({
          subject: { type: 'alert', id: 'alert-1' },
          context: { alerts: [{ ...alertContext.alerts[0], flapping: 'nope' }] },
        })
      ).rejects.toThrow(/flapping/);
    });

    // The workflow interpolates context.event_uuid into an internal request path, so a value that
    // is not id-shaped could point the attach steps at a different endpoint. Everything else in a
    // significant-event context stays open, because that payload belongs to another plugin.
    it.each([
      ['a path separator', 'events/../../other'],
      ['a parent-directory segment', '..'],
      ['a query string', 'abc?expand=true'],
      ['a fragment', 'abc#frag'],
      ['an empty string', ''],
    ])('rejects a significant event context whose event_uuid carries %s', async (_label, uuid) => {
      mockManagement.getWorkflow.mockResolvedValue(mockWorkflow);

      await expect(
        makeClient().start({
          subject: { type: 'significant_event', id: 'se-1' },
          context: { event_uuid: uuid },
        })
      ).rejects.toThrow(InvalidInvestigationContextError);
      expect(mockManagement.runWorkflow).not.toHaveBeenCalled();
    });

    // A non-string cannot travel through `start`'s typed signature, so it is asserted against the
    // schema directly. This is the shape an untyped caller sends: a JSON body, or a workflow step
    // whose input schema is a record of unknown.
    it('rejects an event_uuid that is not a string at all', () => {
      expect(freeFormContextSchema.safeParse({ event_uuid: { nested: true } }).success).toBe(false);
    });

    it('accepts the uuid shape the significant events plugin actually sends', async () => {
      mockManagement.getWorkflow.mockResolvedValue(mockWorkflow);
      mockManagement.runWorkflow.mockResolvedValue('exec-791');

      await expect(
        makeClient().start({
          subject: { type: 'significant_event', id: 'se-1' },
          context: { event_uuid: '3f2504e0-4f89-11d3-9a0c-0305e82c3301' },
        })
      ).resolves.toEqual({ investigation_id: 'exec-791' });
    });

    it('leaves the free-form context of a significant event subject alone', async () => {
      mockManagement.getWorkflow.mockResolvedValue(mockWorkflow);
      mockManagement.runWorkflow.mockResolvedValue('exec-790');

      await expect(
        makeClient().start({
          subject: { type: 'significant_event', id: 'se-1' },
          context: { event_uuid: 'se-1', severity: 'high' },
        })
      ).resolves.toEqual({ investigation_id: 'exec-790' });
    });

    it('does not require alerts for a significant event subject', async () => {
      mockManagement.getWorkflow.mockResolvedValue(mockWorkflow);
      mockManagement.runWorkflow.mockResolvedValue('exec-789');

      await expect(
        makeClient().start({ subject: { type: 'significant_event', id: 'se-1' } })
      ).resolves.toEqual({ investigation_id: 'exec-789' });
    });

    it('builds the brief from the snapshot rather than the bare subject id', async () => {
      mockManagement.getWorkflow.mockResolvedValue(mockWorkflow);
      mockManagement.runWorkflow.mockResolvedValue('exec-321');

      await makeClient().start({
        subject: { type: 'alert', id: 'alert-1' },
        context: alertContext,
      });

      const inputs = mockManagement.runWorkflow.mock.calls[0][2];
      expect(inputs.message).toContain('Latency is too high');
      expect(inputs.message).not.toBe('Investigation requested for alert alert-1');
    });

    // The composed brief is only for alert subjects; a caller-supplied message still wins
    // everywhere else, which is the behaviour every non-alert caller already relies on.
    it('keeps the caller-supplied message for a significant event subject', async () => {
      mockManagement.getWorkflow.mockResolvedValue(mockWorkflow);
      mockManagement.runWorkflow.mockResolvedValue('exec-654');

      await makeClient().start({
        subject: { type: 'significant_event', id: 'se-1' },
        message: 'Checkout latency breach',
        context: { alerts: [alertContext.alerts[0]] },
      });

      const inputs = mockManagement.runWorkflow.mock.calls[0][2];
      expect(inputs.message).toBe('Checkout latency breach');
    });
  });
});

describe('NightshiftInvestigationsClient.update()', () => {
  beforeEach(() => {
    repository.get.mockResolvedValue(makeRecord({ status: 'running', completed_at: undefined }));
  });

  it('throws InvestigationNotFoundError when the investigation does not exist', async () => {
    repository.get.mockResolvedValue(undefined);

    await expect(makeClient().update('inv-missing', { status: 'completed' })).rejects.toThrow(
      InvestigationNotFoundError
    );
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('is an idempotent no-op when replaying the same terminal status', async () => {
    repository.get.mockResolvedValue(makeRecord({ status: 'completed' }));

    await expect(
      makeClient().update('inv-1', { status: 'completed', summary: 'Replayed.' })
    ).resolves.toBeUndefined();
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('throws InvestigationConflictError when moving a settled investigation back to running', async () => {
    repository.get.mockResolvedValue(makeRecord({ status: 'completed' }));

    await expect(makeClient().update('inv-1', { status: 'running' })).rejects.toThrow(
      InvestigationConflictError
    );
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('throws InvestigationConflictError when changing one terminal status to another', async () => {
    repository.get.mockResolvedValue(makeRecord({ status: 'cancelled' }));

    await expect(makeClient().update('inv-1', { status: 'failed' })).rejects.toThrow(
      InvestigationConflictError
    );
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('persists the provided error when status is failed', async () => {
    await makeClient().update('inv-1', {
      status: 'failed',
      error: 'Agent timed out.',
    });

    expect(repository.update).toHaveBeenCalledWith({
      id: 'inv-1',
      patch: expect.objectContaining({ status: 'failed', error: 'Agent timed out.' }),
      version: '1',
    });
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('Agent timed out.'));
  });

  it('persists a generic error when status is failed and no error is provided', async () => {
    await makeClient().update('inv-1', { status: 'failed' });

    expect(repository.update).toHaveBeenCalledWith({
      id: 'inv-1',
      patch: expect.objectContaining({ status: 'failed', error: 'Investigation failed' }),
      version: '1',
    });
  });

  it('does not persist an error field when status is completed', async () => {
    await makeClient().update('inv-1', {
      status: 'completed',
      summary: 'All clear.',
    });

    expect(repository.update).toHaveBeenCalledWith({
      id: 'inv-1',
      patch: expect.objectContaining({ status: 'completed', summary: 'All clear.' }),
      version: '1',
    });
    const { patch } = repository.update.mock.calls[0][0];
    expect(patch).not.toHaveProperty('error');
  });

  it('persists conversation_id and impact', async () => {
    await makeClient().update('inv-1', {
      status: 'completed',
      conversation_id: 'conv-1',
      impact: { entities: [{ name: 'checkout-service' }] },
    });

    expect(repository.update).toHaveBeenCalledWith({
      id: 'inv-1',
      patch: expect.objectContaining({
        status: 'completed',
        conversation_id: 'conv-1',
        impact: { entities: [{ name: 'checkout-service' }] },
      }),
      version: '1',
    });
  });

  it('writes with the version it read and maps a concurrent-write conflict to InvestigationConflictError', async () => {
    repository.update.mockRejectedValue(new InvestigationStaleWriteError('inv-1'));

    await expect(makeClient().update('inv-1', { status: 'completed' })).rejects.toThrow(
      InvestigationConflictError
    );
    expect(repository.update).toHaveBeenCalledTimes(1);
    expect(repository.update).toHaveBeenCalledWith({
      id: 'inv-1',
      patch: expect.objectContaining({ status: 'completed' }),
      version: '1',
    });
  });
});

describe('NightshiftInvestigationsClient.ensureOrCreate()', () => {
  const EXECUTION_ID = 'exec-123';

  const makeEnsureExecution = (overrides: Record<string, unknown> = {}) => ({
    id: EXECUTION_ID,
    workflowId: SIGNIFICANT_EVENTS_INVESTIGATION_WORKFLOW_ID,
    status: ExecutionStatus.RUNNING,
    startedAt: '2024-01-01T00:00:00Z',
    executedBy: 'workflow-user',
    context: {
      inputs: {
        message: 'Investigate this',
        concurrency_key: 'key-1',
        context: {
          source: 'alert',
          alert_id: 'alert-42',
          trigger_type: 'automatic',
        },
      },
    },
    ...overrides,
  });

  it('is a no-op when the record is already running', async () => {
    repository.get.mockResolvedValue(makeRecord({ status: 'running' }, { id: EXECUTION_ID }));

    await makeClient().ensureOrCreate(EXECUTION_ID);

    expect(mockManagement.getWorkflowExecution).not.toHaveBeenCalled();
    expect(repository.create).not.toHaveBeenCalled();
    expect(repository.update).not.toHaveBeenCalled();
  });

  it.each<InvestigationStatus>(['completed', 'failed', 'cancelled'])(
    'throws InvestigationConflictError when the record is already %s',
    async (status) => {
      repository.get.mockResolvedValue(makeRecord({ status }, { id: EXECUTION_ID }));

      await expect(makeClient().ensureOrCreate(EXECUTION_ID)).rejects.toThrow(
        InvestigationConflictError
      );
      expect(mockManagement.getWorkflowExecution).not.toHaveBeenCalled();
      expect(repository.create).not.toHaveBeenCalled();
      expect(repository.update).not.toHaveBeenCalled();
    }
  );

  it('transitions a pending record to running, stamping it from the execution document', async () => {
    repository.get.mockResolvedValue(
      makeRecord(
        { status: 'pending', completed_at: undefined },
        { id: EXECUTION_ID, version: 'v1' }
      )
    );
    mockManagement.getWorkflowExecution.mockResolvedValue(makeEnsureExecution());

    await makeClient().ensureOrCreate(EXECUTION_ID);

    expect(repository.update).toHaveBeenCalledWith({
      id: EXECUTION_ID,
      patch: {
        status: 'running',
        started_at: '2024-01-01T00:00:00Z',
        executed_by: 'workflow-user',
      },
      version: 'v1',
    });
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('treats a lost pending-to-running race as a no-op', async () => {
    repository.get.mockResolvedValue(
      makeRecord(
        { status: 'pending', completed_at: undefined },
        { id: EXECUTION_ID, version: 'v1' }
      )
    );
    mockManagement.getWorkflowExecution.mockResolvedValue(makeEnsureExecution());
    repository.update.mockRejectedValue(new InvestigationStaleWriteError(EXECUTION_ID));

    await expect(makeClient().ensureOrCreate(EXECUTION_ID)).resolves.toBeUndefined();
  });

  it('throws InvestigationNotFoundError when a pending record has no readable execution', async () => {
    repository.get.mockResolvedValue(
      makeRecord({ status: 'pending', completed_at: undefined }, { id: EXECUTION_ID })
    );
    mockManagement.getWorkflowExecution.mockResolvedValue(null);

    await expect(makeClient().ensureOrCreate(EXECUTION_ID)).rejects.toThrow(
      InvestigationNotFoundError
    );
    expect(repository.update).not.toHaveBeenCalled();
  });

  it('creates the record from the execution document', async () => {
    mockManagement.getWorkflowExecution.mockResolvedValue(makeEnsureExecution());

    await makeClient().ensureOrCreate(EXECUTION_ID);

    expect(repository.create).toHaveBeenCalledWith({
      id: EXECUTION_ID,
      attributes: expect.objectContaining({
        status: 'running',
        subject_type: 'alert',
        subject_id: 'alert-42',
        trigger_type: 'automatic',
        concurrency_key: 'key-1',
        executed_by: 'workflow-user',
        created_at: '2024-01-01T00:00:00Z',
        started_at: '2024-01-01T00:00:00Z',
      }),
    });
  });

  it('cancels a superseded running investigation sharing the concurrency key', async () => {
    mockManagement.getWorkflowExecution.mockResolvedValue(makeEnsureExecution());
    const superseded = makeRecord(
      { status: 'running', concurrency_key: 'key-1', completed_at: undefined },
      { id: 'inv-old' }
    );
    repository.find.mockResolvedValue(findResult([superseded]));

    await makeClient().ensureOrCreate(EXECUTION_ID);

    expect(repository.find).toHaveBeenCalledWith(
      expect.objectContaining({
        concurrencyKey: 'key-1',
        statuses: ['pending', 'running'],
        sortField: 'created_at',
        sortOrder: 'desc',
        perPage: 2,
      })
    );
    expect(repository.update).toHaveBeenCalledWith({
      id: 'inv-old',
      patch: expect.objectContaining({ status: 'cancelled' }),
      version: '1',
    });
    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ id: EXECUTION_ID }));
  });

  it('cancels the older record rather than itself when a concurrent ensure already created it', async () => {
    mockManagement.getWorkflowExecution.mockResolvedValue(makeEnsureExecution());
    repository.find.mockResolvedValue(
      findResult([
        makeRecord(
          { status: 'running', concurrency_key: 'key-1', completed_at: undefined },
          { id: EXECUTION_ID }
        ),
        makeRecord(
          { status: 'running', concurrency_key: 'key-1', completed_at: undefined },
          { id: 'inv-old' }
        ),
      ])
    );

    await makeClient().ensureOrCreate(EXECUTION_ID);

    expect(repository.update).toHaveBeenCalledTimes(1);
    expect(repository.update).toHaveBeenCalledWith(
      expect.objectContaining({
        id: 'inv-old',
        patch: expect.objectContaining({ status: 'cancelled' }),
      })
    );
  });

  it('cancels nothing when the only in-flight record sharing the key is itself', async () => {
    mockManagement.getWorkflowExecution.mockResolvedValue(makeEnsureExecution());
    repository.find.mockResolvedValue(
      findResult([
        makeRecord(
          { status: 'running', concurrency_key: 'key-1', completed_at: undefined },
          { id: EXECUTION_ID }
        ),
      ])
    );

    await makeClient().ensureOrCreate(EXECUTION_ID);

    expect(repository.update).not.toHaveBeenCalled();
  });

  it('still creates the record when the superseded cancel loses a write race', async () => {
    mockManagement.getWorkflowExecution.mockResolvedValue(makeEnsureExecution());
    repository.find.mockResolvedValue(
      findResult([
        makeRecord(
          { status: 'running', concurrency_key: 'key-1', completed_at: undefined },
          { id: 'inv-old' }
        ),
      ])
    );
    repository.update.mockRejectedValue(new InvestigationStaleWriteError('inv-old'));

    await expect(makeClient().ensureOrCreate(EXECUTION_ID)).resolves.toBeUndefined();

    expect(repository.create).toHaveBeenCalledWith(expect.objectContaining({ id: EXECUTION_ID }));
    expect(mockLogger.warn).toHaveBeenCalledWith(expect.stringContaining('inv-old'));
  });

  it('throws InvestigationNotFoundError when the execution does not exist', async () => {
    mockManagement.getWorkflowExecution.mockResolvedValue(null);

    await expect(makeClient().ensureOrCreate(EXECUTION_ID)).rejects.toThrow(
      InvestigationNotFoundError
    );
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('accepts a manual execution of the deductive investigation workflow', async () => {
    mockManagement.getWorkflowExecution.mockResolvedValue(
      makeEnsureExecution({
        workflowId: DEDUCTIVE_INVESTIGATION_WORKFLOW_ID,
        originManagedWorkflowId: DEDUCTIVE_INVESTIGATION_WORKFLOW_ID,
        context: {
          inputs: {
            message: 'Investigate last error',
            context: {
              source: 'manual',
              manual_id: 'manual',
              trigger_type: 'manual',
            },
          },
        },
      })
    );

    await expect(makeClient().ensureOrCreate(EXECUTION_ID)).resolves.toBeUndefined();
    expect(repository.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: EXECUTION_ID,
        attributes: expect.objectContaining({
          subject_type: 'manual',
          subject_id: 'manual',
        }),
      })
    );
  });

  it('throws InvestigationNotFoundError for an execution of an unrelated workflow', async () => {
    mockManagement.getWorkflowExecution.mockResolvedValue(
      makeEnsureExecution({ workflowId: 'some-other-workflow', originManagedWorkflowId: undefined })
    );

    await expect(makeClient().ensureOrCreate(EXECUTION_ID)).rejects.toThrow(
      InvestigationNotFoundError
    );
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('throws InvestigationSubjectMissingError for executions without an investigation subject', async () => {
    mockManagement.getWorkflowExecution.mockResolvedValue(
      makeEnsureExecution({ context: { inputs: { message: 'bare run' } } })
    );

    await expect(makeClient().ensureOrCreate(EXECUTION_ID)).rejects.toThrow(
      InvestigationSubjectMissingError
    );
    expect(repository.create).not.toHaveBeenCalled();
  });

  it('tolerates a conflict from a concurrent ensure', async () => {
    mockManagement.getWorkflowExecution.mockResolvedValue(makeEnsureExecution());
    repository.create.mockRejectedValue(new InvestigationAlreadyExistsError(EXECUTION_ID));

    await expect(makeClient().ensureOrCreate(EXECUTION_ID)).resolves.toBeUndefined();
  });

  describe('subject recovery from execution inputs', () => {
    // recoverSubjectFromInput / recoverTriggerTypeFromInput are called here (and only here) on the
    // create path. These cases were previously on get() which used the same functions; after the
    // read path moved to the SO store the functions stayed live but lost their only coverage.

    it('recovers significant_event subject via event_id', async () => {
      mockManagement.getWorkflowExecution.mockResolvedValue(
        makeEnsureExecution({
          context: { inputs: { context: { source: 'significant_event', event_id: 'event-42' } } },
        })
      );
      await makeClient().ensureOrCreate(EXECUTION_ID);
      const { attributes: attrs } = repository.create.mock.calls[0][0];
      expect(attrs.subject_type).toBe('significant_event');
      expect(attrs.subject_id).toBe('event-42');
    });

    it('recovers significant_event subject via significant_event_id when event_id is absent', async () => {
      mockManagement.getWorkflowExecution.mockResolvedValue(
        makeEnsureExecution({
          context: {
            inputs: { context: { source: 'significant_event', significant_event_id: 'se-99' } },
          },
        })
      );
      await makeClient().ensureOrCreate(EXECUTION_ID);
      const { attributes: attrs } = repository.create.mock.calls[0][0];
      expect(attrs.subject_type).toBe('significant_event');
      expect(attrs.subject_id).toBe('se-99');
    });

    it('prefers event_id over significant_event_id when both are present', async () => {
      mockManagement.getWorkflowExecution.mockResolvedValue(
        makeEnsureExecution({
          context: {
            inputs: {
              context: {
                source: 'significant_event',
                event_id: 'checkout-latency-breach',
                significant_event_id: 'event-uuid-1',
              },
            },
          },
        })
      );
      await makeClient().ensureOrCreate(EXECUTION_ID);
      const { attributes: attrs } = repository.create.mock.calls[0][0];
      expect(attrs.subject_id).toBe('checkout-latency-breach');
    });

    it('falls through an empty event_id to significant_event_id', async () => {
      mockManagement.getWorkflowExecution.mockResolvedValue(
        makeEnsureExecution({
          context: {
            inputs: {
              context: {
                source: 'significant_event',
                event_id: '',
                significant_event_id: 'se-fallback',
              },
            },
          },
        })
      );
      await makeClient().ensureOrCreate(EXECUTION_ID);
      const { attributes: attrs } = repository.create.mock.calls[0][0];
      expect(attrs.subject_id).toBe('se-fallback');
    });

    it('throws InvestigationSubjectMissingError when all significant_event id fields are empty', async () => {
      mockManagement.getWorkflowExecution.mockResolvedValue(
        makeEnsureExecution({
          context: {
            inputs: { context: { source: 'significant_event', significant_event_id: '' } },
          },
        })
      );
      await expect(makeClient().ensureOrCreate(EXECUTION_ID)).rejects.toThrow(
        InvestigationSubjectMissingError
      );
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('throws InvestigationSubjectMissingError when the source is unrecognized', async () => {
      mockManagement.getWorkflowExecution.mockResolvedValue(
        makeEnsureExecution({
          context: { inputs: { context: { source: 'chat', some_id: 'x' } } },
        })
      );
      await expect(makeClient().ensureOrCreate(EXECUTION_ID)).rejects.toThrow(
        InvestigationSubjectMissingError
      );
      expect(repository.create).not.toHaveBeenCalled();
    });

    it('stores subject_summary from ctx.summary for a significant_event subject', async () => {
      const long = `${'x'.repeat(400)} and a trailing clause that must not be cut mid-sentence.`;
      mockManagement.getWorkflowExecution.mockResolvedValue(
        makeEnsureExecution({
          context: {
            inputs: {
              context: { source: 'significant_event', event_id: 'event-42', summary: long },
            },
          },
        })
      );
      await makeClient().ensureOrCreate(EXECUTION_ID);
      const { attributes: attrs } = repository.create.mock.calls[0][0];
      expect(attrs.subject_type).toBe('significant_event');
      expect(attrs.subject_id).toBe('event-42');
      expect(attrs.subject_summary).toBe(long);
    });

    it('stores subject_summary for an alert subject', async () => {
      mockManagement.getWorkflowExecution.mockResolvedValue(
        makeEnsureExecution({
          context: {
            inputs: {
              context: { source: 'alert', alert_id: 'alert-99', summary: 'CPU saturation' },
            },
          },
        })
      );
      await makeClient().ensureOrCreate(EXECUTION_ID);
      const { attributes: attrs } = repository.create.mock.calls[0][0];
      expect(attrs.subject_type).toBe('alert');
      expect(attrs.subject_id).toBe('alert-99');
      expect(attrs.subject_summary).toBe('CPU saturation');
    });

    it('falls back to manual trigger_type when context carries none', async () => {
      mockManagement.getWorkflowExecution.mockResolvedValue(
        makeEnsureExecution({
          context: { inputs: { context: { source: 'alert', alert_id: 'a-1' } } },
        })
      );
      await makeClient().ensureOrCreate(EXECUTION_ID);
      const { attributes: attrs } = repository.create.mock.calls[0][0];
      expect(attrs.trigger_type).toBe('manual');
    });
  });
});
