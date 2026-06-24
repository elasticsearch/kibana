/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElementType } from 'react';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { FormattedMessage } from '@kbn/i18n-react';
import {
  EuiAccordion,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiIcon,
  EuiIconTip,
  EuiSpacer,
  EuiText,
  useEuiPaddingSize,
} from '@elastic/eui';
import styled from '@emotion/styled';
import type {
  ExceptionListType,
  ListSchema,
  OsTypeArray,
} from '@kbn/securitysolution-io-ts-list-types';
import {
  ExceptionListTypeEnum,
  ListOperatorTypeEnum as OperatorTypeEnum,
} from '@kbn/securitysolution-io-ts-list-types';
import type {
  BuilderEntry,
  DataViewField,
  FormattedBuilderEntry,
  OperatorOption,
} from '@kbn/securitysolution-list-utils';
import {
  EXCEPTION_OPERATORS_ONLY_LISTS,
  fieldSupportsMatches,
  getEntryOnFieldChange,
  getEntryOnListChange,
  getEntryOnMatchAnyChange,
  getEntryOnMatchChange,
  getEntryOnOperatorChange,
  getEntryOnWildcardChange,
  getFilteredIndexPatterns,
  getMappingConflictsInfo,
  getOperatorOptions,
} from '@kbn/securitysolution-list-utils';
import {
  AutocompleteFieldExistsComponent,
  AutocompleteFieldListsComponent,
  AutocompleteFieldMatchAnyComponent,
  AutocompleteFieldMatchComponent,
  AutocompleteFieldWildcardComponent,
  EsFieldSelector,
  OperatorComponent,
} from '@kbn/securitysolution-autocomplete';
import {
  OperatingSystem,
  WILDCARD_WARNING,
  validatePotentialWildcardInput,
} from '@kbn/securitysolution-utils';
import type { DataViewBase, DataViewFieldBase } from '@kbn/es-query';
import type { AutocompleteStart } from '@kbn/kql/public';
import type { HttpStart } from '@kbn/core/public';

import { getEmptyValue } from '../../../common/empty_value';

import * as i18n from './translations';
import type { EntryFieldError } from './reducer';

const FieldFlexItem = styled(EuiFlexItem)`
  overflow: hidden;
`;

export interface EntryItemProps {
  allowLargeValueLists?: boolean;
  autocompleteService: AutocompleteStart;
  entry: FormattedBuilderEntry;
  httpService: HttpStart;
  indexPattern: DataViewBase;
  showLabel: boolean;
  osTypes?: OsTypeArray;
  listType: ExceptionListType;
  onChange: (arg: BuilderEntry, i: number) => void;
  onlyShowListOperators?: boolean;
  setErrorsExist: (arg: EntryFieldError) => void;
  setWarningsExist: (arg: boolean) => void;
  exceptionItemIndex: number;
  isDisabled?: boolean;
  operatorsList?: OperatorOption[];
  allowCustomOptions?: boolean;
  getExtendedFields?: (fields: string[]) => Promise<DataViewField[]>;
  showValueListModal: ElementType;
}

