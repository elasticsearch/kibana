/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ToolResultType } from '@kbn/agent-builder-common';
import { isToolHandlerStandardReturn } from '@kbn/agent-builder-server';
import type { BuiltinToolDefinition, ToolHandlerStandardReturn } from '@kbn/agent-builder-server';
import { agentBuilderMocks } from '@kbn/agent-builder-plugin/server/mocks';
import type { z } from '@kbn/zod/v4';
import type { ExperimentalFeatures } from '../../../common';
import { coreMock } from '@kbn/core/server/mocks';
import {
  createToolAvailabilityContext,
  createToolHandlerContext,
  createToolTestMocks,
  setupMockCoreStartServices,
} from '../__mocks__/test_helpers';
import { ENABLE_ESQL } from '@kbn/esql-utils';
import {
  createDetectionRuleTool,
  isPlaceholderRuleText,
  SECURITY_CREATE_DETECTION_RULE_TOOL_ID,
} from './create_detection_rule_tool';
import { getBuildAgent } from '../../lib/detection_engine/ai_rule_creation/agent';
import { getAgentBuilderResourceAvailability } from '../utils/get_agent_builder_resource_availability';
import { SECURITY_RULE_ATTACHMENT_ID } from '../../../common/constants';

jest.mock('../../lib/detection_engine/ai_rule_creation/agent', () => ({
  getBuildAgent: jest.fn(),
}));

jest.mock('../utils/get_agent_builder_resource_availability', () => ({
  getAgentBuilderResourceAvailability: jest.fn(),
}));

const mockGetBuildAgent = getBuildAgent as jest.Mock;
const mockGetAgentBuilderResourceAvailability = getAgentBuilderResourceAvailability as jest.Mock;
const userQuery = 'Create a rule to detect suspicious activity';

describe('isPlaceholderRuleText', () => {
  it('returns true for empty object "{}"', () => {
    expect(isPlaceholderRuleText('{}')).toBe(true);
  });

  it('returns true for an object with neither name nor query', () => {
    expect(isPlaceholderRuleText('{"attachmentLabel": "Rule"}')).toBe(true);
  });

  it('returns false when name is present', () => {
    expect(isPlaceholderRuleText('{"name": "My Rule"}')).toBe(false);
  });

  it('returns false when query is present', () => {
    expect(isPlaceholderRuleText('{"query": "FROM logs-*"}')).toBe(false);
  });

  it('returns false for malformed JSON', () => {
    expect(isPlaceholderRuleText('not json')).toBe(false);
  });

  it('returns false for an array', () => {
    expect(isPlaceholderRuleText('[]')).toBe(false);
  });
});

