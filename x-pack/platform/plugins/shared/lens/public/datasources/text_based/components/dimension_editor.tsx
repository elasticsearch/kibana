/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import { i18n } from '@kbn/i18n';
import { EuiFormRow, EuiSpacer, useEuiTheme, EuiText, EuiSwitch } from '@elastic/eui';
import { isSourceParamsESQL, type ExpressionsStart } from '@kbn/expressions-plugin/public';
import { NameInput } from '@kbn/visualization-ui-components';
import { css } from '@emotion/react';
import type {
  TextBasedPrivateState,
  TextBasedLayer,
  DatasourceDimensionEditorProps,
  DataType,
} from '@kbn/lens-common';
import {
  mergeLayer,
  updateColumnDropPartials,
  updateColumnFormat,
  updateColumnLabel,
  isNotNumeric,
  isNumeric,
} from '../utils';
import type { FormatSelectorProps } from '../../form_based/dimension_panel/format_selector';
import { FormatSelector } from '../../form_based/dimension_panel/format_selector';
import { FieldSelect, type FieldOptionCompatible } from './field_select';
import { fetchFieldsFromESQLExpression } from './fetch_fields_from_esql_expression';

export type TextBasedDimensionEditorProps =
  DatasourceDimensionEditorProps<TextBasedPrivateState> & {
    expressions: ExpressionsStart;
  };

