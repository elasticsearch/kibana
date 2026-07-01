/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { CaseResponseProperties } from '../../bundled-types.gen';

export const CASE_ATTACHMENT_TYPE = 'case' as const;
export const CASES_ATTACHMENT_TYPE = 'cases' as const;

export const caseAttachmentDataSchema = CaseResponseProperties.pick({
  id: true,
  incremental_id: true,
  title: true,
  description: true,
  status: true,
  severity: true,
  totalAlerts: true,
  totalComment: true,
  tags: true,
  owner: true,
  assignees: true,
  category: true,
  created_at: true,
  updated_at: true,
  total_observables: true,
}).extend({
  url: z.string().nullable().optional(),
  totalAttachments: z.number().int().optional(),
  connector_name: z.string().nullable().optional(),
});
export type CaseAttachmentData = z.infer<typeof caseAttachmentDataSchema>;

export const CASES_ATTACHMENT_MAX = 20;

export const casesAttachmentDataSchema = z.object({
  cases: z.array(caseAttachmentDataSchema).max(CASES_ATTACHMENT_MAX),
  total: z.number().int(),
  url: z.string().nullable().optional(),
});
export type CasesAttachmentData = z.infer<typeof casesAttachmentDataSchema>;
