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

export const GetCaseStepTypeId = 'cases.getCase';

const InputSchema = CasesStepCaseIdSchema.extend({
  include_comments: z
    .boolean()
    .optional()
    .default(false)
    .describe('Include case comments in the response. Default: false.'),
});

const OutputSchema = CasesStepSingleCaseOutputSchema;

type GetCaseStepInputSchema = typeof InputSchema;
type GetCaseStepOutputSchema = typeof OutputSchema;

export type GetCaseStepInput = z.infer<typeof InputSchema>;

export const getCaseStepCommonDefinition: CommonStepDefinition<
  GetCaseStepInputSchema,
  GetCaseStepOutputSchema
> = {
  id: GetCaseStepTypeId,
  category: StepCategory.KibanaCases,
  label: i18n.GET_CASE_STEP_LABEL,
  description: i18n.GET_CASE_STEP_DESCRIPTION,
  documentation: {
    details: i18n.GET_CASE_STEP_DOCUMENTATION_DETAILS,
    examples: [
      `## Basic usage
\`\`\`yaml
- name: get_case
  type: ${GetCaseStepTypeId}
  with:
    case_id: "abc-123-def-456"
\`\`\``,
      `## With comments included
\`\`\`yaml
- name: get_case_with_comments
  type: ${GetCaseStepTypeId}
  with:
    case_id: "abc-123-def-456"
    include_comments: true
\`\`\``,
      `## Using case from previous step
\`\`\`yaml
- name: find_cases
  type: cases.findCases
  with:
    search_term: "critical incident"

- name: get_first_case
  type: ${GetCaseStepTypeId}
  with:
    case_id: \${{ steps.find_cases.output.cases[0].id }}
    include_comments: true
\`\`\``,
    ],
  },
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
};
