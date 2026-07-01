/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ToolResultType } from '@kbn/agent-builder-common';
import { ConfirmationStatus } from '@kbn/agent-builder-common/agents/prompts';
import type { BuiltinToolDefinition } from '@kbn/agent-builder-server';
import type { z } from '@kbn/zod/v4';
import { coreMock } from '@kbn/core/server/mocks';
import { SecurityAgentBuilderAttachments } from '../../../common/constants';
import { createToolHandlerContext, createToolTestMocks } from '../__mocks__/test_helpers';
import { runRulePreview } from '../../lib/detection_engine/rule_preview/api/preview_rules/run_rule_preview';
import type { RunRulePreviewDeps } from '../../lib/detection_engine/rule_preview/api/preview_rules/run_rule_preview';
import { runRulePreviewTool, SECURITY_RUN_RULE_PREVIEW_TOOL_ID } from './run_rule_preview_tool';

jest.mock('../../lib/detection_engine/rule_preview/api/preview_rules/run_rule_preview', () => ({
  runRulePreview: jest.fn(),
}));

const runRulePreviewMock = runRulePreview as jest.Mock;

const getResults = (ret: unknown) => {
  const standard = ret as { results?: Array<{ type: string }> };
  if (!standard.results) {
    throw new Error('Expected a standard tool return with results');
  }
  return standard.results;
};

