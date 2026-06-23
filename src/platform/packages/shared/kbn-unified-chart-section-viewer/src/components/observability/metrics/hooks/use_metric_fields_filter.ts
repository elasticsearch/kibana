/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { useMemo } from 'react';
import { fieldNameWildcardMatcher } from '@kbn/field-utils';
import type { ParsedMetricItem } from '../../../../types';

export const useMetricFieldsFilter = ({
  metricItems,
  searchTerm,
}: {
  metricItems: ParsedMetricItem[];
  searchTerm: string;
}) => {
  const filteredMetricItems = useMemo(() => {
    const normalizedSearchTerm = searchTerm.trim().toLowerCase();

    return metricItems.filter((metricItem) => {
      if (!normalizedSearchTerm) {
        return true;
      }

      return fieldNameWildcardMatcher({ name: metricItem.metricName }, normalizedSearchTerm);
    });
  }, [metricItems, searchTerm]);

  return { filteredMetricItems };
};
