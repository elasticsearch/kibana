/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useFormContext, useWatch } from 'react-hook-form';
import type { FormValues } from '../types';
import { getRecoverQuery } from '../utils/query_helpers';
import { usePreview } from './use_preview';
import type { PreviewResult } from './use_preview';

export type { PreviewResult as RecoveryPreviewResult } from './use_preview';

/**
 * Recovery preview hook.
 *
 * Watches the recovery policy form fields and uses the standalone
 * `recoveryPolicy.query.base` as the recovery query.
 *
 * Delegates to `usePreview` for ES|QL execution and result mapping.
 * Disabled when recovery type is not `'query'`.
 */
export const useRecoveryPreview = (): PreviewResult => {
  const { control } = useFormContext<FormValues>();

  const query = useWatch({ control, name: 'query' });
  const recoveryStrategy = useWatch({ control, name: 'recoveryStrategy' });
  const recoveryBase = getRecoverQuery(query);
  const timeField = useWatch({ control, name: 'timeField' });
  const interval = useWatch({ control, name: 'schedule.every' });
  const lookback = useWatch({ control, name: 'schedule.lookback' });
  const groupingFields = useWatch({ control, name: 'grouping.fields' }) ?? [];

  return usePreview({
    query: recoveryBase?.trim() ?? '',
    timeField,
    interval,
    lookback,
    groupingFields,
    enabled: recoveryStrategy === 'query',
  });
};
