/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AttachmentTypeDefinition } from '@kbn/agent-builder-server/attachments';
import {
  CASES_ATTACHMENT_TYPE,
  casesAttachmentDataSchema,
  type CasesAttachmentData,
} from '../../../common/types/agent_builder/attachment_schemas';

const formatCasesDescription = (data: CasesAttachmentData): string => {
  // Keep this terse on purpose: the LLM should rely on the rich attachment
  // rendering (via <render_attachment id="..." />) rather than restating each
  // case in prose. The inline UI surfaces up to 10 cases with severity, counts,
  // and links automatically.
  return `${data.cases.length} of ${data.total} case(s)`;
};

export const createCasesAttachmentType = (): AttachmentTypeDefinition<
  typeof CASES_ATTACHMENT_TYPE,
  CasesAttachmentData
> => ({
  id: CASES_ATTACHMENT_TYPE,

  validate: (input) => {
    const result = casesAttachmentDataSchema.safeParse(input);
    if (result.success) {
      return { valid: true, data: result.data };
    }
    return { valid: false, error: result.error.message };
  },

  format: (attachment) => ({
    getRepresentation: () => ({
      type: 'text',
      value: formatCasesDescription(attachment.data),
    }),
  }),

  getAgentDescription: () =>
    'List of Elastic cases from search, bulk-get, find-similar, or find-by-alert. Rendering inline shows a grouped card with up to 10 case rows (severity, counts, per-row links) plus a "Go to cases" button. Emit `<render_attachment id="..." />` for the ID in the tool result\'s `attachment_ids`; without it the user sees only a text label.',
});
