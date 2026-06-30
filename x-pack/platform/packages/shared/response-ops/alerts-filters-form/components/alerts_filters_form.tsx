/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo } from 'react';
import {
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiPanel,
  EuiText,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import type { HttpStart } from '@kbn/core-http-browser';
import type { NotificationsStart } from '@kbn/core-notifications-browser';
import { getFilterMetadata } from '../filters_metadata';
import { AlertsFiltersFormContextProvider } from '../contexts/alerts_filters_form_context';
import type {
  AlertsFilter,
  AlertsFiltersExpression,
  AlertsFiltersType,
  AlertsFiltersExpressionOperator,
  AlertsFiltersExpressionErrors,
} from '../types';
import {
  ADD_OPERATION_LABEL,
  AND_OPERATOR,
  DELETE_OPERAND_LABEL,
  getMaxFiltersNote,
  OR_OPERATOR,
} from '../translations';
import { AlertsFiltersFormItem } from './alerts_filters_form_item';
import { isFilter } from '../utils/filters';
import {
  ADD_AND_OPERATION_BUTTON_SUBJ,
  ADD_OR_OPERATION_BUTTON_SUBJ,
  DELETE_OPERAND_BUTTON_SUBJ,
  FILTERS_FORM_SUBJ,
} from '../constants';

export interface AlertsFiltersFormProps {
  /**
   * Restricts the queries used by filters to these rule types
   */
  ruleTypeIds: string[];
  /**
   * The current filters expression
   */
  value?: AlertsFiltersExpression;
  /**
   * Validation errors
   */
  errors?: AlertsFiltersExpressionErrors;
  /**
   * Callback for changes is the filters expression
   */
  onChange: (newValue: AlertsFiltersExpression) => void;
  /**
   * Disables all the filters
   */
  isDisabled?: boolean;
  /**
   * Restricts the total number of filters, preventing the user from creating more
   */
  maxFilters?: number;
  /**
   * Service dependencies
   */
  services: {
    http: HttpStart;
    notifications: NotificationsStart;
  };
}

// This ensures that the form is initialized with an empty "Filter by" selector
const DEFAULT_VALUE: AlertsFiltersExpression = [{ filter: {} }];
const DEFAULT_MAX_FILTERS = 5;

const isLastFilterEmpty = (expression: AlertsFiltersExpression) => {
  if (!Boolean(expression?.length)) {
    return true;
  }
  const lastExpressionItem = expression[expression.length - 1];
  if (!isFilter(lastExpressionItem)) {
    return true;
  }

  const { filter: lastFilter } = lastExpressionItem;
  if (!lastFilter.type) {
    return true;
  }

  const { isEmpty } = getFilterMetadata(lastFilter.type);
  return isEmpty(lastFilter.value);
};

/**
 * A form to build boolean expressions of filters for alerts searches
 */
export const AlertsFiltersForm = ({
  ruleTypeIds,
  value = DEFAULT_VALUE,
  errors,
  onChange,
  isDisabled = false,
  maxFilters = DEFAULT_MAX_FILTERS,
  services,
}: AlertsFiltersFormProps) => {
  const [firstItem, ...otherItems] = value as [
    {
      filter: AlertsFilter;
    },
    ...AlertsFiltersExpression
  ];
  const lastFilterEmpty = useMemo(() => isLastFilterEmpty(value), [value]);

  const handleChange = useCallback<typeof onChange>(
    (newValue) => {
      onChange(newValue);
    },
    [onChange]
  );

  const addOperand = useCallback(
    (operator: AlertsFiltersExpressionOperator) => {
      handleChange([
        ...value,
        {
          operator,
        },
        { filter: {} },
      ]);
    },
    [handleChange, value]
  );

  const deleteOperand = useCallback(
    (atIndex: number) => {
      // Remove two items: the operator and the following filter
      const newValue = [...value];
      newValue.splice(atIndex, 2);
      handleChange(newValue);
    },
    [handleChange, value]
  );

  const onFormItemTypeChange = useCallback(
    (atIndex: number, newType: AlertsFiltersType) => {
      const newValue = [...value];
      const expressionItem = value[atIndex];
      if (isFilter(expressionItem)) {
        newValue[atIndex] = {
          filter: {
            type: newType,
          },
        };
        handleChange(newValue);
      }
    },
    [handleChange, value]
  );

  const onFormItemValueChange = useCallback(
    (atIndex: number, newItemValue: unknown) => {
      const newValue = [...value];
      const expressionItem = newValue[atIndex];
      if (isFilter(expressionItem)) {
        newValue[atIndex] = {
          filter: {
            ...expressionItem.filter,
            value: newItemValue,
          },
        };
        handleChange(newValue);
      }
    },
    [handleChange, value]
  );

  const contextValue = useMemo(
    () => ({
      ruleTypeIds,
      services,
    }),
    [ruleTypeIds, services]
  );

  const hasErrors = Boolean(errors?.length);

  // `otherItems` is an array with filters interleaved with operators, excluding the first filter.
  // To check against the maximum number of allowed filter we remove 1 (first filter) and multiply
  // by 2 to take into account the operator items between one filter and the other
  const showMaxFiltersWarning = !maxFilters || otherItems.length >= (maxFilters - 1) * 2;

  return (
    <AlertsFiltersFormContextProvider value={contextValue}>
      <EuiFlexGroup direction="column" data-test-subj={FILTERS_FORM_SUBJ}>
        <EuiFlexItem>
          <AlertsFiltersFormItem
            type={firstItem.filter.type}
            onTypeChange={(newType) => onFormItemTypeChange(0, newType)}
            value={firstItem.filter.value}
            onValueChange={(newValue) => onFormItemValueChange(0, newValue)}
            isDisabled={isDisabled}
            errors={hasErrors ? errors?.[0] : undefined}
          />
        </EuiFlexItem>
        {Boolean(otherItems?.length) && (
          <EuiPanel hasShadow={false} color="subdued">
            <EuiFlexGroup direction="column" gutterSize="s">
              {otherItems.map((item, offsetIndex) => {
                // offsetIndex starts from the second item
                const index = offsetIndex + 1;
                return (
                  <EuiFlexItem key={index}>
                    {isFilter(item) ? (
                      <AlertsFiltersFormItem
                        type={item.filter.type}
                        onTypeChange={(newType) => onFormItemTypeChange(index, newType)}
                        value={item.filter.value}
                        onValueChange={(newValue) => onFormItemValueChange(index, newValue)}
                        isDisabled={isDisabled}
                        errors={hasErrors ? errors?.[index] : undefined}
                      />
                    ) : (
                      <Operator operator={item.operator} onDelete={() => deleteOperand(index)} />
                    )}
                  </EuiFlexItem>
                );
              })}
            </EuiFlexGroup>
          </EuiPanel>
        )}
        {showMaxFiltersWarning ? (
          <EuiText textAlign="center" size="s" color="subdued">
            <p>{getMaxFiltersNote(maxFilters)}</p>
          </EuiText>
        ) : (
          !lastFilterEmpty && (
            <EuiFlexItem>
              <EuiFlexGroup
                alignItems="center"
                gutterSize="s"
                role="group"
                aria-label={ADD_OPERATION_LABEL}
              >
                <EuiFlexItem grow>
                  <EuiHorizontalRule margin="s" />
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiButtonEmpty
                    iconType="plusCircle"
                    size="xs"
                    onClick={() => addOperand('or')}
                    isDisabled={isDisabled}
                    data-test-subj={ADD_OR_OPERATION_BUTTON_SUBJ}
                  >
                    {OR_OPERATOR}
                  </EuiButtonEmpty>
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiButtonEmpty
                    iconType="plusCircle"
                    size="xs"
                    onClick={() => addOperand('and')}
                    isDisabled={isDisabled}
                    data-test-subj={ADD_AND_OPERATION_BUTTON_SUBJ}
                  >
                    {AND_OPERATOR}
                  </EuiButtonEmpty>
                </EuiFlexItem>
                <EuiFlexItem grow>
                  <EuiHorizontalRule margin="s" />
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
          )
        )}
      </EuiFlexGroup>
    </AlertsFiltersFormContextProvider>
  );
};

interface OperatorProps {
  operator: 'and' | 'or';
  onDelete: () => void;
}

const Operator = ({ operator, onDelete }: OperatorProps) => {
  const { euiTheme } = useEuiTheme();

  return (
    <EuiFlexGroup
      alignItems="center"
      justifyContent="spaceBetween"
      css={css`
        border-bottom: ${euiTheme.border.thin};
      `}
    >
      <EuiFlexItem grow={false}>
        <EuiText size="s" color="subdued">
          {operator.toUpperCase()}
        </EuiText>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiToolTip content={DELETE_OPERAND_LABEL} disableScreenReaderOutput>
          <EuiButtonIcon
            iconType="trash"
            aria-label={DELETE_OPERAND_LABEL}
            onClick={onDelete}
            iconSize="s"
            color="text"
            data-test-subj={DELETE_OPERAND_BUTTON_SUBJ}
          />
        </EuiToolTip>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
