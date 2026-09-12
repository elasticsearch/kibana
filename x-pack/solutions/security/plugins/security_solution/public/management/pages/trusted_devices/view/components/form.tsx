/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback, useMemo, useState } from 'react';
import type { EuiComboBoxOptionOption } from '@elastic/eui';
import {
  EuiButton,
  EuiButtonIcon,
  EuiComboBox,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiForm,
  EuiFormRow,
  EuiHideFor,
  EuiHorizontalRule,
  EuiSpacer,
  EuiSuperSelect,
  EuiText,
  EuiTextArea,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';
import styled from '@emotion/styled';
import {
  CONTROL_CHARACTER_ERROR,
  OperatingSystem,
  TrustedDeviceConditionEntryField,
  hasControlCharacters,
  isTrustedDeviceFieldAvailableForOs,
} from '@kbn/securitysolution-utils';
import type {
  ExceptionListItemSchema,
  CreateExceptionListItemSchema,
  OsTypeArray,
} from '@kbn/securitysolution-io-ts-list-types';
import type { ArtifactFormComponentProps } from '../../../../components/artifact_list_page';
import { FormattedError } from '../../../../components/formatted_error';
import { useTestIdGenerator } from '../../../../hooks/use_test_id_generator';
import { useCanAssignArtifactPerPolicy } from '../../../../hooks/artifacts';
import { useGetTrustedDeviceSuggestions } from '../../hooks/use_get_trusted_device_suggestions';
import { useFetchIndex } from '../../../../../common/containers/source';
import {
  DEVICE_EVENTS_INDEX_PATTERN,
  ENDPOINT_FIELDS_SEARCH_STRATEGY,
} from '../../../../../../common/endpoint/constants';
import type { EffectedPolicySelectProps } from '../../../../components/effected_policy_select';
import { EffectedPolicySelect } from '../../../../components/effected_policy_select';
import { OPERATING_SYSTEM_WINDOWS_AND_MAC, OS_TITLES } from '../../../../common/translations';
import { AndOrBadge } from '../../../../../common/components/and_or_badge';
import {
  DETAILS_HEADER,
  DETAILS_HEADER_DESCRIPTION,
  NAME_LABEL,
  DESCRIPTION_LABEL,
  CONDITIONS_HEADER,
  CONDITIONS_HEADER_DESCRIPTION,
  SELECT_OS_LABEL,
  POLICY_SELECT_DESCRIPTION,
  CONDITION_FIELD_TITLE,
  OPERATOR_TITLES,
  INPUT_ERRORS,
  VALIDATION_WARNINGS,
  OS_OPTIONS_PLACEHOLDER,
  AND_BUTTON_LABEL,
  REMOVE_ENTRY_ARIA_LABEL,
  VALUE_INPUT_PLACEHOLDER,
} from '../translations';

type ValidationFieldKey = 'name' | 'description' | 'os' | 'entries' | 'entryValues';

interface ValidationResult {
  isValid: boolean;
  errors: Partial<Record<ValidationFieldKey, string[]>>;
  warnings: Partial<Record<ValidationFieldKey, string[]>>;
}

type DeviceEntry = ExceptionListItemSchema['entries'][0];

const defaultDeviceEntry = (): DeviceEntry => ({
  field: TrustedDeviceConditionEntryField.DEVICE_ID,
  operator: 'included',
  type: 'match',
  value: '',
});

const OS_OPTIONS: Array<EuiComboBoxOptionOption<OsTypeArray>> = [
  {
    key: 'windows-mac',
    label: OPERATING_SYSTEM_WINDOWS_AND_MAC,
    value: [OperatingSystem.WINDOWS, OperatingSystem.MAC],
  },
  {
    key: 'windows',
    label: OS_TITLES[OperatingSystem.WINDOWS],
    value: [OperatingSystem.WINDOWS],
  },
  {
    key: 'mac',
    label: OS_TITLES[OperatingSystem.MAC],
    value: [OperatingSystem.MAC],
  },
];

const getFieldOptionsForOs = (osTypes: OsTypeArray) => {
  const allFields = [
    {
      value: TrustedDeviceConditionEntryField.DEVICE_ID,
      inputDisplay: CONDITION_FIELD_TITLE[TrustedDeviceConditionEntryField.DEVICE_ID],
    },
    {
      value: TrustedDeviceConditionEntryField.DEVICE_TYPE,
      inputDisplay: CONDITION_FIELD_TITLE[TrustedDeviceConditionEntryField.DEVICE_TYPE],
    },
    {
      value: TrustedDeviceConditionEntryField.HOST,
      inputDisplay: CONDITION_FIELD_TITLE[TrustedDeviceConditionEntryField.HOST],
    },
    {
      value: TrustedDeviceConditionEntryField.MANUFACTURER,
      inputDisplay: CONDITION_FIELD_TITLE[TrustedDeviceConditionEntryField.MANUFACTURER],
    },
    {
      value: TrustedDeviceConditionEntryField.MANUFACTURER_ID,
      inputDisplay: CONDITION_FIELD_TITLE[TrustedDeviceConditionEntryField.MANUFACTURER_ID],
    },
    {
      value: TrustedDeviceConditionEntryField.PRODUCT_ID,
      inputDisplay: CONDITION_FIELD_TITLE[TrustedDeviceConditionEntryField.PRODUCT_ID],
    },
    {
      value: TrustedDeviceConditionEntryField.PRODUCT_NAME,
      inputDisplay: CONDITION_FIELD_TITLE[TrustedDeviceConditionEntryField.PRODUCT_NAME],
    },
  ];

  if (isTrustedDeviceFieldAvailableForOs(TrustedDeviceConditionEntryField.USERNAME, osTypes)) {
    allFields.push({
      value: TrustedDeviceConditionEntryField.USERNAME,
      inputDisplay: CONDITION_FIELD_TITLE[TrustedDeviceConditionEntryField.USERNAME],
    });
  }

  return allFields;
};

const OPERATOR_OPTIONS = [
  { value: 'is', inputDisplay: OPERATOR_TITLES.is },
  { value: 'match', inputDisplay: OPERATOR_TITLES.matches },
];

const DEVICE_EVENTS_INDEX_NAMES = [DEVICE_EVENTS_INDEX_PATTERN];

interface EntryValidationResult {
  duplicateErrors: string[];
  characterErrors: string[];
  warnings: string[];
  anyEntryEmpty: boolean;
}

const validateEntries = (entries: ExceptionListItemSchema['entries']): EntryValidationResult => {
  const duplicateErrors: string[] = [];
  const characterErrors: string[] = [];
  const warnings: string[] = [];
  const fieldCounts = new Map<string, number>();
  let anyEntryEmpty = false;

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    fieldCounts.set(entry.field, (fieldCounts.get(entry.field) ?? 0) + 1);

    if ('value' in entry) {
      const isEmpty =
        (typeof entry.value === 'string' && !entry.value.trim()) ||
        (Array.isArray(entry.value) && entry.value.length === 0);

      if (isEmpty) {
        anyEntryEmpty = true;
      } else if (hasControlCharacters(entry.value)) {
        characterErrors.push(CONTROL_CHARACTER_ERROR);
      } else if (
        typeof entry.value === 'string' &&
        entry.type === 'wildcard' &&
        entry.value.includes('**')
      ) {
        warnings.push(VALIDATION_WARNINGS.performanceWildcard);
      }
    }
  }

  for (const [field, count] of fieldCounts) {
    if (count > 1) {
      duplicateErrors.push(
        INPUT_ERRORS.noDuplicateField(field as TrustedDeviceConditionEntryField)
      );
    }
  }

  return { duplicateErrors, characterErrors, warnings, anyEntryEmpty };
};

