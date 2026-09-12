/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createAssigneesUserActionBuilder } from './assignees';
import { createCommentUserActionBuilder } from './comment/comment';
import { createConnectorUserActionBuilder } from './connector';
import { createDescriptionUserActionBuilder } from './description';
import { createPushedUserActionBuilder } from './pushed';
import { createSettingsUserActionBuilder } from './settings';
import { createSeverityUserActionBuilder } from './severity';
import { createStatusUserActionBuilder } from './status';
import { createTagsUserActionBuilder } from './tags';
import { createTitleUserActionBuilder } from './title';
import { createCaseUserActionBuilder } from './create_case';
import type { UserActionBuilderMap } from './types';
import { createCategoryUserActionBuilder } from './category';
import { createCustomFieldsUserActionBuilder } from './custom_fields/custom_fields';
import { createObservablesUserActionBuilder } from './observables';
import { createExtendedFieldsUserActionBuilder } from './extended_fields';
import { createTemplateUserActionBuilder } from './template';
import { createWorkflowUserActionBuilder } from './workflow';

export const builderMap: UserActionBuilderMap = {
  create_case: createCaseUserActionBuilder,
  connector: createConnectorUserActionBuilder,
  tags: createTagsUserActionBuilder,
  title: createTitleUserActionBuilder,
  status: createStatusUserActionBuilder,
  severity: createSeverityUserActionBuilder,
  pushed: createPushedUserActionBuilder,
  comment: createCommentUserActionBuilder,
  description: createDescriptionUserActionBuilder,
  settings: createSettingsUserActionBuilder,
  assignees: createAssigneesUserActionBuilder,
  category: createCategoryUserActionBuilder,
  customFields: createCustomFieldsUserActionBuilder,
  observables: createObservablesUserActionBuilder,
  extended_fields: createExtendedFieldsUserActionBuilder,
  template: createTemplateUserActionBuilder,
  workflow: createWorkflowUserActionBuilder,
};
