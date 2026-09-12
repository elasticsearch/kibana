/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ChangeEventHandler } from 'react';
import React, { memo, useCallback, useMemo, useState } from 'react';
import styled from '@emotion/styled';
import { i18n } from '@kbn/i18n';
import type { EuiSuperSelectOption, EuiSuperSelectProps } from '@elastic/eui';
import {
  EuiButtonIcon,
  EuiFieldText,
  EuiFormRow,
  EuiSuperSelect,
  EuiText,
  EuiToolTip,
  useGeneratedHtmlId,
} from '@elastic/eui';
import type { TrustedAppEntryTypes } from '@kbn/securitysolution-utils';
import { ConditionEntryField, OperatingSystem } from '@kbn/securitysolution-utils';
import type { TrustedAppConditionEntry } from '../../../../../../../common/endpoint/types';
import { OperatorFieldIds } from '../../../../../../../common/endpoint/types';

import {
  CONDITION_FIELD_DESCRIPTION,
  CONDITION_FIELD_TITLE,
  ENTRY_PROPERTY_TITLES,
  OPERATOR_TITLES,
} from '../../translations';
import { useTestIdGenerator } from '../../../../../hooks/use_test_id_generator';
import { getPlaceholderTextByOSType } from '../../../../../../../common/utils/path_placeholder';

const ConditionEntryCell = memo<{
  showLabel: boolean;
  label?: string;
  /** Ids of external elements describing the field; applied via `EuiFormRow` when labelled. */
  describedByIds?: string[];
  children: React.ReactElement;
}>(({ showLabel, label = '', describedByIds, children }) => {
  if (showLabel) {
    return (
      <EuiFormRow label={label} fullWidth describedByIds={describedByIds}>
        {children}
      </EuiFormRow>
    );
  }

  return describedByIds?.length
    ? React.cloneElement(children, { 'aria-describedby': describedByIds.join(' ') })
    : children;
});

ConditionEntryCell.displayName = 'ConditionEntryCell';

export interface ConditionEntryInputProps {
  os: OperatingSystem;
  entry: TrustedAppConditionEntry;
  /** controls if remove button is enabled/disabled */
  isRemoveDisabled?: boolean;
  /** If the labels for each Column in the input row should be shown. Normally set on the first row entry */
  showLabels: boolean;
  onRemove: (entry: TrustedAppConditionEntry) => void;
  onChange: (newEntry: TrustedAppConditionEntry, oldEntry: TrustedAppConditionEntry) => void;
  /**
   * invoked when at least one field in the entry was visited (triggered when `onBlur` DOM event is dispatched)
   * For this component, that will be triggered only when the `value` field is visited, since that is the
   * only one needs user input.
   */
  onVisited?: (entry: TrustedAppConditionEntry) => void;
  validation?: {
    errors: React.ReactNode[];
    warnings: React.ReactNode[];
    requiredError?: React.ReactNode;
  };
  showRequiredError?: boolean;
  'data-test-subj'?: string;
}

// adding a style prop on EuiFlexGroup works only partially
// and for some odd reason garbles up gridTemplateAreas entry
const InputGroup = styled.div`
  display: grid;
  grid-template-columns: 25% 25% 45% 5%;
  grid-template-areas:
    'field operator value remove'
    '. . feedback .';
  align-items: center;
`;

const InputItem = styled.div<{ gridArea: string }>`
  grid-area: ${({ gridArea }) => gridArea};
  margin-right: ${(props) => props.theme.euiTheme.size.s};
  vertical-align: baseline;
`;

const ValueFeedback = styled.div`
  margin-top: ${({ theme }) => theme.euiTheme.size.xs};
`;

const operatorOptions = (Object.keys(OperatorFieldIds) as OperatorFieldIds[]).map(
  (value): EuiSuperSelectOption<TrustedAppEntryTypes> => ({
    dropdownDisplay: OPERATOR_TITLES[value],
    inputDisplay: OPERATOR_TITLES[value],
    value: value === 'matches' ? 'wildcard' : 'match',
  })
);