const computeValidation = (
  formData: ExceptionListItemSchema | CreateExceptionListItemSchema,
  visitedFields: Record<string, boolean>,
  hasVisitedAnyEntry: boolean
): ValidationResult => {
  const errors: Partial<Record<ValidationFieldKey, string[]>> = {};
  const warnings: Partial<Record<ValidationFieldKey, string[]>> = {};

  if (!formData.name?.trim()) {
    errors.name = [INPUT_ERRORS.name];
  } else if (formData.name.trim().length > 256) {
    errors.name = [INPUT_ERRORS.nameMaxLength];
  }

  if (formData.description && formData.description.length > 256) {
    errors.description = [INPUT_ERRORS.descriptionMaxLength];
  }

  if (!formData.os_types?.length) {
    errors.os = [INPUT_ERRORS.osRequired];
  }

  const hasOsSelected = (formData.os_types?.length ?? 0) > 0;
  const hasVisitedEntries = visitedFields.entries;

  if (hasOsSelected || hasVisitedEntries) {
    if (formData.entries?.length) {
      const entryValidation = validateEntries(formData.entries);

      const entryErrors = [...entryValidation.duplicateErrors, ...entryValidation.characterErrors];
      if (entryErrors.length > 0) {
        errors.entries = entryErrors;
      }

      if (entryValidation.anyEntryEmpty && hasVisitedAnyEntry) {
        errors.entryValues = [INPUT_ERRORS.entryValueEmpty];
      }

      if (entryValidation.warnings.length > 0) {
        warnings.entries = entryValidation.warnings;
      }

      if (entryValidation.anyEntryEmpty && !hasVisitedAnyEntry) {
        return { isValid: false, errors, warnings };
      }
    }
  }

  return { isValid: Object.keys(errors).length === 0, errors, warnings };
};

