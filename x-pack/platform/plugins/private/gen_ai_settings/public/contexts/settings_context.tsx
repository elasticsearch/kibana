/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { createContext, useContext } from 'react';
import type {
  FieldDefinition,
  OnFieldChangeFn,
  UiSettingMetadata,
  UnsavedFieldChange,
} from '@kbn/management-settings-types';
import { isEmpty } from 'lodash';
import type { IUiSettingsClient, UiSettingsType } from '@kbn/core/public';
import { normalizeSettings } from '@kbn/management-settings-utilities';
import { getFieldDefinition } from '@kbn/management-settings-field-definition';
import { useMutation, useQuery, useQueryClient } from '@kbn/react-query';
import {
  GEN_AI_SETTINGS_DEFAULT_AI_CONNECTOR,
  GEN_AI_SETTINGS_DEFAULT_AI_CONNECTOR_DEFAULT_ONLY,
  GEN_AI_SETTINGS_TOKEN_USAGE_TRACKING,
  AGENT_BUILDER_PRE_PROMPT_WORKFLOW_IDS,
  AI_ASSISTANT_PREFERRED_AI_ASSISTANT_TYPE,
  AI_CHAT_EXPERIENCE_TYPE,
  AGENT_BUILDER_TRACING_ENABLED_SETTING_ID,
  AGENT_BUILDER_TRACING_USER_PROMPTS_SETTING_ID,
  AGENT_BUILDER_TRACING_LLM_RESPONSES_SETTING_ID,
  AGENT_BUILDER_TRACING_TOOL_DETAILS_SETTING_ID,
  AGENT_BUILDER_TRACING_SYSTEM_PROMPT_SETTING_ID,
  AGENT_BUILDER_TRACING_REAL_NAMES_SETTING_ID,
  AGENT_BUILDER_TRACING_REAL_IDS_SETTING_ID,
} from '@kbn/management-settings-ids';
import { i18n } from '@kbn/i18n';
import { useKibana } from '../hooks/use_kibana';

// Validation types
export interface ValidationError {
  message: string;
  field?: string;
}

type SettingsContext = ReturnType<typeof useSettings>;

const SettingsContext = createContext<null | SettingsContext>(null);

const useSettingsContext = () => {
  const context = useContext(SettingsContext);
  if (!context) {
    throw new Error('useSettingsContext must be inside of a SettingsContextProvider.Provider.');
  }
  return context;
};

const SETTING_KEYS = [
  GEN_AI_SETTINGS_DEFAULT_AI_CONNECTOR,
  GEN_AI_SETTINGS_DEFAULT_AI_CONNECTOR_DEFAULT_ONLY,
  GEN_AI_SETTINGS_TOKEN_USAGE_TRACKING,
  AGENT_BUILDER_PRE_PROMPT_WORKFLOW_IDS,
  AI_ASSISTANT_PREFERRED_AI_ASSISTANT_TYPE,
  AI_CHAT_EXPERIENCE_TYPE,
  AGENT_BUILDER_TRACING_ENABLED_SETTING_ID,
  AGENT_BUILDER_TRACING_USER_PROMPTS_SETTING_ID,
  AGENT_BUILDER_TRACING_LLM_RESPONSES_SETTING_ID,
  AGENT_BUILDER_TRACING_TOOL_DETAILS_SETTING_ID,
  AGENT_BUILDER_TRACING_SYSTEM_PROMPT_SETTING_ID,
  AGENT_BUILDER_TRACING_REAL_NAMES_SETTING_ID,
  AGENT_BUILDER_TRACING_REAL_IDS_SETTING_ID,
];

export const SettingsContextProvider = ({ children }: { children: React.ReactNode }) => {
  const value = useSettings({ settingsKeys: SETTING_KEYS });
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
};

function combineErrors(errors: Error[]): Error {
  const message = errors.map((err) => err.message || String(err)).join('; ');
  return new Error(message);
}

