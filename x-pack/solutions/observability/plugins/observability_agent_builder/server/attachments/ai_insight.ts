/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import dedent from 'dedent';
import type { Attachment } from '@kbn/agent-builder-common/attachments';
import type { AttachmentTypeDefinition } from '@kbn/agent-builder-server/attachments';
import { OBSERVABILITY_AI_INSIGHT_ATTACHMENT_TYPE_ID } from '../../common';
import { MAX_TEXT_LENGTH } from '../utils/schema_limits';
import { observabilityAttachmentDataSchema } from './observability_attachment_data_schema';

const aiInsightAttachmentDataSchema = observabilityAttachmentDataSchema.extend({
  summary: z.string().max(MAX_TEXT_LENGTH),
  context: z.string().max(MAX_TEXT_LENGTH),
});

type AiInsightAttachmentData = z.infer<typeof aiInsightAttachmentDataSchema>;

/**
 * Type guard to ensure `attachment.data` conforms to AiInsightAttachmentData.
 */
const isValidAiInsightAttachmentData = (data: unknown): data is AiInsightAttachmentData => {
  return aiInsightAttachmentDataSchema.safeParse(data).success;
};

export const createAiInsightAttachmentType = (): AttachmentTypeDefinition => {
  return {
    id: OBSERVABILITY_AI_INSIGHT_ATTACHMENT_TYPE_ID,
    validate: (input) => {
      const parsed = aiInsightAttachmentDataSchema.safeParse(input);

      if (!parsed.success) {
        return { valid: false, error: parsed.error.message };
      }

      return { valid: true, data: parsed.data };
    },
    format: (attachment: Attachment<string, unknown>) => {
      return {
        getRepresentation: () => {
          // Agent Builder does not apply the attachment schema at `format` time
          // so we re-validate it before using it.
          if (!isValidAiInsightAttachmentData(attachment.data)) {
            throw new Error(`Invalid AI insight attachment data for attachment ${attachment.id}`);
          }

          const { summary, context } = attachment.data;
          const value = [`AI summary:\n${summary}`, `Context data:\n${context}`].join('\n\n');

          return {
            type: 'text',
            value,
          };
        },
      };
    },
    getAgentDescription: () => {
      return dedent(`
        The AI Insight attachment carries a concise natural-language summary and contextual data relevant to observability investigations.
      `);
    },
  };
};