// DetailsSection ---------------------------------------------------------------

const DetailsSection = memo<{
  mode: string;
  getTestId: (suffix?: string) => string | undefined;
  item: ExceptionListItemSchema | CreateExceptionListItemSchema;
  handleNameChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  handleNameBlur: (event: React.FocusEvent<HTMLInputElement>) => void;
  handleDescriptionChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => void;
  disabled: boolean;
  visitedFields: Record<string, boolean>;
  validationResult: ValidationResult;
}>(
  ({
    mode,
    getTestId,
    item,
    handleNameChange,
    handleNameBlur,
    handleDescriptionChange,
    disabled,
    visitedFields,
    validationResult,
  }) => (
    <>
      <EuiTitle size="xs">
        <h3>{DETAILS_HEADER}</h3>
      </EuiTitle>
      <EuiSpacer size="xs" />
      {mode === 'create' && (
        <EuiText size="s" data-test-subj={getTestId('about')}>
          <p>{DETAILS_HEADER_DESCRIPTION}</p>
        </EuiText>
      )}
      <EuiSpacer size="m" />

      <EuiFormRow
        label={NAME_LABEL}
        fullWidth
        data-test-subj={getTestId('nameRow')}
        isInvalid={visitedFields.name && !!validationResult.errors.name}
        error={visitedFields.name ? validationResult.errors.name : undefined}
        helpText={
          visitedFields.name && validationResult.warnings.name
            ? validationResult.warnings.name[0]
            : undefined
        }
      >
        <EuiFieldText
          name="name"
          value={item.name || ''}
          onChange={handleNameChange}
          onBlur={handleNameBlur}
          fullWidth
          maxLength={256}
          data-test-subj={getTestId('nameTextField')}
          disabled={disabled}
          isInvalid={visitedFields.name && !!validationResult.errors.name}
        />
      </EuiFormRow>

      <EuiFormRow
        label={DESCRIPTION_LABEL}
        fullWidth
        data-test-subj={getTestId('descriptionRow')}
        isInvalid={!!validationResult.errors.description}
        error={validationResult.errors.description}
        helpText={
          validationResult.warnings.description
            ? validationResult.warnings.description[0]
            : undefined
        }
      >
        <EuiTextArea
          isInvalid={!!validationResult.errors.description}
          name="description"
          value={item.description || ''}
          onChange={handleDescriptionChange}
          fullWidth
          compressed
          maxLength={256}
          data-test-subj={getTestId('descriptionField')}
          disabled={disabled}
        />
      </EuiFormRow>
    </>
  )
);
DetailsSection.displayName = 'DetailsSection';