function getSettingsFields({
  settingsKeys,
  uiSettings,
}: {
  settingsKeys: string[];
  uiSettings?: IUiSettingsClient;
}) {
  if (!uiSettings) {
    return {};
  }

  const uiSettingsDefinition = uiSettings.getAll();
  const normalizedSettings = normalizeSettings(uiSettingsDefinition);

  return settingsKeys.reduce<Record<string, FieldDefinition>>((acc, key) => {
    const setting: UiSettingMetadata = normalizedSettings[key];
    if (setting) {
      const field = getFieldDefinition({
        id: key,
        setting,
        params: { isCustom: uiSettings.isCustom(key), isOverridden: uiSettings.isOverridden(key) },
      });
      acc[key] = field;
    }
    return acc;
  }, {});
}

const useSettings = ({ settingsKeys }: { settingsKeys: string[] }) => {
  const {
    services: { settings, notifications },
  } = useKibana();

  const [unsavedChanges, setUnsavedChanges] = React.useState<Record<string, UnsavedFieldChange>>(
    {}
  );

  // Custom validation errors from external validators
  const [customValidationErrors, setCustomValidationErrors] = React.useState<ValidationError[]>([]);

  const queryClient = useQueryClient();

  const fieldsQuery = useQuery({
    queryKey: ['settingsFields', settingsKeys],
    queryFn: async () => {
      return getSettingsFields({ settingsKeys, uiSettings: settings?.client });
    },
    refetchOnWindowFocus: true,
  });

  // Subscribe to UI settings changes to update in real-time when values change
  React.useEffect(() => {
    if (!settings?.client) {
      return;
    }

    const subscription = settings.client.getUpdate$().subscribe(({ key }) => {
      // If the changed setting is one we're tracking, invalidate the query to refetch
      if (settingsKeys.includes(key)) {
        queryClient.invalidateQueries({ queryKey: ['settingsFields', settingsKeys] });
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [settings?.client, settingsKeys, queryClient]);

  const saveSingleSettingMutation = useMutation({
    mutationFn: async ({
      id,
      change,
    }: {
      id: string;
      change: UnsavedFieldChange<UiSettingsType>['unsavedValue'];
    }) => {
      await settings.client.set(id, change);
      queryClient.invalidateQueries({ queryKey: ['settingsFields', settingsKeys] });
    },
  });

  const saveAllMutation = useMutation({
    mutationFn: async () => {
      if (settings && !isEmpty(unsavedChanges)) {
        // Validate fields before saving
        if (customValidationErrors.length > 0) {
          // Throw error to prevent save
          throw new Error(customValidationErrors.map((error) => error.message).join('\n'));
        }

        const updateErrors: Error[] = [];
        const subscription = settings.client.getUpdateErrors$().subscribe((error) => {
          updateErrors.push(error);
        });
        try {
          const fieldsMap = fieldsQuery.data ?? {};
          const requiresReload = Object.keys(unsavedChanges).some(
            (key) => fieldsMap[key]?.requiresPageReload === true
          );
          await Promise.all(
            Object.entries(unsavedChanges).map(([key, value]) => {
              return settings.client.set(key, value.unsavedValue);
            })
          );
          queryClient.invalidateQueries({ queryKey: ['settingsFields', settingsKeys] });
          cleanUnsavedChanges();
          if (updateErrors.length > 0) {
            throw combineErrors(updateErrors);
          }
          return requiresReload;
        } finally {
          if (subscription) {
            subscription.unsubscribe();
          }
        }
      }
      return false;
    },
    onSuccess() {
      notifications.toasts.addSuccess({
        title: i18n.translate('xpack.gen_ai_settings.save.success', {
          defaultMessage: 'Settings saved',
        }),
      });
    },
    onError(error: Error) {
      notifications.toasts.addDanger({
        title: i18n.translate('xpack.gen_ai_settings.save.error', {
          defaultMessage: 'Failed to save settings',
        }),
        text:
          error.message ??
          i18n.translate('xpack.gen_ai_settings.save.error.text', {
            defaultMessage: 'Unknown error',
          }),
      });
    },
  });

  const handleFieldChange: OnFieldChangeFn = (id, change) => {
    if (!change) {
      setUnsavedChanges((changes) => {
        const { [id]: unsavedChange, ...rest } = changes;
        return rest;
      });
      return;
    }
    setUnsavedChanges((changes) => ({ ...changes, [id]: change }));
  };

  function cleanUnsavedChanges() {
    setUnsavedChanges({});
  }

  const setValidationErrors = React.useCallback(
    (errors: ValidationError[] | ((current: ValidationError[]) => ValidationError[])) => {
      if (typeof errors === 'function') {
        setCustomValidationErrors((current) => errors(current));
      } else {
        setCustomValidationErrors(errors);
      }
    },
    []
  );

  return {
    fields: fieldsQuery.data ?? {},
    unsavedChanges,
    handleFieldChange,
    saveAll: saveAllMutation.mutateAsync,
    isSaving: saveAllMutation.isLoading || saveSingleSettingMutation.isLoading,
    cleanUnsavedChanges,
    saveSingleSetting: saveSingleSettingMutation.mutateAsync,
    setValidationErrors,
  };
};

export { SettingsContext, useSettingsContext };

/**
 * Field-specific hook for settings context with automatic validation error management
 * @param fieldNames - Array of field names this hook instance is responsible for
 * @param validationFn - Optional validation function that will be called automatically when dependencies change
 * @param validationDeps - Dependencies for the validation function
 * @returns Settings context with field-scoped validation error management
 */
export const useFieldSettingsContext = <T extends any[]>(
  fieldNames: string[],
  validationFn?: (...args: any[]) => ValidationError[],
  validationDeps?: T
) => {
  const context = useSettingsContext();

  // Validate that we have field names
  if (!fieldNames || fieldNames.length === 0) {
    throw new Error('useFieldSettingsContext requires at least one field name');
  }

  // Memoize field names to ensure stable reference
  const fieldNamesString = JSON.stringify(fieldNames);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const stableFieldNames = React.useMemo(() => fieldNames, [fieldNamesString]);

  // Track last validation errors to prevent unnecessary updates
  const lastValidationErrorsRef = React.useRef<ValidationError[]>([]);

  // Create a field-scoped setValidationErrors function with deduplication
  const setValidationErrors = React.useCallback(
    (errors: ValidationError[]) => {
      // Validate that all errors belong to the allowed fields
      const invalidErrors = errors.filter(
        (error) => error.field && !stableFieldNames.includes(error.field)
      );

      if (invalidErrors.length > 0) {
        const invalidFields = invalidErrors.map((e) => e.field).join(', ');
        throw new Error(
          `Validation errors contain fields not managed by this hook instance. ` +
            `Invalid fields: ${invalidFields}. Allowed fields: ${stableFieldNames.join(', ')}`
        );
      }

      // Check if errors have actually changed to prevent unnecessary updates
      const errorsChanged =
        errors.length !== lastValidationErrorsRef.current.length ||
        errors.some(
          (error, index) =>
            error.message !== lastValidationErrorsRef.current[index]?.message ||
            error.field !== lastValidationErrorsRef.current[index]?.field
        );

      if (errorsChanged) {
        lastValidationErrorsRef.current = errors;

        // Set the validation errors using the original context method
        context.setValidationErrors((currentErrors) => {
          // Remove any existing errors for our fields
          const otherErrors = currentErrors.filter(
            (error) => !error.field || !stableFieldNames.includes(error.field)
          );
          // Add the new errors for our fields
          return [...otherErrors, ...errors];
        });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [context.setValidationErrors, stableFieldNames]
  );

  // Auto-run validation function when dependencies change
  React.useEffect(
    () => {
      if (validationFn && validationDeps) {
        const errors = validationFn(...validationDeps);
        setValidationErrors(errors);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    validationDeps
      ? [...validationDeps, setValidationErrors, validationFn]
      : [setValidationErrors, validationFn]
  );

  // Automatically clear errors for our fields when the hook unmounts
  React.useEffect(() => {
    return () => {
      context.setValidationErrors((currentErrors) =>
        currentErrors.filter((error) => !error.field || !stableFieldNames.includes(error.field))
      );
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [context.setValidationErrors, stableFieldNames]);

  // Return the context with our field-scoped validation function
  return {
    ...context,
    setValidationErrors,
  };
};
