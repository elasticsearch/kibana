/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import { UserSchema } from '../user/v1';
import { UserActionActionsSchema } from './action/v1';
import { AssigneesUserActionSchema } from './assignees/v1';
import { CategoryUserActionSchema } from './category/v1';
import { CommentUserActionSchema, CommentUserActionWithoutIdsSchema } from './comment/v1';
import {
  ConnectorUserActionSchema,
  ConnectorUserActionWithoutConnectorIdSchema,
} from './connector/v1';
import {
  CreateCaseUserActionSchema,
  CreateCaseUserActionWithoutConnectorIdSchema,
} from './create_case/v1';
import { DeleteCaseUserActionSchema } from './delete_case/v1';
import { DescriptionUserActionSchema } from './description/v1';
import { PushedUserActionSchema, PushedUserActionWithoutConnectorIdSchema } from './pushed/v1';
import { SettingsUserActionSchema } from './settings/v1';
import { SeverityUserActionSchema } from './severity/v1';
import { StatusUserActionSchema } from './status/v1';
import { TagsUserActionSchema } from './tags/v1';
import { TitleUserActionSchema } from './title/v1';
import { CustomFieldsUserActionSchema } from './custom_fields/v1';
import { ObservablesUserActionSchema } from './observables/v1';
import { WorkflowUserActionSchema } from './workflow/v1';

export { UserActionTypes, UserActionActions } from './action/v1';
export { StatusUserActionSchema } from './status/v1';
export type { UserActionType, UserActionAction } from './action/v1';

const UserActionCommonAttributesSchema = z.object({
  created_at: z.string(),
  created_by: UserSchema,
  owner: z.string(),
  action: UserActionActionsSchema,
});

export const CaseUserActionInjectedDeprecatedIdsSchema = z.object({
  action_id: z.string(),
  case_id: z.string(),
  comment_id: z.string().nullable(),
});

export const CaseUserActionInjectedIdsSchema = z.object({
  comment_id: z.string().nullable(),
});

const BasicUserActionsSchema = z.union([
  DescriptionUserActionSchema,
  TagsUserActionSchema,
  TitleUserActionSchema,
  SettingsUserActionSchema,
  StatusUserActionSchema,
  SeverityUserActionSchema,
  AssigneesUserActionSchema,
  DeleteCaseUserActionSchema,
  CategoryUserActionSchema,
  CustomFieldsUserActionSchema,
  ObservablesUserActionSchema,
  WorkflowUserActionSchema,
]);

const CommonUserActionsWithIdsSchema = z.union([BasicUserActionsSchema, CommentUserActionSchema]);
const CommonUserActionsWithoutIdsSchema = z.union([
  BasicUserActionsSchema,
  CommentUserActionWithoutIdsSchema,
]);

const UserActionPayloadSchema = z.union([
  CommonUserActionsWithIdsSchema,
  CreateCaseUserActionSchema,
  ConnectorUserActionSchema,
  PushedUserActionSchema,
]);

const UserActionsWithoutIdsSchema = z.union([
  CommonUserActionsWithoutIdsSchema,
  CreateCaseUserActionWithoutConnectorIdSchema,
  ConnectorUserActionWithoutConnectorIdSchema,
  PushedUserActionWithoutConnectorIdSchema,
]);

export const CaseUserActionBasicSchema = UserActionPayloadSchema.and(
  UserActionCommonAttributesSchema
);

export const CaseUserActionWithoutReferenceIdsSchema = UserActionsWithoutIdsSchema.and(
  UserActionCommonAttributesSchema
);

export const UserActionAttributesSchema = CaseUserActionBasicSchema.and(
  CaseUserActionInjectedIdsSchema
);

const UserActionSchema = UserActionAttributesSchema.and(
  z.object({ id: z.string(), version: z.string() })
);

export const UserActionsSchema = z.array(UserActionSchema);

export type CaseUserActionWithoutReferenceIds = z.infer<
  typeof CaseUserActionWithoutReferenceIdsSchema
>;
export type UserActionPayload = z.infer<typeof UserActionPayloadSchema>;
export type UserActionAttributes = z.infer<typeof UserActionAttributesSchema>;
export type UserActions = z.infer<typeof UserActionsSchema>;
