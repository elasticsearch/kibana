/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { EuiComboBoxOptionOption } from '@elastic/eui';
import { EuiComboBox, EuiFormLabel, EuiFormRow, EuiSpacer, useEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';
import type { TimeRange } from '@kbn/es-query';
import {
  ESQLVariableType,
  EsqlControlType,
  TIMEFIELD_ROUTE,
  isQueryESQLControl,
  isStaticESQLControl,
  type ESQLControlVariable,
} from '@kbn/esql-types';
import type { OptionsListESQLControlState } from '@kbn/controls-schemas';
import {
  appendStatsByToQuery,
  getESQLResults,
  getIndexPatternFromESQLQuery,
} from '@kbn/esql-utils';
import { isNumericType } from '@kbn/esql-language';
import type { ESQLColumn } from '@kbn/es-types';
import { ESQLValuesPreview } from '@kbn/control-editors-shared-ui';
import { i18n } from '@kbn/i18n';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import type { ISearchGeneric } from '@kbn/search-types';
import { isEqual } from 'lodash';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import useMountedState from 'react-use/lib/useMountedState';
import { UI_SETTINGS } from '@kbn/data-plugin/public';
import { reportEsqlError } from '@kbn/esql-editor';
import { ESQLLangEditor } from '../../../create_editor';
import type { ServiceDeps } from '../../../kibana_services';
import { ControlLabel, ControlSelectionType } from './shared_form_components';

interface ValueControlFormProps {
  search: ISearchGeneric;
  variableType: ESQLVariableType;
  variableName: string;
  controlFlyoutType: EsqlControlType;
  queryString: string;
  setControlState: (state: OptionsListESQLControlState) => void;
  setIsValid: (isValid: boolean) => void;
  initialState?: OptionsListESQLControlState;
  valuesRetrieval?: string;
  timeRange?: TimeRange;
  esqlVariables: ESQLControlVariable[];
}

const SUGGESTED_INTERVAL_VALUES = ['5 minutes', '1 hour', '1 day', '1 week', '1 month'];
const INITIAL_EMPTY_STATE_QUERY = `/** Example
To get the agent field values use:
FROM logs-*
|  WHERE @timestamp <=?_tend and @timestamp >?_tstart
| STATS BY agent
*/`;

export function ValueControlForm({
  variableType,
  initialState,
  queryString,
  variableName,
  controlFlyoutType,
  search,
  setControlState,
  setIsValid,
  valuesRetrieval,
  timeRange,
  esqlVariables,
}: ValueControlFormProps) {
  const isMounted = useMountedState();
  const theme = useEuiTheme();
  const kibana = useKibana<ServiceDeps>();
  const { core } = kibana.services;
  const abortControllerRef = useRef<AbortController>(new AbortController());

  useEffect(() => {
    return () => {
      abortControllerRef.current.abort();
    };
  }, []);

  const [availableValuesOptions, setAvailableValuesOptions] = useState<EuiComboBoxOptionOption[]>(
    variableType === ESQLVariableType.TIME_LITERAL
      ? SUGGESTED_INTERVAL_VALUES.map((option) => {
          return {
            label: option,
            key: option,
            'data-test-subj': option,
          };
        })
      : []
  );

  const [selectedValues, setSelectedValues] = useState<EuiComboBoxOptionOption[]>(
    isStaticESQLControl(initialState)
      ? initialState.available_options.map((option) => {
          return {
            label: option,
            key: option,
            'data-test-subj': option,
          };
        })
      : []
  );

  const [valuesQuery, setValuesQuery] = useState<string>(
    variableType === ESQLVariableType.VALUES
      ? isQueryESQLControl(initialState)
        ? initialState.esql_query
        : INITIAL_EMPTY_STATE_QUERY
      : ''
  );
  const [esqlQueryErrors, setEsqlQueryErrors] = useState<Error[] | undefined>();
  const [previewOptions, setPreviewOptions] = useState<string[] | number[]>([]);
  const [previewColumns, setPreviewColumns] = useState<ESQLColumn[]>([]);
  const [previewError, setPreviewError] = useState<Error | undefined>();
  const [isPreviewQueryRunning, setIsPreviewQueryRunning] = useState<boolean>(false);
  const [showValuesPreview, setShowValuesPreview] = useState<boolean>(false);
  const [label, setLabel] = useState(initialState?.title ?? '');

  const shouldDefaultToMultiSelect = variableType === ESQLVariableType.MULTI_VALUES;
  const [singleSelect, setSingleSelect] = useState<boolean>(
    initialState?.single_select ?? !shouldDefaultToMultiSelect
  );

  const onValuesChange = useCallback((selectedOptions: EuiComboBoxOptionOption[]) => {
    setSelectedValues(selectedOptions);
  }, []);

  const onCreateOption = useCallback(
    (searchValue: string, flattenedOptions: EuiComboBoxOptionOption[] = []) => {
      if (!searchValue) {
        return;
      }

      const normalizedSearchValue = searchValue.trim().toLowerCase();

      const newOption = {
        'data-test-subj': searchValue,
        label: searchValue,
        key: searchValue,
      };

      if (
        flattenedOptions.findIndex(
          (option) => option.label.trim().toLowerCase() === normalizedSearchValue
        ) === -1
      ) {
        setAvailableValuesOptions([...availableValuesOptions, newOption]);
      }

      setSelectedValues((prevSelected) => [...prevSelected, newOption]);
    },
    [availableValuesOptions]
  );

  const onLabelChange = useCallback((e: { target: { value: React.SetStateAction<string> } }) => {
    setLabel(e.target.value);
  }, []);

  const onSelectionTypeChange = useCallback((isSingleSelect: boolean) => {
    setSingleSelect(isSingleSelect);
  }, []);

  const updatePreviewOptionsAndColumns = useCallback(
    (nextOptions: string[] | number[], nextColumns: ESQLColumn[]) => {
      setPreviewOptions(nextOptions);
      setPreviewColumns(nextColumns);
    },
    []
  );

  const onValuesQuerySubmit = useCallback(
    async (query: string) => {
      abortControllerRef.current.abort();
      const controller = new AbortController();
      abortControllerRef.current = controller;

      setIsPreviewQueryRunning(true);
      setShowValuesPreview(true);

      try {
        const timezone = core.uiSettings.get<'Browser' | string>(UI_SETTINGS.DATEFORMAT_TZ);
        const results = await getESQLResults({
          esqlQuery: query,
          search,
          signal: controller.signal,
          filter: undefined,
          dropNullColumns: true,
          timeRange,
          timezone,
          variables: esqlVariables,
        });
        if (!isMounted() || controller.signal.aborted) {
          return;
        }

        setIsPreviewQueryRunning(false);
        const columns = results.response.columns;

        if (columns.length === 1) {
          const [column] = columns;
          const rawValues = results.response.values
            .map((value) => value[0])
            .filter((value) => value !== null && value !== undefined);
          const options = rawValues.map((option) => {
            return {
              label: String(option),
              key: String(option),
              'data-test-subj': String(option),
            };
          });

          updatePreviewOptionsAndColumns(
            isNumericType(column.type)
              ? rawValues.map((option) => Number(option))
              : rawValues.map((option) => String(option)),
            [column]
          );

          setSelectedValues(options);
          setAvailableValuesOptions(options);
          setIsValid(true);
        } else {
          updatePreviewOptionsAndColumns([], columns);
          setIsValid(false);
        }

        setValuesQuery(query);
        setPreviewError(undefined);
        setEsqlQueryErrors([]);
      } catch (e) {
        if (e instanceof DOMException && e.name === 'AbortError') {
          return;
        }
        setIsPreviewQueryRunning(false);
        setIsValid(false);
        setEsqlQueryErrors([e as Error]);
        setPreviewError(e as Error);
      }
    },
    [
      isMounted,
      search,
      timeRange,
      esqlVariables,
      core.uiSettings,
      setIsValid,
      updatePreviewOptionsAndColumns,
    ]
  );

  const setSuggestedQuery = useCallback(async () => {
    const indexPattern = getIndexPatternFromESQLQuery(queryString);
    const response = (await core.http
      ?.post(TIMEFIELD_ROUTE, { body: JSON.stringify({ query: `FROM ${indexPattern}` }) })
      .catch((error) => {
        reportEsqlError(error, { errorType: 'ControlFlyoutTimefieldFetch' });
        return undefined;
      })) as { timeField?: string } | undefined;

    const timeField = response?.timeField;
    const timeFilter = Boolean(timeField)
      ? ` | WHERE ${timeField} <= ?_tend and ${timeField} > ?_tstart`
      : '';
    const queryForValues = `FROM ${indexPattern}${timeFilter} | STATS BY ${valuesRetrieval}`;
    onValuesQuerySubmit(queryForValues);
  }, [queryString, core.http, valuesRetrieval, onValuesQuerySubmit]);

  useEffect(() => {
    if (!selectedValues?.length && controlFlyoutType === EsqlControlType.VALUES_FROM_QUERY) {
      if (isQueryESQLControl(initialState)) {
        onValuesQuerySubmit(initialState.esql_query);
      } else if (valuesRetrieval) {
        setSuggestedQuery();
      }
    }
  }, [
    selectedValues?.length,
    controlFlyoutType,
    initialState,
    variableName,
    valuesRetrieval,
    onValuesQuerySubmit,
    setSuggestedQuery,
  ]);

  useEffect(() => {
    const availableOptions = selectedValues.map((value) => value.label);
    // removes the question mark from the variable name
    const variableNameWithoutQuestionmark = variableName.replace(/^\?+/, '');
    const state = {
      available_options: availableOptions,
      selected_options: [availableOptions[0]],
      single_select: singleSelect,
      title: label || variableNameWithoutQuestionmark,
      variable_name: variableNameWithoutQuestionmark,
      variable_type: singleSelect ? variableType : ESQLVariableType.MULTI_VALUES,
      esql_query: valuesQuery || queryString,
      control_type: controlFlyoutType,
    };
    if (!isEqual(state, initialState)) {
      setControlState(state);
    }
  }, [
    singleSelect,
    controlFlyoutType,
    initialState,
    label,
    queryString,
    selectedValues,
    setControlState,
    valuesQuery,
    variableName,
    variableType,
  ]);

  const updateQuery = useCallback(
    (column: string) => {
      const updatedQuery = appendStatsByToQuery(valuesQuery, column);
      onValuesQuerySubmit(updatedQuery);
    },
    [onValuesQuerySubmit, valuesQuery]
  );

  return (
    <>
      {controlFlyoutType === EsqlControlType.VALUES_FROM_QUERY && (
        <>
          <EuiFormLabel
            css={css`
              display: block;
              width: 100%;
              margin-block-start: ${theme.euiTheme.size.s};
              padding-block-start: ${theme.euiTheme.size.s};
              padding-block-end: ${theme.euiTheme.size.s};
              border-bottom: ${theme.euiTheme.border.thin};
            `}
          >
            {i18n.translate('esql.flyout.valuesQueryEditor.label', {
              defaultMessage: 'Values query',
            })}
          </EuiFormLabel>
          <EuiSpacer size="xs" />
          <ESQLLangEditor
            query={{ esql: valuesQuery }}
            onTextLangQueryChange={(q) => {
              setIsValid(false);
              setValuesQuery(q.esql);
              setPreviewError(undefined);
            }}
            disableAutoFocus={true}
            errors={esqlQueryErrors}
            editorIsInline
            onTextLangQuerySubmit={async (q, a) => {
              if (q) {
                await onValuesQuerySubmit(q.esql);
              }
            }}
            isDisabled={false}
            isLoading={false}
            esqlVariables={esqlVariables}
          />
          {showValuesPreview && (
            <>
              <EuiSpacer size="s" />
              <ESQLValuesPreview
                previewOptions={previewOptions}
                previewColumns={previewColumns}
                previewError={previewError}
                updateQuery={updateQuery}
                isQueryRunning={isPreviewQueryRunning}
                useRange={false /* TODO: Remove when variable controls can produce range sliders */}
              />
            </>
          )}
        </>
      )}
      {controlFlyoutType === EsqlControlType.STATIC_VALUES && (
        <EuiFormRow
          label={i18n.translate('esql.flyout.values.label', {
            defaultMessage: 'Values',
          })}
          fullWidth
        >
          <EuiComboBox
            aria-label={i18n.translate('esql.flyout.values.placeholder', {
              defaultMessage: 'Select or add values',
            })}
            placeholder={i18n.translate('esql.flyout.values.placeholder', {
              defaultMessage: 'Select or add values',
            })}
            data-test-subj="esqlValuesOptions"
            options={availableValuesOptions}
            selectedOptions={selectedValues}
            onChange={onValuesChange}
            onCreateOption={onCreateOption}
            isClearable
            fullWidth
            compressed
            css={css`
              max-height: 200px;
              overflow-y: auto;
              .euiFormControlLayoutIcons {
                align-items: flex-start;
                padding-block-start: 1ch;
              }
            `}
          />
        </EuiFormRow>
      )}
      <ControlLabel label={label} onLabelChange={onLabelChange} />

      <ControlSelectionType
        singleSelect={singleSelect}
        onSelectionTypeChange={onSelectionTypeChange}
      />
    </>
  );
}
