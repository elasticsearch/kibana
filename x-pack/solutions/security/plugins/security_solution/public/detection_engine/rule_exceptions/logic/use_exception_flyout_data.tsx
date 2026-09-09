/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { DataViewBase } from '@kbn/es-query';
import { getIndexListFromEsqlQuery } from '@kbn/securitysolution-utils';

import type { DataViewSpec, FieldSpec } from '@kbn/data-views-plugin/common';

import { useAppToasts } from '../../../common/hooks/use_app_toasts';
import type { Rule } from '../../rule_management/logic/types';
import { useKibana } from '../../../common/lib/kibana';
import { useFetchIndex } from '../../../common/containers/source';

import * as i18n from '../../../common/containers/source/translations';
import { useRuleIndices } from '../../rule_management/logic/use_rule_indices';
import { getMachineLearningJobId } from '../../common/helpers';

export interface ReturnUseFetchExceptionFlyoutData {
  isLoading: boolean;
  indexPatterns: DataViewBase;
  getExtendedFields: (fields: string[]) => Promise<FieldSpec[]>;
}

/**
 * Hook for fetching the fields to be used for populating the exception
 * item conditions options.
 *
 */
export const useFetchIndexPatterns = (rules: Rule[] | null): ReturnUseFetchExceptionFlyoutData => {
  const { data, spaces } = useKibana().services;
  const { addWarning } = useAppToasts();
  // Tracks the last `memoDataViewId` we've settled a fetch for (resolved or failed).
  // Drives `isDataViewLoading` so loading stays true from mount until the data view
  // fetch completes, since that fetch is gated behind an async active-space lookup.
  const [resolvedDataViewId, setResolvedDataViewId] = useState<string | null>(null);
  const [activeSpaceId, setActiveSpaceId] = useState('');
  const isSingleRule = useMemo(() => rules != null && rules.length === 1, [rules]);
  const isMLRule = useMemo(
    () => rules != null && isSingleRule && rules[0].type === 'machine_learning',
    [isSingleRule, rules]
  );

  useEffect(() => {
    const fetchAndSetActiveSpace = async () => {
      if (spaces) {
        const aSpace = await spaces.getActiveSpace();
        setActiveSpaceId(aSpace.id);
      }
    };
    fetchAndSetActiveSpace();
  }, [spaces]);
  // If data view is defined, it superceeds use of rule defined index patterns.
  // If no rule is available, use fields from default data view id.
  const memoDataViewId = useMemo(() => {
    if (rules != null && isSingleRule) {
      return ('data_view_id' in rules[0] && rules[0].data_view_id) || null;
    }
    return `security-solution-${activeSpaceId}`;
  }, [isSingleRule, rules, activeSpaceId]);

  const memoNonDataViewIndexPatterns = useMemo(() => {
    if (rules != null && isSingleRule && rules[0].type === 'esql') {
      return getIndexListFromEsqlQuery(rules?.[0].query);
    }
    return !memoDataViewId &&
      rules != null &&
      isSingleRule &&
      'index' in rules[0] &&
      rules[0].index != null
      ? rules[0].index
      : [];
  }, [memoDataViewId, isSingleRule, rules]);

  // Index pattern logic for ML
  const memoMlJobIds = useMemo(() => {
    if (isMLRule && isSingleRule && rules != null) {
      return getMachineLearningJobId(rules[0]) ?? [];
    }
    return [];
  }, [isMLRule, isSingleRule, rules]);
  const { mlJobLoading, ruleIndices: mlRuleIndices } = useRuleIndices(memoMlJobIds);

  // We only want to provide a non empty array if it's an ML rule and we were able to fetch
  // the index patterns, or if it's a rule not using data views. Otherwise, return an empty
  // empty array to avoid making the `useFetchIndex` call
  const memoRuleIndices = useMemo(() => {
    if (isMLRule && mlRuleIndices.length > 0) {
      return mlRuleIndices;
    } else if (memoDataViewId != null) {
      return [];
    } else {
      return memoNonDataViewIndexPatterns;
    }
  }, [isMLRule, memoDataViewId, memoNonDataViewIndexPatterns, mlRuleIndices]);

  const [
    isIndexPatternLoading,
    { indexPatterns: indexIndexPatterns, dataView: indexDataViewSpec },
  ] = useFetchIndex(memoRuleIndices, false, 'indexFields');

  // Data view logic
  const [dataViewIndexPatterns, setDataViewIndexPatterns] = useState<DataViewBase | null>(null);
  const [dataViewSpec, setDataViewSpec] = useState<DataViewSpec | null>(null);
  useEffect(() => {
    const fetchSingleDataView = async () => {
      // ensure the memoized data view includes a space id, otherwise
      // we could be trying to fetch a data view that does not exist, which would
      // throw an error here.
      if (activeSpaceId !== '' && memoDataViewId) {
        // We wrap dataViews.get within a try catch because we've seen errors happening with conflicting ids in the saved object api
        try {
          const dv = await data.dataViews.get(memoDataViewId);
          await data.dataViews.refreshFields(dv);
          setDataViewIndexPatterns(dv);
          setDataViewSpec(dv.toSpec());
        } catch (error) {
          addWarning(error, { title: 'Failed to load data view for exceptions flyout' });
        } finally {
          // Mark this id as settled (whether it resolved, failed, or returned no fields)
          // so `isDataViewLoading` stops reporting a load instead of hanging.
          setResolvedDataViewId(memoDataViewId);
        }
      }
    };

    fetchSingleDataView();
  }, [memoDataViewId, data.dataViews, setDataViewIndexPatterns, activeSpaceId, addWarning]);

  // Fetch extended fields information
  const getExtendedFields = useCallback(
    async (fields: string[]) => {
      let extendedFields: FieldSpec[] = [];
      const dv = dataViewSpec ?? indexDataViewSpec;
      if (!dv) {
        return extendedFields;
      }
      try {
        extendedFields = await data.dataViews.getFieldsForIndexPattern(dv, {
          includeUnmapped: true,
          fields,
        });
      } catch (error) {
        addWarning(error, { title: i18n.FETCH_FIELDS_WITH_UNMAPPED_DATA_ERROR });
      }
      return extendedFields;
    },
    [addWarning, data.dataViews, dataViewSpec, indexDataViewSpec]
  );

  // Determine whether to use index patterns or data views
  const indexPatternsToUse = useMemo(
    (): DataViewBase =>
      memoDataViewId && dataViewIndexPatterns != null ? dataViewIndexPatterns : indexIndexPatterns,
    [memoDataViewId, dataViewIndexPatterns, indexIndexPatterns]
  );

  // For data-view-backed rules the field fetch is gated behind an async active-space
  // lookup, so on the first renders the effect above hasn't started and the other
  // loading flags are false. Report loading from mount until the current data view id
  // has settled, so consumers don't observe a premature "loaded" state while the
  // condition-builder combobox is still empty.
  const isDataViewLoading = memoDataViewId != null && resolvedDataViewId !== memoDataViewId;

  return {
    isLoading: isIndexPatternLoading || mlJobLoading || isDataViewLoading,
    indexPatterns: indexPatternsToUse,
    getExtendedFields,
  };
};
