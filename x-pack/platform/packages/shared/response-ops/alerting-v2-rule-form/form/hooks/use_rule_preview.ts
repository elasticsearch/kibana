/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useFormContext, useWatch } from 'react-hook-form';
import type { FormValues } from '../types';
import { getBreachQuery } from '../utils/query_helpers';
import { usePreview } from './use_preview';
import { useRuleFormMeta } from '../contexts';

// Re-export shared types for backward compatibility
export type { PreviewResult as RulePreviewResult, PreviewColumn } from './use_preview';

/**
 * Rule preview hook.
 *
 * Watches the evaluation base query and delegates to the generic `usePreview`
 * hook for ES|QL execution, debouncing, and result mapping.
 */
export const useRulePreview = () => {
  const { control } = useFormContext<FormValues>();
  const { additionalPreviewFilter } = useRuleFormMeta();

  const query = useWatch({ control, name: 'query' });
  const baseQuery = getBreachQuery(query);
  const timeField = useWatch({ control, name: 'timeField' });
  const interval = useWatch({ control, name: 'schedule.every' });
  const lookback = useWatch({ control, name: 'schedule.lookback' });
  const groupingFields = useWatch({ control, name: 'grouping.fields' }) ?? [];

  return usePreview({
    query: baseQuery ?? '',
    timeField,
    interval,
    lookback,
    groupingFields,
    additionalFilter: additionalPreviewFilter,
  });
};
