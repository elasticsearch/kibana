/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { StepCategory } from '@kbn/workflows';
import type { CommonStepDefinition } from '@kbn/workflows-extensions/common';
import * as i18n from '../translations';
import {
  CasesStepBaseConfigSchema,
  CasesStepCaseIdSchema,
  CasesStepSingleCaseOutputSchema,
} from './shared';
import { MAX_BULK_CREATE_ATTACHMENTS } from '../../constants';
import { composeAttachmentUnion } from './add_attachment';

export const AddAttachmentsStepTypeId = 'cases.addAttachments';

export const buildAddAttachmentsStepCommonDefinition = (
  members: z.ZodObject[]
): CommonStepDefinition<
  ReturnType<typeof buildAddAttachmentsInputSchema>,
  typeof CasesStepSingleCaseOutputSchema,
  typeof CasesStepBaseConfigSchema
> => ({
  id: AddAttachmentsStepTypeId,
  category: StepCategory.KibanaCases,
  label: i18n.ADD_ATTACHMENTS_STEP_LABEL,
  description: i18n.ADD_ATTACHMENTS_STEP_DESCRIPTION,
  documentation: {
    details: i18n.ADD_ATTACHMENTS_STEP_DOCUMENTATION_DETAILS,
    examples: [
      `## Add multiple attachments in one request
\`\`\`yaml
- name: add_many
  type: ${AddAttachmentsStepTypeId}
  with:
    case_id: "abc-123-def-456"
    attachments:
      - type: comment
        data:
          content: "Investigating this incident."
      - type: file
        attachmentId: "file-so-id"
        metadata:
          soType: file
          files:
            - name: evidence.png
              mimeType: image/png
              extension: png
\`\`\``,
    ],
  },
  inputSchema: buildAddAttachmentsInputSchema(members),
  outputSchema: CasesStepSingleCaseOutputSchema,
  configSchema: CasesStepBaseConfigSchema,
});

export const buildAddAttachmentsInputSchema = (members: z.ZodObject[]) =>
  CasesStepCaseIdSchema.extend({
    attachments: z.array(composeAttachmentUnion(members)).min(1).max(MAX_BULK_CREATE_ATTACHMENTS),
  });

export type AddAttachmentsStepInput = z.infer<ReturnType<typeof buildAddAttachmentsInputSchema>>;
