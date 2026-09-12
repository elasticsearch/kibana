/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { UserActionTypes } from '../action/v1';
import { CASE_WORKFLOW_RUN_ORIGIN_TYPES } from '../../../domain/user_action/workflow/constants';

export const WorkflowPayloadSchema = z.object({
  id: z.string(),
  name: z.string(),
  executionId: z.string(),
});

export const WorkflowOriginSchema = z.object({
  type: z.enum(CASE_WORKFLOW_RUN_ORIGIN_TYPES),
  id: z.string(),
  attachmentType: z.string().optional(),
  index: z.string().optional(),
  count: z.number().optional(),
  typeKey: z.string().optional(),
  value: z.string().optional(),
});

export const WorkflowUserActionPayloadSchema = z.object({
  workflow: WorkflowPayloadSchema,
  origin: WorkflowOriginSchema.optional(),
});

export const WorkflowUserActionSchema = z.object({
  type: z.literal(UserActionTypes.workflow),
  payload: WorkflowUserActionPayloadSchema,
});
