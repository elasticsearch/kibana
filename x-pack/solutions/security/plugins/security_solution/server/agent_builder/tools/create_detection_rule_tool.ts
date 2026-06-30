/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { v4 as uuidv4 } from 'uuid';
import { ToolType } from '@kbn/agent-builder-common';
import { getLatestVersion } from '@kbn/agent-builder-common/attachments';
import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import type { BuiltinToolDefinition, StaticToolRegistration } from '@kbn/agent-builder-server';
import type { CoreSetup, Logger } from '@kbn/core/server';
import { ENABLE_ESQL } from '@kbn/esql-utils';
import type {
  SecuritySolutionPluginStart,
  SecuritySolutionPluginStartDependencies,
} from '../../plugin_contract';
import { securityTool } from './constants';
import type { ExperimentalFeatures } from '../../../common';
import type { EsqlRuleCreateProps } from '../../../common/api/detection_engine/model/rule_schema';
import {
  SecurityAgentBuilderAttachments,
  SECURITY_RULE_ATTACHMENT_ID,
} from '../../../common/constants';
import { getBuildAgent } from '../../lib/detection_engine/ai_rule_creation/agent';
import { getAgentBuilderResourceAvailability } from '../utils/get_agent_builder_resource_availability';

export const SECURITY_CREATE_DETECTION_RULE_TOOL_ID = securityTool('create_detection_rule');

/**
 * Mint a hyphen-free attachment id for new rule cards so the model-assembled
 * `<render_attachment>` tag can't markdown-shatter (hyphens in ids can break
 * autolink parsing). Prefix `air:` keeps it human-readable and autolink-safe.
 */
const mintRuleAttachmentId = (): string => `air:${uuidv4().replace(/-/g, '')}`;

/**
 * A placeholder card has no real rule content — its `text` field deserialises to
 * an object with no `name` and no `query`. Every chat entry point seeds one of
 * these (e.g. `create_rule_menu` uses `text: "{}"`) so the first create fills it
 * rather than creating a second card alongside a phantom empty one.
 */
export const isPlaceholderRuleText = (text: string): boolean => {
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
    const hasName = typeof (parsed as Record<string, unknown>).name === 'string';
    const hasQuery = typeof (parsed as Record<string, unknown>).query === 'string';
    return !hasName && !hasQuery;
  } catch {
    return false;
  }
};

const createDetectionRuleSchema = z.object({
  user_query: z
    .string()
    .describe(
      'Natural language description of the detection rule to create, including threat scenarios, data sources, and desired detection logic'
    ),
  attachment_id: z
    .string()
    .optional()
    .describe(
      'ID of the existing rule attachment to update. Pass when rewriting the query of an existing rule so the tool reads the current rule state and updates in place. Omit for a fresh create.'
    ),
});