// ConditionEntryRow ------------------------------------------------------------

interface ConditionEntryRowProps {
  entry: DeviceEntry;
  index: number;
  selectedOs: OsTypeArray;
  showLabels: boolean;
  isRemoveDisabled: boolean;
  onFieldChange: (index: number, value: string) => void;
  onOperatorChange: (index: number, value: string) => void;
  onValueChange: (index: number, options: Array<EuiComboBoxOptionOption<string>>) => void;
  onValueBlur: (index: number) => void;
  onRemove: (index: number) => void;
  disabled: boolean;
  indexExists: boolean;
  getTestId: (suffix?: string) => string | undefined;
}

const ConditionEntryRow = memo<ConditionEntryRowProps>(
  ({
    entry,
    index,
    selectedOs,
    showLabels,
    isRemoveDisabled,
    onFieldChange,
    onOperatorChange,
    onValueChange,
    onValueBlur,
    onRemove,
    disabled,
    indexExists,
    getTestId,
  }) => {
    const availableFieldOptions = useMemo(() => getFieldOptionsForOs(selectedOs), [selectedOs]);

    const suggestionsEnabled = !disabled && indexExists;

    const { data: suggestions = [], isLoading: isLoadingSuggestions } =
      useGetTrustedDeviceSuggestions({
        field: entry.field || '',
        enabled: suggestionsEnabled,
      });

    const showSuggestionsLoading = suggestionsEnabled && isLoadingSuggestions;

    const handleFieldChange = useCallback(
      (value: string) => onFieldChange(index, value),
      [index, onFieldChange]
    );

    const handleOperatorChange = useCallback(
      (value: string) => onOperatorChange(index, value),
      [index, onOperatorChange]
    );

    const handleValueChange = useCallback(
      (options: Array<EuiComboBoxOptionOption<string>>) => onValueChange(index, options),
      [index, onValueChange]
    );

    const handleValueBlur = useCallback(() => onValueBlur(index), [index, onValueBlur]);

    const handleRemove = useCallback(() => onRemove(index), [index, onRemove]);

    return (
      <EuiFlexGroup alignItems="center" gutterSize="s">
        <EuiFlexItem>
          <EuiFormRow label={showLabels ? 'Field' : undefined}>
            <EuiSuperSelect
              options={availableFieldOptions}
              valueOfSelected={entry.field || TrustedDeviceConditionEntryField.DEVICE_ID}
              onChange={handleFieldChange}
              data-test-subj={getTestId(`entry${index}fieldSelect`)}
              disabled={disabled}
            />
          </EuiFormRow>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiFormRow label={showLabels ? 'Operator' : undefined}>
            <EuiSuperSelect
              options={OPERATOR_OPTIONS}
              valueOfSelected={entry.type === 'match' ? 'is' : 'match'}
              onChange={handleOperatorChange}
              data-test-subj={getTestId(`entry${index}operatorSelect`)}
              disabled={disabled}
            />
          </EuiFormRow>
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiFormRow label={showLabels ? 'Value' : undefined}>
            <EuiComboBox
              placeholder={VALUE_INPUT_PLACEHOLDER}
              singleSelection={{ asPlainText: true }}
              options={suggestions.map((suggestion, idx) => ({
                label: suggestion,
                key: `${suggestion}-${idx}`,
              }))}
              selectedOptions={
                'value' in entry && entry.value ? [{ label: String(entry.value) }] : []
              }
              onChange={handleValueChange}
              onBlur={handleValueBlur}
              onCreateOption={(searchValue) => {
                handleValueChange([{ label: searchValue }]);
              }}
              isLoading={showSuggestionsLoading}
              data-test-subj={getTestId(`entry${index}valueField`)}
              isDisabled={disabled}
              isClearable={false}
            />
          </EuiFormRow>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          {/* Unicode nbsp so the button aligns with other fields when labels are shown */}
          <EuiFormRow label={showLabels ? '\u00A0' : undefined}>
            <EuiToolTip content={REMOVE_ENTRY_ARIA_LABEL} disableScreenReaderOutput>
              <EuiButtonIcon
                color="danger"
                iconType="trash"
                onClick={handleRemove}
                isDisabled={isRemoveDisabled || disabled}
                aria-label={REMOVE_ENTRY_ARIA_LABEL}
                data-test-subj={getTestId(`entry${index}removeButton`)}
              />
            </EuiToolTip>
          </EuiFormRow>
        </EuiFlexItem>
      </EuiFlexGroup>
    );
  }
);
ConditionEntryRow.displayName = 'ConditionEntryRow';

