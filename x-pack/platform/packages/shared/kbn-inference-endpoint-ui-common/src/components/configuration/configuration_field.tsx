/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect, useState } from 'react';

import type { EuiComboBoxOptionOption, EuiSwitchEvent } from '@elastic/eui';
import {
  EuiAccordion,
  EuiButton,
  EuiButtonIcon,
  EuiComboBox,
  EuiFieldText,
  EuiFieldPassword,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormControlLayout,
  EuiFormRow,
  EuiSwitch,
  EuiTextArea,
  EuiFieldNumber,
  EuiToolTip,
} from '@elastic/eui';

import { isEmpty } from 'lodash/fp';
import {
  FieldType,
  isStringArray,
  type ConfigEntryView,
  type ConfigValue,
  type Map,
} from '../../types/types';
import {
  ADD_LABEL,
  DELETE_LABEL,
  HEADERS_KEY_LABEL,
  HEADERS_VALUE_LABEL,
  ADD_HEADERS_SWITCH_LABEL,
  VIEW_HEADERS_SWITCH_LABEL,
  HIDE_HEADERS_SWITCH_LABEL,
  HEADERS_DUPLICATE_KEY_MESSAGE,
  LIST_FIELD_PLACEHOLDER,
} from '../../translations';
import { ensureBooleanType, ensureCorrectTyping, ensureStringType } from './configuration_utils';

interface ConfigurationFieldProps {
  configEntry: ConfigEntryView;
  isLoading: boolean;
  setConfigValue: (value: ConfigValue) => void;
  isEdit?: boolean;
  isPreconfigured?: boolean;
}

interface ConfigInputFieldProps {
  configEntry: ConfigEntryView;
  isLoading: boolean;
  validateAndSetConfigValue: (value: ConfigValue) => void;
  isEdit?: boolean;
  isPreconfigured?: boolean;
}

const KEY_INDEX = 0;
const VALUE_INDEX = 1;

export const ConfigInputField: React.FC<ConfigInputFieldProps> = ({
  configEntry,
  isLoading,
  validateAndSetConfigValue,
  isEdit,
}) => {
  const { isValid, value, default_value: defaultValue, key, updatable } = configEntry;
  const [innerValue, setInnerValue] = useState(
    !value || value.toString().length === 0 ? defaultValue : value
  );

  useEffect(() => {
    // Only sync from external value if it has actual content
    // Don't reset to default when user clears the field (value becomes null)
    if (value != null && String(value).length > 0) {
      setInnerValue(value);
    }
  }, [value]);
  return (
    <EuiFieldText
      disabled={isLoading || (isEdit && !updatable)}
      data-test-subj={`${key}-input`}
      fullWidth
      value={ensureStringType(innerValue)}
      isInvalid={!isValid}
      onChange={(event) => {
        setInnerValue(event.target.value);
        validateAndSetConfigValue(event.target.value);
      }}
    />
  );
};

export const ConfigSwitchField: React.FC<ConfigInputFieldProps> = ({
  configEntry,
  isLoading,
  validateAndSetConfigValue,
}) => {
  const { label, value, default_value: defaultValue, key } = configEntry;
  const [innerValue, setInnerValue] = useState(value ?? defaultValue);
  useEffect(() => {
    setInnerValue(value ?? defaultValue);
  }, [defaultValue, value]);
  return (
    <EuiSwitch
      checked={ensureBooleanType(innerValue)}
      data-test-subj={`${key}-switch`}
      disabled={isLoading}
      label={<p>{label}</p>}
      onChange={(event) => {
        setInnerValue(event.target.checked);
        validateAndSetConfigValue(event.target.checked);
      }}
    />
  );
};

export const ConfigInputTextArea: React.FC<ConfigInputFieldProps> = ({
  isLoading,
  configEntry,
  validateAndSetConfigValue,
  isEdit,
}) => {
  const { isValid, value, default_value: defaultValue, key, updatable } = configEntry;
  const [innerValue, setInnerValue] = useState(value ?? defaultValue);
  useEffect(() => {
    setInnerValue(value ?? '');
  }, [defaultValue, value]);
  return (
    <EuiTextArea
      disabled={isLoading || (isEdit && !updatable)}
      fullWidth
      data-test-subj={`${key}-textarea`}
      value={ensureStringType(innerValue)}
      isInvalid={!isValid}
      onChange={(event) => {
        setInnerValue(event.target.value);
        validateAndSetConfigValue(event.target.value);
      }}
    />
  );
};