export function createDetectionRuleTool(
  core: CoreSetup<SecuritySolutionPluginStartDependencies, SecuritySolutionPluginStart>,
  logger: Logger,
  experimentalFeatures: ExperimentalFeatures
): StaticToolRegistration<typeof createDetectionRuleSchema> {
  const toolDefinition: BuiltinToolDefinition<typeof createDetectionRuleSchema> = {
    id: SECURITY_CREATE_DETECTION_RULE_TOOL_ID,
    type: ToolType.builtin,
    description: `Creates a security detection rule based on natural language description. Analyzes the query, identifies relevant data sources, generates ES|QL queries, and produces a complete detection rule with metadata, tags, and scheduling information.

The tool stores the result as an attachment (creating new or updating existing). Use the returned attachmentId and version with <render_attachment id="..." version="..."> to display it.

Limitations: only ES|QL rules are supported; requires relevant data in existing Elasticsearch indices to generate a query; severity and risk score default to low/21 and are not AI-adapted from threat context.`,
    schema: createDetectionRuleSchema,
    tags: ['security', 'detection', 'rule-creation', 'siem'],
    availability: {
      cacheMode: 'space',
      handler: async ({ request }) => {
        if (!experimentalFeatures?.aiRuleCreationEnabled) {
          return {
            status: 'unavailable',
            reason:
              'AI rule creation is not enabled. Enable it via experimental feature flag "aiRuleCreationEnabled".',
          };
        }

        const spaceAvailability = await getAgentBuilderResourceAvailability({
          core,
          request,
          logger,
        });

        if (spaceAvailability.status === 'unavailable') {
          return spaceAvailability;
        }

        const [coreStart] = await core.getStartServices();
        const savedObjectsClient = coreStart.savedObjects.getScopedClient(request);
        const uiSettingsClient = coreStart.uiSettings.asScopedToClient(savedObjectsClient);
        const isEsqlEnabled = await uiSettingsClient.get<boolean>(ENABLE_ESQL);

        if (!isEsqlEnabled) {
          return {
            status: 'unavailable',
            reason: 'ES|QL is disabled in this space via the enableESQL advanced setting.',
          };
        }

        return { status: 'available' };
      },
    },
    handler: async (
      { user_query: userQuery, attachment_id: attachmentId },
      { esClient, modelProvider, request, events, attachments }
    ) => {
      try {
        logger.debug(
          `Create detection rule tool invoked with query: ${userQuery.substring(0, 100)}...`
        );

        const modelConfig = await modelProvider.getDefaultModel();
        const model = modelConfig.chatModel;
        const connectorId = model.getConnector().connectorId;

        if (!connectorId) {
          return {
            results: [
              {
                type: ToolResultType.error,
                data: {
                  message: 'No connector ID provided and no default connector available',
                },
              },
            ],
          };
        }

        const [coreStart, startPlugins] = await core.getStartServices();
        const savedObjectsClient = coreStart.savedObjects.getScopedClient(request);

        // Resolve which attachment to target and whether the graph should be seeded with
        // an existing rule (for query rewrites).
        //
        // Three-way decision:
        //  1. attachment_id provided → update that card (query rewrite / explicit re-target).
        //  2. attachment_id absent + an empty placeholder card exists → consume it (the first
        //     create in a conversation that was opened from a menu/form entry point).
        //  3. attachment_id absent + no placeholder → mint a new id (genuine second create).
        let resolvedAttachmentId: string;
        let existingRuleText: string | undefined;
        let isNewCard: boolean;

        if (attachmentId) {
          // Branch 1: explicit update
          const record = attachments.getAttachmentRecord(attachmentId);
          const latestVersion = record ? getLatestVersion(record) : undefined;
          if (!latestVersion) {
            logger.warn(
              `create_detection_rule: attachment ${attachmentId} has no resolvable version — treating as fresh create`
            );
          }
          const versionData = latestVersion?.data as Record<string, unknown> | undefined;
          existingRuleText = versionData?.text as string | undefined;
          resolvedAttachmentId = attachmentId;
          isNewCard = false;
        } else {
          // No explicit id — look for an empty placeholder card
          const placeholderRecord = attachments.getAttachmentRecord(SECURITY_RULE_ATTACHMENT_ID);
          const placeholderVersion = placeholderRecord
            ? getLatestVersion(placeholderRecord)
            : undefined;
          const placeholderText = (placeholderVersion?.data as Record<string, unknown> | undefined)
            ?.text as string | undefined;

          if (placeholderRecord && placeholderText && isPlaceholderRuleText(placeholderText)) {
            // Branch 2: consume the empty seed
            resolvedAttachmentId = SECURITY_RULE_ATTACHMENT_ID;
            existingRuleText = undefined; // placeholder has no real rule content
            isNewCard = false;
          } else {
            // Branch 3: mint a new id for a genuinely additional rule
            resolvedAttachmentId = mintRuleAttachmentId();
            existingRuleText = undefined;
            isNewCard = true;
          }
        }

        const rulesClient = await startPlugins.alerting.getRulesClientWithRequest(request);
        const iterativeAgent = await getBuildAgent({
          model,
          logger,
          inference: startPlugins.inference,
          connectorId,
          request,
          esClient: esClient.asCurrentUser,
          savedObjectsClient,
          rulesClient,
          events,
        });

        // Seed the graph with the existing rule when rewriting a query; otherwise create fresh.
        let existingRuleForGraph: Partial<EsqlRuleCreateProps> | undefined;
        if (existingRuleText) {
          try {
            const parsed = JSON.parse(existingRuleText);
            if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
              existingRuleForGraph = parsed as Partial<EsqlRuleCreateProps>;
            }
          } catch {
            logger.warn(
              `Could not parse existing rule text for attachment ${resolvedAttachmentId}`
            );
          }
        }

        const result = await iterativeAgent.invoke({
          userQuery,
          ...(existingRuleForGraph && { rule: existingRuleForGraph }),
        });

        if (result.errors.length) {
          logger.error(`Rule creation failed with errors: ${result.errors.join('; ')}`);
          return {
            results: [
              {
                type: ToolResultType.error,
                data: {
                  message: `Failed to create detection rule: ${result.errors.join('; ')}`,
                  errors: result.errors,
                },
              },
            ],
          };
        }

        logger.debug(`Successfully created detection rule: ${result.rule.name}`);

        // Strip server-assigned identity fields — `id`/`rule_id` must not appear in the stored draft.
        const {
          id: _id,
          rule_id: _ruleId,
          ...ruleWithoutIds
        } = result.rule as typeof result.rule & {
          id?: string;
          rule_id?: string;
        };

        const attachmentDescription = `Rule: ${result.rule.name}`;

        // Identity lives in the attachment's top-level `origin` (set after save), not in the
        // payload. `origin` persists across `update()` on the same attachment id, so a query
        // rewrite of a saved rule stays "Update" without any per-version carry-forward here.
        const attachmentData: Record<string, unknown> = {
          text: JSON.stringify(ruleWithoutIds),
          attachmentLabel: result.rule.name,
        };

        let resultVersion: number | undefined;

        try {
          if (!isNewCard) {
            // Update an existing card (branch 1 or branch 2)
            const updated = await attachments.update(resolvedAttachmentId, {
              data: attachmentData,
              description: attachmentDescription,
            });
            resultVersion = updated?.current_version;
            logger.debug(`Updated rule attachment ${resolvedAttachmentId} v${resultVersion}`);
          } else {
            // Mint a new card (branch 3)
            const created = await attachments.add({
              id: resolvedAttachmentId,
              type: SecurityAgentBuilderAttachments.rule,
              data: attachmentData,
              description: attachmentDescription,
            });
            resultVersion = created.current_version;
            logger.debug(`Created rule attachment ${resolvedAttachmentId} v${resultVersion}`);
          }
        } catch (attachmentError) {
          logger.error(
            `Could not persist rule attachment: ${
              attachmentError instanceof Error ? attachmentError.message : String(attachmentError)
            }`
          );
          throw Error('Could not persist rule attachment');
        }

        return {
          results: [
            {
              type: ToolResultType.other,
              data: {
                success: true,
                rule: ruleWithoutIds,
                attachmentId: resolvedAttachmentId,
                isNewCard,
                ...(resultVersion !== undefined && { version: resultVersion }),
              },
            },
          ],
        };
      } catch (error) {
        logger.error(`Create detection rule tool failed: ${error.message}`, error);

        return {
          results: [
            {
              type: ToolResultType.error,
              data: {
                message: `Failed to create detection rule: ${error.message}`,
                error: error.toString(),
              },
            },
          ],
        };
      }
    },
  };

  return toolDefinition;
}