// ConditionsSection ------------------------------------------------------------

const ConditionGroupFlexGroup = styled(EuiFlexGroup)`
  // The positioning of the 'and-badge' is done by using the EuiButton's height and adding on to it
  // the amount of padding used to space out each of the entries (times 2 because a spacer is also
  // used above the Button), and then we adjust it with 3px
  .and-badge {
    padding-top: 20px;
    padding-bottom: ${({ theme }) => {
      return `calc(${theme.euiTheme.size.xl} + (${theme.euiTheme.size.s} * 2) + 3px);`;
    }};
  }

  .group-entries {
    margin-bottom: ${({ theme }) => theme.euiTheme.size.s};

    & > * {
      margin-bottom: ${({ theme }) => theme.euiTheme.size.s};

      &:last-child {
        margin-bottom: 0;
      }
    }
  }

  .and-button {
    min-width: 95px;
  }
`;

const ConditionsSection = memo<{
  getTestId: (suffix?: string) => string | undefined;
  selectedOs: OsTypeArray;
  handleOsChange: (selectedOptions: Array<EuiComboBoxOptionOption<OsTypeArray>>) => void;
  entries: ExceptionListItemSchema['entries'];
  onAddEntry: () => void;
  onRemoveEntry: (index: number) => void;
  onEntryFieldChange: (index: number, value: string) => void;
  onEntryOperatorChange: (index: number, value: string) => void;
  onEntryValueChange: (index: number, options: Array<EuiComboBoxOptionOption<string>>) => void;
  onEntryValueBlur: (index: number) => void;
  disabled: boolean;
  visitedFields: Record<string, boolean>;
  validationResult: ValidationResult;
  indexExists: boolean;
}>(
  ({
    getTestId,
    selectedOs,
    handleOsChange,
    entries,
    onAddEntry,
    onRemoveEntry,
    onEntryFieldChange,
    onEntryOperatorChange,
    onEntryValueChange,
    onEntryValueBlur,
    disabled,
    visitedFields,
    validationResult,
    indexExists,
  }) => {
    return (
      <>
        <EuiTitle size="xs">
          <h3>{CONDITIONS_HEADER}</h3>
        </EuiTitle>
        <EuiSpacer size="xs" />
        <EuiText size="s">{CONDITIONS_HEADER_DESCRIPTION}</EuiText>
        <EuiSpacer size="m" />

        <EuiFormRow
          label={SELECT_OS_LABEL}
          fullWidth
          data-test-subj={getTestId('osRow')}
          isInvalid={visitedFields.os && !!validationResult.errors.os}
          error={visitedFields.os ? validationResult.errors.os : undefined}
          helpText={
            visitedFields.os && validationResult.warnings.os
              ? validationResult.warnings.os[0]
              : undefined
          }
        >
          <EuiComboBox
            isInvalid={visitedFields.os && !!validationResult.errors.os}
            placeholder={OS_OPTIONS_PLACEHOLDER}
            singleSelection={{ asPlainText: true }}
            options={OS_OPTIONS}
            selectedOptions={OS_OPTIONS.filter(
              (option) => JSON.stringify(option.value) === JSON.stringify(selectedOs)
            )}
            onChange={handleOsChange}
            isClearable={false}
            data-test-subj={getTestId('osSelectField')}
            isDisabled={disabled}
          />
        </EuiFormRow>

        <EuiFormRow
          fullWidth
          data-test-subj={getTestId('conditionsRow')}
          isInvalid={!!validationResult.errors.entries || !!validationResult.errors.entryValues}
          error={[
            ...(validationResult.errors.entries ?? []),
            ...(validationResult.errors.entryValues ?? []),
          ]}
          helpText={
            visitedFields.entries && validationResult.warnings.entries
              ? validationResult.warnings.entries[0]
              : undefined
          }
        >
          <ConditionGroupFlexGroup gutterSize="xs">
            {entries.length > 1 && (
              <EuiHideFor sizes={['xs', 's']}>
                <EuiFlexItem
                  grow={false}
                  data-test-subj={getTestId('andConnector')}
                  className="and-badge"
                >
                  <AndOrBadge type="and" includeAntennas />
                </EuiFlexItem>
              </EuiHideFor>
            )}
            <EuiFlexItem grow={1}>
              <div data-test-subj={getTestId('conditionEntries')} className="group-entries">
                {entries.map((entry, index) => (
                  <ConditionEntryRow
                    key={index}
                    entry={entry}
                    index={index}
                    selectedOs={selectedOs}
                    showLabels={index === 0}
                    isRemoveDisabled={entries.length <= 1}
                    onFieldChange={onEntryFieldChange}
                    onOperatorChange={onEntryOperatorChange}
                    onValueChange={onEntryValueChange}
                    onValueBlur={onEntryValueBlur}
                    onRemove={onRemoveEntry}
                    disabled={disabled}
                    indexExists={indexExists}
                    getTestId={getTestId}
                  />
                ))}
              </div>
              <div>
                <EuiSpacer size="s" />
                <EuiButton
                  size="s"
                  iconType="plusCircle"
                  onClick={onAddEntry}
                  isDisabled={disabled}
                  className="and-button"
                  data-test-subj={getTestId('AndButton')}
                >
                  {AND_BUTTON_LABEL}
                </EuiButton>
              </div>
            </EuiFlexItem>
          </ConditionGroupFlexGroup>
        </EuiFormRow>
      </>
    );
  }
);
ConditionsSection.displayName = 'ConditionsSection';

