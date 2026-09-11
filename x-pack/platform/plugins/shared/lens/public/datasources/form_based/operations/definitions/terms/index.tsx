/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useState } from 'react';
import { i18n } from '@kbn/i18n';
import type { EuiSwitchEvent } from '@elastic/eui';
import {
  EuiFormRow,
  EuiSelect,
  EuiSwitch,
  EuiSpacer,
  EuiAccordion,
  EuiIconTip,
  htmlIdGenerator,
  EuiButtonGroup,
  EuiText,
  useEuiTheme,
  EuiTitle,
  EuiTextColor,
} from '@elastic/eui';
import { uniq } from 'lodash';
import type { AggFunctionsMapping } from '@kbn/data-plugin/public';
import { buildExpressionFunction } from '@kbn/expressions-plugin/public';
import { css } from '@emotion/react';
import type {
  OperationMetadata,
  DataType,
  GenericIndexPatternColumn,
  IncompleteColumn,
  TermsIndexPatternColumn,
  IndexPatternField,
} from '@kbn/lens-common';
import { LENS_DOCUMENT_FIELD_NAME, toEsqlRegistry, TERMS_ID } from '@kbn/lens-common';
import { insertOrReplaceColumn, updateColumnParam, updateDefaultLabels } from '../../layer_helpers';
import type { OperationDefinition } from '..';
import { ValuesInput } from './values_input';
import { getInvalidFieldMessage, isColumn } from '../helpers';
import { FieldInputs, getInputFieldErrorMessage, MAX_MULTI_FIELDS_SIZE } from './field_inputs';
import {
  FieldInput as FieldInputBase,
  getErrorMessage,
} from '../../../dimension_panel/field_input';
import { getFirstValue } from '../../../pure_utils';
import {
  getDisallowedTermsMessage,
  getMultiTermsScriptedFieldErrorMessage,
  getFieldsByValidationState,
  isSortableByColumn,
  isPercentileRankSortable,
  isPercentileSortable,
  getOtherBucketSwitchDefault,
} from './helpers';
import {
  DEFAULT_MAX_DOC_COUNT,
  DEFAULT_SIZE,
  MAXIMUM_MAX_DOC_COUNT,
  supportedTypes,
} from './constants';
import { IncludeExcludeRow } from './include_exclude_options';
import { shouldShowTimeSeriesOption } from '../../../pure_utils';

export function supportsRarityRanking(field?: IndexPatternField) {
  // these es field types can't be sorted by rarity
  return !field?.esTypes?.some((esType) =>
    ['double', 'float', 'half_float', 'scaled_float'].includes(esType)
  );
}
export function supportsSignificantRanking(field?: IndexPatternField) {
  return field?.esTypes?.some((esType) => esType === 'keyword');
}
function isRareOrSignificant(orderBy: TermsIndexPatternColumn['params']['orderBy']) {
  return orderBy.type === 'rare' || orderBy.type === 'significant';
}

const missingFieldLabel = i18n.translate('xpack.lens.indexPattern.missingFieldLabel', {
  defaultMessage: 'Missing field',
});

function ofName(
  name?: string,
  secondaryFieldsCount: number = 0,
  rare: boolean = false,
  significant: boolean = false,
  termsSize: number = 0
) {
  if (rare) {
    return i18n.translate('xpack.lens.indexPattern.rareTermsOf', {
      defaultMessage: 'Rare values of {name}',
      values: {
        name: name ?? missingFieldLabel,
      },
    });
  }
  if (significant) {
    return i18n.translate('xpack.lens.indexPattern.significantTermsOf', {
      defaultMessage: 'Significant values of {name}',
      values: {
        name: name ?? missingFieldLabel,
      },
    });
  }
  if (secondaryFieldsCount) {
    return i18n.translate('xpack.lens.indexPattern.multipleTermsOf', {
      defaultMessage: 'Top values of {name} + {count} {count, plural, one {other} other {others}}',
      values: {
        name: name ?? missingFieldLabel,
        count: secondaryFieldsCount,
      },
    });
  }
  return i18n.translate('xpack.lens.indexPattern.termsOf', {
    defaultMessage:
      'Top {numberOfTermsLabel}{termsCount, plural, one {value} other {values}} of {name}',
    values: {
      name: name ?? missingFieldLabel,
      termsCount: termsSize,
      numberOfTermsLabel: termsSize > 1 ? `${termsSize} ` : '',
    },
  });
}

// It is not always possible to know if there's a numeric field, so just ignore it for now
function getParentFormatter(params: Partial<TermsIndexPatternColumn['params']>) {
  return { id: params.secondaryFields?.length ? 'multi_terms' : 'terms' };
}

const idPrefix = htmlIdGenerator()();

export const termsOperation: OperationDefinition<
  TermsIndexPatternColumn,
  'field',
  TermsIndexPatternColumn['params']
