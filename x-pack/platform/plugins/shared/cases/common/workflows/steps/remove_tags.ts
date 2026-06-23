/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { z } from '@kbn/zod/v4';
import { StepCategory } from '@kbn/workflows';
import type { CommonStepDefinition } from '@kbn/workflows-extensions/common';
import { CaseTags } from '../../bundled-types.gen';
import * as i18n from '../translations';
import {
  CasesStepBaseConfigSchema,
  CasesStepCaseIdSchema,
  CasesStepSingleCaseOutputSchema,
} from './shared';

export const RemoveTagsStepTypeId = 'cases.removeTags';

const InputSchema = CasesStepCaseIdSchema.extend({
  tags: CaseTags,
});

const OutputSchema = CasesStepSingleCaseOutputSchema;

type RemoveTagsStepInputSchema = typeof InputSchema;
type RemoveTagsStepOutputSchema = typeof OutputSchema;

export type RemoveTagsStepInput = z.infer<typeof InputSchema>;

export const removeTagsStepCommonDefinition: CommonStepDefinition<
  RemoveTagsStepInputSchema,
  RemoveTagsStepOutputSchema
> = {
  id: RemoveTagsStepTypeId,
  category: StepCategory.KibanaCases,
  label: i18n.REMOVE_TAG_STEP_LABEL,
  description: i18n.REMOVE_TAG_STEP_DESCRIPTION,
  documentation: {
    details: i18n.REMOVE_TAG_STEP_DOCUMENTATION_DETAILS,
    examples: [
      `## Remove case tags
\`\`\`yaml
- name: remove_case_tags
  type: ${RemoveTagsStepTypeId}
  with:
    case_id: "abc-123-def-456"
    tags: ["investigation", "high-priority"]
\`\`\``,
    ],
  },
  inputSchema: InputSchema,
  outputSchema: OutputSchema,
  configSchema: CasesStepBaseConfigSchema,
};
