/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import type { EuiComboBoxOptionOption } from '@elastic/eui';
import { EuiComboBox, EuiFormRow } from '@elastic/eui';
import { uniq } from 'lodash';
import { ListOperatorTypeEnum as OperatorTypeEnum } from '@kbn/securitysolution-io-ts-list-types';
import type { DataViewBase, DataViewFieldBase } from '@kbn/es-query';

// TODO: I have to use any here for now, but once this is available below, we should use the correct types, https://github.com/elastic/kibana/issues/100715
// import { AutocompleteStart } from '../../../../../../../../../../src/plugins/kql/public';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AutocompleteStart = any;

import * as i18n from '../translations';
import type { GetGenericComboBoxPropsReturn } from '../get_generic_combo_box_props';
import { getGenericComboBoxProps } from '../get_generic_combo_box_props';
import { useFieldValueAutocomplete } from '../hooks/use_field_value_autocomplete';
import { paramIsValid } from '../param_is_valid';
import { paramContainsSpace } from '../param_contains_space';

interface AutocompleteFieldMatchAnyProps {
  placeholder: string;
  selectedField: DataViewFieldBase | undefined;
  selectedValue: string[];
  indexPattern: DataViewBase | undefined;
  isLoading: boolean;
  isDisabled: boolean;
  isClearable: boolean;
  isRequired?: boolean;
  rowLabel?: string;
  autocompleteService: AutocompleteStart;
  onChange: (arg: string[]) => void;
  onError?: (arg: boolean) => void;
  onWarning?: (arg: boolean) => void;
  warning?: string | React.ReactNode;
  'aria-label'?: string;
}

