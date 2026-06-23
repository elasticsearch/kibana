/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiComboBoxProps } from '@elastic/eui';
import {
  EuiButtonIcon,
  EuiComboBox,
  EuiExpression,
  EuiFieldNumber,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiPopover,
  EuiPopoverTitle,
  EuiSelect,
  EuiToolTip,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { isFinite, isNumber } from 'lodash';
import React, { useCallback, useMemo, useState } from 'react';
import type { IErrorObject } from '@kbn/triggers-actions-ui-plugin/public';
import type { ResolvedLogViewField } from '@kbn/logs-shared-plugin/common';
import type { Criterion as CriterionType } from '../../../../../common/alerting/logs/log_threshold/types';
import {
  Comparator,
  ComparatorToi18nMap,
} from '../../../../../common/alerting/logs/log_threshold/types';

const firstCriterionFieldPrefix = i18n.translate(
  'xpack.infra.logs.alertFlyout.firstCriterionFieldPrefix',
  {
    defaultMessage: 'with',
  }
);

const successiveCriterionFieldPrefix = i18n.translate(
  'xpack.infra.logs.alertFlyout.successiveCriterionFieldPrefix',
  {
    defaultMessage: 'and',
  }
);

const criterionFieldTitle = i18n.translate('xpack.infra.logs.alertFlyout.criterionFieldTitle', {
  defaultMessage: 'Field',
});

const criterionComparatorValueTitle = i18n.translate(
  'xpack.infra.logs.alertFlyout.criterionComparatorValueTitle',
  {
    defaultMessage: 'Comparison : Value',
  }
);

const getCompatibleComparatorsForField = (fieldInfo: ResolvedLogViewField | undefined) => {
  if (fieldInfo?.type === 'number') {
    return [
      { value: Comparator.GT, text: ComparatorToi18nMap[Comparator.GT] },
      { value: Comparator.GT_OR_EQ, text: ComparatorToi18nMap[Comparator.GT_OR_EQ] },
      { value: Comparator.LT, text: ComparatorToi18nMap[Comparator.LT] },
      { value: Comparator.LT_OR_EQ, text: ComparatorToi18nMap[Comparator.LT_OR_EQ] },
      { value: Comparator.EQ, text: ComparatorToi18nMap[`${Comparator.EQ}:number`] },
      { value: Comparator.NOT_EQ, text: ComparatorToi18nMap[`${Comparator.NOT_EQ}:number`] },
    ];
  } else if (fieldInfo?.aggregatable) {
    return [
      { value: Comparator.EQ, text: ComparatorToi18nMap[Comparator.EQ] },
      { value: Comparator.NOT_EQ, text: ComparatorToi18nMap[Comparator.NOT_EQ] },
    ];
  } else {
    return [
      { value: Comparator.MATCH, text: ComparatorToi18nMap[Comparator.MATCH] },
      { value: Comparator.NOT_MATCH, text: ComparatorToi18nMap[Comparator.NOT_MATCH] },
      { value: Comparator.MATCH_PHRASE, text: ComparatorToi18nMap[Comparator.MATCH_PHRASE] },
      {
        value: Comparator.NOT_MATCH_PHRASE,
        text: ComparatorToi18nMap[Comparator.NOT_MATCH_PHRASE],
      },
    ];
  }
};

const getFieldInfo = (
  fields: ResolvedLogViewField[],
  fieldName: string
): ResolvedLogViewField | undefined => {
  return fields.find((field) => {
    return field.name === fieldName;
  });
};

interface Props {
  idx: number;
  fields: ResolvedLogViewField[];
  criterion: Partial<CriterionType>;
  updateCriterion: (idx: number, params: Partial<CriterionType>) => void;
  removeCriterion: (idx: number) => void;
  canDelete: boolean;
  errors: IErrorObject;
}

export const Criterion: React.FC<Props> = ({
  idx,
  fields,
  criterion,
  updateCriterion,
  removeCriterion,
  canDelete,
  errors,
}) => {
  const [isFieldPopoverOpen, setIsFieldPopoverOpen] = useState(false);
  const [isComparatorPopoverOpen, setIsComparatorPopoverOpen] = useState(false);
  const fieldPopoverTitleId = useGeneratedHtmlId();
  const comparatorPopoverTitleId = useGeneratedHtmlId();

  const fieldOptions = useMemo(() => {
    return fields.map((field) => {
      return { label: field.name };
    });
  }, [fields]);

  const fieldInfo: ResolvedLogViewField | undefined = useMemo(() => {
    if (criterion.field) {
      return getFieldInfo(fields, criterion.field);
    } else {
      return undefined;
    }
  }, [fields, criterion]);

  const compatibleComparatorOptions = useMemo(() => {
    return getCompatibleComparatorsForField(fieldInfo);
  }, [fieldInfo]);

  const handleFieldChange = useCallback<NonNullable<EuiComboBoxProps<{}>['onChange']>>(
    ([selectedOption]) => {
      if (!selectedOption) {
        updateCriterion(idx, { field: '' });
        return;
      }

      const fieldName = selectedOption.label;

      const nextFieldInfo = getFieldInfo(fields, fieldName);
      // If the field information we're dealing with has changed, reset the comparator and value.
      if (
        fieldInfo?.type !== nextFieldInfo?.type ||
        fieldInfo?.aggregatable !== nextFieldInfo?.aggregatable
      ) {
        const compatibleComparators = getCompatibleComparatorsForField(nextFieldInfo);
        updateCriterion(idx, {
          field: fieldName,
          comparator: compatibleComparators[0].value,
          value: undefined,
        });
      } else {
        updateCriterion(idx, { field: fieldName });
      }

      setIsFieldPopoverOpen(false);
    },
    [fieldInfo, fields, idx, updateCriterion]
  );

  const selectedField = criterion.field ? [{ label: criterion.field }] : [];

  return (
    <EuiFlexGroup gutterSize="s">
      <EuiFlexItem grow>
        <EuiFlexGroup gutterSize="s">
          <EuiFlexItem grow={false}>
            <EuiPopover
              id="criterion-field"
              aria-labelledby={fieldPopoverTitleId}
              button={
                <EuiExpression
                  description={
                    idx === 0 ? firstCriterionFieldPrefix : successiveCriterionFieldPrefix
                  }
                  uppercase={true}
                  value={criterion.field ?? 'a chosen field'}
                  isActive={isFieldPopoverOpen}
                  color={errors.field.length === 0 ? 'success' : 'danger'}
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    setIsFieldPopoverOpen(!isFieldPopoverOpen);
                  }}
                />
              }
              isOpen={isFieldPopoverOpen}
              closePopover={() => setIsFieldPopoverOpen(false)}
              onClick={(e: React.MouseEvent) => e.stopPropagation()}
              ownFocus
              panelPaddingSize="s"
              anchorPosition="downLeft"
            >
              <div>
                <EuiPopoverTitle id={fieldPopoverTitleId}>{criterionFieldTitle}</EuiPopoverTitle>
                <EuiFormRow
                  style={{ minWidth: '300px' }}
                  // @ts-expect-error upgrade typescript v5.1.6
                  isInvalid={errors.field.length > 0}
                  error={errors.field as string}
                >
                  <EuiComboBox
                    // @ts-expect-error upgrade typescript v5.1.6
                    isInvalid={errors.field.length > 0}
                    compressed
                    fullWidth
                    isClearable={false}
                    singleSelection={{ asPlainText: true }}
                    aria-label={criterionFieldTitle}
                    options={fieldOptions}
                    selectedOptions={selectedField}
                    onChange={handleFieldChange}
                  />
                </EuiFormRow>
              </div>
            </EuiPopover>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiPopover
              id="criterion-comparator-value"
              aria-labelledby={comparatorPopoverTitleId}
              button={
                <EuiExpression
                  description={
                    criterion.comparator
                      ? // @ts-expect-error upgrade typescript v5.4.5
                        ComparatorToi18nMap[`${criterion.comparator}:${fieldInfo?.type}`] ??
                        ComparatorToi18nMap[criterion.comparator] ??
                        ''
                      : ''
                  }
                  uppercase={true}
                  value={criterion.value}
                  isActive={isComparatorPopoverOpen}
                  color={
                    errors.comparator.length === 0 && errors.value.length === 0
                      ? 'success'
                      : 'danger'
                  }
                  onClick={(e: React.MouseEvent) => {
                    e.stopPropagation();
                    setIsComparatorPopoverOpen(!isComparatorPopoverOpen);
                  }}
                />
              }
              isOpen={isComparatorPopoverOpen}
              closePopover={() => setIsComparatorPopoverOpen(false)}
              onClick={(e) => e.stopPropagation()}
              ownFocus
              panelPaddingSize="s"
              anchorPosition="downLeft"
            >
              <div>
                <EuiPopoverTitle id={comparatorPopoverTitleId}>
                  {criterionComparatorValueTitle}
                </EuiPopoverTitle>
                <EuiFlexGroup gutterSize="l">
                  <EuiFlexItem grow={false}>
                    <EuiFormRow
                      isInvalid={
                        // @ts-expect-error upgrade typescript v5.1.6
                        errors.comparator.length > 0
                      }
                      error={errors.comparator as string}
                    >
                      <EuiSelect
                        // @ts-expect-error upgrade typescript v5.1.6
                        isInvalid={errors.comparator.length > 0}
                        data-test-subj="infraCriterionSelect"
                        compressed
                        hasNoInitialSelection={criterion.comparator == null}
                        value={criterion.comparator}
                        onChange={(e) =>
                          updateCriterion(idx, { comparator: e.target.value as Comparator })
                        }
                        options={compatibleComparatorOptions}
                        aria-label={i18n.translate(
                          'xpack.infra.logs.alertFlyout.comparatorSelectAriaLabel',
                          {
                            defaultMessage: 'Comparison',
                          }
                        )}
                      />
                    </EuiFormRow>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiFormRow
                      isInvalid={
                        // @ts-expect-error upgrade typescript v5.1.6
                        errors.value.length > 0
                      }
                      error={errors.value as string}
                    >
                      {fieldInfo?.type === 'number' ? (
                        <EuiFieldNumber
                          data-test-subj="infraCriterionFieldNumber"
                          compressed
                          value={criterion.value as number | undefined}
                          onChange={(e) => {
                            const number = parseFloat(e.target.value);
                            updateCriterion(idx, {
                              value: isNumber(number) && isFinite(number) ? number : undefined,
                            });
                          }}
                        />
                      ) : (
                        <EuiFieldText
                          data-test-subj="infraCriterionFieldText"
                          compressed
                          value={criterion.value}
                          onChange={(e) => updateCriterion(idx, { value: e.target.value })}
                        />
                      )}
                    </EuiFormRow>
                  </EuiFlexItem>
                </EuiFlexGroup>
              </div>
            </EuiPopover>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexItem>
      {canDelete && (
        <EuiFlexItem grow={false}>
          <EuiToolTip
            content={i18n.translate('xpack.infra.logs.alertFlyout.removeCondition', {
              defaultMessage: 'Remove condition',
            })}
            disableScreenReaderOutput
          >
            <EuiButtonIcon
              data-test-subj="infraCriterionButton"
              aria-label={i18n.translate('xpack.infra.logs.alertFlyout.removeCondition', {
                defaultMessage: 'Remove condition',
              })}
              color={'danger'}
              iconType={'trash'}
              onClick={(e: React.MouseEvent) => {
                e.stopPropagation();
                removeCriterion(idx);
              }}
            />
          </EuiToolTip>
        </EuiFlexItem>
      )}
    </EuiFlexGroup>
  );
};