export const ConditionEntryInput = memo<ConditionEntryInputProps>(
  ({
    os,
    entry,
    showLabels = false,
    onRemove,
    onChange,
    isRemoveDisabled = false,
    onVisited,
    validation,
    showRequiredError = false,
    'data-test-subj': dataTestSubj,
  }) => {
    const getTestId = useTestIdGenerator(dataTestSubj);
    const [isVisited, setIsVisited] = useState(false);
    const visibleErrors = useMemo(
      () => [
        ...(validation?.errors ?? []),
        ...((isVisited || showRequiredError) && validation?.requiredError
          ? [validation.requiredError]
          : []),
      ],
      [isVisited, showRequiredError, validation]
    );
    const warnings = validation?.warnings ?? [];
    const hasValueFeedback = visibleErrors.length > 0 || warnings.length > 0;
    const valueFeedbackId = useGeneratedHtmlId({ prefix: 'conditionEntryValueFeedback' });

    const handleVisited = useCallback(() => {
      onVisited?.(entry);

      if (!isVisited) {
        setIsVisited(true);
      }
    }, [entry, isVisited, onVisited]);

    const fieldOptions = useMemo<Array<EuiSuperSelectOption<ConditionEntryField>>>(() => {
      const getDropdownDisplay = (field: ConditionEntryField) => (
        <>
          {CONDITION_FIELD_TITLE[field]}
          <EuiText size="xs" color="subdued">
            {CONDITION_FIELD_DESCRIPTION[field]}
          </EuiText>
        </>
      );

      return [
        {
          dropdownDisplay: getDropdownDisplay(ConditionEntryField.HASH),
          inputDisplay: CONDITION_FIELD_TITLE[ConditionEntryField.HASH],
          value: ConditionEntryField.HASH,
          'data-test-subj': getTestId(
            `field-type-${CONDITION_FIELD_TITLE[ConditionEntryField.HASH]}`
          ),
        },
        {
          dropdownDisplay: getDropdownDisplay(ConditionEntryField.PATH),
          inputDisplay: CONDITION_FIELD_TITLE[ConditionEntryField.PATH],
          value: ConditionEntryField.PATH,
          'data-test-subj': getTestId(
            `field-type-${CONDITION_FIELD_TITLE[ConditionEntryField.PATH]}`
          ),
        },
        ...(os === OperatingSystem.WINDOWS
          ? [
              {
                dropdownDisplay: getDropdownDisplay(ConditionEntryField.SIGNER),
                inputDisplay: CONDITION_FIELD_TITLE[ConditionEntryField.SIGNER],
                value: ConditionEntryField.SIGNER,
                'data-test-subj': getTestId(
                  `field-type-${CONDITION_FIELD_TITLE[ConditionEntryField.SIGNER]}`
                ),
              },
            ]
          : []),
        ...(os === OperatingSystem.MAC
          ? [
              {
                dropdownDisplay: getDropdownDisplay(ConditionEntryField.SIGNER_MAC),
                inputDisplay: CONDITION_FIELD_TITLE[ConditionEntryField.SIGNER_MAC],
                value: ConditionEntryField.SIGNER_MAC,
                'data-test-subj': getTestId(
                  `field-type-${CONDITION_FIELD_TITLE[ConditionEntryField.SIGNER_MAC]}`
                ),
              },
            ]
          : []),
      ];
    }, [getTestId, os]);

    const handleValueUpdate = useCallback<ChangeEventHandler<HTMLInputElement>>(
      (ev) => onChange({ ...entry, value: ev.target.value }, entry),
      [entry, onChange]
    );

    const handleFieldUpdate = useCallback<
      NonNullable<EuiSuperSelectProps<ConditionEntryField>['onChange']>
    >(
      (newField) => {
        onChange({ ...entry, field: newField }, entry);

        if (entry.value) {
          handleVisited();
        }
      },
      [handleVisited, entry, onChange]
    );

    const handleOperatorUpdate = useCallback<
      NonNullable<EuiSuperSelectProps<TrustedAppEntryTypes>['onChange']>
    >((newOperator) => onChange({ ...entry, type: newOperator }, entry), [entry, onChange]);

    const handleRemoveClick = useCallback(() => onRemove(entry), [entry, onRemove]);

    const handleValueOnBlur = useCallback(() => {
      handleVisited();

      const trimmedValue = entry.value.trim();
      if (trimmedValue && trimmedValue !== entry.value) {
        onChange({ ...entry, value: trimmedValue }, entry);
      }
    }, [entry, handleVisited, onChange]);

    return (
      <InputGroup data-test-subj={dataTestSubj}>
        <InputItem gridArea="field">
          <ConditionEntryCell showLabel={showLabels} label={ENTRY_PROPERTY_TITLES.field}>
            <EuiSuperSelect
              options={fieldOptions}
              valueOfSelected={entry.field}
              onChange={handleFieldUpdate}
              data-test-subj={getTestId('field')}
              aria-label={ENTRY_PROPERTY_TITLES.field}
            />
          </ConditionEntryCell>
        </InputItem>
        <InputItem gridArea="operator">
          <ConditionEntryCell showLabel={showLabels} label={ENTRY_PROPERTY_TITLES.operator}>
            {entry.field === ConditionEntryField.PATH ? (
              <EuiSuperSelect
                options={operatorOptions}
                onChange={handleOperatorUpdate}
                valueOfSelected={entry.type}
                data-test-subj={getTestId('operator')}
                aria-label={ENTRY_PROPERTY_TITLES.operator}
              />
            ) : (
              <EuiFieldText
                name="operator"
                value={OPERATOR_TITLES.is}
                data-test-subj={getTestId('operator')}
                readOnly
              />
            )}
          </ConditionEntryCell>
        </InputItem>
        <InputItem gridArea="value">
          <ConditionEntryCell
            showLabel={showLabels}
            label={ENTRY_PROPERTY_TITLES.value}
            describedByIds={hasValueFeedback ? [valueFeedbackId] : undefined}
          >
            <EuiFieldText
              name="value"
              value={entry.value}
              placeholder={getPlaceholderTextByOSType({
                os,
                field: entry.field,
                type: entry.type,
              })}
              fullWidth
              required={isVisited}
              isInvalid={visibleErrors.length > 0}
              onChange={handleValueUpdate}
              onBlur={handleValueOnBlur}
              data-test-subj={getTestId('value')}
            />
          </ConditionEntryCell>
        </InputItem>
        <InputItem gridArea="remove">
          {/* Unicode `nbsp` is used below so that Remove button is properly displayed */}
          <ConditionEntryCell showLabel={showLabels} label={'\u00A0'}>
            <EuiToolTip
              content={i18n.translate(
                'xpack.securitySolution.trustedapps.logicalConditionBuilder.entry.removeLabel',
                { defaultMessage: 'Remove Entry' }
              )}
              disableScreenReaderOutput
            >
              <EuiButtonIcon
                color="danger"
                iconType="trash"
                onClick={handleRemoveClick}
                isDisabled={isRemoveDisabled}
                aria-label={i18n.translate(
                  'xpack.securitySolution.trustedapps.logicalConditionBuilder.entry.removeLabel',
                  { defaultMessage: 'Remove Entry' }
                )}
                data-test-subj={getTestId('remove')}
              />
            </EuiToolTip>
          </ConditionEntryCell>
        </InputItem>
        {hasValueFeedback ? (
          <InputItem gridArea="feedback">
            <ValueFeedback id={valueFeedbackId}>
              {visibleErrors.map((error, index) => (
                <EuiText
                  key={`error-${index}`}
                  color="danger"
                  size="xs"
                  data-test-subj={getTestId('valueError')}
                >
                  {error}
                </EuiText>
              ))}
              {warnings.map((warning, index) => (
                <EuiText
                  key={`warning-${index}`}
                  color="warning"
                  size="xs"
                  data-test-subj={getTestId('valueWarning')}
                >
                  {warning}
                </EuiText>
              ))}
            </ValueFeedback>
          </InputItem>
        ) : null}
      </InputGroup>
    );
  }
);

ConditionEntryInput.displayName = 'ConditionEntryInput';