describe('createDetectionRuleTool', () => {
  const { mockCore, mockLogger, mockEsClient, mockRequest } = createToolTestMocks();
  const mockModelProvider = agentBuilderMocks.createModelProvider();
  mockModelProvider.getDefaultModel.mockResolvedValue({
    chatModel: {
      getConnector: jest.fn().mockReturnValue({ connectorId: 'test-connector-id' }),
    },
  } as never);
  const mockEvents = {
    reportProgress: jest.fn(),
    sendUiEvent: jest.fn(),
  };
  const mockExperimentalFeatures = { aiRuleCreationEnabled: true } as ExperimentalFeatures;
  const tool = createDetectionRuleTool(
    mockCore,
    mockLogger,
    mockExperimentalFeatures
  ) as BuiltinToolDefinition<
    z.ZodObject<{ user_query: z.ZodString; attachment_id?: z.ZodOptional<z.ZodString> }>
  >;

  let mockCoreStart: ReturnType<typeof setupMockCoreStartServices>;
  let mockUiSettingsClient: ReturnType<
    ReturnType<typeof setupMockCoreStartServices>['uiSettings']['asScopedToClient']
  >;

  beforeEach(() => {
    jest.clearAllMocks();
    mockCoreStart = setupMockCoreStartServices(mockCore, mockEsClient);
    mockUiSettingsClient = mockCoreStart.uiSettings.asScopedToClient(
      mockCoreStart.savedObjects.getScopedClient(mockRequest)
    );
    jest.mocked(mockUiSettingsClient.get).mockResolvedValue(true);
    mockGetAgentBuilderResourceAvailability.mockResolvedValue({
      status: 'available',
    });
  });

  describe('schema', () => {
    it('validates correct schema with required user_query', () => {
      const result = tool.schema.safeParse({
        user_query: 'Create a rule to detect suspicious logins',
      });
      expect(result.success).toBe(true);
    });

    it('accepts optional attachment_id', () => {
      const result = tool.schema.safeParse({
        user_query: 'Update the rule query',
        attachment_id: 'air:abc123',
      });
      expect(result.success).toBe(true);
    });

    it('rejects missing user_query', () => {
      expect(tool.schema.safeParse({}).success).toBe(false);
    });

    it('rejects non-string user_query', () => {
      expect(tool.schema.safeParse({ user_query: 123 }).success).toBe(false);
    });
  });

  describe('tool properties', () => {
    it('returns correct tool id', () => {
      expect(tool.id).toBe(SECURITY_CREATE_DETECTION_RULE_TOOL_ID);
    });

    it('has correct tags', () => {
      expect(tool.tags).toEqual(['security', 'detection', 'rule-creation', 'siem']);
    });
  });

  describe('availability', () => {
    it('returns unavailable when experimental feature is disabled', async () => {
      const toolWithFeatureDisabled = createDetectionRuleTool(mockCore, mockLogger, {
        aiRuleCreationEnabled: false,
      } as ExperimentalFeatures);

      const availability = await toolWithFeatureDisabled.availability?.handler(
        createToolAvailabilityContext(mockRequest, 'default')
      );

      expect(availability).toEqual({
        status: 'unavailable',
        reason:
          'AI rule creation is not enabled. Enable it via experimental feature flag "aiRuleCreationEnabled".',
      });
    });

    it('returns unavailable when space availability check fails', async () => {
      mockGetAgentBuilderResourceAvailability.mockResolvedValue({
        status: 'unavailable',
        reason: 'Space is not available',
      });

      const availability = await tool.availability?.handler(
        createToolAvailabilityContext(mockRequest, 'default')
      );

      expect(availability).toEqual({
        status: 'unavailable',
        reason: 'Space is not available',
      });
    });

    it('returns unavailable when ES|QL is disabled', async () => {
      jest.mocked(mockUiSettingsClient.get).mockResolvedValue(false);

      const availability = await tool.availability?.handler(
        createToolAvailabilityContext(mockRequest, 'default')
      );

      expect(availability).toEqual({
        status: 'unavailable',
        reason: 'ES|QL is disabled in this space via the enableESQL advanced setting.',
      });
      expect(mockUiSettingsClient.get).toHaveBeenCalledWith(ENABLE_ESQL);
    });

    it('returns available when all checks pass', async () => {
      const availability = await tool.availability?.handler(
        createToolAvailabilityContext(mockRequest, 'default')
      );
      expect(availability).toEqual({ status: 'available' });
    });
  });

  describe('handler', () => {
    const mockIterativeAgent = { invoke: jest.fn() };
    const mockRule = {
      name: 'Test Rule',
      query: 'FROM test | limit 100',
      language: 'esql',
      type: 'esql',
    };

    beforeEach(() => {
      mockGetBuildAgent.mockResolvedValue(mockIterativeAgent);
      const coreStart = coreMock.createStart();
      Object.assign(coreStart.elasticsearch.client, {
        asInternalUser: mockEsClient.asInternalUser,
        asCurrentUser: mockEsClient.asCurrentUser,
      });
      mockCore.getStartServices.mockResolvedValue([
        coreStart,
        {
          alerting: { getRulesClientWithRequest: jest.fn().mockResolvedValue({}) },
          inference: {},
        },
        {},
      ]);
      mockIterativeAgent.invoke.mockResolvedValue({ rule: mockRule, errors: [] });
    });

    // -----------------------------------------------------------------
    // Branch 2: empty placeholder seed → consume it (no phantom card)
    // -----------------------------------------------------------------
    describe('placeholder seed consumption (no attachment_id + empty seed present)', () => {
      it('updates the constant-id seed and returns isNewCard=false', async () => {
        const context = createToolHandlerContext(mockRequest, mockEsClient, mockLogger, {
          modelProvider: mockModelProvider,
          events: mockEvents,
        });
        (context.attachments.getAttachmentRecord as jest.Mock).mockImplementation((id: string) => {
          if (id === SECURITY_RULE_ATTACHMENT_ID) {
            return {
              id: SECURITY_RULE_ATTACHMENT_ID,
              current_version: 1,
              versions: [{ version: 1, data: { text: '{}' } }],
            };
          }
          return undefined;
        });
        (context.attachments.update as jest.Mock).mockResolvedValue({
          id: SECURITY_RULE_ATTACHMENT_ID,
          current_version: 1,
        });

        const result = await tool.handler({ user_query: userQuery }, context);

        expect(context.attachments.add).not.toHaveBeenCalled();
        expect(context.attachments.update).toHaveBeenCalledWith(
          SECURITY_RULE_ATTACHMENT_ID,
          expect.objectContaining({
            data: expect.not.objectContaining({ ruleId: expect.anything() }),
          })
        );
        expect(result).toEqual({
          results: [
            {
              type: ToolResultType.other,
              data: {
                success: true,
                rule: mockRule,
                attachmentId: SECURITY_RULE_ATTACHMENT_ID,
                isNewCard: false,
                version: 1,
              },
            },
          ],
        });
      });

      it('never writes ruleId into the card (identity lives in origin)', async () => {
        const context = createToolHandlerContext(mockRequest, mockEsClient, mockLogger, {
          modelProvider: mockModelProvider,
          events: mockEvents,
        });
        // Seed carries a stale ruleId from a previous save, but the card text is still a placeholder
        (context.attachments.getAttachmentRecord as jest.Mock).mockImplementation((id: string) => {
          if (id === SECURITY_RULE_ATTACHMENT_ID) {
            return {
              id: SECURITY_RULE_ATTACHMENT_ID,
              current_version: 1,
              versions: [{ version: 1, data: { text: '{}', ruleId: 'old-id' } }],
            };
          }
          return undefined;
        });
        (context.attachments.update as jest.Mock).mockResolvedValue({
          id: SECURITY_RULE_ATTACHMENT_ID,
          current_version: 1,
        });

        await tool.handler({ user_query: userQuery }, context);

        // On a create (no attachment_id), ruleId must be null regardless of seed data
        expect(context.attachments.update).toHaveBeenCalledWith(
          SECURITY_RULE_ATTACHMENT_ID,
          expect.objectContaining({
            data: expect.not.objectContaining({ ruleId: expect.anything() }),
          })
        );
      });
    });

    // -----------------------------------------------------------------
    // Branch 3: no placeholder → mint a fresh uuid
    // -----------------------------------------------------------------
    describe('fresh create — no attachment_id, no placeholder (isNewCard=true)', () => {
      it('mints a new hyphen-free id and calls add()', async () => {
        const context = createToolHandlerContext(mockRequest, mockEsClient, mockLogger, {
          modelProvider: mockModelProvider,
          events: mockEvents,
        });
        // No constant-id seed → getAttachmentRecord returns undefined for any id
        (context.attachments.getAttachmentRecord as jest.Mock).mockReturnValue(undefined);
        (context.attachments.add as jest.Mock).mockResolvedValue({
          id: 'air:abc123',
          current_version: 1,
        });

        const result = await tool.handler({ user_query: userQuery }, context);

        expect(context.attachments.update).not.toHaveBeenCalled();
        expect(context.attachments.add).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.not.objectContaining({ ruleId: expect.anything() }),
          })
        );

        expect(isToolHandlerStandardReturn(result)).toBe(true);
        const resultData = (result as ToolHandlerStandardReturn).results[0].data as Record<
          string,
          unknown
        >;
        expect(resultData.isNewCard).toBe(true);

        // Minted id must be hyphen-free (no markdown-shatter risk)
        expect(typeof resultData.attachmentId).toBe('string');
        expect(resultData.attachmentId as string).not.toContain('-');
      });

      it('returns success result with attachmentId, version, and isNewCard=true', async () => {
        const context = createToolHandlerContext(mockRequest, mockEsClient, mockLogger, {
          modelProvider: mockModelProvider,
          events: mockEvents,
        });
        (context.attachments.getAttachmentRecord as jest.Mock).mockReturnValue(undefined);
        (context.attachments.add as jest.Mock).mockResolvedValue({
          id: 'air:newidhere',
          current_version: 1,
        });

        const result = await tool.handler({ user_query: userQuery }, context);

        expect(isToolHandlerStandardReturn(result)).toBe(true);
        const resultData = (result as ToolHandlerStandardReturn).results[0].data as Record<
          string,
          unknown
        >;
        expect(resultData.success).toBe(true);
        expect(resultData.isNewCard).toBe(true);
        expect(resultData.version).toBe(1);
        expect(mockIterativeAgent.invoke).toHaveBeenCalledWith({ userQuery });
      });

      it('two sequential creates produce one update (seed) then one add with distinct ids', async () => {
        // First create: seed is present → consumes it (update)
        const ctx1 = createToolHandlerContext(mockRequest, mockEsClient, mockLogger, {
          modelProvider: mockModelProvider,
          events: mockEvents,
        });
        (ctx1.attachments.getAttachmentRecord as jest.Mock).mockImplementation((id: string) =>
          id === SECURITY_RULE_ATTACHMENT_ID
            ? {
                id: SECURITY_RULE_ATTACHMENT_ID,
                current_version: 1,
                versions: [{ version: 1, data: { text: '{}' } }],
              }
            : undefined
        );
        (ctx1.attachments.update as jest.Mock).mockResolvedValue({
          id: SECURITY_RULE_ATTACHMENT_ID,
          current_version: 1,
        });
        const result1 = await tool.handler({ user_query: userQuery }, ctx1);
        expect(isToolHandlerStandardReturn(result1)).toBe(true);
        const data1 = (result1 as ToolHandlerStandardReturn).results[0].data as Record<
          string,
          unknown
        >;
        expect(data1.isNewCard).toBe(false);
        expect(data1.attachmentId).toBe(SECURITY_RULE_ATTACHMENT_ID);
        expect(ctx1.attachments.add).not.toHaveBeenCalled();

        // Second create: only a real named card exists → mints a new uuid (add)
        const ctx2 = createToolHandlerContext(mockRequest, mockEsClient, mockLogger, {
          modelProvider: mockModelProvider,
          events: mockEvents,
        });
        const realCardId = SECURITY_RULE_ATTACHMENT_ID;
        (ctx2.attachments.getAttachmentRecord as jest.Mock).mockImplementation((id: string) =>
          id === realCardId
            ? {
                id: realCardId,
                current_version: 1,
                versions: [{ version: 1, data: { text: JSON.stringify(mockRule) } }],
              }
            : undefined
        );
        const mintedId = 'air:newcard';
        (ctx2.attachments.add as jest.Mock).mockResolvedValue({
          id: mintedId,
          current_version: 1,
        });
        const result2 = await tool.handler({ user_query: userQuery }, ctx2);
        expect(isToolHandlerStandardReturn(result2)).toBe(true);
        const data2 = (result2 as ToolHandlerStandardReturn).results[0].data as Record<
          string,
          unknown
        >;
        expect(data2.isNewCard).toBe(true);
        expect(data2.attachmentId).not.toBe(SECURITY_RULE_ATTACHMENT_ID);
        expect(ctx2.attachments.update).not.toHaveBeenCalled();
      });
    });

    // -----------------------------------------------------------------
    // Branch 1: attachment_id provided → update in place
    // -----------------------------------------------------------------
    describe('query rewrite — attachment_id provided (isNewCard=false)', () => {
      it('reads the rule from the attachment and calls update(attachment_id)', async () => {
        const existingAttachmentId = 'air:existingcard';
        const existingRuleJson = JSON.stringify({
          name: 'Existing Rule',
          query: 'FROM old | limit 10',
          severity: 'high',
        });
        const context = createToolHandlerContext(mockRequest, mockEsClient, mockLogger, {
          modelProvider: mockModelProvider,
          events: mockEvents,
        });
        (context.attachments.getAttachmentRecord as jest.Mock).mockImplementation((id: string) =>
          id === existingAttachmentId
            ? {
                id: existingAttachmentId,
                current_version: 1,
                versions: [{ version: 1, data: { text: existingRuleJson, ruleId: null } }],
              }
            : undefined
        );
        (context.attachments.update as jest.Mock).mockResolvedValue({
          id: existingAttachmentId,
          current_version: 2,
        });

        const result = await tool.handler(
          { user_query: userQuery, attachment_id: existingAttachmentId },
          context
        );

        expect(context.attachments.add).not.toHaveBeenCalled();
        expect(context.attachments.update).toHaveBeenCalledWith(
          existingAttachmentId,
          expect.objectContaining({
            data: expect.not.objectContaining({ ruleId: expect.anything() }),
          })
        );

        expect(isToolHandlerStandardReturn(result)).toBe(true);
        const resultData = (result as ToolHandlerStandardReturn).results[0].data as Record<
          string,
          unknown
        >;
        expect(resultData.isNewCard).toBe(false);
        expect(resultData.attachmentId).toBe(existingAttachmentId);
        expect(resultData.version).toBe(2);
      });

      it('seeds the graph with the existing rule text when attachment_id is provided', async () => {
        const existingAttachmentId = 'air:existingcard';
        const existingRule = {
          name: 'DNS Rule',
          query: 'FROM logs-* | WHERE dns IS NOT NULL',
          severity: 'high',
        };
        const context = createToolHandlerContext(mockRequest, mockEsClient, mockLogger, {
          modelProvider: mockModelProvider,
          events: mockEvents,
        });
        (context.attachments.getAttachmentRecord as jest.Mock).mockImplementation((id: string) =>
          id === existingAttachmentId
            ? {
                id: existingAttachmentId,
                current_version: 1,
                versions: [
                  { version: 1, data: { text: JSON.stringify(existingRule), ruleId: null } },
                ],
              }
            : undefined
        );
        (context.attachments.update as jest.Mock).mockResolvedValue({
          id: existingAttachmentId,
          current_version: 2,
        });

        await tool.handler({ user_query: userQuery, attachment_id: existingAttachmentId }, context);

        expect(mockIterativeAgent.invoke).toHaveBeenCalledWith({
          userQuery,
          rule: expect.objectContaining({ name: 'DNS Rule', severity: 'high' }),
        });
      });

      it('does not write ruleId when rewriting a saved rule (origin carries identity)', async () => {
        // Identity lives in the attachment's top-level `origin`, which persists across update() on
        // the same id — so the tool no longer re-emits a per-version ruleId to stay "Update".
        const existingAttachmentId = 'air:savedcard';
        const context = createToolHandlerContext(mockRequest, mockEsClient, mockLogger, {
          modelProvider: mockModelProvider,
          events: mockEvents,
        });
        (context.attachments.getAttachmentRecord as jest.Mock).mockImplementation((id: string) =>
          id === existingAttachmentId
            ? {
                id: existingAttachmentId,
                current_version: 1,
                versions: [
                  { version: 1, data: { text: JSON.stringify(mockRule), ruleId: 'saved-rule-id' } },
                ],
              }
            : undefined
        );
        (context.attachments.update as jest.Mock).mockResolvedValue({
          id: existingAttachmentId,
          current_version: 2,
        });

        await tool.handler({ user_query: userQuery, attachment_id: existingAttachmentId }, context);

        expect(context.attachments.update).toHaveBeenCalledWith(
          existingAttachmentId,
          expect.objectContaining({
            data: expect.not.objectContaining({ ruleId: expect.anything() }),
          })
        );
      });

      it('returns isNewCard=false for an update', async () => {
        const existingAttachmentId = 'air:existingcard';
        const context = createToolHandlerContext(mockRequest, mockEsClient, mockLogger, {
          modelProvider: mockModelProvider,
          events: mockEvents,
        });
        (context.attachments.getAttachmentRecord as jest.Mock).mockImplementation((id: string) =>
          id === existingAttachmentId
            ? {
                id: existingAttachmentId,
                current_version: 1,
                versions: [{ version: 1, data: { text: '{}' } }],
              }
            : undefined
        );
        (context.attachments.update as jest.Mock).mockResolvedValue({
          id: existingAttachmentId,
          current_version: 2,
        });

        const result = await tool.handler(
          { user_query: userQuery, attachment_id: existingAttachmentId },
          context
        );

        expect(isToolHandlerStandardReturn(result)).toBe(true);
        const resultData = (result as ToolHandlerStandardReturn).results[0].data as Record<
          string,
          unknown
        >;
        expect(resultData.isNewCard).toBe(false);
      });
    });

    // -----------------------------------------------------------------
    // Error cases
    // -----------------------------------------------------------------
    it('returns error when connector ID is not available', async () => {
      const mockModelProviderWithoutConnector = agentBuilderMocks.createModelProvider();
      mockModelProviderWithoutConnector.getDefaultModel.mockResolvedValue({
        chatModel: { getConnector: jest.fn().mockReturnValue({ connectorId: null }) },
      } as never);

      const result = await tool.handler(
        { user_query: userQuery },
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger, {
          modelProvider: mockModelProviderWithoutConnector,
          events: mockEvents,
        })
      );

      expect(result).toEqual({
        results: [
          {
            type: ToolResultType.error,
            data: { message: 'No connector ID provided and no default connector available' },
          },
        ],
      });
    });

    it('returns error when graph creates rule with errors', async () => {
      const mockErrors = ['Error 1', 'Error 2'];
      mockIterativeAgent.invoke.mockResolvedValue({ rule: null, errors: mockErrors });

      const context = createToolHandlerContext(mockRequest, mockEsClient, mockLogger, {
        modelProvider: mockModelProvider,
        events: mockEvents,
      });
      (context.attachments.getAttachmentRecord as jest.Mock).mockReturnValue(undefined);

      const result = await tool.handler({ user_query: userQuery }, context);

      expect(result).toEqual({
        results: [
          {
            type: ToolResultType.error,
            data: {
              message: `Failed to create detection rule: ${mockErrors.join('; ')}`,
              errors: mockErrors,
            },
          },
        ],
      });
    });

    it('handles exceptions and returns error result', async () => {
      const mockError = new Error('Test error');
      mockGetBuildAgent.mockRejectedValue(mockError);

      const result = await tool.handler(
        { user_query: userQuery },
        createToolHandlerContext(mockRequest, mockEsClient, mockLogger, {
          modelProvider: mockModelProvider,
          events: mockEvents,
        })
      );

      expect(result).toEqual({
        results: [
          {
            type: ToolResultType.error,
            data: {
              message: `Failed to create detection rule: ${mockError.message}`,
              error: mockError.toString(),
            },
          },
        ],
      });
    });

    it('initiates the agent with the correct parameters', async () => {
      const context = createToolHandlerContext(mockRequest, mockEsClient, mockLogger, {
        modelProvider: mockModelProvider,
        events: mockEvents,
      });
      (context.attachments.getAttachmentRecord as jest.Mock).mockReturnValue(undefined);
      (context.attachments.add as jest.Mock).mockResolvedValue({
        id: 'air:abc',
        current_version: 1,
      });

      await tool.handler({ user_query: userQuery }, context);

      expect(mockGetBuildAgent).toHaveBeenCalledWith({
        model: expect.objectContaining({ getConnector: expect.any(Function) }),
        logger: mockLogger,
        inference: expect.any(Object),
        connectorId: 'test-connector-id',
        request: mockRequest,
        esClient: mockEsClient.asCurrentUser,
        savedObjectsClient: expect.any(Object),
        rulesClient: expect.any(Object),
        events: mockEvents,
      });
    });
  });
});
