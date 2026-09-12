/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import * as rt from 'io-ts';
import { UserRt } from '../user/v1';
import { UserActionActionsRt } from './action/v1';
import { AssigneesUserActionRt } from './assignees/v1';
import { CategoryUserActionRt } from './category/v1';
import type { CommentUserActionPayloadWithoutIdsRt } from './comment/v1';
import { CommentUserActionRt, CommentUserActionWithoutIdsRt } from './comment/v1';
import { ConnectorUserActionRt, ConnectorUserActionWithoutConnectorIdRt } from './connector/v1';
import { CreateCaseUserActionRt, CreateCaseUserActionWithoutConnectorIdRt } from './create_case/v1';
import { DeleteCaseUserActionRt } from './delete_case/v1';
import { DescriptionUserActionRt } from './description/v1';
import { PushedUserActionRt, PushedUserActionWithoutConnectorIdRt } from './pushed/v1';
import type { SettingsUserActionPayloadRt } from './settings/v1';
import { SettingsUserActionRt } from './settings/v1';
import { SeverityUserActionRt } from './severity/v1';
import { StatusUserActionRt } from './status/v1';
import { TagsUserActionRt } from './tags/v1';
import { TitleUserActionRt } from './title/v1';
import { CustomFieldsUserActionRt } from './custom_fields/v1';
import { ObservablesUserActionRt } from './observables/v1';
import { ExtendedFieldsUserActionRt } from './extended_fields/v1';
import { TemplateUserActionRt } from './template/v1';
import { WorkflowUserActionRt } from './workflow/v1';
export { UserActionTypes, UserActionActions } from './action/v1';
export { StatusUserActionRt } from './status/v1';

export type { UserActionType, UserActionAction } from './action/v1';

const UserActionCommonAttributesRt = rt.strict({
  created_at: rt.string,
  created_by: UserRt,
  owner: rt.string,
  action: UserActionActionsRt,
});

/**
 * This should only be used for the getAll route and it should be removed when the route is removed
 * @deprecated use CaseUserActionInjectedIdsRt instead
 */
export const CaseUserActionInjectedDeprecatedIdsRt = rt.strict({
  action_id: rt.string,
  case_id: rt.string,
  comment_id: rt.union([rt.string, rt.null]),
});

export const CaseUserActionInjectedIdsRt = rt.strict({
  comment_id: rt.union([rt.string, rt.null]),
});

const BasicUserActionsRt = rt.union([
  DescriptionUserActionRt,
  TagsUserActionRt,
  TitleUserActionRt,
  SettingsUserActionRt,
  StatusUserActionRt,
  SeverityUserActionRt,
  AssigneesUserActionRt,
  DeleteCaseUserActionRt,
  CategoryUserActionRt,
  CustomFieldsUserActionRt,
  ObservablesUserActionRt,
  ExtendedFieldsUserActionRt,
  TemplateUserActionRt,
  WorkflowUserActionRt,
]);

const CommonUserActionsWithIdsRt = rt.union([BasicUserActionsRt, CommentUserActionRt]);
const CommonUserActionsWithoutIdsRt = rt.union([BasicUserActionsRt, CommentUserActionWithoutIdsRt]);

const UserActionPayloadRt = rt.union([
  CommonUserActionsWithIdsRt,
  CreateCaseUserActionRt,
  ConnectorUserActionRt,
  PushedUserActionRt,
]);

const UserActionsWithoutIdsRt = rt.union([
  CommonUserActionsWithoutIdsRt,
  CreateCaseUserActionWithoutConnectorIdRt,
  ConnectorUserActionWithoutConnectorIdRt,
  PushedUserActionWithoutConnectorIdRt,
]);

export const CaseUserActionBasicRt = rt.intersection([
  UserActionPayloadRt,
  UserActionCommonAttributesRt,
]);

export const CaseUserActionWithoutReferenceIdsRt = rt.intersection([
  UserActionsWithoutIdsRt,
  UserActionCommonAttributesRt,
]);

/**
 * This includes the comment_id but not the action_id or case_id
 */
export const UserActionAttributesRt = rt.intersection([
  CaseUserActionBasicRt,
  CaseUserActionInjectedIdsRt,
]);

