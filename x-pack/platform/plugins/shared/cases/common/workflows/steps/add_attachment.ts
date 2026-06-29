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

export const AddAttachmentStepTypeId = 'cases.addAttachment';

/**
 * Composes the per-attachment-type discriminated union from registered
 * full-payload zod schemas. `owner` is stripped because the workflow step
 * injects it from the target case, not the YAML author.
 */
export const composeAttachmentUnion = (members: z.ZodObject[]): z.ZodDiscriminatedUnion => {
  if (members.length === 0) {
    throw new Error(
      'cases.addAttachment: cannot compose input schema with zero registered attachment types'
    );
  }
  const stripped = members.map((m) => m.omit({ owner: true }));
  return z.discriminatedUnion('type', stripped as [z.ZodObject, ...z.ZodObject[]]);
};

export const buildAddAttachmentStepCommonDefinition = (
  members: z.ZodObject[]
): CommonStepDefinition<
  ReturnType<typeof buildAddAttachmentInputSchema>,
  typeof CasesStepSingleCaseOutputSchema,
  typeof CasesStepBaseConfigSchema
> => ({
  id: AddAttachmentStepTypeId,
  category: StepCategory.KibanaCases,
  label: i18n.ADD_ATTACHMENT_STEP_LABEL,
  description: i18n.ADD_ATTACHMENT_STEP_DESCRIPTION,
  documentation: {
    details: i18n.ADD_ATTACHMENT_STEP_DOCUMENTATION_DETAILS,
    examples: [
      `## Add a comment attachment
\`\`\`yaml
- name: add_comment
  type: ${AddAttachmentStepTypeId}
  with:
    case_id: "abc-123-def-456"
    attachment:
      type: comment
      data:
        content: "Investigating this incident now."
\`\`\``,
    ],
  },
  inputSchema: buildAddAttachmentInputSchema(members),
  outputSchema: CasesStepSingleCaseOutputSchema,
  configSchema: CasesStepBaseConfigSchema,
});

export const buildAddAttachmentInputSchema = (members: z.ZodObject[]) =>
  CasesStepCaseIdSchema.extend({ attachment: composeAttachmentUnion(members) });

export type AddAttachmentStepInput = z.infer<ReturnType<typeof buildAddAttachmentInputSchema>>;
