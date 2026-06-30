/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { act, renderHook } from '@testing-library/react';
import type {
  BooleanFieldDefinition,
  BooleanUnsavedFieldChange,
  FieldDefinition,
  UnsavedFieldChange,
} from '@kbn/management-settings-types';
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
import { useTracingEnabledState } from './use_tracing_enabled_state';

jest.mock('../../contexts/settings_context');
jest.mock('@kbn/management-settings-utilities', () => ({
  hasUnsavedChange: jest.fn(),
}));

const mockUseSettingsContext = useSettingsContext as jest.MockedFunction<typeof useSettingsContext>;
const mockHasUnsavedChange = hasUnsavedChange as jest.MockedFunction<typeof hasUnsavedChange>;

const dependentTracingSettingIds = [
  AGENT_BUILDER_TRACING_USER_PROMPTS_SETTING_ID,
  AGENT_BUILDER_TRACING_LLM_RESPONSES_SETTING_ID,
  AGENT_BUILDER_TRACING_TOOL_DETAILS_SETTING_ID,
  AGENT_BUILDER_TRACING_SYSTEM_PROMPT_SETTING_ID,
  AGENT_BUILDER_TRACING_REAL_NAMES_SETTING_ID,
  AGENT_BUILDER_TRACING_REAL_IDS_SETTING_ID,
] as const;

const createBooleanField = ({
  id,
  savedValue,
  defaultValue,
  isOverridden = false,
}: {
  id: string;
  savedValue?: boolean | null;
  defaultValue?: boolean | null;
  isOverridden?: boolean;
}): BooleanFieldDefinition => ({
  id,
  type: 'boolean',
  savedValue,
  defaultValue,
  isOverridden,
  ariaAttributes: { ariaLabel: id },
  categories: [],
  defaultValueDisplay: String(defaultValue ?? false),
  displayName: id,
  groupId: 'test',
  isCustom: false,
  isDefaultValue: savedValue === defaultValue,
  isReadOnly: false,
  name: id,
  order: 0,
  requiresPageReload: false,
  unsavedFieldId: id,
});

const createDependentBooleanFields = (
  overrides: Partial<
    Record<(typeof dependentTracingSettingIds)[number], Partial<BooleanFieldDefinition>>
  > = {}
): Record<string, FieldDefinition> => {
  return dependentTracingSettingIds.reduce<Record<string, FieldDefinition>>((acc, settingId) => {
    const fieldOverrides = overrides[settingId] ?? {};
    acc[settingId] = createBooleanField({
      id: settingId,
      savedValue: true,
      ...fieldOverrides,
    });
    return acc;
  }, {});
};

const setup = ({
  tracingEnabledField,
  dependentFields = {},
  unsavedChanges = {},
}: {
  tracingEnabledField?: BooleanFieldDefinition;
  dependentFields?: Record<string, FieldDefinition>;
  unsavedChanges?: Record<string, UnsavedFieldChange>;
} = {}) => {
  const handleFieldChange = jest.fn();

  const fields: Record<string, FieldDefinition> = { ...dependentFields };
  if (tracingEnabledField) {
    fields[AGENT_BUILDER_TRACING_ENABLED_SETTING_ID] = tracingEnabledField;
  }

  mockUseSettingsContext.mockReturnValue({
    fields,
    handleFieldChange,
    unsavedChanges,
    saveAll: jest.fn(),
    isSaving: false,
    cleanUnsavedChanges: jest.fn(),
    saveSingleSetting: jest.fn(),
    setValidationErrors: jest.fn(),
  });

  const { result } = renderHook(() => useTracingEnabledState());

  return { result, handleFieldChange };
};