export const ConfigNumberField: React.FC<ConfigInputFieldProps> = ({
  configEntry,
  isLoading,
  validateAndSetConfigValue,
  isEdit,
  isPreconfigured,
}) => {
  const { isValid, value, default_value: defaultValue, key, updatable } = configEntry;
  const [innerValue, setInnerValue] = useState(value ?? defaultValue);
  useEffect(() => {
    // Only sync from external value if it has actual content
    // Don't reset to default when user clears the field (value becomes null)
    if (value != null && String(value).length > 0) {
      setInnerValue(value);
    }
  }, [value]);
  return (
    <EuiFormControlLayout
      isDisabled={isLoading || (isEdit && !updatable) || isPreconfigured}
      fullWidth
      clear={{
        onClick: (e) => {
          validateAndSetConfigValue('');
          setInnerValue('');
        },
      }}
    >
      <EuiFieldNumber
        min={0}
        fullWidth
        disabled={isLoading || (isEdit && !updatable) || isPreconfigured}
        data-test-subj={`${key}-number`}
        value={innerValue as number}
        isInvalid={!isValid}
        onChange={(event) => {
          const newValue = isEmpty(event.target.value) ? '0' : event.target.value;
          setInnerValue(newValue);
          validateAndSetConfigValue(newValue);
        }}
      />
    </EuiFormControlLayout>
  );
};

export const ConfigSensitiveTextArea: React.FC<ConfigInputFieldProps> = ({
  isLoading,
  configEntry,
  validateAndSetConfigValue,
}) => {
  const { key, label } = configEntry;
  return (
    <EuiAccordion id={key + '-accordion'} buttonContent={<p>{label}</p>}>
      <ConfigInputTextArea
        isLoading={isLoading}
        configEntry={configEntry}
        validateAndSetConfigValue={validateAndSetConfigValue}
      />
    </EuiAccordion>
  );
};

export const ConfigInputPassword: React.FC<ConfigInputFieldProps> = ({
  isLoading,
  configEntry,
  validateAndSetConfigValue,
}) => {
  const { value, key } = configEntry;
  const [innerValue, setInnerValue] = useState(value ?? null);
  useEffect(() => {
    setInnerValue(value ?? null);
  }, [value]);
  return (
    <>
      <EuiFieldPassword
        fullWidth
        disabled={isLoading}
        data-test-subj={`${key}-password`}
        type="dual"
        value={ensureStringType(innerValue)}
        onChange={(event) => {
          setInnerValue(event.target.value);
          validateAndSetConfigValue(event.target.value);
        }}
      />
    </>
  );
};

const emptyHeaders: Map = { '': '' };
const emptyHeadersList: Array<[string, string]> = [['', '']];

function getInitialHeadersList(
  value: ConfigValue,
  defaultValue: ConfigValue
): Array<[string, string]> {
  try {
    const headersObj =
      value && Object.keys(value).length > 0
        ? value
        : defaultValue && Object.keys(defaultValue).length > 0
        ? defaultValue
        : emptyHeaders;
    const headersList: Array<[string, string]> = Object.entries(headersObj as Map);
    return headersList.length > 0 ? headersList : emptyHeadersList;
  } catch (e) {
    return emptyHeadersList;
  }
}

const checkForDuplicateKeys = (headersList: string[][]) =>
  headersList.some((header, index) => {
    return (
      header[KEY_INDEX] !== '' &&
      headersList.findIndex((h) => h[KEY_INDEX] === header[KEY_INDEX]) !== index
    );
  });

