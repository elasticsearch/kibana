/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AttachmentTypeDefinition } from '@kbn/agent-builder-server/attachments';
import {
  CASE_ATTACHMENT_TYPE,
  caseAttachmentDataSchema,
  type CaseAttachmentData,
} from '../../../common/types/agent_builder/attachment_schemas';

const formatCaseDescription = (data: CaseAttachmentData): string => {
  // Keep this terse on purpose: the LLM should rely on the rich attachment
  // rendering (via <render_attachment id="..." />) instead of restating fields
  // in its prose response.
  const idPart = data.incremental_id ? `#${data.incremental_id}` : data.id;
  return `Case ${idPart} "${data.title}" (${data.status}, ${data.severity}, owner=${data.owner})`;
};

export const createCaseAttachmentType = (): AttachmentTypeDefinition<
  typeof CASE_ATTACHMENT_TYPE,
  CaseAttachmentData
> => ({
  id: CASE_ATTACHMENT_TYPE,

  validate: (input) => {
    const result = caseAttachmentDataSchema.safeParse(input);
    if (result.success) {
      return { valid: true, data: result.data };
    }
    return { valid: false, error: result.error.message };
  },

  format: (attachment) => ({
    getRepresentation: () => ({
      type: 'text',
      value: formatCaseDescription(attachment.data),
    }),
  }),

  getAgentDescription: () =>
    'Single Elastic case. Rendering inline shows an interactive card with title, ID, status, severity, alert/comment counts, assignees, tags, "Go to case" link, and a "Show more" toggle for description, dates, observables count, and connector. Emit `<render_attachment id="..." />` for each ID in the tool result\'s `attachment_ids`; without it the user sees only a text label.',
});