describe('runRulePreviewTool', () => {
  const { mockLogger, mockEsClient, mockRequest } = createToolTestMocks();

  const getActionsClientWithRequest = jest.fn().mockResolvedValue({});
  const getLicense = jest.fn().mockResolvedValue({});
  const mockCoreStart = coreMock.createStart();
  const getStartServices = jest.fn().mockResolvedValue([
    mockCoreStart,
    {
      actions: { getActionsClientWithRequest },
      licensing: { getLicense },
    },
  ]);

  const deps = {
    config: { experimentalFeatures: { esqlRulesDisabled: false } } as never,
    ml: undefined,
    security: undefined,
    securityRuleTypeOptions: {} as never,
    previewRuleDataClient: {} as never,
    getStartServices,
    logger: mockLogger,
    isServerless: false,
  } as unknown as RunRulePreviewDeps;

  const tool = runRulePreviewTool(deps) as unknown as BuiltinToolDefinition<
    z.ZodObject<z.ZodRawShape>
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    runRulePreviewMock.mockResolvedValue({
      previewId: 'preview-123',
      logs: [],
      isAborted: false,
    });
  });

  it('returns the correct tool id', () => {
    expect(tool.id).toBe(SECURITY_RUN_RULE_PREVIEW_TOOL_ID);
  });

  it('schema accepts a command string', () => {
    const parsed = tool.schema.safeParse({
      command: 'esql --query "FROM logs-* | LIMIT 10"',
    });
    expect(parsed.success).toBe(true);
  });

  it('schema requires a command string', () => {
    const parsed = tool.schema.safeParse({});
    expect(parsed.success).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Help path
  // ---------------------------------------------------------------------------

  it('returns help text when --help is passed', async () => {
    const context = createToolHandlerContext(mockRequest, mockEsClient, mockLogger);
    const result = await tool.handler({ command: '--help' }, context);

    expect(runRulePreviewMock).not.toHaveBeenCalled();
    const [firstResult] = getResults(result);
    expect(firstResult.type).toBe(ToolResultType.other);
    const data = (firstResult as { type: string; data: { help: string } }).data;
    expect(data.help).toContain('Commands:');
  });

  it('returns type-specific help for esql --help', async () => {
    const context = createToolHandlerContext(mockRequest, mockEsClient, mockLogger);
    const result = await tool.handler({ command: 'esql --help' }, context);

    expect(runRulePreviewMock).not.toHaveBeenCalled();
    const [firstResult] = getResults(result);
    expect(firstResult.type).toBe(ToolResultType.other);
    const data = (firstResult as { type: string; data: { help: string } }).data;
    expect(data.help).toContain('ES|QL');
  });

  // ---------------------------------------------------------------------------
  // Error path
  // ---------------------------------------------------------------------------

  it('returns an error result for an empty command', async () => {
    const context = createToolHandlerContext(mockRequest, mockEsClient, mockLogger);
    const result = await tool.handler({ command: '' }, context);

    expect(runRulePreviewMock).not.toHaveBeenCalled();
    const [firstResult] = getResults(result);
    expect(firstResult.type).toBe(ToolResultType.error);
  });

  it('returns an error result for an unknown flag', async () => {
    const context = createToolHandlerContext(mockRequest, mockEsClient, mockLogger);
    const result = await tool.handler({ command: 'esql --query "x" --bogus value' }, context);

    expect(runRulePreviewMock).not.toHaveBeenCalled();
    const [firstResult] = getResults(result);
    expect(firstResult.type).toBe(ToolResultType.error);
    const data = (firstResult as { type: string; data: { message: string } }).data;
    expect(data.message).toContain('bogus');
  });

  // ---------------------------------------------------------------------------
  // Preview path — ES|QL
  // ---------------------------------------------------------------------------

  it('runs a valid esql preview and creates an attachment', async () => {
    const context = createToolHandlerContext(mockRequest, mockEsClient, mockLogger);
    (context.prompts.checkConfirmationStatus as jest.Mock).mockReturnValue({
      status: ConfirmationStatus.accepted,
    });
    (context.attachments.add as jest.Mock).mockResolvedValue({
      id: 'security-rule-preview-preview-123',
      type: SecurityAgentBuilderAttachments.rulePreview,
      current_version: 1,
    });

    const result = await tool.handler(
      {
        command:
          'esql --query "FROM logs-* | LIMIT 10" --timeframe-start 2024-01-01T00:00:00.000Z --timeframe-end 2024-01-01T01:00:00.000Z --interval 5m',
      },
      context
    );

    expect(runRulePreviewMock).toHaveBeenCalledTimes(1);
    const [passedDeps, passedParams] = runRulePreviewMock.mock.calls[0];
    expect(passedDeps).toBe(deps);
    expect(passedParams).toEqual(
      expect.objectContaining({
        request: context.request,
        spaceId: 'default',
        enableLoggedRequests: false,
        body: expect.objectContaining({
          type: 'esql',
          query: 'FROM logs-* | LIMIT 10',
          // 1h / 5m interval => 12 invocations
          invocationCount: 12,
        }),
      })
    );

    expect(context.attachments.add).toHaveBeenCalledWith({
      id: 'security-rule-preview-preview-123',
      type: SecurityAgentBuilderAttachments.rulePreview,
      data: { previewId: 'preview-123' },
      description: 'Rule preview: preview-123',
    });

    expect(result).toEqual({
      results: [
        {
          type: ToolResultType.other,
          data: expect.objectContaining({
            attachmentId: 'security-rule-preview-preview-123',
            type: SecurityAgentBuilderAttachments.rulePreview,
            version: 1,
            previewId: 'preview-123',
          }),
        },
      ],
    });
  });

  it('sets from to now-{interval} so per-invocation ES query window matches the interval', async () => {
    const context = createToolHandlerContext(mockRequest, mockEsClient, mockLogger);
    (context.prompts.checkConfirmationStatus as jest.Mock).mockReturnValue({
      status: ConfirmationStatus.accepted,
    });
    (context.attachments.add as jest.Mock).mockResolvedValue({
      id: 'security-rule-preview-preview-123',
      type: SecurityAgentBuilderAttachments.rulePreview,
      current_version: 1,
    });

    await tool.handler(
      {
        command:
          'esql --query "FROM logs-* | LIMIT 10" --timeframe-start 2024-01-01T00:00:00.000Z --timeframe-end 2024-01-01T01:00:00.000Z --interval 5m',
      },
      context
    );

    const [, passedParams] = runRulePreviewMock.mock.calls[0];
    // from must match the interval so getRuleRangeTuples produces the correct per-invocation window
    expect(passedParams.body.from).toBe('now-5m');
    expect(passedParams.body.to).toBe('now');
    expect(passedParams.enableLoggedRequests).toBe(false);
  });

  // ---------------------------------------------------------------------------
  // Preview path — Machine Learning
  // ---------------------------------------------------------------------------

  it('runs a valid machine_learning preview', async () => {
    const context = createToolHandlerContext(mockRequest, mockEsClient, mockLogger);
    (context.prompts.checkConfirmationStatus as jest.Mock).mockReturnValue({
      status: ConfirmationStatus.accepted,
    });
    (context.attachments.add as jest.Mock).mockResolvedValue({
      id: 'security-rule-preview-preview-123',
      type: SecurityAgentBuilderAttachments.rulePreview,
      current_version: 1,
    });

    await tool.handler(
      {
        command:
          'machine_learning --job-id my-ml-job --anomaly-threshold 75 --timeframe-start 2024-01-01T00:00:00.000Z --timeframe-end 2024-01-01T01:00:00.000Z',
      },
      context
    );

    expect(runRulePreviewMock).toHaveBeenCalledTimes(1);
    const [, passedParams] = runRulePreviewMock.mock.calls[0];
    expect(passedParams.body).toEqual(
      expect.objectContaining({
        type: 'machine_learning',
        machine_learning_job_id: 'my-ml-job',
        anomaly_threshold: 75,
      })
    );
  });

  // ---------------------------------------------------------------------------
  // HITL confirmation
  // ---------------------------------------------------------------------------

  describe('HITL confirmation for large previews', () => {
    // 1h window at 5m interval = 12 invocations > threshold of 10
    const highInvocationCommand =
      'esql --query "FROM logs-* | LIMIT 10" --interval 5m --timeframe-start 2024-01-01T00:00:00.000Z --timeframe-end 2024-01-01T01:00:00.000Z';

    it('returns a confirmation prompt when invocationCount exceeds the threshold', async () => {
      const mockPrompt = { prompt: { type: 'confirmation', id: 'test-prompt' } };
      const context = createToolHandlerContext(mockRequest, mockEsClient, mockLogger);
      (context.prompts.checkConfirmationStatus as jest.Mock).mockReturnValue({
        status: ConfirmationStatus.unprompted,
      });
      (context.prompts.askForConfirmation as jest.Mock).mockReturnValue(mockPrompt);

      const result = await tool.handler({ command: highInvocationCommand }, context);

      expect(runRulePreviewMock).not.toHaveBeenCalled();
      expect(context.prompts.askForConfirmation).toHaveBeenCalledWith(
        expect.objectContaining({
          id: `run_rule_preview.high_invocation_count.${context.callContext.toolCallId}`,
          color: 'warning',
        })
      );
      expect(result).toBe(mockPrompt);
    });

    it('proceeds after the user confirms the large preview', async () => {
      const context = createToolHandlerContext(mockRequest, mockEsClient, mockLogger);
      (context.prompts.checkConfirmationStatus as jest.Mock).mockReturnValue({
        status: ConfirmationStatus.accepted,
      });
      (context.attachments.add as jest.Mock).mockResolvedValue({
        id: 'security-rule-preview-preview-123',
        type: SecurityAgentBuilderAttachments.rulePreview,
        current_version: 1,
      });

      const result = await tool.handler({ command: highInvocationCommand }, context);

      expect(runRulePreviewMock).toHaveBeenCalledTimes(1);
      expect(getResults(result)[0].type).toBe(ToolResultType.other);
    });

    it('returns an error with the original command when the user cancels the large preview', async () => {
      const context = createToolHandlerContext(mockRequest, mockEsClient, mockLogger);
      (context.prompts.checkConfirmationStatus as jest.Mock).mockReturnValue({
        status: ConfirmationStatus.rejected,
      });

      const result = await tool.handler({ command: highInvocationCommand }, context);

      expect(runRulePreviewMock).not.toHaveBeenCalled();
      const [firstResult] = getResults(result);
      expect(firstResult.type).toBe(ToolResultType.error);
      const errorData = (firstResult as { type: string; data: { message: string } }).data;
      expect(errorData.message).toContain('explicitly rejected');
      // The original command must appear so the LLM can re-run it
      expect(errorData.message).toContain(highInvocationCommand);
    });

    it('does not prompt when invocationCount is within the threshold', async () => {
      const context = createToolHandlerContext(mockRequest, mockEsClient, mockLogger);
      (context.attachments.add as jest.Mock).mockResolvedValue({
        id: 'security-rule-preview-preview-123',
        type: SecurityAgentBuilderAttachments.rulePreview,
        current_version: 1,
      });

      // 9 hour window at 1h interval = 9 invocations ≤ threshold of 10
      await tool.handler(
        {
          command:
            'esql --query "FROM logs-* | LIMIT 10" --interval 1h --timeframe-start 2024-01-01T00:00:00.000Z --timeframe-end 2024-01-01T09:00:00.000Z',
        },
        context
      );

      expect(context.prompts.checkConfirmationStatus).not.toHaveBeenCalled();
      expect(runRulePreviewMock).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // esqlRulesDisabled feature flag
  // ---------------------------------------------------------------------------

  describe('esqlRulesDisabled feature flag', () => {
    const esqlDisabledDeps = {
      ...deps,
      config: { experimentalFeatures: { esqlRulesDisabled: true } } as never,
    } as unknown as RunRulePreviewDeps;

    const esqlDisabledTool = runRulePreviewTool(
      esqlDisabledDeps
    ) as unknown as BuiltinToolDefinition<z.ZodObject<z.ZodRawShape>>;

    it('returns an error when esqlRulesDisabled and rule type is esql', async () => {
      const context = createToolHandlerContext(mockRequest, mockEsClient, mockLogger);

      const result = await esqlDisabledTool.handler(
        { command: 'esql --query "FROM logs-* | LIMIT 10"' },
        context
      );

      expect(runRulePreviewMock).not.toHaveBeenCalled();
      const [firstResult] = getResults(result);
      expect(firstResult.type).toBe(ToolResultType.error);
      const data = (firstResult as { type: string; data: { message: string } }).data;
      expect(data.message).toContain('ES|QL');
    });

    it('succeeds when esqlRulesDisabled but rule type is eql', async () => {
      const context = createToolHandlerContext(mockRequest, mockEsClient, mockLogger);
      (context.prompts.checkConfirmationStatus as jest.Mock).mockReturnValue({
        status: ConfirmationStatus.accepted,
      });
      (context.attachments.add as jest.Mock).mockResolvedValue({
        id: 'security-rule-preview-preview-123',
        type: SecurityAgentBuilderAttachments.rulePreview,
        current_version: 1,
      });

      await esqlDisabledTool.handler(
        {
          command:
            'eql --query "process where process.name == \\"cmd.exe\\"" --timeframe-start 2024-01-01T00:00:00.000Z --timeframe-end 2024-01-01T01:00:00.000Z',
        },
        context
      );

      expect(runRulePreviewMock).toHaveBeenCalledTimes(1);
      const [, passedParams] = runRulePreviewMock.mock.calls[0];
      expect(passedParams.body.type).toBe('eql');
    });
  });

  // ---------------------------------------------------------------------------
  // Error paths — backend failures
  // ---------------------------------------------------------------------------

  it('returns a clean error result for an invalid --interval (parseDuration throws)', async () => {
    const context = createToolHandlerContext(mockRequest, mockEsClient, mockLogger);

    const result = await tool.handler(
      {
        command:
          'esql --query "FROM logs-* | LIMIT 10" --timeframe-start 2024-01-01T00:00:00.000Z --timeframe-end 2024-01-01T01:00:00.000Z --interval not-a-duration',
      },
      context
    );

    expect(runRulePreviewMock).not.toHaveBeenCalled();
    const [firstResult] = getResults(result);
    expect(firstResult.type).toBe(ToolResultType.error);
    const data = (firstResult as { type: string; data: { message: string } }).data;
    expect(data.message).toContain('not-a-duration');
  });

  it('returns a clean error for structurally invalid threat_mapping entries that bypass CLI validation', async () => {
    // The CLI parser only checks Array.isArray(threatMapping). The route Zod schema
    // also validates entry structure: type must be literal 'mapping'. This test proves
    // the tool validates the body before calling runRulePreview.
    const context = createToolHandlerContext(mockRequest, mockEsClient, mockLogger);
    (context.prompts.checkConfirmationStatus as jest.Mock).mockReturnValue({
      status: ConfirmationStatus.accepted,
    });

    const result = await tool.handler(
      {
        command:
          'threat_match --query "*:*" --threat-query "*:*" --threat-index ti-* ' +
          '--threat-mapping \'[{"entries":[{"field":"src.ip","type":"wrong","value":"dst.ip"}]}]\' ' +
          '--timeframe-start 2024-01-01T00:00:00.000Z --timeframe-end 2024-01-01T01:00:00.000Z',
      },
      context
    );

    expect(runRulePreviewMock).not.toHaveBeenCalled();
    const [firstResult] = getResults(result);
    expect(firstResult.type).toBe(ToolResultType.error);
  });

  it('returns an error result for an invalid timeframe (unparseable datemath)', async () => {
    const context = createToolHandlerContext(mockRequest, mockEsClient, mockLogger);

    const result = await tool.handler(
      {
        command:
          'esql --query "FROM logs-* | LIMIT 10" --timeframe-start not-a-date --timeframe-end now',
      },
      context
    );

    expect(runRulePreviewMock).not.toHaveBeenCalled();
    const [firstResult] = getResults(result);
    expect(firstResult.type).toBe(ToolResultType.error);
  });

  it('returns an error result when no preview id is produced', async () => {
    runRulePreviewMock.mockResolvedValue({
      previewId: undefined,
      logs: [{ errors: ['boom'], warnings: [], duration: 0 }],
      isAborted: false,
    });
    const context = createToolHandlerContext(mockRequest, mockEsClient, mockLogger);
    (context.prompts.checkConfirmationStatus as jest.Mock).mockReturnValue({
      status: ConfirmationStatus.accepted,
    });

    const result = await tool.handler(
      { command: 'esql --query "FROM logs-* | LIMIT 10"' },
      context
    );

    expect(runRulePreviewMock).toHaveBeenCalledTimes(1);
    expect(context.attachments.add).not.toHaveBeenCalled();
    const [firstResult] = getResults(result);
    expect(firstResult.type).toBe(ToolResultType.error);
  });
});