> = {
  type: 'terms',
  displayName: i18n.translate('xpack.lens.indexPattern.terms', {
    defaultMessage: 'Top values',
  }),
  priority: 3, // Higher than any metric
  input: 'field',
  scale: () => 'ordinal',
  toESQL: toEsqlRegistry[TERMS_ID],
  getCurrentFields: (targetColumn) => {
    return [targetColumn.sourceField, ...(targetColumn?.params?.secondaryFields ?? [])];
  },
  getParamsForMultipleFields: ({ targetColumn, sourceColumn, field, indexPattern }) => {
    const secondaryFields = new Set<string>(
      getFieldsByValidationState(indexPattern, targetColumn).validFields
    );

    const validFieldsToAdd = getFieldsByValidationState(
      indexPattern,
      sourceColumn,
      field
    ).validFields;

    for (const validField of validFieldsToAdd) {
      secondaryFields.add(validField);
    }
    // remove the sourceField
    secondaryFields.delete(targetColumn.sourceField);

    const secondaryFieldsList: string[] = [...secondaryFields];
    const ret: Partial<TermsIndexPatternColumn['params']> = {
      secondaryFields: secondaryFieldsList,
      parentFormat: getParentFormatter({
        ...targetColumn.params,
        secondaryFields: secondaryFieldsList,
      }),
    };
    return ret;
  },
  canAddNewField: ({ targetColumn, sourceColumn, field, indexPattern }) => {
    if (isRareOrSignificant(targetColumn.params.orderBy)) {
      return false;
    }
    // collect the fields from the targetColumn
    const originalTerms = new Set(
      getFieldsByValidationState(indexPattern, targetColumn).validFields
    );
    // now check how many fields can be added
    const { validFields } = getFieldsByValidationState(indexPattern, sourceColumn, field);
    const counter = validFields.filter((fieldName) => !originalTerms.has(fieldName)).length;
    // reject when there are no new fields to add
    if (!counter) {
      return false;
    }
    return counter + (targetColumn.params?.secondaryFields?.length ?? 0) <= MAX_MULTI_FIELDS_SIZE;
  },
  getDefaultVisualSettings: (column) => ({
    truncateText: Boolean(!column.params?.secondaryFields?.length),
  }),
  getPossibleOperationForField: ({
    aggregationRestrictions,
    aggregatable,
    type,
    timeSeriesMetric,
  }) => {
    if (
      supportedTypes.has(type) &&
      aggregatable &&
      timeSeriesMetric !== 'counter' &&
      (!aggregationRestrictions || aggregationRestrictions.terms)
    ) {
      return {
        dataType: type as DataType,
        isBucketed: true,
        scale: 'ordinal',
      };
    }
  },
  getErrorMessage: (layer, columnId, indexPattern) => {
    return [
      ...getInvalidFieldMessage(layer, columnId, indexPattern),
      ...getDisallowedTermsMessage(layer, columnId, indexPattern),
      ...getMultiTermsScriptedFieldErrorMessage(layer, columnId, indexPattern),
    ];
  },
  getNonTransferableFields: (column, newIndexPattern) => {
    return getFieldsByValidationState(newIndexPattern, column).invalidFields;
  },
  isTransferable: (column, newIndexPattern) => {
    const { allFields, invalidFields } = getFieldsByValidationState(newIndexPattern, column);

    return Boolean(
      allFields.length &&
        invalidFields.length === 0 &&
        (!column.params.otherBucket || !newIndexPattern.hasRestrictions)
    );
  },
  buildColumn({ layer, field, indexPattern }, columnParams) {
    const existingMetricColumn = Object.entries(layer.columns)
      .filter(([columnId]) => isSortableByColumn(layer, columnId))
      .map(([id]) => id)[0];

    return {
      label: ofName(field.displayName),
      dataType: field.type as DataType,
      operationType: 'terms',
      sourceField: field.name,
      isBucketed: true,
      params: {
        size: columnParams?.size ?? DEFAULT_SIZE,
        orderBy:
          columnParams?.orderBy ??
          (existingMetricColumn
            ? {
                type: 'column',
                columnId: existingMetricColumn,
              }
            : { type: 'alphabetical', fallback: true }),
        orderAgg: columnParams?.orderBy.type === 'custom' ? columnParams?.orderAgg : undefined,
        orderDirection: columnParams?.orderDirection ?? (existingMetricColumn ? 'desc' : 'asc'),
        otherBucket: (columnParams?.otherBucket ?? true) && !indexPattern.hasRestrictions,
        missingBucket: columnParams?.missingBucket ?? false,
        parentFormat: columnParams?.parentFormat ?? { id: 'terms' },
        include: columnParams?.include ?? [],
        exclude: columnParams?.exclude ?? [],
        includeIsRegex: columnParams?.includeIsRegex ?? false,
        excludeIsRegex: columnParams?.excludeIsRegex ?? false,
        secondaryFields: columnParams?.secondaryFields,
      },
    };
  },
  toEsAggsFn: (
    column,
    columnId,
    _indexPattern,
    layer,
    uiSettings,
    orderedColumnIds,
    operationDefinitionMap
  ) => {
    if (column.params?.orderBy.type === 'rare') {
      return buildExpressionFunction<AggFunctionsMapping['aggRareTerms']>('aggRareTerms', {
        id: columnId,
        enabled: true,
        schema: 'segment',
        field: column.sourceField,
        max_doc_count: column.params.orderBy.maxDocCount,
      }).toAst();
    }

    // To get more accurate results, we set shard_size to a minimum of 1000
    // The other calculation matches the current Elasticsearch shard_size default,
    // but they may diverge in the future
    const shardSize = column.params.accuracyMode
      ? Math.max(1000, column.params.size * 1.5 + 10)
      : undefined;

    if (column.params?.orderBy.type === 'significant') {
      return buildExpressionFunction<AggFunctionsMapping['aggSignificantTerms']>(
        'aggSignificantTerms',
        {
          id: columnId,
          enabled: true,
          schema: 'segment',
          field: column.sourceField,
          size: column.params.size,
          shardSize,
          ...(column.params.include?.length && { include: column.params.include as string[] }),
          ...(column.params.exclude?.length && { exclude: column.params.exclude as string[] }),
        }
      ).toAst();
    }

    let orderBy = '_key';

    if (column.params?.orderBy.type === 'column') {
      const orderColumn = layer.columns[column.params.orderBy.columnId];
      orderBy = String(orderedColumnIds.indexOf(column.params.orderBy.columnId));
      // percentile rank with non integer value should default to alphabetical order
      if (
        !orderColumn ||
        !isPercentileRankSortable(orderColumn) ||
        !isPercentileSortable(orderColumn)
      ) {
        orderBy = '_key';
      }
    }

    const orderAggColumn = column.params.orderAgg;
    let orderAgg;
    if (orderAggColumn) {
      orderBy = 'custom';
      const def = operationDefinitionMap?.[orderAggColumn?.operationType];
      if (def && 'toEsAggsFn' in def) {
        orderAgg = [
          {
            type: 'expression' as const,
            chain: [
              def.toEsAggsFn(
                orderAggColumn,
                `${columnId}-orderAgg`,
                _indexPattern,
                layer,
                uiSettings,
                orderedColumnIds
              ),
            ],
          },
        ];
      }
    }
    if (column.params?.secondaryFields?.length) {
      return buildExpressionFunction<AggFunctionsMapping['aggMultiTerms']>('aggMultiTerms', {
        id: columnId,
        enabled: true,
        schema: 'segment',
        fields: [column.sourceField, ...column.params.secondaryFields],
        orderBy,
        order: column.params.orderDirection,
        orderAgg,
        size: column.params.size,
        shardSize,
        otherBucket: Boolean(column.params.otherBucket),
        otherBucketLabel: i18n.translate('xpack.lens.indexPattern.terms.otherLabel', {
          defaultMessage: 'Other',
        }),
      }).toAst();
    }

    return buildExpressionFunction<AggFunctionsMapping['aggTerms']>('aggTerms', {
      id: columnId,
      enabled: true,
      schema: 'segment',
      field: column.sourceField,
      orderBy,
      order: column.params.orderDirection,
      orderAgg,
      size: column.params.size,
      shardSize,
      ...(column.params.include?.length && { include: column.params.include }),
      ...(column.params.exclude?.length && { exclude: column.params.exclude }),
      includeIsRegex: Boolean(column.params.includeIsRegex),
      excludeIsRegex: Boolean(column.params.excludeIsRegex),
      otherBucket: Boolean(column.params.otherBucket),
      missingBucket: column.params.otherBucket && column.params.missingBucket,
    }).toAst();
  },
  getDefaultLabel: (column, columns, indexPattern) =>
    ofName(
      indexPattern?.getFieldByName(column.sourceField)?.displayName,
      column.params.secondaryFields?.length,
      column.params.orderBy.type === 'rare',
      column.params.orderBy.type === 'significant',
      column.params.size
    ),
  onFieldChange: (oldColumn, field, params) => {
    const newParams = {
      ...oldColumn.params,
      secondaryFields: undefined,
      ...(params as Partial<TermsIndexPatternColumn['params']>),
    };
    if ('format' in newParams && field.type !== 'number') {
      delete newParams.format;
    }
    newParams.parentFormat = getParentFormatter(newParams);
    if (
      (!supportsRarityRanking(field) && newParams.orderBy.type === 'rare') ||
      (!supportsSignificantRanking(field) && newParams.orderBy.type === 'significant')
    ) {
      newParams.orderBy = { type: 'alphabetical' };
    }

    return {
      ...oldColumn,
      dataType: field.type as DataType,
      label: oldColumn.customLabel
        ? oldColumn.label
        : ofName(
            field.displayName,
            newParams.secondaryFields?.length,
            newParams.orderBy.type === 'rare',
            newParams.orderBy.type === 'significant',
            newParams.size
          ),
      sourceField: field.name,
      params: newParams,
    };
  },
  onOtherColumnChanged: (layer, thisColumnId) => {
    const columns = layer.columns;
    const currentColumn = columns[thisColumnId] as TermsIndexPatternColumn;
    if (
      currentColumn.params.orderBy.type === 'column' ||
      (currentColumn.params.orderBy.type === 'alphabetical' &&
        currentColumn.params.orderBy.fallback)
    ) {
      // check whether the column is still there and still a metric
      const columnSortedBy =
        currentColumn.params.orderBy.type === 'column'
          ? columns[currentColumn.params.orderBy.columnId]
          : undefined;
      if (
        !columnSortedBy ||
        (currentColumn.params.orderBy.type === 'column' &&
          !isSortableByColumn(layer, currentColumn.params.orderBy.columnId))
      ) {
        // check whether we can find another metric column to sort by
        const existingMetricColumn = Object.entries(layer.columns)
          .filter(([columnId]) => isSortableByColumn(layer, columnId))
          .map(([id]) => id)[0];
        return {
          ...currentColumn,
          params: {
            ...currentColumn.params,
            orderBy: existingMetricColumn
              ? { type: 'column', columnId: existingMetricColumn }
              : { type: 'alphabetical', fallback: true },
            orderDirection: existingMetricColumn ? 'desc' : 'asc',
          },
        };
      }
    }
    return currentColumn;
  },
  renderFieldInput: function FieldInput(props) {
    const {
      layer,
      selectedColumn,
      columnId,
      indexPattern,
      operationSupportMatrix,
      updateLayer,
      dimensionGroups,
      groupId,
      incompleteParams,
    } = props;
    const onFieldSelectChange = useCallback(
      (fields: string[]) => {
        const column = layer.columns[columnId] as TermsIndexPatternColumn;
        const [sourcefield, ...secondaryFields] = fields;
        const dataTypes = uniq(fields.map((field) => indexPattern.getFieldByName(field)?.type));
        const newDataType = (dataTypes.length === 1 ? dataTypes[0] : 'string') || column.dataType;
        const newParams = {
          ...column.params,
        };
        if ('format' in newParams && newDataType !== 'number') {
          delete newParams.format;
        }
        const mainField = indexPattern.getFieldByName(sourcefield);
        if (
          (!supportsRarityRanking(mainField) && newParams.orderBy.type === 'rare') ||
          (!supportsSignificantRanking(mainField) && newParams.orderBy.type === 'significant')
        ) {
          newParams.orderBy = { type: 'alphabetical' };
        }
        // in single field mode, allow the automatic switch of the function to
        // the most appropriate one
        if (fields.length === 1) {
          const possibleOperations = operationSupportMatrix.operationByField.get(sourcefield);
          const termsSupported = possibleOperations?.has('terms');
          if (!termsSupported) {
            const newFieldOp = getFirstValue(possibleOperations);
            if (newFieldOp) {
              return updateLayer(
                insertOrReplaceColumn({
                  layer,
                  columnId,
                  indexPattern,
                  op: newFieldOp,
                  field: mainField,
                  visualizationGroups: dimensionGroups,
                  targetGroup: groupId,
                  incompleteParams,
                })
              );
            }
          }
        }
        updateLayer({
          ...layer,
          columns: {
            ...layer.columns,
            [columnId]: {
              ...column,
              dataType: newDataType,
              sourceField: sourcefield,
              label: column.customLabel
                ? column.label
                : ofName(
                    mainField?.displayName,
                    fields.length - 1,
                    newParams.orderBy.type === 'rare',
                    newParams.orderBy.type === 'significant',
                    newParams.size
                  ),
              params: {
                ...newParams,
                secondaryFields,
                parentFormat: getParentFormatter({
                  ...newParams,
                  secondaryFields,
                }),
              },
            },
          } as Record<string, TermsIndexPatternColumn>,
        });
      },
      [
        columnId,
        dimensionGroups,
        groupId,
        incompleteParams,
        indexPattern,
        layer,
        operationSupportMatrix.operationByField,
        updateLayer,
      ]
    );
    const currentColumn = layer.columns[columnId];

    const fieldErrorMessage = getErrorMessage(
      selectedColumn,
      Boolean(props.incompleteOperation),
      'field',
      props.currentFieldIsInvalid
    );

    // let the default component do its job in case of incomplete informations
    if (
      !currentColumn ||
      !selectedColumn ||
      props.incompleteOperation ||
      (fieldErrorMessage && !selectedColumn.params?.secondaryFields?.length)
    ) {
      return <FieldInputBase {...props} />;
    }

    const showScriptedFieldError =
      getMultiTermsScriptedFieldErrorMessage(layer, columnId, indexPattern).length > 0;
    const { invalidFields } = getFieldsByValidationState(indexPattern, selectedColumn);

    return (
      <EuiFormRow
        data-test-subj="indexPattern-field-selection-row"
        label={i18n.translate('xpack.lens.indexPattern.terms.chooseFields', {
          defaultMessage: '{count, plural, zero {Field} other {Fields}}',
          values: {
            count: selectedColumn.params?.secondaryFields?.length || 0,
          },
        })}
        fullWidth
        isInvalid={Boolean(showScriptedFieldError || invalidFields.length)}
        error={getInputFieldErrorMessage(showScriptedFieldError, invalidFields)}
      >
        <FieldInputs
          column={selectedColumn}
          indexPattern={indexPattern}
          operationSupportMatrix={operationSupportMatrix}
          onChange={onFieldSelectChange}
          invalidFields={invalidFields}
          showTimeSeriesDimensions={shouldShowTimeSeriesOption(
            layer,
            indexPattern,
            groupId,
            dimensionGroups
          )}
        />
      </EuiFormRow>
    );
  },
  quickFunctionDocumentation: i18n.translate('xpack.lens.indexPattern.terms.documentation.quick', {
    defaultMessage: `
The top values of a specified field ranked by the chosen metric.
      `,
  }),
  handleDataSectionExtra: true,
  paramEditor: function ParamEditor({
    layer,
    paramEditorUpdater,
    currentColumn,
    columnId,
    indexPattern,
    operationDefinitionMap,
    ReferenceEditor,
    paramEditorCustomProps,
    activeData,
    dataSectionExtra,
    ...rest
  }) {
    const [incompleteColumn, setIncompleteColumn] = useState<IncompleteColumn | undefined>(
      undefined
    );

    const hasRestrictions = indexPattern.hasRestrictions;

    const SEPARATOR = '$$$';
    function toValue(orderBy: TermsIndexPatternColumn['params']['orderBy']) {
      if (orderBy.type !== 'column') {
        return orderBy.type;
      }
      return `${orderBy.type}${SEPARATOR}${orderBy.columnId}`;
    }

    function fromValue(value: string): TermsIndexPatternColumn['params']['orderBy'] {
      if (value === 'alphabetical') {
        return { type: 'alphabetical', fallback: false };
      }
      if (value === 'rare') {
        return { type: 'rare', maxDocCount: DEFAULT_MAX_DOC_COUNT };
      }
      if (value === 'significant') {
        return { type: 'significant' };
      }
      if (value === 'custom') {
        return { type: 'custom' };
      }
      const parts = value.split(SEPARATOR);
      return {
        type: 'column',
        columnId: parts[1],
      };
    }

    const getEffectiveLabel = (column: GenericIndexPatternColumn): string => {
      if (column.customLabel) {
        return column.label;
      }
      return (
        (column.label ||
          operationDefinitionMap[column.operationType]?.getDefaultLabel(
            column,
            layer.columns,
            indexPattern
          )) ??
        ''
      );
    };

    const orderOptions = Object.entries(layer.columns)
      .filter(([sortId]) => isSortableByColumn(layer, sortId))
      .map(([sortId, column]) => {
        return {
          value: toValue({ type: 'column', columnId: sortId }),
          text: getEffectiveLabel(column),
        };
      });
    orderOptions.push({
      value: toValue({ type: 'alphabetical' }),
      text: i18n.translate('xpack.lens.indexPattern.terms.orderAlphabetical', {
        defaultMessage: 'Alphabetical',
      }),
    });
    if (
      !currentColumn.params.secondaryFields?.length &&
      supportsRarityRanking(indexPattern.getFieldByName(currentColumn.sourceField))
    ) {
      orderOptions.push({
        value: toValue({ type: 'rare', maxDocCount: DEFAULT_MAX_DOC_COUNT }),
        text: i18n.translate('xpack.lens.indexPattern.terms.orderRare', {
          defaultMessage: 'Rarity',
        }),
      });
    }
    if (
      !currentColumn.params.secondaryFields?.length &&
      supportsSignificantRanking(indexPattern.getFieldByName(currentColumn.sourceField))
    ) {
      orderOptions.push({
        value: toValue({ type: 'significant' }),
        text: i18n.translate('xpack.lens.indexPattern.terms.orderSignificant', {
          defaultMessage: 'Significance',
        }),
      });
    }
    orderOptions.push({
      value: toValue({ type: 'custom' }),
      text: i18n.translate('xpack.lens.indexPattern.terms.orderCustomMetric', {
        defaultMessage: 'Custom',
      }),
    });

    const secondaryFieldsCount = currentColumn.params.secondaryFields
      ? currentColumn.params.secondaryFields.length
      : 0;

    const { euiTheme } = useEuiTheme();

    return (
      <>
        <ValuesInput
          value={currentColumn.params.size}
          disabled={currentColumn.params.orderBy.type === 'rare'}
          onChange={(value) => {
            paramEditorUpdater({
              ...layer,
              columns: {
                ...layer.columns,
                [columnId]: {
                  ...currentColumn,
                  label: currentColumn.customLabel
                    ? currentColumn.label
                    : ofName(
                        indexPattern.getFieldByName(currentColumn.sourceField)?.displayName,
                        secondaryFieldsCount,
                        currentColumn.params.orderBy.type === 'rare',
                        currentColumn.params.orderBy.type === 'significant',
                        value
                      ),
                  params: {
                    ...currentColumn.params,
                    size: value,
                    otherBucket: getOtherBucketSwitchDefault(currentColumn, value),
                  },
                },
              } as Record<string, TermsIndexPatternColumn>,
            });
          }}
        />
        {currentColumn.params.orderBy.type === 'rare' && (
          <ValuesInput
            value={currentColumn.params.orderBy.maxDocCount}
            label={i18n.translate('xpack.lens.indexPattern.terms.maxDocCount', {
              defaultMessage: 'Max doc count per term',
            })}
            maxValue={MAXIMUM_MAX_DOC_COUNT}
            onChange={(value) => {
              paramEditorUpdater(
                updateColumnParam({
                  layer,
                  columnId,
                  paramName: 'orderBy',
                  value: { ...currentColumn.params.orderBy, maxDocCount: value },
                })
              );
            }}
          />
        )}
        <EuiFormRow
          label={
            <>
              {i18n.translate('xpack.lens.indexPattern.terms.orderBy', {
                defaultMessage: 'Rank by',
              })}{' '}
              <EuiIconTip
                color="subdued"
                content={i18n.translate('xpack.lens.indexPattern.terms.orderByHelp', {
                  defaultMessage: `Specifies the dimension the top values are ranked by.`,
                })}
                iconProps={{
                  className: 'eui-alignTop',
                }}
                position="top"
                size="s"
                type="question"
              />
            </>
          }
          display="rowCompressed"
          fullWidth
        >
          <EuiSelect
            compressed
            fullWidth
            data-test-subj="indexPattern-terms-orderBy"
            options={orderOptions}
            value={toValue(currentColumn.params.orderBy)}
            onChange={(e: React.ChangeEvent<HTMLSelectElement>) => {
              const newOrderByValue = fromValue(e.target.value);
              let updatedLayer = updateDefaultLabels(
                updateColumnParam({
                  layer,
                  columnId,
                  paramName: 'orderBy',
                  value: newOrderByValue,
                }),
                indexPattern
              );
              if (newOrderByValue.type === 'custom') {
                const initialOperation = (
                  operationDefinitionMap.count as OperationDefinition<
                    GenericIndexPatternColumn,
                    'field'
                  >
                ).buildColumn({
                  layer,
                  indexPattern,
                  field: indexPattern.getFieldByName(LENS_DOCUMENT_FIELD_NAME)!,
                });
                updatedLayer = updateColumnParam({
                  layer: updatedLayer,
                  columnId,
                  paramName: 'orderAgg',
                  value: initialOperation,
                });
              } else {
                updatedLayer = updateColumnParam({
                  layer: updatedLayer,
                  columnId,
                  paramName: 'orderAgg',
                  value: undefined,
                });
              }
              setIncompleteColumn(undefined);
              paramEditorUpdater(
                updateColumnParam({
                  layer: updatedLayer,
                  columnId,
                  paramName: 'orderDirection',
                  value: newOrderByValue.type === 'alphabetical' ? 'asc' : 'desc',
                })
              );
            }}
            aria-label={i18n.translate('xpack.lens.indexPattern.terms.orderBy', {
              defaultMessage: 'Rank by',
            })}
          />
        </EuiFormRow>
        {currentColumn.params.orderAgg && ReferenceEditor && (
          <>
            <EuiSpacer size="s" />
            <ReferenceEditor
              operationDefinitionMap={operationDefinitionMap}
              functionLabel={i18n.translate('xpack.lens.indexPattern.terms.orderAgg.rankFunction', {
                defaultMessage: 'Rank function',
              })}
              fieldLabel={i18n.translate('xpack.lens.indexPattern.terms.orderAgg.rankField', {
                defaultMessage: 'Rank field',
              })}
              isInline={true}
              paramEditorCustomProps={{
                ...paramEditorCustomProps,
                isInline: true,
                labels: getLabelForRankFunctions(currentColumn.params.orderAgg.operationType),
              }}
              layer={layer}
              selectionStyle="full"
              columnId={`${columnId}-orderAgg`}
              currentIndexPattern={indexPattern}
              paramEditorUpdater={(setter) => {
                if (!isColumn(setter)) {
                  throw new Error('Setter should always be a column when ran here.');
                }
                paramEditorUpdater(
                  updateColumnParam({
                    layer,
                    columnId,
                    paramName: 'orderAgg',
                    value: setter,
                  })
                );
              }}
              column={currentColumn.params.orderAgg}
              incompleteColumn={incompleteColumn}
              onResetIncomplete={() => setIncompleteColumn(undefined)}
              onDeleteColumn={() => {
                throw new Error('Should not be called');
              }}
              onChooseField={(choice) => {
                const field = choice.field && indexPattern.getFieldByName(choice.field);
                if (field) {
                  const hypotethicalColumn = (
                    operationDefinitionMap[choice.operationType] as OperationDefinition<
                      GenericIndexPatternColumn,
                      'field'
                    >
                  ).buildColumn({
                    previousColumn: currentColumn.params.orderAgg,
                    layer,
                    indexPattern,
                    field,
                  });
                  setIncompleteColumn(undefined);
                  paramEditorUpdater(
                    updateColumnParam({
                      layer,
                      columnId,
                      paramName: 'orderAgg',
                      value: hypotethicalColumn,
                    })
                  );
                } else {
                  setIncompleteColumn({
                    sourceField: choice.field,
                    operationType: choice.operationType,
                  });
                }
              }}
              onChooseFunction={(operationType: string, field?: IndexPatternField) => {
                if (field) {
                  const hypotethicalColumn = (
                    operationDefinitionMap[operationType] as OperationDefinition<
                      GenericIndexPatternColumn,
                      'field'
                    >
                  ).buildColumn({
                    previousColumn: currentColumn.params.orderAgg,
                    layer,
                    indexPattern,
                    field,
                  });
                  setIncompleteColumn(undefined);

                  paramEditorUpdater(
                    updateColumnParam({
                      layer,
                      columnId,
                      paramName: 'orderAgg',
                      value: hypotethicalColumn,
                    })
                  );
                } else {
                  setIncompleteColumn({ operationType });
                }
              }}
              validation={{
                input: ['field', 'managedReference'],
                validateMetadata: (meta: OperationMetadata) =>
                  meta.dataType === 'number' && !meta.isBucketed,
              }}
              {...rest}
            />
            <EuiSpacer size="m" />
          </>
        )}
        <EuiFormRow
          label={i18n.translate('xpack.lens.indexPattern.terms.orderDirection', {
            defaultMessage: 'Rank direction',
          })}
          display="rowCompressed"
          fullWidth
        >
          <EuiButtonGroup
            isFullWidth
            legend={i18n.translate('xpack.lens.indexPattern.terms.orderDirection', {
              defaultMessage: 'Rank direction',
            })}
            data-test-subj="indexPattern-terms-orderDirection-groups"
            buttonSize="compressed"
            aria-label={i18n.translate('xpack.lens.indexPattern.terms.orderDirection', {
              defaultMessage: 'Rank direction',
            })}
            isDisabled={isRareOrSignificant(currentColumn.params.orderBy)}
            options={[
              {
                id: `${idPrefix}asc`,
                'data-test-subj': 'indexPattern-terms-orderDirection-groups-asc',
                value: 'asc',
                label: i18n.translate('xpack.lens.indexPattern.terms.orderAscending', {
                  defaultMessage: 'Ascending',
                }),
              },
              {
                id: `${idPrefix}desc`,
                'data-test-subj': 'indexPattern-terms-orderDirection-groups-desc',
                value: 'desc',
                label: i18n.translate('xpack.lens.indexPattern.terms.orderDescending', {
                  defaultMessage: 'Descending',
                }),
              },
            ]}
            idSelected={`${idPrefix}${currentColumn.params.orderDirection}`}
            onChange={(id) => {
              const value = id.replace(
                idPrefix,
                ''
              ) as TermsIndexPatternColumn['params']['orderDirection'];
              paramEditorUpdater(
                updateColumnParam({
                  layer,
                  columnId,
                  paramName: 'orderDirection',
                  value,
                })
              );
            }}
          />
        </EuiFormRow>
        {dataSectionExtra && (
          <>
            <EuiSpacer size="m" />
            {dataSectionExtra}
          </>
        )}
        {!hasRestrictions && (
          <>
            <EuiSpacer size="m" />
            <EuiAccordion
              css={css`
                color: ${euiTheme.colors.primary};
              `}
              id="lnsTermsAdvanced"
              arrowProps={{ color: 'primary' }}
              buttonContent={
                <EuiTitle size="xxs">
                  <h5>
                    <EuiTextColor color={euiTheme.colors.primary}>
                      {i18n.translate('xpack.lens.indexPattern.terms.advancedSettings', {
                        defaultMessage: 'Advanced',
                      })}
                    </EuiTextColor>
                  </h5>
                </EuiTitle>
              }
              data-test-subj="indexPattern-terms-advanced"
              className="lnsIndexPatternDimensionEditor-advancedOptions"
            >
              <EuiSpacer size="s" />
              <EuiSwitch
                label={
                  <EuiText size="xs">
                    {i18n.translate('xpack.lens.indexPattern.terms.missingBucketDescription', {
                      defaultMessage: 'Include documents without the selected field',
                    })}
                  </EuiText>
                }
                compressed
                disabled={
                  !currentColumn.params.otherBucket ||
                  indexPattern.getFieldByName(currentColumn.sourceField)?.type !== 'string' ||
                  isRareOrSignificant(currentColumn.params.orderBy)
                }
                data-test-subj="indexPattern-terms-missing-bucket"
                checked={Boolean(currentColumn.params.missingBucket)}
                onChange={(e: EuiSwitchEvent) =>
                  paramEditorUpdater(
                    updateColumnParam({
                      layer,
                      columnId,
                      paramName: 'missingBucket',
                      value: e.target.checked,
                    })
                  )
                }
              />
              <EuiSpacer size="s" />
              <EuiSwitch
                label={
                  <EuiText size="xs">
                    {i18n.translate('xpack.lens.indexPattern.terms.otherBucketDescription', {
                      defaultMessage: 'Group remaining values as "Other"',
                    })}
                  </EuiText>
                }
                compressed
                data-test-subj="indexPattern-terms-other-bucket"
                checked={Boolean(currentColumn.params.otherBucket)}
                disabled={isRareOrSignificant(currentColumn.params.orderBy)}
                onChange={(e: EuiSwitchEvent) =>
                  paramEditorUpdater(
                    updateColumnParam({
                      layer,
                      columnId,
                      paramName: 'otherBucket',
                      value: e.target.checked,
                    })
                  )
                }
              />
              <EuiSpacer size="s" />
              <EuiSwitch
                label={
                  <EuiText size="xs">
                    {i18n.translate('xpack.lens.indexPattern.terms.accuracyModeDescription', {
                      defaultMessage: 'Enable accuracy mode',
                    })}{' '}
                    <EuiIconTip
                      color="subdued"
                      content={i18n.translate('xpack.lens.indexPattern.terms.accuracyModeHelp', {
                        defaultMessage: `Improves results for high-cardinality data, but increases the load on the Elasticsearch cluster.`,
                      })}
                      iconProps={{
                        className: 'eui-alignTop',
                      }}
                      position="top"
                      size="s"
                      type="question"
                    />
                  </EuiText>
                }
                compressed
                disabled={currentColumn.params.orderBy.type === 'rare'}
                data-test-subj="indexPattern-accuracy-mode"
                checked={Boolean(
                  currentColumn.params.accuracyMode && currentColumn.params.orderBy.type !== 'rare'
                )}
                onChange={(e: EuiSwitchEvent) =>
                  paramEditorUpdater(
                    updateColumnParam({
                      layer,
                      columnId,
                      paramName: 'accuracyMode',
                      value: e.target.checked,
                    })
                  )
                }
              />
              {(currentColumn.dataType === 'number' || currentColumn.dataType === 'string') &&
                !currentColumn.params.secondaryFields?.length && (
                  <>
                    <IncludeExcludeRow
                      include={currentColumn.params.include}
                      exclude={currentColumn.params.exclude}
                      includeIsRegex={Boolean(currentColumn.params.includeIsRegex)}
                      excludeIsRegex={Boolean(currentColumn.params.excludeIsRegex)}
                      tableRows={activeData?.[rest.layerId]?.rows}
                      columnId={columnId}
                      isNumberField={Boolean(currentColumn.dataType === 'number')}
                      updateParams={(operation, operationValue, regex, regexValue) =>
                        paramEditorUpdater({
                          ...layer,
                          columns: {
                            ...layer.columns,
                            [columnId]: {
                              ...currentColumn,
                              params: {
                                ...currentColumn.params,
                                [operation]: operationValue,
                                [regex]: regexValue,
                              },
                            },
                          } as Record<string, TermsIndexPatternColumn>,
                        })
                      }
                    />
                  </>
                )}
            </EuiAccordion>
          </>
        )}
      </>
    );
  },
  getMaxPossibleNumValues: (column) => column.params.size + (column.params.otherBucket ? 1 : 0),
};
function getLabelForRankFunctions(operationType: string) {
  switch (operationType) {
    case 'last_value':
      return [
        i18n.translate('xpack.lens.indexPattern.terms.lastValue.sortRankBy', {
          defaultMessage: 'Sort rank by',
        }),
      ];
    case 'percentile_rank':
      return [
        i18n.translate('xpack.lens.indexPattern.terms.percentile.', {
          defaultMessage: 'Percentile ranks',
        }),
      ];
    default:
      return;
  }
}
