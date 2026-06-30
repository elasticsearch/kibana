/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { Fragment, useCallback, useEffect, useMemo, useReducer, useState } from 'react';
import deepEqual from 'fast-deep-equal';
import { lastValueFrom } from 'rxjs';
import type { Filter, Query } from '@kbn/es-query';
import { FormattedMessage } from '@kbn/i18n-react';
import { EuiFormRow, EuiSpacer, EuiTitle } from '@elastic/eui';
import type { IErrorObject } from '@kbn/triggers-actions-ui-plugin/public';
import type { SearchBarProps } from '@kbn/unified-search-plugin/public';
import type { DataView } from '@kbn/data-views-plugin/public';
import { mapAndFlattenFilters, getTime } from '@kbn/data-plugin/public';
import type { SavedQuery, ISearchSource } from '@kbn/data-plugin/public';
import type { FieldOption } from '@kbn/triggers-actions-ui-plugin/public/common';
import {
  BUCKET_SELECTOR_FIELD,
  buildAggregation,
  convertFieldSpecToFieldOption,
  isCountAggregation,
  isGroupAggregation,
  parseAggregationResults,
} from '@kbn/triggers-actions-ui-plugin/public/common';
import { STACK_ALERTS_FEATURE_ID } from '@kbn/rule-data-utils';
import { getComparatorScript } from '../../../../common';
import type { Comparator } from '../../../../common/comparator_types';
import type {
  CommonRuleParams,
  EsQueryRuleMetaData,
  EsQueryRuleParams,
  SearchType,
  SourceField,
} from '../types';
import { DEFAULT_VALUES, SERVERLESS_DEFAULT_VALUES } from '../constants';
import { DataViewSelectPopover } from '../../components/data_view_select_popover';
import { RuleCommonExpressions } from '../rule_common_expressions';
import { useTriggerUiActionServices } from '../util';
import { hasExpressionValidationErrors } from '../validation';

const HIDDEN_FILTER_PANEL_OPTIONS: SearchBarProps['hiddenFilterPanelOptions'] = [
  'pinFilter',
  'disableFilter',
];

interface LocalState extends CommonRuleParams {
  index?: DataView;
  filter: Filter[];
  query: Query;
}

interface LocalStateAction {
  type: SearchSourceParamsAction['type'] | keyof CommonRuleParams;
  payload:
    | SearchSourceParamsAction['payload']
    | (number[] | number | string | string[] | boolean | SourceField[] | undefined);
}

type LocalStateReducer = (prevState: LocalState, action: LocalStateAction) => LocalState;

interface SearchSourceParamsAction {
  type: 'index' | 'filter' | 'query';
  payload: DataView | Filter[] | Query;
}

interface SearchSourceExpressionFormProps {
  searchSource: ISearchSource;
  ruleParams: EsQueryRuleParams<SearchType.searchSource>;
  errors: IErrorObject;
  metadata?: EsQueryRuleMetaData;
  initialSavedQuery?: SavedQuery;
  setParam: (paramField: string, paramValue: unknown) => void;
  onChangeMetaData: (metadata: EsQueryRuleMetaData) => void;
}

const isSearchSourceParam = (action: LocalStateAction): action is SearchSourceParamsAction => {
  return action.type === 'filter' || action.type === 'index' || action.type === 'query';
};

