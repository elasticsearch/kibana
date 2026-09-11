/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

jest.mock('@elastic/schemas/es/tools/manifest.js', () => ({
  esManifest: [
    { id: 'indices.create' },
    { id: 'indices.delete' },
    { id: 'indices.update_aliases' },
    { id: 'bulk' },
  ],
}));

jest.mock('@elastic/schemas/kibana/tools/manifest.js', () => ({
  kibanaManifest: [{ id: 'alerting.delete-alerting-rule-id' }],
}));

import type { KibanaRequest } from '@kbn/core-http-server';
import { of, throwError } from 'rxjs';
import { z } from '@kbn/zod/v4';
import { ChatEventType, createRequestAbortedError } from '@kbn/agent-builder-common';
import {
  AGGREGATE_BY_REQUIRES_PLUGIN_ID_MESSAGE,
  ConfigSchema,
  InputSchema,
} from '../../common/step_types/run_agent_step';
import {
  CONNECTOR_ID_BY_FEATURE_CONFLICT_MESSAGE_WORKFLOW,
  CONNECTOR_OR_INFERENCE_ID_CONFLICT_MESSAGE_WORKFLOW,
} from '../../common/resolve_connector_or_inference_id';
import { getRunAgentStepDefinition, parseMaxStepSize } from './run_agent_step';
import type { StepHandlerContext } from '@kbn/workflows-extensions/server';

describe('parseMaxStepSize', () => {
  it('parses byte units into bytes', () => {
    expect(parseMaxStepSize('1b')).toBe(1);
    expect(parseMaxStepSize('1kb')).toBe(1024);
    expect(parseMaxStepSize('1mb')).toBe(1024 ** 2);
    expect(parseMaxStepSize('10mb')).toBe(10 * 1024 ** 2);
    expect(parseMaxStepSize('1gb')).toBe(1024 ** 3);
  });

  it('is case-insensitive and tolerates surrounding whitespace', () => {
    expect(parseMaxStepSize('  10MB ')).toBe(10 * 1024 ** 2);
    expect(parseMaxStepSize('1GB')).toBe(1024 ** 3);
  });

  it('treats a bare number as a byte count', () => {
    expect(parseMaxStepSize('10')).toBe(10);
    expect(parseMaxStepSize('2048')).toBe(2048);
  });

  it('returns undefined for empty or malformed values', () => {
    expect(parseMaxStepSize('')).toBeUndefined();
    expect(parseMaxStepSize('   ')).toBeUndefined();
    expect(parseMaxStepSize('10tb')).toBeUndefined();
    expect(parseMaxStepSize('abc')).toBeUndefined();
    expect(parseMaxStepSize('mb')).toBeUndefined();
    expect(parseMaxStepSize('-5mb')).toBeUndefined();
    // Fractions and inner spaces are intentionally unsupported (ByteSizeValue semantics).
    expect(parseMaxStepSize('1.5kb')).toBeUndefined();
    expect(parseMaxStepSize('10 mb')).toBeUndefined();
  });
});