export function TextBasedDimensionEditor(props: TextBasedDimensionEditorProps) {
  const [allColumns, setAllColumns] = useState<FieldOptionCompatible[]>([]);
  const query = props.state.layers[props.layerId]?.query;
  const { euiTheme } = useEuiTheme();
  const {
    isFullscreen,
    columnId,
    layerId,
    state,
    setState,
    indexPatterns,
    dateRange,
    expressions,
    esqlVariables,
    enableFormatSelector,
  } = props;

  useEffect(() => {
    // in case the columns are not in the cache, I refetch them
    async function fetchColumns() {
      if (query) {
        const table = await fetchFieldsFromESQLExpression(
          { esql: `${query.esql} | limit 0` },
          expressions,
          { from: dateRange.fromDate, to: dateRange.toDate },
          undefined,
          Object.values(indexPatterns).length
            ? Object.values(indexPatterns)[0].timeFieldName
            : undefined,
          esqlVariables
        );

        if (table) {
          const hasNumberTypeColumns = table.columns?.some(isNumeric);
          const columns = table.columns.map((col) => {
            return {
              id: col.variable ?? col.id,
              name: col.variable ? `??${col.variable}` : col.name,
              meta: col?.meta ?? { type: 'number' },
              variable: col.variable,
              compatible:
                props.isMetricDimension && hasNumberTypeColumns
                  ? props.filterOperations({
                      dataType: col?.meta?.type as DataType,
                      isBucketed: Boolean(isNotNumeric(col)),
                      scale: 'ordinal',
                    })
                  : true,
            };
          });
          setAllColumns(columns);
        }
      }
    }
    fetchColumns();
  }, [
    dateRange.fromDate,
    dateRange.toDate,
    esqlVariables,
    expressions,
    indexPatterns,
    props,
    query,
  ]);

  const selectedField = useMemo(() => {
    const layerColumns = props.state.layers[props.layerId].columns;
    return layerColumns?.find((column) => column.columnId === props.columnId);
  }, [props.columnId, props.layerId, props.state.layers]);

  const updateLayer = useCallback(
    (newLayer: Partial<TextBasedLayer>) =>
      setState((prevState) => mergeLayer({ state: prevState, layerId, newLayer })),
    [layerId, setState]
  );

  const onFormatChange = useCallback<FormatSelectorProps['onChange']>(
    (newFormat) => {
      updateLayer(
        updateColumnFormat({
          layer: state.layers[layerId],
          columnId,
          value: newFormat,
        })
      );
    },
    [columnId, layerId, state.layers, updateLayer]
  );

  const onDropPartialsChange = useCallback(
    (value: boolean) => {
      updateLayer(
        updateColumnDropPartials({
          layer: state.layers[layerId],
          columnId,
          value,
        })
      );
    },
    [columnId, layerId, state.layers, updateLayer]
  );

  const activeTable = props.activeData?.[layerId];
  const activeColumnMeta = activeTable?.columns.find((col) => col.id === columnId)?.meta;
  const isNumericColumn =
    activeColumnMeta != null
      ? activeColumnMeta?.type === 'number'
      : selectedField?.meta?.type === 'number';
  const sourceParams = activeColumnMeta?.sourceParams;

  // Check if the column is a date histogram column, is there a better way to do this?
  const isDateHistogramColumn =
    sourceParams &&
    isSourceParamsESQL(sourceParams) &&
    typeof sourceParams.params === 'object' &&
    sourceParams.params !== null &&
    'used_interval' in sourceParams.params &&
    typeof sourceParams.params.used_interval === 'string';

  return (
    <>
      <div className="lnsIndexPatternDimensionEditor--padded">
        <EuiFormRow
          data-test-subj="text-based-languages-field-selection-row"
          label={i18n.translate('xpack.lens.textBasedLanguages.chooseField', {
            defaultMessage: 'Field',
          })}
          fullWidth
        >
          <FieldSelect
            data-test-subj="text-based-dimension-field"
            existingFields={allColumns ?? []}
            selectedField={selectedField}
            onChoose={(choice) => {
              const column = allColumns?.find((f) => f.name === choice.field);
              const newColumn = {
                columnId: props.columnId,
                fieldName: choice.field,
                meta: column?.meta,
                variable: column?.variable,
                label: choice.field,
                ...(props.isMetricDimension && { inMetricDimension: true }),
              };
              return props.setState(
                !selectedField
                  ? {
                      ...props.state,
                      layers: {
                        ...props.state.layers,
                        [props.layerId]: {
                          ...props.state.layers[props.layerId],
                          columns: [...props.state.layers[props.layerId].columns, newColumn],
                        },
                      },
                    }
                  : {
                      ...props.state,
                      layers: {
                        ...props.state.layers,
                        [props.layerId]: {
                          ...props.state.layers[props.layerId],
                          columns: props.state.layers[props.layerId].columns.map((col) => {
                            if (col.columnId !== props.columnId) {
                              return col;
                            }

                            const isNewColumnNumeric = column?.meta?.type === 'number';
                            const shouldKeepCustomLabel = Boolean(col.customLabel);

                            return {
                              ...col,
                              fieldName: choice.field,
                              meta: column?.meta,
                              variable: column?.variable,
                              // If the new column is not numeric, remove the format selector params
                              ...(!isNewColumnNumeric && col.params ? { params: undefined } : {}),
                              // If the previous column has a custom label, keep it
                              ...(shouldKeepCustomLabel
                                ? {}
                                : {
                                    label: choice.field,
                                    customLabel: false,
                                  }),
                            };
                          }),
                        },
                      },
                    }
              );
            }}
          />
        </EuiFormRow>
        {selectedField && isDateHistogramColumn && (
          <>
            <EuiSpacer size="s" />
            <EuiFormRow display="rowCompressed" hasChildLabel={false}>
              <EuiSwitch
                label={
                  <EuiText size="xs">
                    {i18n.translate('xpack.lens.indexPattern.dateHistogram.dropPartialBuckets', {
                      defaultMessage: 'Drop partial intervals',
                    })}
                  </EuiText>
                }
                data-test-subj="lensDropPartialIntervals"
                checked={Boolean(selectedField.params?.dropPartials)}
                onChange={(e) => onDropPartialsChange(e.target.checked)}
                compressed
              />
            </EuiFormRow>
          </>
        )}
      </div>
      {props.dataSectionExtra}
      {!isFullscreen && selectedField && (
        <div className="lnsIndexPatternDimensionEditor--padded lnsIndexPatternDimensionEditor--collapseNext">
          <EuiText
            size="s"
            css={css`
              margin-bottom: ${euiTheme.size.base};
            `}
          >
            <h4>
              {i18n.translate('xpack.lens.indexPattern.dimensionEditor.headingAppearance', {
                defaultMessage: 'Appearance',
              })}
            </h4>
          </EuiText>

          <NameInput
            value={selectedField.customLabel ? selectedField.label ?? '' : ''}
            defaultValue={selectedField.fieldName}
            onChange={(value) => {
              updateLayer(
                updateColumnLabel({
                  layer: state.layers[layerId],
                  columnId,
                  value,
                })
              );
            }}
          />

          {isNumericColumn && enableFormatSelector ? (
            <FormatSelector
              selectedColumn={selectedField}
              onChange={onFormatChange}
              docLinks={props.core.docLinks}
            />
          ) : null}
        </div>
      )}
    </>
  );
}