export const BuilderEntryItem: React.FC<EntryItemProps> = ({
  allowLargeValueLists = false,
  autocompleteService,
  entry,
  httpService,
  indexPattern,
  osTypes,
  listType,
  onChange,
  onlyShowListOperators = false,
  setErrorsExist,
  setWarningsExist,
  showLabel,
  isDisabled = false,
  operatorsList,
  allowCustomOptions = false,
  getExtendedFields,
  exceptionItemIndex,
  showValueListModal,
}): JSX.Element => {
  const sPaddingSize = useEuiPaddingSize('s');

  const handleError = useCallback(
    (err: boolean): void => {
      setErrorsExist({ [entry.id]: err });
    },
    [setErrorsExist, entry.id]
  );
  const handleWarning = useCallback(
    (warn: boolean): void => {
      setWarningsExist(warn);
    },
    [setWarningsExist]
  );

  const handleFieldChange = useCallback(
    ([newField]: DataViewFieldBase[]): void => {
      const { updatedEntry, index } = getEntryOnFieldChange(entry, newField);
      onChange(updatedEntry, index);
    },
    [onChange, entry]
  );

  const handleOperatorChange = useCallback(
    ([newOperator]: OperatorOption[]): void => {
      const { updatedEntry, index } = getEntryOnOperatorChange(entry, newOperator);
      handleError(false);
      handleWarning(false);
      onChange(updatedEntry, index);
    },
    [onChange, entry, handleError, handleWarning]
  );

  const handleFieldMatchValueChange = useCallback(
    (newField: string): void => {
      const { updatedEntry, index } = getEntryOnMatchChange(entry, newField);

      onChange(updatedEntry, index);
    },
    [onChange, entry]
  );

  const handleFieldMatchAnyValueChange = useCallback(
    (newField: string[]): void => {
      const { updatedEntry, index } = getEntryOnMatchAnyChange(entry, newField);

      onChange(updatedEntry, index);
    },
    [onChange, entry]
  );

  const handleFieldWildcardValueChange = useCallback(
    (newField: string): void => {
      const { updatedEntry, index } = getEntryOnWildcardChange(entry, newField);

      onChange(updatedEntry, index);
    },
    [onChange, entry]
  );

  const handleFieldListValueChange = useCallback(
    (newField: ListSchema): void => {
      const { updatedEntry, index } = getEntryOnListChange(entry, newField);

      onChange(updatedEntry, index);
    },
    [onChange, entry]
  );

  const [extendedField, setExtendedField] = useState<DataViewField | null>(null);
  useEffect(() => {
    if (!entry.field?.name) {
      setExtendedField(null);
    }
    const fetchExtendedField = async (): Promise<void> => {
      const fieldName = entry.field?.name;
      if (getExtendedFields && fieldName) {
        const extendedFields = await getExtendedFields([fieldName]);
        const field = extendedFields.find((f) => f.name === fieldName) ?? null;
        setExtendedField(field);
      }
    };
    fetchExtendedField();
  }, [entry.field?.name, getExtendedFields]);

  const isFieldComponentDisabled = useMemo(
    (): boolean =>
      isDisabled ||
      (!allowCustomOptions &&
        (indexPattern == null || (indexPattern != null && indexPattern.fields.length === 0))),
    [isDisabled, indexPattern, allowCustomOptions]
  );

  const renderFieldInput = useCallback(
    (isFirst: boolean): JSX.Element => {
      const filteredIndexPatterns = getFilteredIndexPatterns(indexPattern, entry);
      const comboBox = (
        <EsFieldSelector
          placeholder={
            entry.nested != null
              ? i18n.EXCEPTION_FIELD_NESTED_PLACEHOLDER
              : i18n.EXCEPTION_FIELD_PLACEHOLDER
          }
          indexPattern={filteredIndexPatterns}
          selectedField={entry.field}
          aria-label={i18n.EXCEPTION_ITEM_ARIA_LABEL(
            i18n.FIELD,
            exceptionItemIndex,
            entry.entryIndex
          )}
          isClearable={true}
          isLoading={false}
          isDisabled={isDisabled || indexPattern == null}
          onChange={handleFieldChange}
          acceptsCustomOptions={entry.nested == null && allowCustomOptions}
          data-test-subj="exceptionBuilderEntryField"
          showMappingConflicts={true}
        />
      );

      const warningIconCss = { marginRight: `${sPaddingSize}` };
      const getMappingConflictsWarning = (): React.ReactNode | null => {
        if (!extendedField) {
          return null;
        }
        const conflictsInfo = getMappingConflictsInfo(extendedField);
        if (!conflictsInfo) {
          return null;
        }
        return (
          <>
            <EuiSpacer size="s" />
            <EuiAccordion
              id={`${entry.id}`}
              buttonContent={
                <>
                  <EuiIcon
                    data-test-subj="mappingConflictsAccordionIcon"
                    type="warning"
                    size="s"
                    css={warningIconCss}
                    aria-hidden={true}
                  />
                  {i18n.FIELD_CONFLICT_INDICES_WARNING_DESCRIPTION}
                </>
              }
              arrowDisplay="none"
              data-test-subj="mappingConflictsAccordion"
            >
              <div data-test-subj="mappingConflictsDescription">
                {conflictsInfo.map((info, idx) => {
                  const groupDetails = info.groupedIndices.map(
                    ({ name, count }) =>
                      `${count > 1 ? i18n.CONFLICT_MULTIPLE_INDEX_DESCRIPTION(name, count) : name}`
                  );
                  return (
                    <EuiFlexItem key={`${idx}`}>
                      <EuiSpacer size="s" />
                      {`${
                        info.totalIndexCount > 1
                          ? i18n.CONFLICT_MULTIPLE_INDEX_DESCRIPTION(
                              info.type,
                              info.totalIndexCount
                            )
                          : info.type
                      }: ${groupDetails.join(', ')}`}
                    </EuiFlexItem>
                  );
                })}
                <EuiSpacer size="s" />
              </div>
            </EuiAccordion>
          </>
        );
      };

      const customOptionText =
        entry.nested == null && allowCustomOptions ? i18n.CUSTOM_COMBOBOX_OPTION_TEXT : undefined;

      const helpText =
        extendedField?.conflictDescriptions == null ? (
          customOptionText
        ) : (
          <>
            {customOptionText}
            {getMappingConflictsWarning()}
          </>
        );
      return (
        <EuiFormRow
          fullWidth
          label={isFirst ? i18n.FIELD : ''}
          helpText={helpText}
          data-test-subj="exceptionBuilderEntryFieldFormRow"
        >
          {comboBox}
        </EuiFormRow>
      );
    },
    [
      indexPattern,
      entry,
      exceptionItemIndex,
      isDisabled,
      handleFieldChange,
      allowCustomOptions,
      sPaddingSize,
      extendedField,
    ]
  );

  const renderOperatorInput = (isFirst: boolean): JSX.Element => {
    // Extra operators for wildcards will be removed if the field does not support matches
    const doesFieldSupportMatches = entry.field !== undefined && fieldSupportsMatches(entry.field);
    const isEventFilterList = listType === ExceptionListTypeEnum.ENDPOINT_EVENTS;
    const isTrustedAppsList = listType === ExceptionListTypeEnum.ENDPOINT_TRUSTED_APPS;

    const augmentedOperatorsList =
      operatorsList && doesFieldSupportMatches && (isEventFilterList || isTrustedAppsList)
        ? operatorsList
        : operatorsList?.filter((operator) => operator.type !== OperatorTypeEnum.WILDCARD);

    const operatorOptions = augmentedOperatorsList
      ? augmentedOperatorsList
      : onlyShowListOperators
      ? EXCEPTION_OPERATORS_ONLY_LISTS
      : getOperatorOptions(
          entry,
          listType,
          entry.field != null && entry.field.type === 'boolean',
          isFirst
        );

    const comboBox = (
      <OperatorComponent
        placeholder={i18n.EXCEPTION_OPERATOR_PLACEHOLDER}
        selectedField={entry.field}
        operator={entry.operator}
        isDisabled={isFieldComponentDisabled}
        operatorOptions={operatorOptions}
        isLoading={false}
        isClearable={false}
        onChange={handleOperatorChange}
        aria-label={i18n.EXCEPTION_ITEM_ARIA_LABEL(
          i18n.OPERATOR,
          exceptionItemIndex,
          entry.entryIndex
        )}
        data-test-subj="exceptionBuilderEntryOperator"
      />
    );

    if (isFirst) {
      return (
        <EuiFormRow label={i18n.OPERATOR} data-test-subj="exceptionBuilderEntryFieldFormRow">
          {comboBox}
        </EuiFormRow>
      );
    } else {
      return (
        <EuiFormRow label={''} data-test-subj="exceptionBuilderEntryFieldFormRow">
          {comboBox}
        </EuiFormRow>
      );
    }
  };

  // show warning when a wildcard is detected with the IS operator
  const getWildcardWithIsOperatorWarning = (): React.ReactNode => {
    return (
      <EuiText size="xs">
        <FormattedMessage
          id="xpack.lists.exceptions.builder.exceptionIsOperator.warningMessage.incorrectWildCardUsage"
          defaultMessage="Change the operator to 'matches' to ensure wildcards run properly."
        />{' '}
        <EuiIconTip type="info" content={i18n.WILDCARD_WITH_IS_OPERATOR_TOOLTIP} />
      </EuiText>
    );
  };

  // show this when wildcard with matches operator
  const getWildcardPerformanceWarningInfo = (precedingWarning: string): React.ReactNode => {
    return (
      <p>
        {precedingWarning}{' '}
        <EuiIconTip
          type="info"
          content={
            <FormattedMessage
              id="xpack.lists.exceptions.builder.exceptionMatchesOperator.warningMessage.wildcardInFilepath"
              defaultMessage="To make a more efficient event filter, use multiple conditions and make them as specific as possible when using wildcards in the values. For instance, adding a process.name or file.name field. Creating event filters with both `matches` and `does not match` operators may significantly decrease performance."
            />
          }
          size="m"
        />
      </p>
    );
  };

  // eslint-disable-next-line complexity
  const getFieldValueComboBox = (type: OperatorTypeEnum, isFirst: boolean): JSX.Element => {
    const ariaLabel = i18n.EXCEPTION_ITEM_ARIA_LABEL(
      i18n.VALUE,
      exceptionItemIndex,
      entry.entryIndex
    );

    switch (type) {
      case OperatorTypeEnum.MATCH:
        const value = typeof entry.value === 'string' ? entry.value : undefined;
        const fieldMatchWarning = /[*?]/.test(value ?? '')
          ? getWildcardWithIsOperatorWarning()
          : undefined;
        return (
          <AutocompleteFieldMatchComponent
            autocompleteService={autocompleteService}
            rowLabel={isFirst ? i18n.VALUE : undefined}
            placeholder={i18n.EXCEPTION_FIELD_VALUE_PLACEHOLDER}
            selectedField={entry.correspondingKeywordField ?? entry.field}
            selectedValue={value}
            isDisabled={isFieldComponentDisabled}
            isLoading={false}
            isClearable={false}
            indexPattern={indexPattern}
            onError={handleError}
            onWarning={handleWarning}
            warning={fieldMatchWarning}
            onChange={handleFieldMatchValueChange}
            isRequired
            data-test-subj="exceptionBuilderEntryFieldMatch"
            aria-label={ariaLabel}
          />
        );
      case OperatorTypeEnum.MATCH_ANY:
        const values: string[] = Array.isArray(entry.value) ? entry.value : [];
        return (
          <AutocompleteFieldMatchAnyComponent
            autocompleteService={autocompleteService}
            rowLabel={isFirst ? i18n.VALUE : undefined}
            placeholder={i18n.EXCEPTION_FIELD_VALUE_PLACEHOLDER}
            selectedField={
              entry.correspondingKeywordField != null
                ? entry.correspondingKeywordField
                : entry.field
            }
            selectedValue={values}
            isDisabled={isFieldComponentDisabled}
            isLoading={false}
            isClearable={false}
            indexPattern={indexPattern}
            onError={handleError}
            onChange={handleFieldMatchAnyValueChange}
            isRequired
            aria-label={ariaLabel}
            data-test-subj="exceptionBuilderEntryFieldMatchAny"
          />
        );
      case OperatorTypeEnum.WILDCARD:
        const wildcardValue = typeof entry.value === 'string' ? entry.value : undefined;
        let actualWarning: React.ReactNode | string | undefined;
        if (listType !== 'detection' && listType !== 'rule_default') {
          let os: OperatingSystem = OperatingSystem.WINDOWS;
          if (osTypes) {
            [os] = osTypes as OperatingSystem[];
          }
          const warning = validatePotentialWildcardInput({
            field: entry.field?.name,
            os,
            value: wildcardValue,
          });
          actualWarning =
            warning === WILDCARD_WARNING ? getWildcardPerformanceWarningInfo(warning) : warning;
        }

        return (
          <AutocompleteFieldWildcardComponent
            autocompleteService={autocompleteService}
            data-test-subj="exceptionBuilderEntryFieldWildcard"
            isRequired
            isDisabled={isFieldComponentDisabled}
            isLoading={false}
            isClearable={false}
            indexPattern={indexPattern}
            onError={handleError}
            onChange={handleFieldWildcardValueChange}
            onWarning={handleWarning}
            warning={actualWarning}
            placeholder={i18n.EXCEPTION_FIELD_VALUE_PLACEHOLDER}
            rowLabel={isFirst ? i18n.VALUE : undefined}
            selectedField={entry.correspondingKeywordField ?? entry.field}
            selectedValue={wildcardValue}
            aria-label={ariaLabel}
          />
        );
      case OperatorTypeEnum.LIST:
        const id = typeof entry.value === 'string' ? entry.value : undefined;
        return (
          <AutocompleteFieldListsComponent
            httpService={httpService}
            rowLabel={isFirst ? i18n.VALUE : undefined}
            selectedField={entry.field}
            placeholder={i18n.EXCEPTION_FIELD_LISTS_PLACEHOLDER}
            selectedValue={id}
            isLoading={false}
            isDisabled={isFieldComponentDisabled}
            isClearable={false}
            onChange={handleFieldListValueChange}
            data-test-subj="exceptionBuilderEntryFieldList"
            allowLargeValueLists={allowLargeValueLists}
            aria-label={ariaLabel}
            showValueListModal={showValueListModal}
          />
        );
      case OperatorTypeEnum.EXISTS:
        return (
          <AutocompleteFieldExistsComponent
            rowLabel={isFirst ? i18n.VALUE : undefined}
            placeholder={getEmptyValue()}
            data-test-subj="exceptionBuilderEntryFieldExists"
            aria-label={ariaLabel}
          />
        );
      default:
        return <></>;
    }
  };

  const renderFieldValueInput = (isFirst: boolean, entryType: OperatorTypeEnum): JSX.Element =>
    getFieldValueComboBox(entryType, isFirst);

  return (
    <EuiFlexGroup
      direction="row"
      gutterSize="s"
      alignItems="flexStart"
      className="exceptionItemEntryContainer"
      data-test-subj="exceptionItemEntryContainer"
    >
      <FieldFlexItem grow={4}>{renderFieldInput(showLabel)}</FieldFlexItem>
      <EuiFlexItem grow={false}>{renderOperatorInput(showLabel)}</EuiFlexItem>
      <FieldFlexItem grow={5}>
        {renderFieldValueInput(
          showLabel,
          entry.nested === 'parent' ? OperatorTypeEnum.EXISTS : entry.operator.type
        )}
      </FieldFlexItem>
    </EuiFlexGroup>
  );
};

BuilderEntryItem.displayName = 'BuilderEntryItem';