describe('ai.agent workflow step (Agent Builder)', () => {
  const createContext = (overrides: Partial<any> = {}) => {
    const fakeRequest = { headers: {} } as unknown as KibanaRequest;
    return {
      input: {},
      config: {},
      rawInput: {},
      contextManager: {
        getFakeRequest: jest.fn().mockReturnValue(fakeRequest),
        getContext: jest.fn(),
        getScopedEsClient: jest.fn(),
        renderInputTemplate: jest.fn(),
        callKibanaApi: jest.fn(),
      },
      logger: {
        debug: jest.fn(),
        info: jest.fn(),
        warn: jest.fn(),
        error: jest.fn(),
      },
      abortSignal: new AbortController().signal,
      stepId: 'test-step',
      stepType: 'ai.agent',
      ...overrides,
    } as StepHandlerContext;
  };

  const createExecutionMock = (events$: any) => ({
    executeAgent: jest.fn().mockResolvedValue({ executionId: 'exec-1', events$ }),
  });

  // Regression: the agent loop emits one round_complete per round; the step's
  // output must be the FINAL round (the terminal structured answer), not the
  // first intermediate research round. `find` returned round r-1 and silently
  // dropped the structured output whenever the agent researched first.
  it('returns the FINAL round_complete when the agent runs multiple rounds', async () => {
    const events$ = of(
      {
        type: ChatEventType.roundComplete,
        data: {
          round: {
            id: 'r-1',
            response: { message: 'intermediate research round' },
          },
        },
      },
      {
        type: ChatEventType.roundComplete,
        data: {
          round: {
            id: 'r-2',
            response: {
              message: 'final answer',
              structured_output: { isIncident: true },
            },
          },
        },
      }
    );
    const execution = createExecutionMock(events$);
    const step = getRunAgentStepDefinition({ internalStart: { execution } } as any);
    const res = await step.handler(createContext({ input: { message: 'hi' } }));
    expect(res.output?.structured_output).toEqual({ isIncident: true });
    expect(res.output?.message).toContain('final answer');
  });

  it('creates and persists a conversation when create_conversation is true, and emits conversation_id', async () => {
    const events$ = of(
      {
        type: ChatEventType.conversationCreated,
        data: { conversation_id: 'c-1', title: 't' },
      },
      {
        type: ChatEventType.roundComplete,
        data: {
          round: {
            id: 'r-1',
            response: { message: 'ok', structured_output: { foo: 'bar' } },
          },
        },
      }
    );

    const execution = createExecutionMock(events$);

    const serviceManager = {
      internalStart: { execution },
    } as any;

    const step = getRunAgentStepDefinition(serviceManager);
    const context = createContext({
      input: {
        message: 'hello',
      },
      config: {
        'create-conversation': true,
      },
    });
    const res = await step.handler(context);

    expect(execution.executeAgent).toHaveBeenCalledTimes(1);
    expect(execution.executeAgent.mock.calls[0][0].params.accessControl).toBeUndefined();
    expect(res).toHaveProperty('output.conversation_id');
    expect(res.output?.conversation_id).toBe('c-1');
  });

  it('passes public access control when public-conversation is true', async () => {
    const events$ = of(
      {
        type: ChatEventType.conversationCreated,
        data: { conversation_id: 'c-public', title: 't' },
      },
      {
        type: ChatEventType.roundComplete,
        data: {
          round: {
            id: 'r-1',
            response: { message: 'ok' },
          },
        },
      }
    );

    const execution = createExecutionMock(events$);

    const serviceManager = {
      internalStart: { execution },
    } as any;

    const step = getRunAgentStepDefinition(serviceManager);
    const res = await step.handler(
      createContext({
        input: {
          message: 'hello',
        },
        config: {
          'create-conversation': true,
          'public-conversation': true,
        },
      })
    );

    expect(execution.executeAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          accessControl: { access_mode: 'public' },
          storeConversation: true,
          autoCreateConversationWithId: true,
        }),
      })
    );
    expect(res.output?.conversation_id).toBe('c-public');
  });

  it('uses conversation_id from input (with:) and create-conversation from config (static)', async () => {
    const events$ = of(
      {
        type: ChatEventType.conversationCreated,
        data: { conversation_id: 'c-dash', title: 't' },
      },
      {
        type: ChatEventType.roundComplete,
        data: {
          round: {
            id: 'r-1',
            response: { message: 'ok' },
          },
        },
      }
    );

    const execution = createExecutionMock(events$);

    const serviceManager = {
      internalStart: { execution },
    } as any;

    const step = getRunAgentStepDefinition(serviceManager);
    const res = await step.handler(
      createContext({
        input: {
          message: 'hello',
          conversation_id: 'c-dash',
        },
        config: {
          'create-conversation': true,
        },
      })
    );

    expect(execution.executeAgent).toHaveBeenCalledTimes(1);
    expect(res).toHaveProperty('output.conversation_id', 'c-dash');
  });

  it('reuses an existing conversation_id and updates it for follow-up prompts', async () => {
    const events$ = of(
      {
        type: ChatEventType.conversationUpdated,
        data: { conversation_id: 'c-1', title: 't' },
      },
      {
        type: ChatEventType.roundComplete,
        data: {
          round: {
            id: 'r-1',
            response: { message: 'ok' },
          },
        },
      }
    );

    const execution = createExecutionMock(events$);

    const serviceManager = {
      internalStart: { execution },
    } as any;

    const step = getRunAgentStepDefinition(serviceManager);
    const res = await step.handler(
      createContext({
        input: {
          message: 'follow up',
          conversation_id: 'c-1',
        },
      })
    );

    expect(execution.executeAgent).toHaveBeenCalledTimes(1);
    expect(res.output?.conversation_id).toBe('c-1');
  });

  it('does not create a conversation when create_conversation is false and no conversation_id is provided', async () => {
    const events$ = of({
      type: ChatEventType.roundComplete,
      data: {
        round: {
          id: 'r-1',
          response: { message: 'ok' },
        },
      },
    });

    const execution = createExecutionMock(events$);

    const serviceManager = {
      internalStart: { execution },
    } as any;

    const step = getRunAgentStepDefinition(serviceManager);
    const res = await step.handler(
      createContext({
        input: {
          message: 'stateless',
        },
      })
    );

    expect(execution.executeAgent).toHaveBeenCalledTimes(1);
    expect(res.output?.conversation_id).toBeUndefined();
  });

  it('propagates execution service errors (e.g., missing connector)', async () => {
    const execError = new Error('No LLM connector configured');
    const events$ = throwError(() => execError);

    const execution = createExecutionMock(events$);

    const serviceManager = {
      internalStart: { execution },
    } as any;

    const step = getRunAgentStepDefinition(serviceManager);
    const res = await step.handler(
      createContext({
        input: {
          message: 'hello',
        },
      })
    );

    expect(execution.executeAgent).toHaveBeenCalledTimes(1);
    expect(res.error).toBe(execError);
  });

  it('returns an error when no round_complete event is emitted', async () => {
    const events$ = of({
      type: ChatEventType.conversationCreated,
      data: { conversation_id: 'c-1', title: 't' },
    });

    const execution = createExecutionMock(events$);

    const serviceManager = {
      internalStart: { execution },
    } as any;

    const step = getRunAgentStepDefinition(serviceManager);
    const res = await step.handler(
      createContext({
        input: {
          message: 'hello',
        },
      })
    );

    expect(execution.executeAgent).toHaveBeenCalledTimes(1);
    expect(res.error).toBeInstanceOf(Error);
    expect(res.error?.message).toContain('No round_complete event');
  });

  it('fails when the workflow abort signal is already aborted', async () => {
    const events$ = throwError(() => createRequestAbortedError('Converse request was aborted'));

    const execution = createExecutionMock(events$);
    const abortController = new AbortController();
    abortController.abort();

    const serviceManager = {
      internalStart: { execution },
    } as any;

    const step = getRunAgentStepDefinition(serviceManager);
    const res = await step.handler(
      createContext({
        input: {
          message: 'hello',
        },
        abortSignal: abortController.signal,
      })
    );

    expect(execution.executeAgent).toHaveBeenCalledTimes(1);
    expect(res.error).toBeInstanceOf(Error);
    expect(res.error?.message).toContain('aborted');
  });

  it('propagates attachments to execution service nextInput', async () => {
    const attachments = [
      {
        id: 'attachment-1',
        type: 'security.alert',
        data: { alertId: 'alert-123', severity: 'high' },
      },
      {
        type: 'document',
        data: { content: 'test content' },
        hidden: true,
      },
    ];

    const events$ = of({
      type: ChatEventType.roundComplete,
      data: {
        round: {
          id: 'r-1',
          response: { message: 'ok' },
        },
      },
    });
    const execution = createExecutionMock(events$);

    const serviceManager = {
      internalStart: {
        execution,
      },
    } as any;

    const step = getRunAgentStepDefinition(serviceManager);
    const res = await step.handler(
      createContext({
        input: {
          message: 'hello',
          attachments,
        },
      })
    );

    expect(execution.executeAgent).toHaveBeenCalledTimes(1);
    expect(execution.executeAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        params: expect.objectContaining({
          nextInput: {
            message: 'hello',
            attachments,
          },
        }),
      })
    );
    expect(res.output?.message).toBe('ok');
  });

  describe('approvals', () => {
    const runStep = async (input: Record<string, unknown>) => {
      const events$ = of({
        type: ChatEventType.roundComplete,
        data: { round: { id: 'r-1', response: { message: 'ok' } } },
      });
      const execution = createExecutionMock(events$);
      const serviceManager = { internalStart: { execution } } as any;

      const step = getRunAgentStepDefinition(serviceManager);
      await step.handler(createContext({ input }));

      return execution;
    };

    it('flattens the per-target map without ever enabling interactivity', async () => {
      const execution = await runStep({
        message: 'hello',
        approvals: {
          auto_approved_apis: {
            elasticsearch: ['indices.create', 'indices.update_aliases'],
            kibana: ['alerting.delete-alerting-rule-id'],
          },
        },
      });

      expect(execution.executeAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          interactive: {
            enabled: false,
            auto_approved_apis: [
              { target: 'elasticsearch', api: 'indices.create' },
              { target: 'elasticsearch', api: 'indices.update_aliases' },
              { target: 'kibana', api: 'alerting.delete-alerting-rule-id' },
            ],
          },
        })
      );
    });

    it.each<{ description: string; input: Record<string, unknown> }>([
      { description: 'omitted', input: { message: 'hello' } },
      { description: 'an empty object', input: { message: 'hello', approvals: {} } },
      {
        description: 'an empty map',
        input: { message: 'hello', approvals: { auto_approved_apis: {} } },
      },
      {
        description: 'an empty list for a target',
        input: { message: 'hello', approvals: { auto_approved_apis: { elasticsearch: [] } } },
      },
    ])(
      'runs non-interactively with no grants when the field is $description',
      async ({ input }) => {
        const execution = await runStep(input);

        expect(execution.executeAgent.mock.calls[0][0].interactive).toEqual({ enabled: false });
      }
    );

    it('emits a per-target selector enum, which is what drives editor autocomplete', () => {
      const jsonSchema = z.toJSONSchema(InputSchema, {
        unrepresentable: 'any',
        io: 'input',
      }) as Record<string, any>;

      const byTarget = jsonSchema.properties.approvals.properties.auto_approved_apis.properties;

      expect(byTarget.elasticsearch.items.enum).toContain('indices.create');
      expect(byTarget.elasticsearch.items.enum).not.toContain('alerting.delete-alerting-rule-id');
      expect(byTarget.kibana.items.enum).toContain('alerting.delete-alerting-rule-id');
      expect(byTarget.kibana.items.enum).not.toContain('indices.create');
    });

    it('offers the wildcards through that same enum', () => {
      const jsonSchema = z.toJSONSchema(InputSchema, {
        unrepresentable: 'any',
        io: 'input',
      }) as Record<string, any>;

      const byTarget = jsonSchema.properties.approvals.properties.auto_approved_apis.properties;

      expect(byTarget.elasticsearch.items.enum).toEqual(expect.arrayContaining(['*', 'indices.*']));
      expect(byTarget.kibana.items.enum).toEqual(expect.arrayContaining(['*', 'alerting.*']));
      expect(byTarget.kibana.items.enum).not.toContain('indices.*');
    });

    it('accepts a well-formed map, including wildcards', () => {
      const parsed = InputSchema.safeParse({
        message: 'hello',
        approvals: {
          auto_approved_apis: {
            elasticsearch: ['indices.create', 'indices.*', 'bulk', '*'],
            kibana: ['alerting.delete-alerting-rule-id', 'alerting.*'],
          },
        },
      });
      expect(parsed.success).toBe(true);
    });

    it.each<{ description: string; autoApprovedApis: unknown }>([
      {
        description: 'an identifier that names no real API',
        autoApprovedApis: { elasticsearch: ['indices.crate'] },
      },
      {
        description: 'an identifier that only exists on the other target',
        autoApprovedApis: { kibana: ['indices.create'] },
      },
      {
        description: 'a namespace wildcard that only exists on the other target',
        autoApprovedApis: { kibana: ['indices.*'] },
      },
      {
        description: 'a bare namespace instead of a full identifier or wildcard',
        autoApprovedApis: { elasticsearch: ['indices'] },
      },
      {
        description: 'a wildcard on an identifier that has no namespace',
        autoApprovedApis: { elasticsearch: ['bulk.*'] },
      },
      {
        description: 'an unknown target',
        autoApprovedApis: { postgres: ['indices.create'] },
      },
      {
        description: 'a flat list, which was the previous shape',
        autoApprovedApis: [{ target: 'elasticsearch', api: 'indices.create' }],
      },
      {
        description: 'a list exceeding 100 entries for one target',
        autoApprovedApis: {
          elasticsearch: Array.from({ length: 101 }, () => 'indices.create'),
        },
      },
    ])('rejects $description', ({ autoApprovedApis }) => {
      const parsed = InputSchema.safeParse({
        message: 'hello',
        approvals: { auto_approved_apis: autoApprovedApis },
      });
      expect(parsed.success).toBe(false);
    });
  });

  describe('configuration_overrides (InputSchema)', () => {
    it('accepts configuration_overrides with all optional fields', () => {
      const parsed = InputSchema.safeParse({
        message: 'hello',
        configuration_overrides: {
          instructions: 'Custom instructions.',
          tools: [{ tool_ids: ['tool-a', 'tool-b'] }],
          skill_ids: ['skill-a'],
        },
      });
      expect(parsed.success).toBe(true);
    });

    it('accepts configuration_overrides with a subset of fields', () => {
      expect(
        InputSchema.safeParse({ message: 'hi', configuration_overrides: { skill_ids: ['s1'] } })
          .success
      ).toBe(true);
      expect(
        InputSchema.safeParse({
          message: 'hi',
          configuration_overrides: { instructions: 'override' },
        }).success
      ).toBe(true);
    });

    it('accepts an omitted configuration_overrides field', () => {
      const parsed = InputSchema.safeParse({ message: 'hello' });
      expect(parsed.success).toBe(true);
      if (parsed.success) {
        expect(parsed.data.configuration_overrides).toBeUndefined();
      }
    });

    it('rejects instructions exceeding 2048 characters', () => {
      const parsed = InputSchema.safeParse({
        message: 'hello',
        configuration_overrides: { instructions: 'a'.repeat(2049) },
      });
      expect(parsed.success).toBe(false);
    });

    it('rejects skill_ids list exceeding 50 entries', () => {
      const parsed = InputSchema.safeParse({
        message: 'hello',
        configuration_overrides: { skill_ids: Array.from({ length: 51 }, (_, i) => `s-${i}`) },
      });
      expect(parsed.success).toBe(false);
    });

    it('rejects tools list exceeding 50 entries', () => {
      const parsed = InputSchema.safeParse({
        message: 'hello',
        configuration_overrides: {
          tools: Array.from({ length: 51 }, (_, i) => ({ tool_ids: [`t-${i}`] })),
        },
      });
      expect(parsed.success).toBe(false);
    });
  });

  describe('connector-id / inference-id', () => {
    it('ConfigSchema rejects when both ids are meaningful', () => {
      const parsed = ConfigSchema.safeParse({
        'connector-id': 'a',
        'inference-id': 'b',
      });
      expect(parsed.success).toBe(false);
    });

    it('ConfigSchema accepts when connector-id is whitespace-only and inference-id is set', () => {
      const parsed = ConfigSchema.safeParse({
        'connector-id': '   ',
        'inference-id': 'b',
      });
      expect(parsed.success).toBe(true);
    });

    it('does not call executeAgent when both ids are meaningful (handler coalesce)', async () => {
      const events$ = of({
        type: ChatEventType.roundComplete,
        data: {
          round: {
            id: 'r-1',
            response: { message: 'ok' },
          },
        },
      });
      const execution = createExecutionMock(events$);
      const serviceManager = { internalStart: { execution } } as any;
      const step = getRunAgentStepDefinition(serviceManager);
      const res = await step.handler(
        createContext({
          input: { message: 'hello' },
          config: {
            'connector-id': 'a',
            'inference-id': 'b',
          },
        })
      );

      expect(execution.executeAgent).not.toHaveBeenCalled();
      expect(res.error?.message).toBe(CONNECTOR_OR_INFERENCE_ID_CONFLICT_MESSAGE_WORKFLOW);
    });

    it('passes trimmed inference-id as connectorId to executeAgent', async () => {
      const events$ = of({
        type: ChatEventType.roundComplete,
        data: {
          round: {
            id: 'r-1',
            response: { message: 'ok' },
          },
        },
      });
      const execution = createExecutionMock(events$);
      const serviceManager = { internalStart: { execution } } as any;
      const step = getRunAgentStepDefinition(serviceManager);
      await step.handler(
        createContext({
          input: { message: 'hello' },
          config: { 'inference-id': '  inf-1  ' },
        })
      );

      expect(execution.executeAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({ connectorId: 'inf-1' }),
        })
      );
    });
  });

  describe('connector-id-by-feature', () => {
    const createFeatureServicesMock = (
      endpoints: Array<{ connectorId: string }> = [],
      feature?: { taskType: string }
    ) => ({
      searchInferenceEndpoints: {
        features: {
          get: jest.fn().mockReturnValue(feature),
        },
        endpoints: {
          getForFeature: jest
            .fn()
            .mockResolvedValue({ endpoints, warnings: [], soEntryFound: false }),
        },
      },
    });

    it('ConfigSchema rejects connector-id-by-feature combined with connector-id', () => {
      const parsed = ConfigSchema.safeParse({
        'connector-id': 'a',
        'connector-id-by-feature': 'my_feature',
      });
      expect(parsed.success).toBe(false);
    });

    it('ConfigSchema rejects connector-id-by-feature combined with inference-id', () => {
      const parsed = ConfigSchema.safeParse({
        'inference-id': 'a',
        'connector-id-by-feature': 'my_feature',
      });
      expect(parsed.success).toBe(false);
    });

    it('ConfigSchema accepts connector-id-by-feature alone', () => {
      const parsed = ConfigSchema.safeParse({ 'connector-id-by-feature': 'my_feature' });
      expect(parsed.success).toBe(true);
    });

    it('resolves the connector from the feature and passes it to executeAgent', async () => {
      const events$ = of({
        type: ChatEventType.roundComplete,
        data: { round: { id: 'r-1', response: { message: 'ok' } } },
      });
      const execution = createExecutionMock(events$);
      const featureServices = createFeatureServicesMock([{ connectorId: 'feature-connector' }]);
      const serviceManager = { internalStart: { execution, ...featureServices } } as any;

      const step = getRunAgentStepDefinition(serviceManager);
      await step.handler(
        createContext({
          input: { message: 'hello' },
          config: { 'connector-id-by-feature': 'significant_events_investigation' },
        })
      );

      expect(featureServices.searchInferenceEndpoints.endpoints.getForFeature).toHaveBeenCalledWith(
        'significant_events_investigation',
        expect.anything()
      );
      expect(execution.executeAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({ connectorId: 'feature-connector' }),
        })
      );
    });

    it('does not call executeAgent when connector-id-by-feature conflicts with connector-id at runtime', async () => {
      const events$ = of({
        type: ChatEventType.roundComplete,
        data: { round: { id: 'r-1', response: { message: 'ok' } } },
      });
      const execution = createExecutionMock(events$);
      const featureServices = createFeatureServicesMock();
      const serviceManager = { internalStart: { execution, ...featureServices } } as any;

      const step = getRunAgentStepDefinition(serviceManager);
      const res = await step.handler(
        createContext({
          input: { message: 'hello' },
          config: {
            'connector-id': 'a',
            'connector-id-by-feature': 'my_feature',
          },
        })
      );

      expect(execution.executeAgent).not.toHaveBeenCalled();
      expect(res.error?.message).toBe(CONNECTOR_ID_BY_FEATURE_CONFLICT_MESSAGE_WORKFLOW);
    });

    it('surfaces an error when no connector can be resolved for the feature', async () => {
      const execution = createExecutionMock(of());
      const featureServices = createFeatureServicesMock([]);
      const serviceManager = { internalStart: { execution, ...featureServices } } as any;

      const step = getRunAgentStepDefinition(serviceManager);
      const res = await step.handler(
        createContext({
          input: { message: 'hello' },
          config: { 'connector-id-by-feature': 'unknown_feature' },
        })
      );

      expect(execution.executeAgent).not.toHaveBeenCalled();
      expect(res.error?.message).toBe('No connector available for feature "unknown_feature".');
    });

    it('surfaces an error when the feature is not a chat completion feature', async () => {
      const execution = createExecutionMock(of());
      const featureServices = createFeatureServicesMock([{ connectorId: 'feature-connector' }], {
        taskType: 'text_embedding',
      });
      const serviceManager = { internalStart: { execution, ...featureServices } } as any;

      const step = getRunAgentStepDefinition(serviceManager);
      const res = await step.handler(
        createContext({
          input: { message: 'hello' },
          config: { 'connector-id-by-feature': 'knowledge_base_embeddings' },
        })
      );

      expect(
        featureServices.searchInferenceEndpoints.endpoints.getForFeature
      ).not.toHaveBeenCalled();
      expect(execution.executeAgent).not.toHaveBeenCalled();
      expect(res.error?.message).toBe(
        'Feature "knowledge_base_embeddings" is not a chat completion feature (task type "text_embedding"). connector-id-by-feature requires a feature with task type "chat_completion".'
      );
    });
  });

  describe('telemetry attribution (plugin-id / aggregate-by)', () => {
    const roundCompleteEvents = () =>
      of({
        type: ChatEventType.roundComplete,
        data: {
          round: {
            id: 'r-1',
            response: { message: 'ok' },
          },
        },
      });

    it('ConfigSchema rejects aggregate-by without plugin-id', () => {
      const parsed = ConfigSchema.safeParse({ 'aggregate-by': 'streams_significant_events' });
      expect(parsed.success).toBe(false);
      if (!parsed.success) {
        expect(parsed.error.issues[0].message).toBe(AGGREGATE_BY_REQUIRES_PLUGIN_ID_MESSAGE);
      }
    });

    it('ConfigSchema accepts plugin-id with aggregate-by, and plugin-id alone', () => {
      expect(
        ConfigSchema.safeParse({
          'plugin-id': 'streams_significant_events_discovery',
          'aggregate-by': 'streams_significant_events',
        }).success
      ).toBe(true);
      expect(
        ConfigSchema.safeParse({ 'plugin-id': 'streams_significant_events_discovery' }).success
      ).toBe(true);
    });

    it('forwards plugin-id and aggregate-by as telemetryMetadata to executeAgent', async () => {
      const execution = createExecutionMock(roundCompleteEvents());
      const serviceManager = { internalStart: { execution } } as any;
      const step = getRunAgentStepDefinition(serviceManager);

      await step.handler(
        createContext({
          input: { message: 'hello' },
          config: {
            'plugin-id': 'streams_significant_events_discovery',
            'aggregate-by': 'streams_significant_events',
          },
        })
      );

      expect(execution.executeAgent).toHaveBeenCalledWith(
        expect.objectContaining({
          params: expect.objectContaining({
            telemetryMetadata: {
              pluginId: 'streams_significant_events_discovery',
              aggregateBy: 'streams_significant_events',
            },
          }),
        })
      );
    });

    it('omits telemetryMetadata when no plugin-id is configured', async () => {
      const execution = createExecutionMock(roundCompleteEvents());
      const serviceManager = { internalStart: { execution } } as any;
      const step = getRunAgentStepDefinition(serviceManager);

      await step.handler(createContext({ input: { message: 'hello' } }));

      const callArg = execution.executeAgent.mock.calls[0][0];
      expect(callArg.params).not.toHaveProperty('telemetryMetadata');
    });
  });

  describe('metadata', () => {
    it('forwards input.metadata to executeAgent', async () => {
      const events$ = of({
        type: ChatEventType.roundComplete,
        data: { round: { id: 'r-1', response: { message: 'ok' } } },
      });
      const execution = createExecutionMock(events$);
      const serviceManager = { internalStart: { execution } } as any;
      const step = getRunAgentStepDefinition(serviceManager);

      await step.handler(
        createContext({
          input: { message: 'hello', metadata: { workflow_execution_id: 'wf-exec-1' } },
        })
      );

      expect(execution.executeAgent).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: { workflow_execution_id: 'wf-exec-1' } })
      );
    });
  });

  describe('token usage', () => {
    it('includes usage in output from a single round with model_usage', async () => {
      const events$ = of({
        type: ChatEventType.roundComplete,
        data: {
          round: {
            id: 'r-1',
            response: { message: 'hello' },
            model_usage: {
              connector_id: 'c',
              llm_calls: 1,
              input_tokens: 100,
              output_tokens: 50,
              cached_input_tokens: 20,
            },
          },
        },
      });

      const execution = createExecutionMock(events$);
      const step = getRunAgentStepDefinition({ internalStart: { execution } } as any);

      const res = await step.handler(createContext({ input: { message: 'hi' } }));

      expect(res.output?.metadata?.usage).toEqual({
        connectorId: 'c',
        inputTokens: 100,
        outputTokens: 50,
        cachedTokens: 20,
        totalTokens: 150,
      });
    });

    it('accumulates token usage across multiple rounds', async () => {
      const events$ = of(
        {
          type: ChatEventType.roundComplete,
          data: {
            round: {
              id: 'r-1',
              response: { message: 'intermediate' },
              model_usage: {
                connector_id: 'c',
                llm_calls: 1,
                input_tokens: 200,
                output_tokens: 80,
                cached_input_tokens: 50,
              },
            },
          },
        },
        {
          type: ChatEventType.roundComplete,
          data: {
            round: {
              id: 'r-2',
              response: { message: 'final' },
              model_usage: {
                connector_id: 'c',
                llm_calls: 1,
                input_tokens: 300,
                output_tokens: 120,
                cached_input_tokens: 70,
              },
            },
          },
        }
      );

      const execution = createExecutionMock(events$);
      const step = getRunAgentStepDefinition({ internalStart: { execution } } as any);

      const res = await step.handler(createContext({ input: { message: 'hi' } }));

      // Output should be from the FINAL round: the terminal answer carries the
      // structured output; intermediate research rounds do not.
      expect(res.output?.message).toBe('final');
      // Usage should be the sum across all rounds
      expect(res.output?.metadata?.usage).toEqual({
        connectorId: 'c',
        inputTokens: 500,
        outputTokens: 200,
        cachedTokens: 120,
        totalTokens: 700,
      });
    });

    it('returns zero usage when round has no model_usage', async () => {
      const events$ = of({
        type: ChatEventType.roundComplete,
        data: {
          round: {
            id: 'r-1',
            response: { message: 'ok' },
            // no model_usage
          },
        },
      });

      const execution = createExecutionMock(events$);
      const step = getRunAgentStepDefinition({ internalStart: { execution } } as any);

      const res = await step.handler(createContext({ input: { message: 'hi' } }));

      expect(res.output?.metadata?.usage).toEqual({
        inputTokens: 0,
        outputTokens: 0,
        cachedTokens: 0,
        totalTokens: 0,
      });
    });

    it("does not tag a connector when the round reports the 'unknown' sentinel", async () => {
      // A round that made no LLM call reports connector_id: 'unknown'
      // (see add_round_complete_event.ts); it must not surface as a connector.
      const events$ = of({
        type: ChatEventType.roundComplete,
        data: {
          round: {
            id: 'r-1',
            response: { message: 'ok' },
            model_usage: {
              connector_id: 'unknown',
              llm_calls: 0,
              input_tokens: 10,
              output_tokens: 5,
            },
          },
        },
      });

      const execution = createExecutionMock(events$);
      const step = getRunAgentStepDefinition({ internalStart: { execution } } as any);

      const res = await step.handler(createContext({ input: { message: 'hi' } }));

      expect(res.output?.metadata?.usage).not.toHaveProperty('connectorId');
    });

    it('preserves partial token counts when the event stream errors mid-execution', async () => {
      const { concat, throwError: rxThrowError } =
        jest.requireActual<typeof import('rxjs')>('rxjs');

      // Cold observable: emits one round with tokens, then errors
      const events$ = concat(
        of({
          type: ChatEventType.roundComplete,
          data: {
            round: {
              id: 'r-1',
              response: { message: 'partial' },
              model_usage: {
                connector_id: 'c',
                llm_calls: 1,
                input_tokens: 150,
                output_tokens: 60,
                cached_input_tokens: 30,
              },
            },
          },
        }),
        rxThrowError(() => new Error('stream interrupted'))
      );

      const execution = createExecutionMock(events$);
      const step = getRunAgentStepDefinition({ internalStart: { execution } } as any);

      const res = await step.handler(createContext({ input: { message: 'hi' } }));

      expect(res.error).toBeInstanceOf(Error);
      // Partial token counts (and the resolved connector) are preserved in the
      // output despite the error.
      expect(res.output?.metadata?.usage).toEqual({
        connectorId: 'c',
        inputTokens: 150,
        outputTokens: 60,
        cachedTokens: 30,
        totalTokens: 210,
      });
    });
  });
});
