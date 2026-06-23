/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ToolHandlerContext } from '@kbn/agent-builder-server/tools';
import type { ScopedModel } from '@kbn/agent-builder-server';
import type { InferenceChatModel } from '@kbn/inference-langchain';
import type { InferenceConnector, BoundInferenceClient } from '@kbn/inference-common';
import { InferenceConnectorType } from '@kbn/inference-common';
import { ToolType } from '@kbn/agent-builder-common';
import { ToolResultType } from '@kbn/agent-builder-common/tools';

import type { EndpointAppContextService } from '../../../../../endpoint/endpoint_app_context_services';
import { createMockEndpointAppContextService } from '../../../../../endpoint/mocks';
import { GENERATE_INSIGHT_TOOL_ID } from '../..';
import { createGenerateInsightGraph } from './graph';
import { generateInsightTool } from '.';

jest.mock('./graph');

const mockCreateGenerateInsightGraph = createGenerateInsightGraph as jest.Mock;

const createTool = () => generateInsightTool(createMockEndpointAppContextService());

describe('automaticTroubleshootingGenerateInsightTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('tool definition', () => {
    it('returns a valid builtin tool definition', () => {
      const tool = createTool();

      expect(tool).toBeDefined();
      expect(tool.type).toBe(ToolType.builtin);
      expect(tool.id).toBe(GENERATE_INSIGHT_TOOL_ID);
      expect(tool.description).toContain(
        'Generate and store structured Automatic Troubleshooting insights.'
      );
    });

    it('has correct tool id format', () => {
      expect(GENERATE_INSIGHT_TOOL_ID).toBe('automatic_troubleshooting.generate_insight');
    });
  });

  describe('schema validation', () => {
    const tool = createTool();

    it('validates correct schema with all required fields', () => {
      const validInput = {
        problemDescription: 'test problem description',
        remediation: 'solve the thing',
        endpointIds: ['endpoint-1', 'endpoint-2'],
        data: [{ field1: 'value1' }, { field2: 'value2' }],
      };

      const result = tool.schema.safeParse(validInput);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.problemDescription).toBe(validInput.problemDescription);
        expect(result.data.endpointIds).toEqual(validInput.endpointIds);
        expect(result.data.data).toEqual(validInput.data);
      }
    });

    it('accepts data with catchall unknown fields', () => {
      const validInput = {
        problemDescription: 'Test problem',
        remediation: 'solve the thing',
        endpointIds: ['endpoint-1'],
        data: [
          { anyField: 'anyValue', nested: { deep: { object: true } } },
          { different: 123, array: [1, 2, 3] },
        ],
      };

      const result = tool.schema.safeParse(validInput);

      expect(result.success).toBe(true);
    });

    it('rejects missing problemDescription', () => {
      const invalidInput = {
        endpointIds: ['endpoint-1'],
        data: [{ test: 'data' }],
      };

      const result = tool.schema.safeParse(invalidInput);

      expect(result.success).toBe(false);
    });

    it('reject empty problemDescription', () => {
      const validInput = {
        problemDescription: '',
        remediation: 'solve the thing',
        endpointIds: ['endpoint-1'],
        data: [{ test: 'data' }],
      };
      const result = tool.schema.safeParse(validInput);

      expect(result.success).toBe(false);
    });

    it('rejects missing remediation', () => {
      const invalidInput = {
        problemDescription: 'test problem',
        endpointIds: ['endpoint-1'],
        data: [{ test: 'data' }],
      };

      const result = tool.schema.safeParse(invalidInput);

      expect(result.success).toBe(false);
    });

    it('reject empty remediation', () => {
      const validInput = {
        problemDescription: 'test problem',
        remediation: '',
        endpointIds: ['endpoint-1'],
        data: [{ test: 'data' }],
      };
      const result = tool.schema.safeParse(validInput);

      expect(result.success).toBe(false);
    });

    it('rejects missing endpointIds', () => {
      const invalidInput = {
        problemDescription: 'test problem',
        remediation: 'solve the thing',
        data: [{ test: 'data' }],
      };

      const result = tool.schema.safeParse(invalidInput);

      expect(result.success).toBe(false);
    });

    it('rejects empty endpointIds array', () => {
      const invalidInput = {
        problemDescription: 'test problem',
        remediation: 'solve the thing',
        endpointIds: [],
        data: [{ test: 'data' }],
      };

      const result = tool.schema.safeParse(invalidInput);

      expect(result.success).toBe(false);
    });

    it('rejects non-array endpointIds', () => {
      const invalidInput = {
        problemDescription: 'test problem',
        remediation: 'solve the thing',
        endpointIds: 'not-an-array',
        data: [{ test: 'data' }],
      };

      const result = tool.schema.safeParse(invalidInput);

      expect(result.success).toBe(false);
    });

    it('rejects missing data', () => {
      const invalidInput = {
        problemDescription: 'Test problem',
        remediation: 'solve the thing',
        endpointIds: ['endpoint-1'],
      };

      const result = tool.schema.safeParse(invalidInput);

      expect(result.success).toBe(false);
    });

    it('rejects empty data array', () => {
      const validInput = {
        problemDescription: 'Test problem',
        remediation: 'solve the thing',
        endpointIds: ['endpoint-1'],
        data: [],
      };

      const result = tool.schema.safeParse(validInput);

      expect(result.success).toBe(false);
    });

    it('rejects non-array data', () => {
      const invalidInput = {
        problemDescription: 'Test problem',
        remediation: 'solve the thing',
        endpointIds: ['endpoint-1'],
        data: 'not-an-array',
      };

      const result = tool.schema.safeParse(invalidInput);

      expect(result.success).toBe(false);
    });
  });

  describe('handler', () => {
    let tool: ReturnType<typeof generateInsightTool>;
    let mockEndpointAppContextService: jest.Mocked<EndpointAppContextService>;
    let mockEnsureInCurrentSpace: jest.Mock;
    let mockModelProvider: ToolHandlerContext['modelProvider'];
    let mockModel: ScopedModel;
    let mockGraph: { invoke: jest.Mock };

    const createHandlerContext = () =>
      ({
        modelProvider: mockModelProvider,
        spaceId: 'space-1',
        logger: {
          error: jest.fn(),
        },
      } as unknown as ToolHandlerContext);

    beforeEach(() => {
      mockEndpointAppContextService = createMockEndpointAppContextService();
      const fleetServices = mockEndpointAppContextService.getInternalFleetServices();
      mockEnsureInCurrentSpace = fleetServices.ensureInCurrentSpace as jest.Mock;
      mockEnsureInCurrentSpace.mockResolvedValue(undefined);
      mockEndpointAppContextService.getInternalFleetServices.mockClear();

      tool = generateInsightTool(mockEndpointAppContextService);

      mockGraph = {
        invoke: jest.fn(),
      };

      mockModel = {
        chatModel: {} as InferenceChatModel,
        connector: {
          connectorId: 'test-connector-id',
          type: InferenceConnectorType.OpenAI,
          name: 'test-connector',
          config: {},
          capabilities: {},
        } as InferenceConnector,
        inferenceClient: {} as BoundInferenceClient,
      } as ScopedModel;

      mockModelProvider = {
        getDefaultModel: jest.fn().mockResolvedValue(mockModel),
      } as unknown as ToolHandlerContext['modelProvider'];

      mockCreateGenerateInsightGraph.mockReturnValue(mockGraph);
    });

    it('successfully generates insights when data is provided', async () => {
      const mockResults = [
        {
          type: ToolResultType.other,
          data: { workflowInsights: ['insight-1', 'insight-2'] },
        },
      ];

      mockGraph.invoke.mockResolvedValue({ results: mockResults });

      const inputData = [{ event: { type: 'process' } }, { event: { type: 'network' } }];

      const result = await tool.handler(
        {
          problemDescription: 'configuration issue detected',
          remediation: 'fix the thing',
          endpointIds: ['endpoint-1', 'endpoint-2'],
          data: inputData,
        },
        createHandlerContext()
      );

      expect(mockEndpointAppContextService.getInternalFleetServices).toHaveBeenCalledWith(
        'space-1'
      );
      expect(mockEnsureInCurrentSpace).toHaveBeenCalledWith({
        agentIds: ['endpoint-1', 'endpoint-2'],
      });
      expect(mockModelProvider.getDefaultModel).toHaveBeenCalledTimes(1);
      expect(mockCreateGenerateInsightGraph).toHaveBeenCalledWith({
        model: mockModel,
        problemDescription: 'configuration issue detected',
        remediation: 'fix the thing',
        endpointIds: ['endpoint-1', 'endpoint-2'],
        data: inputData,
        spaceId: 'space-1',
      });
      expect(mockGraph.invoke).toHaveBeenCalledWith({});
      expect(result).toEqual({ results: mockResults });
    });

    it('returns an error and skips graph execution when endpoint space validation fails', async () => {
      mockEnsureInCurrentSpace.mockRejectedValueOnce(new Error('Agent endpoint-2 not found'));
      const handlerContext = createHandlerContext();

      const result = await tool.handler(
        {
          problemDescription: 'configuration issue detected',
          remediation: 'fix the thing',
          endpointIds: ['endpoint-1', 'endpoint-2'],
          data: [{ event: { type: 'process' } }],
        },
        handlerContext
      );

      expect(mockEndpointAppContextService.getInternalFleetServices).toHaveBeenCalledWith(
        'space-1'
      );
      expect(mockEnsureInCurrentSpace).toHaveBeenCalledWith({
        agentIds: ['endpoint-1', 'endpoint-2'],
      });
      expect(mockModelProvider.getDefaultModel).not.toHaveBeenCalled();
      expect(mockCreateGenerateInsightGraph).not.toHaveBeenCalled();
      expect(mockGraph.invoke).not.toHaveBeenCalled();
      expect(handlerContext.logger.error).toHaveBeenCalledWith(
        'Error in automatic_troubleshooting.generate_insight tool: Agent endpoint-2 not found'
      );
      expect(result).toEqual({
        results: [
          {
            type: ToolResultType.error,
            data: {
              message: 'Error: Agent endpoint-2 not found',
            },
          },
        ],
      });
    });

    it('validates endpoint space before loading the model and creating the graph', async () => {
      mockGraph.invoke.mockResolvedValue({ results: [] });

      await tool.handler(
        {
          problemDescription: 'test problem',
          remediation: 'fix the thing',
          endpointIds: ['endpoint-1'],
          data: [{ test: 'data' }],
        },
        createHandlerContext()
      );

      const ensureOrder = mockEnsureInCurrentSpace.mock.invocationCallOrder[0];
      const modelOrder = (mockModelProvider.getDefaultModel as jest.Mock).mock
        .invocationCallOrder[0];
      const graphOrder = mockCreateGenerateInsightGraph.mock.invocationCallOrder[0];

      expect(ensureOrder).toBeLessThan(modelOrder);
      expect(modelOrder).toBeLessThan(graphOrder);
    });

    it('handles graph returning empty results', async () => {
      mockGraph.invoke.mockResolvedValue({ results: [] });

      const result = await tool.handler(
        {
          problemDescription: 'test problem',
          remediation: 'fix the thing',
          endpointIds: ['endpoint-1'],
          data: [{ test: 'data' }],
        },
        createHandlerContext()
      );

      expect(result).toEqual({ results: [] });
    });

    it('handles graph returning multiple results', async () => {
      const mockResults = [
        {
          type: ToolResultType.other,
          data: { workflowInsights: ['insight-1'] },
        },
        {
          type: ToolResultType.other,
          data: { workflowInsights: ['insight-2'] },
        },
        {
          type: ToolResultType.other,
          data: { workflowInsights: ['insight-3'] },
        },
      ];

      mockGraph.invoke.mockResolvedValue({ results: mockResults });

      const result = await tool.handler(
        {
          problemDescription: 'multiple issues',
          remediation: 'fix the things',
          endpointIds: ['endpoint-1', 'endpoint-2', 'endpoint-3'],
          data: [{ issue: 1 }, { issue: 2 }, { issue: 3 }],
        },
        createHandlerContext()
      );

      if ('results' in result) {
        expect(result.results).toHaveLength(3);
        expect(result).toEqual({ results: mockResults });
      }
    });

    it('works with nested data structures', async () => {
      const mockResults = [
        {
          type: ToolResultType.other,
          data: { workflowInsights: ['insight-1'] },
        },
      ];

      mockGraph.invoke.mockResolvedValue({ results: mockResults });

      const data = [
        {
          event: {
            type: 'process',
            action: 'start',
            process: {
              name: 'test.exe',
              args: ['--config', 'test.conf'],
              parent: {
                process: {
                  name: 'parent.exe',
                },
              },
            },
          },
          agent: {
            id: 'agent-1',
            version: '9.4.0',
          },
        },
      ];

      await tool.handler(
        {
          problemDescription: 'solve me',
          remediation: 'fix the thing',
          endpointIds: ['endpoint-1'],
          data,
        },
        createHandlerContext()
      );

      expect(mockCreateGenerateInsightGraph).toHaveBeenCalledWith(
        expect.objectContaining({
          data,
        })
      );
    });

    it('handles multiple endpoint ids', async () => {
      const mockResults = [
        {
          type: ToolResultType.other,
          data: { workflowInsights: ['insight-1'] },
        },
      ];

      mockGraph.invoke.mockResolvedValue({ results: mockResults });

      const endpointIds = ['endpoint-1', 'endpoint-2', 'endpoint-3', 'endpoint-4', 'endpoint-5'];

      await tool.handler(
        {
          problemDescription: 'multi-endpoint issue',
          remediation: 'fix the things',
          endpointIds,
          data: [{ test: 'data' }],
        },
        createHandlerContext()
      );

      expect(mockCreateGenerateInsightGraph).toHaveBeenCalledWith(
        expect.objectContaining({
          endpointIds,
        })
      );
    });

    it('properly invokes graph with empty object', async () => {
      mockGraph.invoke.mockResolvedValue({ results: [] });

      await tool.handler(
        {
          problemDescription: 'test',
          remediation: 'fix the thing',
          endpointIds: ['endpoint-1'],
          data: [{ test: 'data' }],
        },
        createHandlerContext()
      );

      expect(mockGraph.invoke).toHaveBeenCalledWith({});
      expect(mockGraph.invoke).toHaveBeenCalledTimes(1);
    });
  });

  describe('tool metadata', () => {
    const tool = createTool();

    it('has appropriate description for when to use the tool', () => {
      expect(tool.description).toContain('When to use:');
      expect(tool.description).toContain('When a conclusion has been reached');
    });

    it('describes that the tool must be called', () => {
      expect(tool.description).toContain('This tool MUST ALWAYS be called.');
    });
  });
});