// TrustedDevicesForm -----------------------------------------------------------

export const TrustedDevicesForm = memo<ArtifactFormComponentProps>(
  ({ item, onChange, mode = 'create', disabled = false, error: submitError }) => {
    const [hasUserSelectedOs, setHasUserSelectedOs] = useState<boolean>(false);
    const [hasFormChanged, setHasFormChanged] = useState(false);
    const [hasVisitedAnyEntry, setHasVisitedAnyEntry] = useState(false);

    const getTestId = useTestIdGenerator('trustedDevices-form');

    const [isIndexLoading, { indexPatterns }] = useFetchIndex(
      DEVICE_EVENTS_INDEX_NAMES,
      true,
      ENDPOINT_FIELDS_SEARCH_STRATEGY
    );

    const hasIndexWithFields = !isIndexLoading && indexPatterns?.fields?.length > 0;

    const [visitedFields, setVisitedFields] = useState<Record<string, boolean>>({});

    // For new TD items, ensure we start with the correct OS types
    const currentItem = useMemo(() => {
      if (
        mode === 'create' &&
        item.os_types?.length === 1 &&
        item.os_types[0] === 'windows' &&
        !item.name?.trim() &&
        !hasUserSelectedOs
      ) {
        return { ...item, os_types: [OperatingSystem.WINDOWS, OperatingSystem.MAC] };
      }
      return item;
    }, [item, mode, hasUserSelectedOs]);

    const showAssignmentSection = useCanAssignArtifactPerPolicy(
      currentItem,
      mode,
      hasFormChanged,
      'enterprise'
    );

    const updateVisitedFields = useCallback((updates: Record<string, boolean>) => {
      setVisitedFields((prev) => ({ ...prev, ...updates }));
    }, []);

    const validationResult = useMemo(
      () => computeValidation(currentItem, visitedFields, hasVisitedAnyEntry),
      [currentItem, visitedFields, hasVisitedAnyEntry]
    );

    const updateField = useCallback(
      (field: string, value: string) => {
        const updatedItem = { ...currentItem, [field]: value };
        const { isValid } = computeValidation(updatedItem, visitedFields, hasVisitedAnyEntry);

        setHasFormChanged(true);
        onChange({ item: updatedItem, isValid });
      },
      [currentItem, visitedFields, hasVisitedAnyEntry, onChange]
    );

    const handleNameChange = useCallback(
      (event: React.ChangeEvent<HTMLInputElement>) => {
        updateField('name', event.target.value);
      },
      [updateField]
    );

    const handleNameBlur = useCallback(
      (_event: React.FocusEvent<HTMLInputElement>) => {
        updateVisitedFields({ ...visitedFields, name: true });
      },
      [visitedFields, updateVisitedFields]
    );

    const handleDescriptionChange = useCallback(
      (event: React.ChangeEvent<HTMLTextAreaElement>) => {
        updateField('description', event.target.value);
      },
      [updateField]
    );

    const handleOsChange = useCallback(
      (selectedOptions: Array<EuiComboBoxOptionOption<OsTypeArray>>) => {
        const osTypes = selectedOptions[0]?.value || [];

        setHasUserSelectedOs(true);
        setHasFormChanged(true);
        setHasVisitedAnyEntry(false);

        // remove username field if it is not available for the selected OS
        const updatedEntries = (currentItem.entries ?? []).filter((entry) => {
          return !(
            entry.field === TrustedDeviceConditionEntryField.USERNAME &&
            !isTrustedDeviceFieldAvailableForOs(TrustedDeviceConditionEntryField.USERNAME, osTypes)
          );
        });

        const updatedItem = {
          ...currentItem,
          os_types: osTypes,
          entries: updatedEntries.length ? updatedEntries : [defaultDeviceEntry()],
        };

        const { isValid } = computeValidation(updatedItem, visitedFields, false);

        updateVisitedFields({ ...visitedFields, os: true });

        onChange({ item: updatedItem, isValid });
      },
      [currentItem, onChange, updateVisitedFields, visitedFields]
    );

    const updateEntryAtIndex = useCallback(
      (index: number, updates: Record<string, string>) => {
        const entries = currentItem.entries?.length
          ? [...currentItem.entries]
          : [defaultDeviceEntry()];
        const currentEntry = entries[index] ?? defaultDeviceEntry();
        entries[index] = { ...currentEntry, ...updates };
        const updatedItem = { ...currentItem, entries };
        const { isValid } = computeValidation(updatedItem, visitedFields, hasVisitedAnyEntry);

        setHasFormChanged(true);
        onChange({ item: updatedItem, isValid });
      },
      [currentItem, visitedFields, hasVisitedAnyEntry, onChange]
    );

    const handleEntryFieldChange = useCallback(
      (index: number, value: string) => {
        updateEntryAtIndex(index, { field: value, value: '' });
        updateVisitedFields({ entries: false });
        setHasVisitedAnyEntry(false);
      },
      [updateEntryAtIndex, updateVisitedFields]
    );

    const handleEntryOperatorChange = useCallback(
      (index: number, value: string) => {
        const type = value === 'is' ? 'match' : 'wildcard';
        updateEntryAtIndex(index, { type });
        setHasVisitedAnyEntry(false);
      },
      [updateEntryAtIndex]
    );

    const handleEntryValueChange = useCallback(
      (index: number, options: Array<EuiComboBoxOptionOption<string>>) => {
        const value = options.length > 0 ? options[0].label.trim() : '';
        updateEntryAtIndex(index, { value });
      },
      [updateEntryAtIndex]
    );

    const handleEntryValueBlur = useCallback(
      (index: number) => {
        setHasVisitedAnyEntry(true);
        updateVisitedFields({ ...visitedFields, entries: true });

        const entry = currentItem.entries?.[index];
        if (entry && 'value' in entry && typeof entry.value === 'string') {
          const trimmedValue = entry.value.trim();
          if (trimmedValue !== entry.value) {
            updateEntryAtIndex(index, { value: trimmedValue });
          }
        }
      },
      [currentItem.entries, updateEntryAtIndex, updateVisitedFields, visitedFields]
    );

    const handleAddEntry = useCallback(() => {
      const existingEntries = currentItem.entries?.length
        ? currentItem.entries
        : [defaultDeviceEntry()];
      const entries = [...existingEntries, defaultDeviceEntry()];
      const updatedItem = { ...currentItem, entries };
      const { isValid } = computeValidation(updatedItem, visitedFields, false);

      setHasFormChanged(true);
      setHasVisitedAnyEntry(false);
      onChange({ item: updatedItem, isValid });
    }, [currentItem, visitedFields, onChange]);

    const handleRemoveEntry = useCallback(
      (index: number) => {
        const entries = (currentItem.entries ?? []).filter((_, i) => i !== index);
        const updatedItem = { ...currentItem, entries };

        const { isValid } = computeValidation(updatedItem, visitedFields, false);
        setHasFormChanged(true);
        setHasVisitedAnyEntry(false);
        onChange({ item: updatedItem, isValid });
      },
      [currentItem, visitedFields, onChange]
    );

    const handlePolicyChange = useCallback<EffectedPolicySelectProps['onChange']>(
      (updatedItem) => {
        const { isValid } = computeValidation(updatedItem, visitedFields, hasVisitedAnyEntry);

        setHasFormChanged(true);
        onChange({ item: updatedItem, isValid });
      },
      [visitedFields, hasVisitedAnyEntry, onChange]
    );

    const selectedOs = useMemo((): OsTypeArray => {
      return currentItem.os_types?.length
        ? currentItem.os_types
        : [OperatingSystem.WINDOWS, OperatingSystem.MAC];
    }, [currentItem.os_types]);

    const currentEntries = useMemo((): ExceptionListItemSchema['entries'] => {
      if (currentItem.entries?.length) {
        return currentItem.entries;
      }
      return [defaultDeviceEntry()];
    }, [currentItem.entries]);

    return (
      <EuiForm
        component="div"
        data-test-subj={getTestId('')}
        error={
          submitError ? (
            <FormattedError error={submitError} data-test-subj={getTestId('submitError')} />
          ) : undefined
        }
        isInvalid={!!submitError}
      >
        <DetailsSection
          mode={mode}
          getTestId={getTestId}
          item={currentItem}
          handleNameChange={handleNameChange}
          handleNameBlur={handleNameBlur}
          handleDescriptionChange={handleDescriptionChange}
          disabled={disabled}
          visitedFields={visitedFields}
          validationResult={validationResult}
        />

        <EuiHorizontalRule />

        <ConditionsSection
          getTestId={getTestId}
          selectedOs={selectedOs}
          handleOsChange={handleOsChange}
          entries={currentEntries}
          onAddEntry={handleAddEntry}
          onRemoveEntry={handleRemoveEntry}
          onEntryFieldChange={handleEntryFieldChange}
          onEntryOperatorChange={handleEntryOperatorChange}
          onEntryValueChange={handleEntryValueChange}
          onEntryValueBlur={handleEntryValueBlur}
          disabled={disabled}
          visitedFields={visitedFields}
          validationResult={validationResult}
          indexExists={hasIndexWithFields}
        />

        {showAssignmentSection ? (
          <>
            <EuiHorizontalRule />

            <EuiFormRow fullWidth data-test-subj={getTestId('policySelection')}>
              <EffectedPolicySelect
                item={currentItem}
                description={POLICY_SELECT_DESCRIPTION}
                data-test-subj={getTestId('effectedPolicies')}
                onChange={handlePolicyChange}
              />
            </EuiFormRow>
          </>
        ) : null}
      </EuiForm>
    );
  }
);

TrustedDevicesForm.displayName = 'TrustedDevicesForm';
