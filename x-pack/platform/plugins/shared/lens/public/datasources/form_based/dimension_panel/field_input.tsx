/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiFormRow } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import React from 'react';
import type { GenericIndexPatternColumn, FieldBasedIndexPatternColumn } from '@kbn/lens-common';
import { insertOrReplaceColumn } from '../operations/layer_helpers';
import { FieldSelect } from './field_select';
import type { FieldInputProps, OperationType } from '../operations/definitions';
import { shouldShowTimeSeriesOption } from '../pure_utils';
import { getColumnParamsForNewBucket } from '../include_empty_rows_defaults';

export function FieldInput({
  layer,
  selectedColumn,
  columnId,
  indexPattern,
  operationSupportMatrix,
  updateLayer,
  onDeleteColumn,
  incompleteField,
  incompleteOperation,
  incompleteParams,
  currentFieldIsInvalid,
  helpMessage,
  groupId,
  dimensionGroups,
  operationDefinitionMap,
  activeVisualizationTypeId,
}: FieldInputProps<FieldBasedIndexPatternColumn>) {
  const selectedOperationDefinition =
    selectedColumn && operationDefinitionMap[selectedColumn.operationType];
  // Need to workout early on the error to decide whether to show this or an help text
  const fieldErrorMessage =
    ((selectedOperationDefinition?.input !== 'fullReference' &&
      selectedOperationDefinition?.input !== 'managedReference') ||
      (incompleteOperation && operationDefinitionMap[incompleteOperation].input === 'field')) &&
    getErrorMessage(
      selectedColumn,
      Boolean(incompleteOperation),
      selectedOperationDefinition?.input,
      currentFieldIsInvalid
    );
  const fieldLabel = i18n.translate('xpack.lens.indexPattern.chooseField', {
    defaultMessage: 'Field',
  });
  return (
    <EuiFormRow
      data-test-subj="indexPattern-field-selection-row"
      label={fieldLabel}
      fullWidth
      isInvalid={Boolean(incompleteOperation || currentFieldIsInvalid)}
      error={fieldErrorMessage}
      labelAppend={!fieldErrorMessage && helpMessage}
    >
      <FieldSelect
        fieldIsInvalid={currentFieldIsInvalid}
        currentIndexPattern={indexPattern}
        operationByField={operationSupportMatrix.operationByField}
        selectedOperationType={
          // Allows operation to be selected before creating a valid column
          selectedColumn ? (selectedColumn.operationType as OperationType) : incompleteOperation
        }
        selectedField={incompleteField ?? selectedColumn?.sourceField}
        incompleteOperation={incompleteOperation}
        onDeleteColumn={onDeleteColumn}
        onChoose={(choice) => {
          return updateLayer(
            insertOrReplaceColumn({
              layer,
              columnId,
              indexPattern,
              op: choice.operationType,
              field: indexPattern.getFieldByName(choice.field),
              visualizationGroups: dimensionGroups,
              targetGroup: groupId,
              incompleteParams,
              columnParams: getColumnParamsForNewBucket(
                choice.operationType,
                activeVisualizationTypeId
              ),
            })
          );
        }}
        showTimeSeriesDimensions={shouldShowTimeSeriesOption(
          layer,
          indexPattern,
          groupId,
          dimensionGroups
        )}
        aria-label={fieldLabel}
      />
    </EuiFormRow>
  );
}

export function getErrorMessage(
  selectedColumn: GenericIndexPatternColumn | undefined,
  incompleteOperation: boolean,
  input: 'none' | 'field' | 'fullReference' | 'managedReference' | undefined,
  fieldInvalid: boolean
) {
  if (selectedColumn && incompleteOperation) {
    if (input === 'field') {
      return i18n.translate('xpack.lens.indexPattern.invalidOperationLabel', {
        defaultMessage: 'This field does not work with the selected function.',
      });
    }
    return i18n.translate('xpack.lens.indexPattern.chooseFieldLabel', {
      defaultMessage: 'To use this function, select a field.',
    });
  }
  if (fieldInvalid) {
    return i18n.translate('xpack.lens.indexPattern.invalidFieldLabel', {
      defaultMessage: 'Invalid field. Check your data view or pick another field.',
    });
  }
}