export const ConfigInputMapField: React.FC<ConfigInputFieldProps> = ({
  configEntry,
  isLoading,
  validateAndSetConfigValue,
  isEdit = false,
}) => {
  const { isValid, value, default_value: defaultValue, key, updatable } = configEntry;
  const [showHeaderInputs, setShowHeaderInputs] = useState<boolean>(false);
  const [headersList, setHeadersList] = useState<string[][]>(
    getInitialHeadersList(value, defaultValue)
  );
  const [errorMessage, setErrorMessage] = useState<string | undefined>();

  const onChange = (e: EuiSwitchEvent) => {
    setShowHeaderInputs(e.target.checked);
  };

  const handleHeaderChange = (
    e: React.ChangeEvent<HTMLInputElement>,
    headerIndex: number,
    elementIndex: number
  ) => {
    const newValue = e.target.value;
    setHeadersList((prevHeadersList) =>
      prevHeadersList.map((header, i) =>
        i === headerIndex ? header.map((cell, j) => (j === elementIndex ? newValue : cell)) : header
      )
    );
  };

  const onBlur = () => {
    // Check for duplicate keys
    const hasDuplicateKeys = checkForDuplicateKeys(headersList);

    if (hasDuplicateKeys) {
      setErrorMessage(HEADERS_DUPLICATE_KEY_MESSAGE);
    }

    if (!hasDuplicateKeys && errorMessage) {
      setErrorMessage(undefined);
    }

    const isEmptyHeadersList =
      headersList.length === 1 && headersList[0][0] === '' && headersList[0][1] === '';
    // Update the config value when user is done typing - only if the headers list is not empty
    if (!isEmptyHeadersList && !hasDuplicateKeys) {
      const headersObj = Object.fromEntries(headersList);
      validateAndSetConfigValue(headersObj);
    }
  };

  return (
    <>
      <EuiFlexGroup direction="column" gutterSize="s" data-test-subj={'config-field-map-type'}>
        <EuiFlexItem grow={false}>
          <EuiFormRow error={errorMessage} isInvalid={!!errorMessage}>
            <EuiSwitch
              data-test-subj={`${key}-switch-${showHeaderInputs ? 'checked' : 'unchecked'}`}
              label={
                showHeaderInputs
                  ? HIDE_HEADERS_SWITCH_LABEL
                  : isEdit
                  ? VIEW_HEADERS_SWITCH_LABEL
                  : ADD_HEADERS_SWITCH_LABEL
              }
              checked={showHeaderInputs}
              onChange={(e) => onChange(e)}
            />
          </EuiFormRow>
        </EuiFlexItem>
        {showHeaderInputs
          ? headersList.map((header, index) => (
              <EuiFlexItem key={`${key}-header-${index}`}>
                <EuiFlexGroup gutterSize="s" alignItems="center">
                  <EuiFlexItem>
                    <EuiFormRow label={HEADERS_KEY_LABEL}>
                      <EuiFieldText
                        onBlur={onBlur}
                        data-test-subj={`${key}-key-${index}`}
                        isInvalid={!isValid}
                        disabled={isLoading || (isEdit && !updatable)}
                        value={header[0]}
                        onChange={(e) => {
                          handleHeaderChange(e, index, KEY_INDEX);
                        }}
                        aria-label={HEADERS_KEY_LABEL}
                      />
                    </EuiFormRow>
                  </EuiFlexItem>
                  <EuiFlexItem>
                    <EuiFormRow label={HEADERS_VALUE_LABEL}>
                      <EuiFieldText
                        onBlur={onBlur}
                        data-test-subj={`${key}-value-${index}`}
                        disabled={isLoading || (isEdit && !updatable)}
                        value={header[1]}
                        onChange={(e) => {
                          handleHeaderChange(e, index, VALUE_INDEX);
                        }}
                        aria-label={HEADERS_VALUE_LABEL}
                      />
                    </EuiFormRow>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiToolTip content={DELETE_LABEL} disableScreenReaderOutput>
                      <EuiButtonIcon
                        disabled={isLoading || (isEdit && !updatable)}
                        display="base"
                        color="danger"
                        css={{ marginTop: '22px' }}
                        onClick={() => {
                          const newHeaders = headersList.toSpliced(index, 1);
                          const hasDuplicateKeys = checkForDuplicateKeys(newHeaders);
                          const headersObj = Object.fromEntries(newHeaders);
                          if (!hasDuplicateKeys && errorMessage) {
                            setErrorMessage(undefined);
                          }
                          setHeadersList(newHeaders);
                          validateAndSetConfigValue(
                            Object.keys(headersObj).length > 0 ? headersObj : ''
                          );
                        }}
                        iconType="minusCircle"
                        aria-label={DELETE_LABEL}
                        data-test-subj={`${key}-delete-button-${index}`}
                      />
                    </EuiToolTip>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </EuiFlexItem>
            ))
          : null}
        <EuiFlexItem grow={false}>
          <span>
            <EuiButton
              size="s"
              disabled={
                !showHeaderInputs ||
                isLoading ||
                (isEdit && !updatable) ||
                (!isEdit &&
                  headersList.length === 1 &&
                  (headersList[0][0] === '' || headersList[0][1] === ''))
              }
              iconType="plusCircle"
              onClick={() => {
                const newHeaders = [...headersList, ['', '']];
                setHeadersList(newHeaders);
              }}
              data-test-subj={`${key}-add-button`}
              aria-label={ADD_LABEL}
            >
              {ADD_LABEL}
            </EuiButton>
          </span>
        </EuiFlexItem>
      </EuiFlexGroup>
    </>
  );
};

