/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import type {
  AttachmentTypeDefinition,
  AttachmentResolveContext,
} from '@kbn/agent-builder-server/attachments';
import type { Attachment } from '@kbn/agent-builder-common/attachments';
import { platformCoreTools } from '@kbn/agent-builder-common';
import { z } from '@kbn/zod/v4';
import { SecurityAgentBuilderAttachments } from '../../../common/constants';
import type { RuleResponse } from '../../../common/api/detection_engine/model/rule_schema';
import type { SecuritySolutionPluginCoreSetupDependencies } from '../../plugin_contract';
import { readRules } from '../../lib/detection_engine/rule_management/logic/detection_rules_client/read_rules';
import { transform } from '../../lib/detection_engine/rule_management/utils/utils';
import { SECURITY_CREATE_DETECTION_RULE_TOOL_ID, SECURITY_LABS_SEARCH_TOOL_ID } from '../tools';

import { securityAttachmentDataSchema } from './security_attachment_data_schema';

export const ruleAttachmentDataSchema = securityAttachmentDataSchema.extend({
  text: z.string().max(500_000),
  attachmentLabel: z.string().max(1_000).optional(),
});

const DETECTION_RULE_SKILL_NAME_ID = 'detection-rule-edit';

type RuleAttachmentData = z.infer<typeof ruleAttachmentDataSchema>;

const isRuleAttachmentData = (data: unknown): data is RuleAttachmentData => {
  return ruleAttachmentDataSchema.safeParse(data).success;
};

/**
 * Strip server-assigned fields before storing a fetched rule as attachment `text`. `id`/`rule_id`
 * in the text causes the agent to skip `attachment_id` and mint a new card instead of updating the
 * existing one; the read-only audit fields are dropped to keep the draft shape consistent with the
 * save path (`stripServerFields` in `ai_rule_creation_handler.ts`).
 */
const stripServerRuleFields = (rule: RuleResponse): Partial<RuleResponse> => {
  const {
    id: _id,
    rule_id: _ruleId,
    revision: _revision,
    created_at: _createdAt,
    created_by: _createdBy,
    updated_at: _updatedAt,
    updated_by: _updatedBy,
    execution_summary: _execSummary,
    ...spec
  } = rule as RuleResponse & { rule_id?: string };
  return spec;
};

export const createRuleAttachmentType = (
  core: SecuritySolutionPluginCoreSetupDependencies,
  logger: Logger
): AttachmentTypeDefinition => {
  return {
    id: SecurityAgentBuilderAttachments.rule,
    validate: (input) => {
      const parseResult = ruleAttachmentDataSchema.safeParse(input);
      if (parseResult.success) {
        return { valid: true, data: parseResult.data };
      } else {
        return { valid: false, error: parseResult.error.message };
      }
    },
    format: (attachment: Attachment<string, unknown>) => {
      const data = attachment.data;
      // AttachmentType enum is not yet registered for security attachments, so we validate manually.
      if (!isRuleAttachmentData(data)) {
        throw new Error(`Invalid rule attachment data for attachment ${attachment.id}`);
      }
      return {
        getRepresentation: () => {
          return { type: 'text', value: formatRuleData(data) };
        },
      };
    },
    // By-reference creation: when an attachment is added with `origin` (a saved rule id) and no
    // `data` — e.g. "add an existing rule to chat" — the framework calls this once to populate the
    // card from the live rule. `origin` being set is also what drives the "Update" button state.
    resolve: async (origin: string, context: AttachmentResolveContext) => {
      try {
        const [, startPlugins] = await core.getStartServices();
        const rulesClient = await startPlugins.alerting.getRulesClientWithRequest(context.request);
        const rule = await readRules({ rulesClient, id: origin, ruleId: undefined });
        if (!rule) {
          return undefined;
        }
        const transformed = transform(rule);
        if (!transformed) {
          return undefined;
        }
        return {
          text: JSON.stringify(stripServerRuleFields(transformed)),
          attachmentLabel: transformed.name,
        };
      } catch (error) {
        logger.warn(`Failed to resolve rule attachment for origin "${origin}": ${error}`);
        return undefined;
      }
    },
    getTools: () => [
      platformCoreTools.generateEsql,
      platformCoreTools.productDocumentation,
      SECURITY_CREATE_DETECTION_RULE_TOOL_ID,
      SECURITY_LABS_SEARCH_TOOL_ID,
    ],

    getAgentDescription: () => {
      const description = `You have access to a security detection rule stored as stringified JSON in the "text" field. It may be an existing rule or an empty placeholder for a new rule.

SECURITY RULE DATA:
{ruleData}

---
Complete in order:

1. When asked to modify, update, or create a detection rule, ALWAYS read the ${DETECTION_RULE_SKILL_NAME_ID} skill from the skills/security/rules directory.
2. Use the available tools to research, create, or edit the rule and provide a response.`;
      return description;
    },
  };
};

const formatRuleData = (data: RuleAttachmentData): string => {
  return data.text;
};
