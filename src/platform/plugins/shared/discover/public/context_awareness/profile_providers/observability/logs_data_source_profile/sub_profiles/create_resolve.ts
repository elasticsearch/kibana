/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { createRegExpPatternFrom, testPatternAgainstAllowedList } from '@kbn/data-view-utils';
import { BehaviorSubject } from 'rxjs';
import { DataSourceCategory, SolutionType } from '../../../../profiles';
import { extractIndexPatternFrom } from '../../../extract_index_pattern_from';
import type { LogOverviewContext, LogsDataSourceProfileProvider } from '../profile';

export const createResolve = (
  baseIndexPattern: string
): LogsDataSourceProfileProvider['resolve'] => {
  const testIndexPattern = testPatternAgainstAllowedList([
    createRegExpPatternFrom(baseIndexPattern, 'data'),
  ]);

  return (params) => {
    if (
      params.rootContext.solutionType !== SolutionType.Observability &&
      params.rootContext.solutionType !== SolutionType.Default
    ) {
      return { isMatch: false };
    }

    const indexPattern = extractIndexPatternFrom(params);

    if (!indexPattern || !testIndexPattern(indexPattern)) {
      return { isMatch: false };
    }

    return {
      isMatch: true,
      context: {
        category: DataSourceCategory.Logs,
        logOverviewContext$: new BehaviorSubject<LogOverviewContext | undefined>(undefined),
      },
    };
  };
};
