/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect } from 'react';
import type { UseFormReturn } from 'react-hook-form';
import type { IndexFields } from '@kbn/search-queries';
import {
  generateSearchQuery,
  getDefaultQueryFields,
  getDefaultSourceFields,
} from '@kbn/search-queries';

import { useUsageTracker } from './use_usage_tracker';
import type { PlaygroundForm } from '../types';
import { PlaygroundFormFields } from '../types';
import { useIndicesFields } from './use_indices_fields';
import { AnalyticsEvents } from '../analytics/constants';

const mergeDefaultAndCurrentValues = (
  defaultFields: IndexFields,
  currentFields: IndexFields
): IndexFields =>
  Object.keys(defaultFields).reduce<IndexFields>((result, key) => {
    result[key] = currentFields?.[key] ?? defaultFields[key];

    return result;
  }, {});

export const useLoadFieldsByIndices = ({
  watch,
  setValue,
  getValues,
}: Pick<UseFormReturn<PlaygroundForm>, 'watch' | 'getValues' | 'setValue'>) => {
  const usageTracker = useUsageTracker();
  const selectedIndices = watch(PlaygroundFormFields.indices);
  const { fields, isFetched } = useIndicesFields(selectedIndices);

  useEffect(() => {
    // Don't merge fields if we haven't fetched them from indices yet, otherwise we'll overwrite save values with a race condition
    if (!isFetched) return;
    const {
      [PlaygroundFormFields.queryFields]: queryFields,
      [PlaygroundFormFields.sourceFields]: sourceFields,
    } = getValues();

    const defaultFields = getDefaultQueryFields(fields);
    const defaultSourceFields = getDefaultSourceFields(fields);
    const mergedQueryFields = mergeDefaultAndCurrentValues(defaultFields, queryFields);
    const mergedSourceFields = mergeDefaultAndCurrentValues(defaultSourceFields, sourceFields);

    setValue(
      PlaygroundFormFields.elasticsearchQuery,
      generateSearchQuery(mergedQueryFields, mergedSourceFields, fields)
    );
    setValue(PlaygroundFormFields.queryFields, mergedQueryFields);
    setValue(PlaygroundFormFields.sourceFields, mergedSourceFields);

    usageTracker?.count(AnalyticsEvents.sourceFieldsLoaded, Object.values(fields)?.flat()?.length);
  }, [fields, getValues, setValue, usageTracker, isFetched]);
};
