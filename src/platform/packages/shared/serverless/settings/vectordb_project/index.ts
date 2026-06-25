/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  COURIER_IGNORE_FILTER_IF_FIELD_NOT_IN_INDEX_ID,
  AI_ANONYMIZATION_SETTINGS,
  AI_CHAT_EXPERIENCE_TYPE,
  AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID,
  AGENT_BUILDER_BASH_SUPPORT_SETTING_ID,
  AGENT_BUILDER_PRE_PROMPT_WORKFLOW_IDS,
  GEN_AI_SETTINGS_DEFAULT_AI_CONNECTOR,
  GEN_AI_SETTINGS_DEFAULT_AI_CONNECTOR_DEFAULT_ONLY,
  GEN_AI_SETTINGS_TOKEN_USAGE_TRACKING,
} from '@kbn/management-settings-ids';
import { ENABLE_DOCKED_CONSOLE_UI_SETTING_ID } from '@kbn/dev-tools-plugin/common';
import {
  WORKFLOWS_UI_SETTING_ID,
  WORKFLOWS_UI_SHOW_MANAGED_WORKFLOWS_SETTING_ID,
} from '@kbn/workflows/common/constants';

export const VECTORDB_PROJECT_SETTINGS = [
  COURIER_IGNORE_FILTER_IF_FIELD_NOT_IN_INDEX_ID,
  ENABLE_DOCKED_CONSOLE_UI_SETTING_ID,
  AI_ANONYMIZATION_SETTINGS,
  AI_CHAT_EXPERIENCE_TYPE,
  AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID,
  AGENT_BUILDER_BASH_SUPPORT_SETTING_ID,
  AGENT_BUILDER_PRE_PROMPT_WORKFLOW_IDS,
  GEN_AI_SETTINGS_DEFAULT_AI_CONNECTOR,
  GEN_AI_SETTINGS_DEFAULT_AI_CONNECTOR_DEFAULT_ONLY,
  GEN_AI_SETTINGS_TOKEN_USAGE_TRACKING,
  // This setting is temporary, will be removed on 9.5.0 release.
  WORKFLOWS_UI_SETTING_ID,
  WORKFLOWS_UI_SHOW_MANAGED_WORKFLOWS_SETTING_ID,
];