export const SearchSourceExpressionForm = (props: SearchSourceExpressionFormProps) => {
  const services = useTriggerUiActionServices();
  const unifiedSearch = services.unifiedSearch;
  const { dataViews, dataViewEditor, isServerless } = useTriggerUiActionServices();
  const { searchSource, errors, initialSavedQuery, setParam, ruleParams } = props;
  const [savedQuery, setSavedQuery] = useState<SavedQuery>();

  useEffect(() => setSavedQuery(initialSavedQuery), [initialSavedQuery]);

  const [ruleConfiguration, dispatch] = useReducer<LocalStateReducer>(
    (currentState, action) => {
      if (isSearchSourceParam(action)) {
        searchSource.setParent(undefined).setField(action.type, action.payload);
        setParam('searchConfiguration', searchSource.getSerializedFields());

        if (action.type === 'index') {
          setParam('timeField', searchSource.getField('index')?.timeFieldName);
        }
      } else {
        setParam(action.type, action.payload);
      }
      return { ...currentState, [action.type]: action.payload };
    },
    {
      index: searchSource.getField('index'),
      query: searchSource.getField('query')! as Query,
      filter: mapAndFlattenFilters(searchSource.getField('filter') as Filter[]),
      threshold: ruleParams.threshold ?? DEFAULT_VALUES.THRESHOLD,
      thresholdComparator: ruleParams.thresholdComparator ?? DEFAULT_VALUES.THRESHOLD_COMPARATOR,
      timeWindowSize: ruleParams.timeWindowSize ?? DEFAULT_VALUES.TIME_WINDOW_SIZE,
      timeWindowUnit: ruleParams.timeWindowUnit ?? DEFAULT_VALUES.TIME_WINDOW_UNIT,
      aggType: ruleParams.aggType ?? DEFAULT_VALUES.AGGREGATION_TYPE,
      aggField: ruleParams.aggField,
      groupBy: ruleParams.groupBy ?? DEFAULT_VALUES.GROUP_BY,
      termSize: ruleParams.termSize ?? DEFAULT_VALUES.TERM_SIZE,
      termField: ruleParams.termField,
      size:
        ruleParams.size ?? (isServerless ? SERVERLESS_DEFAULT_VALUES.SIZE : DEFAULT_VALUES.SIZE),
      excludeHitsFromPreviousRun:
        ruleParams.excludeHitsFromPreviousRun ?? DEFAULT_VALUES.EXCLUDE_PREVIOUS_HITS,
      // The sourceFields param is ignored
      sourceFields: [],
    }
  );

  const { index: dataView, query, filter: filters } = ruleConfiguration;
  const indexPatterns = useMemo(() => (dataView ? [dataView] : []), [dataView]);

  const [esFields, setEsFields] = useState<FieldOption[]>(
    dataView ? convertFieldSpecToFieldOption(dataView.fields.map((field) => field.toSpec())) : []
  );

  const onSelectDataView = useCallback((newDataView: DataView) => {
    dispatch({ type: 'index', payload: newDataView });
    setEsFields(convertFieldSpecToFieldOption(newDataView.fields.map((field) => field.toSpec())));
  }, []);

  const onUpdateFilters = useCallback(
    (newFilters: Filter[]) => {
      dispatch({ type: 'filter', payload: mapAndFlattenFilters(newFilters) });
    },
    []
  );

  const onChangeQuery = useCallback(
    ({ query: newQuery }: { query?: Query }) => {
      if (!deepEqual(newQuery, query)) {
        dispatch({ type: 'query', payload: newQuery || { ...query, query: '' } });
      }
    },
    [query]
  );

  // needs to change language mode only
  const onQueryBarSubmit = ({ query: newQuery }: { query?: Query }) => {
    if (newQuery?.language !== query.language) {
      dispatch({ type: 'query', payload: { ...query, language: newQuery?.language } as Query });
    }
  };

  // Saved query
  const onSavedQuery = useCallback((newSavedQuery: SavedQuery) => {
    setSavedQuery(newSavedQuery);
    const { filters: newFilters, query: newQuery } = newSavedQuery.attributes;
    if (newFilters) {
      dispatch({ type: 'filter', payload: newFilters });
    }
    if (newQuery) {
      dispatch({ type: 'query', payload: newQuery });
    }
  }, []);

  const onClearSavedQuery = () => {
    setSavedQuery(undefined);
    dispatch({ type: 'query', payload: { ...query, query: '' } });
  };

  // window size
  const onChangeWindowUnit = useCallback(
    (selectedWindowUnit: string) =>
      dispatch({ type: 'timeWindowUnit', payload: selectedWindowUnit }),
    []
  );

  const onChangeWindowSize = useCallback(
    (selectedWindowSize?: number) =>
      selectedWindowSize && dispatch({ type: 'timeWindowSize', payload: selectedWindowSize }),
    []
  );

  // threshold
  const onChangeSelectedThresholdComparator = useCallback(
    (selectedThresholdComparator?: string) =>
      selectedThresholdComparator &&
      dispatch({ type: 'thresholdComparator', payload: selectedThresholdComparator }),
    []
  );

  const onChangeSelectedAggField = useCallback(
    (selectedAggField?: string) => dispatch({ type: 'aggField', payload: selectedAggField }),
    []
  );

  const onChangeSelectedAggType = useCallback(
    (selectedAggType: string) => dispatch({ type: 'aggType', payload: selectedAggType }),
    []
  );

  const onChangeSelectedGroupBy = useCallback(
    (selectedGroupBy?: string) =>
      selectedGroupBy && dispatch({ type: 'groupBy', payload: selectedGroupBy }),
    []
  );

  const onChangeSelectedTermField = useCallback(
    (selectedTermField?: string | string[]) =>
      dispatch({ type: 'termField', payload: selectedTermField }),
    []
  );

  const onChangeSelectedTermSize = useCallback(
    (selectedTermSize?: number) =>
      selectedTermSize && dispatch({ type: 'termSize', payload: selectedTermSize }),
    []
  );

  const onChangeSelectedThreshold = useCallback(
    (selectedThresholds?: number[]) =>
      selectedThresholds && dispatch({ type: 'threshold', payload: selectedThresholds }),
    []
  );

  const onChangeSizeValue = useCallback(
    (updatedValue: number) => dispatch({ type: 'size', payload: updatedValue }),
    []
  );

  const onChangeExcludeHitsFromPreviousRun = useCallback(
    (exclude: boolean) => dispatch({ type: 'excludeHitsFromPreviousRun', payload: exclude }),
    []
  );

  const timeWindow = `${ruleConfiguration.timeWindowSize}${ruleConfiguration.timeWindowUnit}`;

  const createTestSearchSource = useCallback(() => {
    const testSearchSource = searchSource.createCopy();
    const timeFilter = getTime(searchSource.getField('index')!, {
      from: `now-${timeWindow}`,
      to: 'now',
    });
    testSearchSource.setField(
      'filter',
      timeFilter ? [timeFilter, ...ruleConfiguration.filter] : ruleConfiguration.filter
    );
    testSearchSource.setField(
      'aggs',
      buildAggregation({
        aggType: ruleParams.aggType,
        aggField: ruleParams.aggField,
        termField: ruleParams.termField,
        termSize: ruleParams.termSize,
        condition: {
          conditionScript: getComparatorScript(
            (ruleParams.thresholdComparator ?? DEFAULT_VALUES.THRESHOLD_COMPARATOR) as Comparator,
            ruleParams.threshold,
            BUCKET_SELECTOR_FIELD
          ),
        },
      })
    );
    return testSearchSource;
  }, [
    searchSource,
    timeWindow,
    ruleConfiguration,
    ruleParams.aggType,
    ruleParams.aggField,
    ruleParams.termField,
    ruleParams.termSize,
    ruleParams.threshold,
    ruleParams.thresholdComparator,
  ]);

  const onCopyQuery = useCallback(() => {
    const testSearchSource = createTestSearchSource();
    return JSON.stringify(testSearchSource.getSearchRequestBody(), null, 2);
  }, [createTestSearchSource]);

  const onTestFetch = useCallback(async () => {
    const isGroupAgg = isGroupAggregation(ruleParams.termField);
    const isCountAgg = isCountAggregation(ruleParams.aggType);
    const testSearchSource = createTestSearchSource();
    const { rawResponse } = await lastValueFrom(testSearchSource.fetch$());
    return {
      testResults: parseAggregationResults({ isCountAgg, isGroupAgg, esResult: rawResponse }),
      isGrouped: isGroupAgg,
      timeWindow,
    };
  }, [timeWindow, createTestSearchSource, ruleParams.aggType, ruleParams.termField]);

  return (
    <Fragment>
      <EuiFormRow
        fullWidth
        label={
          <FormattedMessage
            id="xpack.stackAlerts.esQuery.ui.selectDataViewPrompt"
            defaultMessage="Select a data view"
          />
        }
      >
        <DataViewSelectPopover
          dependencies={{ dataViews, dataViewEditor }}
          dataView={dataView}
          metadata={props.metadata}
          onSelectDataView={onSelectDataView}
          onChangeMetaData={props.onChangeMetaData}
        />
      </EuiFormRow>
      {Boolean(dataView?.id) && (
        <>
          <EuiSpacer size="s" />
          <EuiTitle size="xs">
            <h5>
              <FormattedMessage
                id="xpack.stackAlerts.esQuery.ui.defineTextQueryPrompt"
                defaultMessage="Define your query"
              />
            </h5>
          </EuiTitle>
          <EuiSpacer size="xs" />
          <unifiedSearch.ui.SearchBar
            appName={STACK_ALERTS_FEATURE_ID}
            onQuerySubmit={onQueryBarSubmit}
            onQueryChange={onChangeQuery}
            suggestionsSize="s"
            displayStyle="inPage"
            query={query}
            indexPatterns={indexPatterns}
            savedQuery={savedQuery}
            filters={filters}
            onFiltersUpdated={onUpdateFilters}
            onClearSavedQuery={onClearSavedQuery}
            onSavedQueryUpdated={onSavedQuery}
            onSaved={onSavedQuery}
            allowSavingQueries
            showQueryInput
            showFilterBar
            showDatePicker={false}
            showAutoRefreshOnly={false}
            showSubmitButton={false}
            dateRangeFrom={undefined}
            dateRangeTo={undefined}
            hiddenFilterPanelOptions={HIDDEN_FILTER_PANEL_OPTIONS}
          />
        </>
      )}

      <EuiSpacer size="m" />

      <RuleCommonExpressions
        threshold={ruleConfiguration.threshold}
        thresholdComparator={ruleConfiguration.thresholdComparator}
        timeWindowSize={ruleConfiguration.timeWindowSize}
        timeWindowUnit={ruleConfiguration.timeWindowUnit}
        size={ruleConfiguration.size}
        esFields={esFields}
        aggType={ruleConfiguration.aggType}
        aggField={ruleConfiguration.aggField}
        groupBy={ruleConfiguration.groupBy}
        termSize={ruleConfiguration.termSize}
        termField={ruleConfiguration.termField}
        onChangeSelectedAggField={onChangeSelectedAggField}
        onChangeSelectedAggType={onChangeSelectedAggType}
        onChangeSelectedGroupBy={onChangeSelectedGroupBy}
        onChangeSelectedTermField={onChangeSelectedTermField}
        onChangeSelectedTermSize={onChangeSelectedTermSize}
        onChangeThreshold={onChangeSelectedThreshold}
        onChangeThresholdComparator={onChangeSelectedThresholdComparator}
        onChangeWindowSize={onChangeWindowSize}
        onChangeWindowUnit={onChangeWindowUnit}
        onChangeSizeValue={onChangeSizeValue}
        errors={errors}
        hasValidationErrors={hasExpressionValidationErrors(props.ruleParams, isServerless)}
        onTestFetch={onTestFetch}
        onCopyQuery={onCopyQuery}
        excludeHitsFromPreviousRun={ruleConfiguration.excludeHitsFromPreviousRun}
        onChangeExcludeHitsFromPreviousRun={onChangeExcludeHitsFromPreviousRun}
        canSelectMultiTerms={DEFAULT_VALUES.CAN_SELECT_MULTI_TERMS}
      />
      <EuiSpacer />
    </Fragment>
  );
};