const UserActionRt = rt.intersection([
  UserActionAttributesRt,
  rt.strict({
    id: rt.string,
    version: rt.string,
  }),
]);

export const UserActionsRt = rt.array(UserActionRt);

type UserActionWithAttributes<T> = T & rt.TypeOf<typeof UserActionCommonAttributesRt>;
export type UserActionWithDeprecatedResponse<T> = T &
  rt.TypeOf<typeof CaseUserActionInjectedDeprecatedIdsRt>;

export type CaseUserActionWithoutReferenceIds = rt.TypeOf<
  typeof CaseUserActionWithoutReferenceIdsRt
>;

export type UserActionPayload = rt.TypeOf<typeof UserActionPayloadRt>;
export type UserActionAttributes = rt.TypeOf<typeof UserActionAttributesRt>;
export type UserActions = rt.TypeOf<typeof UserActionsRt>;
export type UserAction<T extends UserActionPayload = UserActionPayload> = Omit<
  rt.TypeOf<typeof UserActionRt>,
  'type' | 'payload'
> &
  T;

/**
 * User actions
 */
export type AssigneesUserAction = UserAction<rt.TypeOf<typeof AssigneesUserActionRt>>;
export type CategoryUserAction = UserAction<rt.TypeOf<typeof CategoryUserActionRt>>;
export type CommentUserAction = UserAction<rt.TypeOf<typeof CommentUserActionRt>>;
export type CommentUserActionPayloadWithoutIds = UserActionWithAttributes<
  rt.TypeOf<typeof CommentUserActionPayloadWithoutIdsRt>
>;
export type ConnectorUserAction = UserAction<rt.TypeOf<typeof ConnectorUserActionRt>>;
export type ConnectorUserActionWithoutConnectorId = UserActionWithAttributes<
  rt.TypeOf<typeof ConnectorUserActionWithoutConnectorIdRt>
>;
export type DeleteCaseUserAction = UserAction<rt.TypeOf<typeof DeleteCaseUserActionRt>>;
export type DescriptionUserAction = UserAction<rt.TypeOf<typeof DescriptionUserActionRt>>;
export type PushedUserAction = UserAction<rt.TypeOf<typeof PushedUserActionRt>>;
export type PushedUserActionWithoutConnectorId = UserActionWithAttributes<
  rt.TypeOf<typeof PushedUserActionWithoutConnectorIdRt>
>;
export type SettingsUserAction = UserAction<rt.TypeOf<typeof SettingsUserActionRt>>;
export type SettingsUserActionPayload = rt.TypeOf<typeof SettingsUserActionPayloadRt>;
export type SeverityUserAction = UserAction<rt.TypeOf<typeof SeverityUserActionRt>>;
export type StatusUserAction = UserAction<rt.TypeOf<typeof StatusUserActionRt>>;
export type TagsUserAction = UserAction<rt.TypeOf<typeof TagsUserActionRt>>;
export type TitleUserAction = UserAction<rt.TypeOf<typeof TitleUserActionRt>>;
export type CreateCaseUserAction = UserAction<rt.TypeOf<typeof CreateCaseUserActionRt>>;
export type CreateCaseUserActionWithoutConnectorId = UserActionWithAttributes<
  rt.TypeOf<typeof CreateCaseUserActionWithoutConnectorIdRt>
>;
export type CustomFieldsUserAction = UserAction<rt.TypeOf<typeof CustomFieldsUserActionRt>>;
export type ObservablesUserAction = UserAction<rt.TypeOf<typeof ObservablesUserActionRt>>;
export type ExtendedFieldsUserAction = UserAction<rt.TypeOf<typeof ExtendedFieldsUserActionRt>>;
export { ExtendedFieldsRt } from './extended_fields/v1';
export type TemplateUserAction = UserAction<rt.TypeOf<typeof TemplateUserActionRt>>;
export type WorkflowUserAction = UserAction<rt.TypeOf<typeof WorkflowUserActionRt>>;
export { WorkflowUserActionRt, WorkflowOriginRt } from './workflow/v1';
export type { WorkflowPayload, WorkflowOrigin, WorkflowUserActionPayload } from './workflow/v1';
