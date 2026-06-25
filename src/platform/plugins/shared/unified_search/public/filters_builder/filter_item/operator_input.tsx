/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useCallback, useContext } from 'react';
import { i18n } from '@kbn/i18n';
import type { DataViewField } from '@kbn/data-views-plugin/common';
import type { Operator } from '../../filter_bar/filter_editor';
import { getOperatorOptions, GenericComboBox } from '../../filter_bar/filter_editor';
import { FiltersBuilderContextType } from '../context';

export const strings = {
  getOperatorSelectPlaceholderSelectLabel: () =>
    i18n.translate('unifiedSearch.filter.filtersBuilder.operatorSelectPlaceholderSelect', {
      defaultMessage: 'Select operator',
    }),
};

interface OperatorInputProps<TParams = unknown> {
  field: DataViewField | undefined;
  operator: Operator | undefined;
  params: TParams;
  onHandleOperator: (operator: Operator, params?: TParams) => void;
}

export function OperatorInput<TParams = unknown>({
  field,
  operator,
  params,
  onHandleOperator,
}: OperatorInputProps<TParams>) {
  const { disabled } = useContext(FiltersBuilderContextType);
  const operators = field ? getOperatorOptions(field) : [];

  const onOperatorChange = useCallback(
    ([selectedOperator]: Operator[]) => {
      const selectedParams = selectedOperator === operator ? params : undefined;

      onHandleOperator(selectedOperator, selectedParams);
    },
    [onHandleOperator, operator, params]
  );

  return (
    <GenericComboBox
      fullWidth
      compressed
      isDisabled={!field || disabled}
      placeholder={strings.getOperatorSelectPlaceholderSelectLabel()}
      aria-label={strings.getOperatorSelectPlaceholderSelectLabel()}
      options={operators}
      selectedOptions={operator ? [operator] : []}
      getLabel={({ message }) => message}
      getOptionTestSubj={({ message }) => `filterOperatorOption-${message}`}
      onChange={onOperatorChange}
      singleSelection={{ asPlainText: true }}
      isClearable={false}
      data-test-subj="filterOperatorList"
      inputPopoverProps={{ panelMinWidth: 180 }}
    />
  );
}
