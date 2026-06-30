/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { BooleanUnsavedFieldChange, OnFieldChangeFn } from '@kbn/management-settings-types';
import { hasUnsavedChange } from '@kbn/management-settings-utilities';
import {
  AGENT_BUILDER_TRACING_ENABLED_SETTING_ID,
  AGENT_BUILDER_TRACING_USER_PROMPTS_SETTING_ID,
  AGENT_BUILDER_TRACING_LLM_RESPONSES_SETTING_ID,
  AGENT_BUILDER_TRACING_TOOL_DETAILS_SETTING_ID,
  AGENT_BUILDER_TRACING_SYSTEM_PROMPT_SETTING_ID,
  AGENT_BUILDER_TRACING_REAL_NAMES_SETTING_ID,
  AGENT_BUILDER_TRACING_REAL_IDS_SETTING_ID,
} from '@kbn/management-settings-ids';
import { useSettingsContext } from '../../contexts/settings_context';

const dependentTracingSettingIds = [
  AGENT_BUILDER_TRACING_USER_PROMPTS_SETTING_ID,
  AGENT_BUILDER_TRACING_LLM_RESPONSES_SETTING_ID,
  AGENT_BUILDER_TRACING_TOOL_DETAILS_SETTING_ID,
  AGENT_BUILDER_TRACING_SYSTEM_PROMPT_SETTING_ID,
  AGENT_BUILDER_TRACING_REAL_NAMES_SETTING_ID,
  AGENT_BUILDER_TRACING_REAL_IDS_SETTING_ID,
] as const;

export const useTracingEnabledState = () => {
  const { fields, handleFieldChange, unsavedChanges } = useSettingsContext();

  const tracingEnabledField = fields[AGENT_BUILDER_TRACING_ENABLED_SETTING_ID];

  const tracingEnabledUnsaved = unsavedChanges[AGENT_BUILDER_TRACING_ENABLED_SETTING_ID];
  const tracingEnabled =
    tracingEnabledUnsaved?.unsavedValue !== undefined
      ? Boolean(tracingEnabledUnsaved.unsavedValue)
      : Boolean(tracingEnabledField?.savedValue ?? tracingEnabledField?.defaultValue);

  const handleTracingEnabledChange: OnFieldChangeFn = (id, change) => {
    handleFieldChange(id, change);

    if (change?.unsavedValue !== false) {
      return;
    }

    dependentTracingSettingIds.forEach((settingId) => {
      const field = fields[settingId];

      if (!field || field.type !== 'boolean' || field.isOverridden) {
        return;
      }

      const update: BooleanUnsavedFieldChange = {
        type: field.type,
        unsavedValue: false,
      };

      handleFieldChange(field.id, hasUnsavedChange(field, update) ? update : undefined);
    });
  };

  return {
    tracingEnabledField,
    tracingEnabled,
    handleTracingEnabledChange,
  };
};
