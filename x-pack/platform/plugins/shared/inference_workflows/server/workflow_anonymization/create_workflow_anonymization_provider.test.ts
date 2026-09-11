/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { httpServerMock } from '@kbn/core-http-server-mocks';
import { MessageRole } from '@kbn/inference-common';
import type {
  AroundCompletionEvent,
  InferenceProceedCapability,
  PiiTokenizationContext,
} from '@kbn/inference-plugin/server';
import { ExecutionStatus, type WorkflowDetailDto, type WorkflowYaml } from '@kbn/workflows';
import type { WorkflowsManagementApi } from '@kbn/workflows-management-plugin/server';
import {
  INFERENCE_PROCEED_CAPABILITY_ID,
  PII_TOKENIZATION_CAPABILITY_ID,
  resolveInferenceProceedCapabilityValue,
  resolvePiiTokenizationCapabilityValue,
} from '@kbn/inference-plugin/server';
import { aroundCompletionEventSchema } from '../../common/workflow_anonymization';
import { createWorkflowAnonymizationProvider } from './create_workflow_anonymization_provider';

type Management = Pick<
  WorkflowsManagementApi,
  'resolveWorkflowTriggerMatches' | 'executeWorkflowSynchronously'
>;

const createManagement = (): jest.Mocked<Management> => ({
  resolveWorkflowTriggerMatches: jest.fn(),
  executeWorkflowSynchronously: jest.fn(),
});

const createProvider = (
  management: jest.Mocked<Management>,
  ensureManagedWorkflow: jest.Mock = jest.fn().mockResolvedValue(undefined),
  triggerCacheTtlMs = 30_000
) => createWorkflowAnonymizationProvider({ management, ensureManagedWorkflow, triggerCacheTtlMs });

const createAroundCompletionTrigger = (): WorkflowYaml['triggers'][number] => {
  // The static WorkflowYaml type models built-ins only; registered triggers are added dynamically.
  const trigger: WorkflowYaml['triggers'][number] = { type: 'manual' };
  Reflect.set(trigger, 'type', 'inference.aroundCompletion');
  return trigger;
};

const createWorkflow = (steps: WorkflowYaml['steps']): WorkflowDetailDto => ({
  id: 'workflow-1',
  name: 'Inference protection',
  enabled: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  createdBy: 'system',
  lastUpdatedAt: '2026-01-01T00:00:00.000Z',
  lastUpdatedBy: 'system',
  yaml: 'name: Inference protection',
  valid: true,
  definition: {
    version: '1',
    name: 'Inference protection',
    enabled: true,
    triggers: [createAroundCompletionTrigger()],
    steps,
  },
});

const proceedStep: WorkflowYaml['steps'][number] = {
  name: 'proceed',
  type: 'call_site.proceed',
  with: {},
};
const configuredStep: WorkflowYaml['steps'][number] = {
  name: 'configured',
  type: 'test.step',
  with: { type: 'call_site.proceed' },
};
const conditionalProceedStep: WorkflowYaml['steps'][number] = {
  name: 'conditional',
  type: 'if',
  condition: 'true',
  steps: [proceedStep],
};

const event: AroundCompletionEvent = {
  messages: [{ role: MessageRole.User, content: 'hello' }],
};
const pii: PiiTokenizationContext = {
  detectEntities: jest.fn().mockResolvedValue([]),
  tokenize: jest.fn(),
};
const proceed: InferenceProceedCapability = {
  invoke: jest.fn().mockResolvedValue({ rawContent: 'protected' }),
};

