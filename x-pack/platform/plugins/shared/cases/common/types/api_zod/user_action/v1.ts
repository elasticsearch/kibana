/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import {
  MAX_USER_ACTIONS_PER_PAGE,
  MAX_USER_ACTION_SEARCH_LENGTH,
  MAX_USER_ACTION_AUTHOR_LENGTH,
} from '../../../constants';
import { paginationSchema } from '../../../schema_zod';
import { UserActionsSchema } from '../../domain_zod/user_action/v1';
import { UserActionTypes } from '../../domain/user_action/action/v1';

const UserActionAdditionalFindRequestFilterTypes = {
  action: 'action',
  alert: 'alert',
  user: 'user',
  attachment: 'attachment',
} as const;

const UserActionFindRequestTypes = {
  ...UserActionTypes,
  ...UserActionAdditionalFindRequestFilterTypes,
} as const;

const UserActionFindRequestTypesValues = Object.values(UserActionFindRequestTypes) as [
  string,
  ...string[]
];

export const CaseUserActionStatsSchema = z.object({
  total: z.number(),
  total_deletions: z.number(),
  total_comments: z.number(),
  total_comment_deletions: z.number(),
  total_comment_creations: z.number(),
  total_hidden_comment_updates: z.number(),
  total_other_actions: z.number(),
  total_other_action_deletions: z.number(),
});

export const UserActionFindRequestSchema = paginationSchema({
  maxPerPage: MAX_USER_ACTIONS_PER_PAGE,
}).extend({
  types: z.array(z.enum(UserActionFindRequestTypesValues)).optional(),
  sortOrder: z.enum(['desc', 'asc']).optional(),
});

export const UserActionInternalFindRequestSchema = UserActionFindRequestSchema.extend({
  author: z.string().max(MAX_USER_ACTION_AUTHOR_LENGTH).optional(),
  search: z.string().max(MAX_USER_ACTION_SEARCH_LENGTH).optional(),
});

export const UserActionFindResponseSchema = z.object({
  userActions: UserActionsSchema,
  page: z.number(),
  perPage: z.number(),
  total: z.number(),
});

export type CaseUserActionStats = z.infer<typeof CaseUserActionStatsSchema>;
export type UserActionFindRequest = z.infer<typeof UserActionFindRequestSchema>;
export type UserActionInternalFindRequest = z.infer<typeof UserActionInternalFindRequestSchema>;
export type UserActionFindResponse = z.infer<typeof UserActionFindResponseSchema>;