describe('useTracingEnabledState', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHasUnsavedChange.mockReturnValue(true);
  });

  it('returns tracingEnabled false when defaultValue is false and there is no unsaved change', () => {
    const { result } = setup({
      tracingEnabledField: createBooleanField({
        id: AGENT_BUILDER_TRACING_ENABLED_SETTING_ID,
        defaultValue: false,
      }),
    });

    expect(result.current.tracingEnabled).toBe(false);
  });

  it('returns tracingEnabled true when defaultValue is true and there is no unsaved change', () => {
    const { result } = setup({
      tracingEnabledField: createBooleanField({
        id: AGENT_BUILDER_TRACING_ENABLED_SETTING_ID,
        defaultValue: true,
      }),
    });

    expect(result.current.tracingEnabled).toBe(true);
  });

  it('returns tracingEnabled true when savedValue is false but unsaved change is true', () => {
    const { result } = setup({
      tracingEnabledField: createBooleanField({
        id: AGENT_BUILDER_TRACING_ENABLED_SETTING_ID,
        savedValue: false,
      }),
      unsavedChanges: {
        [AGENT_BUILDER_TRACING_ENABLED_SETTING_ID]: {
          type: 'boolean',
          unsavedValue: true,
        },
      },
    });

    expect(result.current.tracingEnabled).toBe(true);
  });

  it('returns tracingEnabled false when savedValue is true but unsaved change is false', () => {
    const { result } = setup({
      tracingEnabledField: createBooleanField({
        id: AGENT_BUILDER_TRACING_ENABLED_SETTING_ID,
        savedValue: true,
      }),
      unsavedChanges: {
        [AGENT_BUILDER_TRACING_ENABLED_SETTING_ID]: {
          type: 'boolean',
          unsavedValue: false,
        },
      },
    });

    expect(result.current.tracingEnabled).toBe(false);
  });

  it('returns tracingEnabledField as undefined when the enabled field is missing', () => {
    const { result } = setup();

    expect(result.current.tracingEnabledField).toBeUndefined();
    expect(result.current.tracingEnabled).toBe(false);
  });

  it('cascades false to each non-overridden dependent boolean when tracing is disabled', () => {
    const { result, handleFieldChange } = setup({
      tracingEnabledField: createBooleanField({
        id: AGENT_BUILDER_TRACING_ENABLED_SETTING_ID,
        savedValue: true,
      }),
      dependentFields: createDependentBooleanFields(),
    });

    const change: BooleanUnsavedFieldChange = {
      type: 'boolean',
      unsavedValue: false,
    };

    act(() => {
      result.current.handleTracingEnabledChange(AGENT_BUILDER_TRACING_ENABLED_SETTING_ID, change);
    });

    expect(handleFieldChange).toHaveBeenCalledWith(
      AGENT_BUILDER_TRACING_ENABLED_SETTING_ID,
      change
    );

    dependentTracingSettingIds.forEach((settingId) => {
      expect(handleFieldChange).toHaveBeenCalledWith(settingId, {
        type: 'boolean',
        unsavedValue: false,
      });
    });
    expect(handleFieldChange).toHaveBeenCalledTimes(dependentTracingSettingIds.length + 1);
  });

  it('does not cascade when tracing is enabled', () => {
    const { result, handleFieldChange } = setup({
      tracingEnabledField: createBooleanField({
        id: AGENT_BUILDER_TRACING_ENABLED_SETTING_ID,
        savedValue: false,
      }),
      dependentFields: createDependentBooleanFields(),
    });

    const change: BooleanUnsavedFieldChange = {
      type: 'boolean',
      unsavedValue: true,
    };

    act(() => {
      result.current.handleTracingEnabledChange(AGENT_BUILDER_TRACING_ENABLED_SETTING_ID, change);
    });

    expect(handleFieldChange).toHaveBeenCalledTimes(1);
    expect(handleFieldChange).toHaveBeenCalledWith(
      AGENT_BUILDER_TRACING_ENABLED_SETTING_ID,
      change
    );
  });

  it('skips dependent fields that are overridden when cascading', () => {
    const { result, handleFieldChange } = setup({
      tracingEnabledField: createBooleanField({
        id: AGENT_BUILDER_TRACING_ENABLED_SETTING_ID,
        savedValue: true,
      }),
      dependentFields: createDependentBooleanFields({
        [AGENT_BUILDER_TRACING_USER_PROMPTS_SETTING_ID]: { isOverridden: true },
      }),
    });

    const change: BooleanUnsavedFieldChange = {
      type: 'boolean',
      unsavedValue: false,
    };

    act(() => {
      result.current.handleTracingEnabledChange(AGENT_BUILDER_TRACING_ENABLED_SETTING_ID, change);
    });

    expect(handleFieldChange).not.toHaveBeenCalledWith(
      AGENT_BUILDER_TRACING_USER_PROMPTS_SETTING_ID,
      expect.anything()
    );
    expect(handleFieldChange).toHaveBeenCalledTimes(dependentTracingSettingIds.length);
  });

  it('passes undefined to handleFieldChange when a dependent field is already false', () => {
    const { result, handleFieldChange } = setup({
      tracingEnabledField: createBooleanField({
        id: AGENT_BUILDER_TRACING_ENABLED_SETTING_ID,
        savedValue: true,
      }),
      dependentFields: createDependentBooleanFields({
        [AGENT_BUILDER_TRACING_USER_PROMPTS_SETTING_ID]: { savedValue: false },
      }),
    });

    // user_prompts field has savedValue: false — resetting to false is not an unsaved change
    mockHasUnsavedChange.mockImplementation((field) => field.savedValue !== false);

    const change: BooleanUnsavedFieldChange = {
      type: 'boolean',
      unsavedValue: false,
    };

    act(() => {
      result.current.handleTracingEnabledChange(AGENT_BUILDER_TRACING_ENABLED_SETTING_ID, change);
    });

    expect(handleFieldChange).toHaveBeenCalledWith(
      AGENT_BUILDER_TRACING_USER_PROMPTS_SETTING_ID,
      undefined
    );
  });
});
