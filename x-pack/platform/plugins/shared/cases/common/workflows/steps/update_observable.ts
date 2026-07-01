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
import { CasesStepCaseIdSchema, CasesStepSingleCaseOutputSchema } from './shared';

export const UpdateObservableStepTypeId = 'cases.updateObservable';

const InputSchema = CasesStepCaseIdSchema.extend({
  observable_id: z.string().min(1, 'observable_id is required'),
  value: z.string().min(1, 'value is required'),
  description: z
    .string()
    .nullable()
    .optional()
    .describe('Observable description. Pass null to clear.'),
});

const OutputSchema = CasesStepSingleCaseOutputSchema;

type UpdateObservableStepInputSchema = typeof InputSchema;
type UpdateObservableStepOutputSchema = typeof OutputSchema;

export type UpdateObservableStepInput = z.infer<typeof InputSchema>;

export const updateObservableStepCommonDefinition: CommonStepDefinition<
  UpdateObservableStepInputSchema,
  UpdateObservableStepOutputSchema
> = {
  id: UpdateObservableStepTypeId,
  category: StepCategory.KibanaCases,
  label: i18n.UPDATE_OBSERVABLE_STEP_LABEL,
  description: i18n.UPDATE_OBSERVABLE_STEP_DESCRIPTION,
  documentation: {
    details: i18n.UPDATE_OBSERVABLE_STEP_DOCUMENTATION_DETAILS,
    examples: [
      `## Update observable value and description
\`\`\`yaml
- name: update_observable
  type: ${UpdateObservableStepTypeId}
  with:
    case_id: "abc-123-def-456"
    observable_id: "obs-789"
    value: "10.0.0.42"
    description: "Updated source IP after investigation"
\`\`\``,
      `## Clear observable description
\`\`\`yaml
- name: clear_description
  type: ${UpdateObservableStepTypeId}
  with:
    case_id: "abc-123-def-456"
    observable_id: "obs-789"
    value: "10.0.0.42"
    description: null
\`\`\``,
    ],
  },
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
};
