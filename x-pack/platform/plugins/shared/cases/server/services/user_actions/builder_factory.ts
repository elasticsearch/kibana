/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { UserActionType } from '../../../common/types/domain';
import { CreateCaseUserActionBuilder } from './builders/create_case';
import { TitleUserActionBuilder } from './builders/title';
import { CommentUserActionBuilder } from './builders/comment';
import { ConnectorUserActionBuilder } from './builders/connector';
import { DescriptionUserActionBuilder } from './builders/description';
import { PushedUserActionBuilder } from './builders/pushed';
import { StatusUserActionBuilder } from './builders/status';
import { TagsUserActionBuilder } from './builders/tags';
import { SettingsUserActionBuilder } from './builders/settings';
import type { UserActionBuilder } from './abstract_builder';
import { SeverityUserActionBuilder } from './builders/severity';
import { AssigneesUserActionBuilder } from './builders/assignees';
import { NoopUserActionBuilder } from './builders/noop';
import { CategoryUserActionBuilder } from './builders/category';
import { CustomFieldsUserActionBuilder } from './builders/custom_fields';
import { ObservablesUserActionBuilder } from './builders/observables';
import { ExtendedFieldsUserActionBuilder } from './builders/extended_fields';
import { TemplateUserActionBuilder } from './builders/template';
import { WorkflowUserActionBuilder } from './builders/workflow';

const builderMap = {
  assignees: AssigneesUserActionBuilder,
  title: TitleUserActionBuilder,
  create_case: CreateCaseUserActionBuilder,
  connector: ConnectorUserActionBuilder,
  comment: CommentUserActionBuilder,
  description: DescriptionUserActionBuilder,
  pushed: PushedUserActionBuilder,
  tags: TagsUserActionBuilder,
  status: StatusUserActionBuilder,
  category: CategoryUserActionBuilder,
  severity: SeverityUserActionBuilder,
  settings: SettingsUserActionBuilder,
  delete_case: NoopUserActionBuilder,
  customFields: CustomFieldsUserActionBuilder,
  observables: ObservablesUserActionBuilder,
  extended_fields: ExtendedFieldsUserActionBuilder,
  template: TemplateUserActionBuilder,
  workflow: WorkflowUserActionBuilder,
};

export class BuilderFactory {
  getBuilder<T extends UserActionType>(type: T): UserActionBuilder | undefined {
    return new builderMap[type]();
  }
}
