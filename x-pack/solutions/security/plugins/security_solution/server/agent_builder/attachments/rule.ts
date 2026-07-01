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
const INVESTIGATE_RULE_SKILL_NAME_ID = 'investigate-rule';

type RuleAttachmentData = z.infer<typeof ruleAttachmentDataSchema>;

const isRuleAttachmentData = (data: unknown): data is RuleAttachmentData => {
  return ruleAttachmentDataSchema.safeParse(data).success;
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
    // By-reference creation: when an attachment is added with `origin` and no `data` — e.g.
    // investigate-rule.resolve_rule_attachment after the user picks a rule from find-security-rules —
    // the framework calls this once to populate the card from the live rule.
    //
    // `origin` is a detection rule signature (`rule_id`), so we look the rule up by `ruleId` (not the
    // saved-object `id`). The full transformed rule — including `rule_id` and `id` — is stored in
    // `text`: the investigate-rule skill reads those identifiers back out of the attachment to query
    // the rule's alerts (`kibana.alert.rule.rule_id` / `.uuid`), and `origin` is not visible to skills.
    resolve: async (origin: string, context: AttachmentResolveContext) => {
      const [, startPlugins] = await core.getStartServices();
      const rulesClient = await startPlugins.alerting.getRulesClientWithRequest(context.request);
      const rule = await readRules({ rulesClient, id: undefined, ruleId: origin });
      const transformed = rule ? transform(rule) : null;
      if (!transformed) {
        logger.warn(`Failed to resolve rule attachment for rule_id "${origin}"`);
        throw new Error(`Rule with rule_id "${origin}" was not found`);
      }
      return {
        text: JSON.stringify(transformed),
        attachmentLabel: transformed.name,
      };
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
2. When asked why the rule is noisy or generating false positives, ALWAYS read the ${INVESTIGATE_RULE_SKILL_NAME_ID} skill from the skills/security/rules directory.
3. Use the available tools to research, create, or edit the rule and provide a response.`;
      return description;
    },
  };
};

const formatRuleData = (data: RuleAttachmentData): string => {
  return data.text;
};
