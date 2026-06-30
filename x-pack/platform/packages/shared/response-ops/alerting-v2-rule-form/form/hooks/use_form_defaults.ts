/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useMemo } from 'react';
import { DELAY_MODE } from '../types';
import type { FormValues } from '../types';
import { useDefaultGroupBy } from './use_default_group_by';

interface UseFormDefaultsProps {
  /** The ES|QL query to derive defaults from */
  query: string;
}

/**
 * Computes the default form values based on the provided ES|QL query.
 *
 * This hook extracts:
 * - groupingKey: columns from the STATS ... BY clause
 *
 * The full query is used as-is as the standalone `query.breach.query` — it is
 * not split into base + condition because the executor only uses the breach
 * query field.
 *
 * Note: timeField defaults to '@timestamp' which is the most common time field.
 * TimeFieldSelect may update this if @timestamp is not available in the query results.
 */
export const useFormDefaults = ({ query }: UseFormDefaultsProps): FormValues => {
  const { defaultGroupBy } = useDefaultGroupBy({ query });

  return useMemo(
    () => ({
      kind: 'alert',
      metadata: {
        name: '',
        enabled: true,
        description: '',
      },
      timeField: '@timestamp', // Default to @timestamp; TimeFieldSelect may update if not available
      schedule: {
        every: '1m',
        lookback: '5m',
      },
      query: {
        format: 'standalone',
        breach: {
          query,
        },
      },
      grouping: defaultGroupBy.length
        ? {
            fields: defaultGroupBy,
          }
        : undefined,
      recoveryStrategy: 'no_breach',
      stateTransitionAlertDelayMode: DELAY_MODE.immediate,
      stateTransitionRecoveryDelayMode: DELAY_MODE.immediate,
    }),
    [query, defaultGroupBy]
  );
};
