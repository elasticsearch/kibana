/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BuiltinToolDefinition } from '@kbn/agent-builder-server';
import type { ToolHandlerStandardReturn } from '@kbn/agent-builder-server/tools';
import { registerValidateWorkflowTool } from './validate_workflow_tool';

const invokeHandler = async (tool: BuiltinToolDefinition, input: unknown, context: unknown) =>
  (await tool.handler(input as never, context as never)) as ToolHandlerStandardReturn;

describe('registerValidateWorkflowTool', () => {
  let registeredTool: BuiltinToolDefinition;

  const mockApi = {
    validateWorkflow: jest.fn(),
  } as any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockApi.validateWorkflow.mockResolvedValue({
      valid: true,
      errors: [],
      warnings: [],
    });

    const agentBuilder = {
      tools: {
        register: jest.fn((tool: BuiltinToolDefinition) => {
          registeredTool = tool;
        }),
      },
    } as any;

    registerValidateWorkflowTool(agentBuilder, mockApi);
  });

  it('registers with correct id', () => {
    expect(registeredTool.id).toBe('platform.workflows.validate_workflow');
  });

  it('calls api.validateWorkflow with yaml, spaceId, request', async () => {
    const yaml = `version: '1'\nname: test\nenabled: true\ntriggers:\n  - type: manual\nsteps:\n  - name: log\n    type: console\n    with:\n      message: test\n`;
    const context = { spaceId: 'default', request: { headers: { foo: 'bar' } } } as any;

    await invokeHandler(registeredTool, { yaml }, context);

    expect(mockApi.validateWorkflow).toHaveBeenCalledTimes(1);
    expect(mockApi.validateWorkflow).toHaveBeenCalledWith(
      yaml,
      'default',
      context.request,
      undefined
    );
  });

  it('forwards expectedInputRefs when the caller supplies them', async () => {
    const yaml = `version: '1'\nname: test\nenabled: true\ntriggers:\n  - type: manual\nsteps:\n  - name: log\n    type: console\n    with:\n      message: test\n`;
    const context = { spaceId: 'default', request: {} } as any;
    const expectedInputRefs = ['#/kibana/definitions/alertingV2NotificationGroup'];

    await invokeHandler(registeredTool, { yaml, expectedInputRefs }, context);

    expect(mockApi.validateWorkflow).toHaveBeenCalledWith(yaml, 'default', context.request, {
      expectedInputRefs,
    });
  });

  it('returns results in expected shape', async () => {
    const yaml = `version: '1'\nname: test\nenabled: true\ntriggers:\n  - type: manual\nsteps:\n  - name: log\n    type: console\n    with:\n      message: test\n`;
    const context = { spaceId: 'default', request: {} } as any;

    const result = await invokeHandler(registeredTool, { yaml }, context);

    expect(result).toHaveProperty('results');
    expect(result.results).toHaveLength(1);
    expect(result.results[0].type).toBe('other');
    expect(result.results[0]).toHaveProperty('data');
    expect((result.results[0].data as any).result).toEqual({
      valid: true,
      errors: [],
      warnings: [],
    });
  });
});