describe('createWorkflowAnonymizationProvider', () => {
  it('rejects an empty space ID before workflow resolution', async () => {
    const management = createManagement();
    const provider = createProvider(management);

    await expect(
      provider.execute({
        event,
        namespace: '',
        request: httpServerMock.createKibanaRequest(),
        pii,
        proceed,
      })
    ).rejects.toThrow('non-empty space ID');
    expect(management.resolveWorkflowTriggerMatches).not.toHaveBeenCalled();
  });

  it('returns without execution when no workflow matches', async () => {
    const management = createManagement();
    management.resolveWorkflowTriggerMatches.mockResolvedValue({
      matched: [],
      invalidConditionWorkflows: [],
    });
    const ensureManagedWorkflow = jest.fn().mockResolvedValue(undefined);
    const provider = createProvider(management, ensureManagedWorkflow);

    await expect(
      provider.execute({
        event,
        namespace: 'default',
        request: httpServerMock.createKibanaRequest(),
        pii,
        proceed,
      })
    ).resolves.toEqual({ matched: false });
    expect(ensureManagedWorkflow).toHaveBeenCalledWith('default', expect.anything());
    expect(management.resolveWorkflowTriggerMatches).toHaveBeenCalledWith(
      'inference.aroundCompletion',
      aroundCompletionEventSchema.parse(event),
      'default'
    );
    expect(management.executeWorkflowSynchronously).not.toHaveBeenCalled();
  });

  describe('trigger resolution cache', () => {
    it('skips the ES lookup on the second call with the same (namespace, agentId)', async () => {
      const management = createManagement();
      management.resolveWorkflowTriggerMatches.mockResolvedValue({
        matched: [],
        invalidConditionWorkflows: [],
      });
      const provider = createProvider(management);
      const request = httpServerMock.createKibanaRequest();
      const eventWithAgent = { ...event, agentId: 'agent-a' };

      await provider.execute({
        event: eventWithAgent,
        namespace: 'default',
        request,
        pii,
        proceed,
      });
      await provider.execute({
        event: eventWithAgent,
        namespace: 'default',
        request,
        pii,
        proceed,
      });

      expect(management.resolveWorkflowTriggerMatches).toHaveBeenCalledTimes(1);
    });

    it('makes a new ES call when the agentId differs', async () => {
      const management = createManagement();
      management.resolveWorkflowTriggerMatches.mockResolvedValue({
        matched: [],
        invalidConditionWorkflows: [],
      });
      const provider = createProvider(management);
      const request = httpServerMock.createKibanaRequest();

      await provider.execute({
        event: { ...event, agentId: 'agent-a' },
        namespace: 'default',
        request,
        pii,
        proceed,
      });
      await provider.execute({
        event: { ...event, agentId: 'agent-b' },
        namespace: 'default',
        request,
        pii,
        proceed,
      });

      expect(management.resolveWorkflowTriggerMatches).toHaveBeenCalledTimes(2);
    });

    it('makes a new ES call when the namespace differs', async () => {
      const management = createManagement();
      management.resolveWorkflowTriggerMatches.mockResolvedValue({
        matched: [],
        invalidConditionWorkflows: [],
      });
      const provider = createProvider(management);
      const request = httpServerMock.createKibanaRequest();

      await provider.execute({ event, namespace: 'space-a', request, pii, proceed });
      await provider.execute({ event, namespace: 'space-b', request, pii, proceed });

      expect(management.resolveWorkflowTriggerMatches).toHaveBeenCalledTimes(2);
    });

    it('makes a new ES call on every request when triggerCacheTtlMs is 0', async () => {
      const management = createManagement();
      management.resolveWorkflowTriggerMatches.mockResolvedValue({
        matched: [],
        invalidConditionWorkflows: [],
      });
      const provider = createProvider(management, jest.fn().mockResolvedValue(undefined), 0);
      const request = httpServerMock.createKibanaRequest();

      await provider.execute({ event, namespace: 'default', request, pii, proceed });
      await provider.execute({ event, namespace: 'default', request, pii, proceed });

      expect(management.resolveWorkflowTriggerMatches).toHaveBeenCalledTimes(2);
    });

    it('does not cache a resolution with invalid conditions', async () => {
      const management = createManagement();
      management.resolveWorkflowTriggerMatches.mockResolvedValue({
        matched: [],
        invalidConditionWorkflows: [{ id: 'broken', name: 'Broken' }],
      });
      const provider = createProvider(management);
      const request = httpServerMock.createKibanaRequest();

      await expect(
        provider.execute({ event, namespace: 'default', request, pii, proceed })
      ).rejects.toThrow('Broken');
      await expect(
        provider.execute({ event, namespace: 'default', request, pii, proceed })
      ).rejects.toThrow('Broken');

      expect(management.resolveWorkflowTriggerMatches).toHaveBeenCalledTimes(2);
    });
  });

  it('executes one matching workflow synchronously with request-local capabilities', async () => {
    const management = createManagement();
    management.resolveWorkflowTriggerMatches.mockResolvedValue({
      matched: [createWorkflow([configuredStep, conditionalProceedStep])],
      invalidConditionWorkflows: [],
    });
    management.executeWorkflowSynchronously.mockResolvedValue({
      workflowExecutionId: 'execution-1',
      result: { status: ExecutionStatus.COMPLETED, output: { content: 'restored content' } },
    });
    const provider = createProvider(management);
    const request = httpServerMock.createKibanaRequest();
    const abortSignal = new AbortController().signal;
    const parsedEvent = aroundCompletionEventSchema.parse(event);

    await expect(
      provider.execute({ event, namespace: 'space-a', request, pii, proceed, abortSignal })
    ).resolves.toEqual({ matched: true, content: 'restored content' });
    expect(management.executeWorkflowSynchronously).toHaveBeenCalledWith({
      workflowId: 'workflow-1',
      workflow: expect.objectContaining({ id: 'workflow-1' }),
      context: {
        event: parsedEvent,
        spaceId: 'space-a',
        triggeredBy: 'inference.aroundCompletion',
      },
      spaceId: 'space-a',
      request,
      capabilities: expect.any(Array),
      abortSignal,
    });
    const [{ capabilities, context }] = management.executeWorkflowSynchronously.mock.calls[0];
    expect(context.event).not.toBe(event);
    expect(capabilities?.map(({ id }) => id)).toEqual([
      PII_TOKENIZATION_CAPABILITY_ID,
      INFERENCE_PROCEED_CAPABILITY_ID,
    ]);
    expect(resolvePiiTokenizationCapabilityValue(capabilities?.[0].value ?? {})).toBe(pii);
    expect(resolveInferenceProceedCapabilityValue(capabilities?.[1].value ?? {})).toBe(proceed);
  });

  it('rejects invalid trigger conditions and overlapping workflow matches before execution', async () => {
    const management = createManagement();
    const provider = createProvider(management);

    management.resolveWorkflowTriggerMatches.mockResolvedValue({
      matched: [createWorkflow([proceedStep])],
      invalidConditionWorkflows: [{ id: 'invalid-workflow', name: 'Broken policy' }],
    });
    await expect(
      provider.execute({
        event,
        namespace: 'space-a',
        request: httpServerMock.createKibanaRequest(),
        pii,
        proceed,
      })
    ).rejects.toThrow('Broken policy (invalid-workflow)');
    expect(management.executeWorkflowSynchronously).not.toHaveBeenCalled();

    management.resolveWorkflowTriggerMatches.mockResolvedValue({
      matched: [createWorkflow([proceedStep]), createWorkflow([proceedStep])],
      invalidConditionWorkflows: [],
    });
    await expect(
      provider.execute({
        event,
        namespace: 'space-a',
        request: httpServerMock.createKibanaRequest(),
        pii,
        proceed,
      })
    ).rejects.toThrow('Multiple workflows matched');
    expect(management.executeWorkflowSynchronously).not.toHaveBeenCalled();
  });

  it('rejects when the matched workflow has no proceed step', async () => {
    const management = createManagement();
    management.resolveWorkflowTriggerMatches.mockResolvedValue({
      matched: [createWorkflow([])],
      invalidConditionWorkflows: [],
    });

    await expect(
      createProvider(management).execute({
        event,
        namespace: 'space-a',
        request: httpServerMock.createKibanaRequest(),
        pii,
        proceed,
      })
    ).rejects.toThrow('must contain exactly one');
  });

  it('rejects when the workflow completes without string content', async () => {
    const management = createManagement();
    management.resolveWorkflowTriggerMatches.mockResolvedValue({
      matched: [createWorkflow([proceedStep])],
      invalidConditionWorkflows: [],
    });
    management.executeWorkflowSynchronously.mockResolvedValue({
      workflowExecutionId: 'execution-1',
      result: { status: ExecutionStatus.COMPLETED, output: {} },
    });

    await expect(
      createProvider(management).execute({
        event,
        namespace: 'space-a',
        request: httpServerMock.createKibanaRequest(),
        pii,
        proceed,
      })
    ).rejects.toThrow('did not return string content');
  });
});