const toSelectedOptions = (items: string[]): Array<EuiComboBoxOptionOption<string>> =>
  items.map((label) => ({ label }));

const getListValues = (
  value: ConfigEntryView['value'],
  defaultValue: ConfigEntryView['default_value']
): string[] => {
  if (isStringArray(value)) {
    return value;
  }
  if (isStringArray(defaultValue)) {
    return defaultValue;
  }
  return [];
};

export const ConfigInputListField: React.FC<ConfigInputFieldProps> = ({
  isEdit,
  isLoading,
  configEntry,
  validateAndSetConfigValue,
}) => {
  const { isValid, value, default_value: defaultValue, key, updatable, label } = configEntry;
  const [listValues, setListValues] = useState<string[]>(() => getListValues(value, defaultValue));

  useEffect(() => {
    if (isStringArray(value)) {
      setListValues(value);
    }
  }, [value]);

  const emitValues = (items: string[]) => {
    setListValues(items);
    validateAndSetConfigValue(items.length > 0 ? items : null);
  };

  return (
    <EuiComboBox
      aria-label={label}
      placeholder={LIST_FIELD_PLACEHOLDER}
      noSuggestions
      selectedOptions={toSelectedOptions(listValues)}
      onCreateOption={(searchValue) => {
        const trimmed = searchValue.trim();
        if (trimmed.length === 0) {
          return false;
        }
        if (listValues.includes(trimmed)) {
          return false;
        }
        emitValues([...listValues, trimmed]);
      }}
      onChange={(options) => {
        emitValues(options.map((option) => option.label));
      }}
      isClearable
      isInvalid={!isValid}
      isDisabled={isLoading || (isEdit && !updatable)}
      fullWidth
      data-test-subj={`${key}-list`}
    />
  );
};

export const ConfigurationField: React.FC<ConfigurationFieldProps> = ({
  configEntry,
  isLoading,
  setConfigValue,
  isEdit,
  isPreconfigured,
}) => {
  const validateAndSetConfigValue = (value: ConfigValue) => {
    setConfigValue(
      configEntry.type === FieldType.STRING && value === ''
        ? null
        : ensureCorrectTyping(configEntry.type, value)
    );
  };

  const { key, type, sensitive } = configEntry;

  switch (type) {
    case FieldType.INTEGER:
      return (
        <ConfigNumberField
          key={key}
          isLoading={isLoading}
          configEntry={configEntry}
          validateAndSetConfigValue={validateAndSetConfigValue}
          isEdit={isEdit}
          isPreconfigured={isPreconfigured}
        />
      );

    case FieldType.BOOLEAN:
      return (
        <ConfigSwitchField
          isLoading={isLoading}
          configEntry={configEntry}
          validateAndSetConfigValue={validateAndSetConfigValue}
        />
      );

    case FieldType.MAP:
      return (
        <ConfigInputMapField
          isEdit={isEdit}
          isLoading={isLoading}
          configEntry={configEntry}
          validateAndSetConfigValue={validateAndSetConfigValue}
        />
      );

    case FieldType.LIST:
      return (
        <ConfigInputListField
          key={key}
          isEdit={isEdit}
          isLoading={isLoading}
          configEntry={configEntry}
          validateAndSetConfigValue={validateAndSetConfigValue}
        />
      );

    default:
      return sensitive ? (
        <ConfigInputPassword
          isLoading={isLoading}
          configEntry={configEntry}
          validateAndSetConfigValue={validateAndSetConfigValue}
        />
      ) : (
        <ConfigInputField
          key={key}
          isLoading={isLoading}
          configEntry={configEntry}
          validateAndSetConfigValue={validateAndSetConfigValue}
          isEdit={isEdit}
        />
      );
  }
};