export const AutocompleteFieldMatchAnyComponent: React.FC<AutocompleteFieldMatchAnyProps> = ({
  placeholder,
  rowLabel,
  selectedField,
  selectedValue,
  indexPattern,
  isLoading,
  isDisabled = false,
  isClearable = false,
  isRequired = false,
  onChange,
  onError,
  onWarning,
  warning,
  autocompleteService,
  'aria-label': ariaLabel,
}): JSX.Element => {
  const [searchQuery, setSearchQuery] = useState('');
  const [touched, setIsTouched] = useState(false);
  const [error, setError] = useState<string | undefined>(undefined);
  const [showSpacesWarning, setShowSpacesWarning] = useState<boolean>(false);
  const [isLoadingSuggestions, isSuggestingValues, suggestions] = useFieldValueAutocomplete({
    autocompleteService,
    fieldValue: selectedValue,
    indexPattern,
    operatorType: OperatorTypeEnum.MATCH_ANY,
    query: searchQuery,
    selectedField,
  });
  const getLabel = useCallback((option: string): string => option, []);
  const optionsMemo = useMemo(
    (): string[] => (selectedValue ? uniq([...selectedValue, ...suggestions]) : suggestions),
    [suggestions, selectedValue]
  );
  const { comboOptions, labels, selectedComboOptions } = useMemo(
    (): GetGenericComboBoxPropsReturn =>
      getGenericComboBoxProps<string>({
        getLabel,
        options: optionsMemo,
        selectedOptions: selectedValue,
      }),
    [optionsMemo, selectedValue, getLabel]
  );
  const handleSpacesWarning = useCallback(
    (params: string[]) =>
      setShowSpacesWarning(!!params.find((param: string) => paramContainsSpace(param))),
    [setShowSpacesWarning]
  );
  const handleError = useCallback(
    (err: string | undefined): void => {
      setError((existingErr): string | undefined => {
        const oldErr = existingErr != null;
        const newErr = err != null;
        if (oldErr !== newErr && onError != null) {
          onError(newErr);
        }

        return err;
      });
    },
    [setError, onError]
  );
  const handleWarning = useCallback(
    (warn: string | React.ReactNode | undefined): void => {
      if (onWarning) {
        onWarning(warn !== undefined);
      }
    },
    [onWarning]
  );

  const handleValuesChange = useCallback(
    (newOptions: EuiComboBoxOptionOption[]): void => {
      const newValues: string[] = newOptions.map(({ label }) => optionsMemo[labels.indexOf(label)]);
      handleError(undefined);
      handleWarning(warning);
      handleSpacesWarning(newValues);
      onChange(newValues);
    },
    [handleError, handleSpacesWarning, handleWarning, labels, onChange, optionsMemo, warning]
  );

  const handleSearchChange = useCallback(
    (searchVal: string) => {
      if (searchVal === '') {
        handleError(undefined);
      }

      if (searchVal !== '' && selectedField != null) {
        const err = paramIsValid(searchVal, selectedField, isRequired, touched);
        handleError(err);

        if (!err) handleSpacesWarning([searchVal]);

        setSearchQuery(searchVal);
      }
    },
    [handleError, handleSpacesWarning, isRequired, selectedField, touched]
  );

  const handleCreateOption = useCallback(
    (option: string): boolean => {
      const err = paramIsValid(option, selectedField, isRequired, touched);
      handleError(err);

      if (err != null) {
        // Explicitly reject the user's input
        setShowSpacesWarning(false);
        return false;
      }

      onChange([...(selectedValue || []), option]);
      handleWarning(warning);
      handleSpacesWarning([option]);
      return true;
    },
    [
      handleError,
      handleSpacesWarning,
      handleWarning,
      isRequired,
      onChange,
      selectedField,
      selectedValue,
      touched,
      warning,
    ]
  );

  const setIsTouchedValue = useCallback((): void => {
    handleError(selectedComboOptions.length === 0 ? i18n.FIELD_REQUIRED_ERR : undefined);
    setIsTouched(true);
  }, [setIsTouched, handleError, selectedComboOptions]);

  const inputPlaceholder = useMemo(
    (): string => (isLoading || isLoadingSuggestions ? i18n.LOADING : placeholder),
    [isLoading, isLoadingSuggestions, placeholder]
  );

  const isLoadingState = useMemo(
    (): boolean => isLoading || isLoadingSuggestions,
    [isLoading, isLoadingSuggestions]
  );
  useEffect((): void => {
    handleSpacesWarning(selectedValue);
    handleWarning(warning);
  }, [selectedField, selectedValue, handleSpacesWarning, handleWarning, warning]);

  const defaultInput = useMemo((): JSX.Element => {
    return (
      <EuiFormRow
        label={rowLabel}
        error={error}
        isInvalid={selectedField != null && error != null}
        helpText={warning || (showSpacesWarning && i18n.FIELD_SPACE_WARNING)}
        fullWidth
      >
        <EuiComboBox
          placeholder={inputPlaceholder}
          isLoading={isLoadingState}
          isClearable={isClearable}
          isDisabled={isDisabled}
          options={comboOptions}
          selectedOptions={selectedComboOptions}
          onChange={handleValuesChange}
          onSearchChange={handleSearchChange}
          onCreateOption={handleCreateOption}
          isInvalid={selectedField != null && error != null}
          isCaseSensitive
          onBlur={setIsTouchedValue}
          data-test-subj="valuesAutocompleteMatchAny"
          aria-label={ariaLabel}
          fullWidth
          async
        />
      </EuiFormRow>
    );
  }, [
    rowLabel,
    error,
    selectedField,
    warning,
    showSpacesWarning,
    inputPlaceholder,
    isLoadingState,
    isClearable,
    isDisabled,
    comboOptions,
    selectedComboOptions,
    handleValuesChange,
    handleSearchChange,
    handleCreateOption,
    setIsTouchedValue,
    ariaLabel,
  ]);

  if (!isSuggestingValues && selectedField != null) {
    switch (selectedField.type) {
      case 'number':
        return (
          <EuiFormRow
            label={rowLabel}
            error={error}
            isInvalid={selectedField != null && error != null}
            fullWidth
          >
            <EuiComboBox
              noSuggestions
              placeholder={inputPlaceholder}
              isLoading={isLoadingState}
              isClearable={isClearable}
              isDisabled={isDisabled}
              selectedOptions={selectedComboOptions}
              onChange={handleValuesChange}
              onSearchChange={handleSearchChange}
              onCreateOption={handleCreateOption}
              isInvalid={selectedField != null && error != null}
              onFocus={setIsTouchedValue}
              data-test-subj="valuesAutocompleteMatchAnyNumber"
              aria-label={ariaLabel}
              fullWidth
            />
          </EuiFormRow>
        );
      default:
        return defaultInput;
    }
  }

  return defaultInput;
};

AutocompleteFieldMatchAnyComponent.displayName = 'AutocompleteFieldMatchAny';
