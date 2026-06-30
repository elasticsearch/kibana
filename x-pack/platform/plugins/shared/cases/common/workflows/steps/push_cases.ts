/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { StepCategory } from '@kbn/workflows';
import type { CommonStepDefinition } from '@kbn/workflows-extensions/common';
import { CaseResponseProperties as CaseResponsePropertiesSchema } from '../../bundled-types.gen';
import * as i18n from '../translations';
import { MAX_CASES_TO_UPDATE } from '../../constants';

export const PushCasesStepTypeId = 'cases.pushCases';

const InputSchema = z.object({
  case_ids: z
    .array(z.string().min(1, 'case_ids values are required').max(1000))
    .min(1)
    .max(MAX_CASES_TO_UPDATE),
});

const OutputSchema = z.object({
  cases: z.array(CaseResponsePropertiesSchema),
});

type PushCasesStepInputSchema = typeof InputSchema;
type PushCasesStepOutputSchema = typeof OutputSchema;

export type PushCasesStepInput = z.infer<typeof InputSchema>;

export const pushCasesStepCommonDefinition: CommonStepDefinition<
  PushCasesStepInputSchema,
  PushCasesStepOutputSchema
> = {
  id: PushCasesStepTypeId,
  category: StepCategory.KibanaCases,
  label: i18n.PUSH_CASE_STEP_LABEL,
  description: i18n.PUSH_CASE_STEP_DESCRIPTION,
  documentation: {
    details: i18n.PUSH_CASE_STEP_DOCUMENTATION_DETAILS,
    examples: [
      `## Push a single case to its connector
\`\`\`yaml
- name: push_case
  type: ${PushCasesStepTypeId}
  with:
    case_ids:
      - "abc-123-def-456"
\`\`\``,
      `## Push multiple cases to their connectors
\`\`\`yaml
- name: push_cases
  type: ${PushCasesStepTypeId}
  with:
    case_ids:
      - "abc-123-def-456"
      - "ghi-789-jkl-012"
\`\`\``,
    ],
  },
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
};
