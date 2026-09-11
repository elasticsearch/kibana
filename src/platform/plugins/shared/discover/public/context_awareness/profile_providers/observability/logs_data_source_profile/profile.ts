/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { BehaviorSubject } from 'rxjs';
import type { DataSourceContext, DataSourceProfileProvider } from '../../../profiles';
import { DataSourceCategory, SolutionType } from '../../../profiles';
import type { ProfileProviderServices } from '../../profile_provider_services';
import {
  getCellRenderers,
  getRowIndicatorProvider,
  getRowAdditionalLeadingControls,
  createGetDefaultAppState,
  getPaginationConfig,
  getColumnsConfiguration,
  createRecommendedFields,
  getDeepAnalysisPlaybook,
} from './accessors';
import { extractIndexPatternFrom } from '../../extract_index_pattern_from';

export type LogOverViewAccordionExpandedValue = 'stacktrace' | 'quality_issues' | undefined;

export interface LogOverviewContext {
  recordId: string;
  initialAccordionSection: LogOverViewAccordionExpandedValue;
}

export interface LogsDataSourceContext {
  logOverviewContext$: BehaviorSubject<LogOverviewContext | undefined>;
}

export type LogsDataSourceProfileProvider = DataSourceProfileProvider<LogsDataSourceContext>;

const LOGS_DATA_SOURCE_PROFILE_ID = 'observability-logs-data-source-profile';

export const isLogsDataSourceContext = (
  dataSourceContext: DataSourceContext
): dataSourceContext is DataSourceContext & LogsDataSourceContext =>
  dataSourceContext.category === DataSourceCategory.Logs &&
  'logOverviewContext$' in dataSourceContext &&
  dataSourceContext.logOverviewContext$ instanceof BehaviorSubject;

export const createLogsDataSourceProfileProvider = (
  services: ProfileProviderServices
): LogsDataSourceProfileProvider => ({
  profileId: LOGS_DATA_SOURCE_PROFILE_ID,
  profile: {
    getDefaultAppState: createGetDefaultAppState(),
    getCellRenderers,
    getRowIndicatorProvider,
    getRowAdditionalLeadingControls,
    getPaginationConfig,
    getColumnsConfiguration,
    getRecommendedFields: createRecommendedFields({}),
    getDeepAnalysisPlaybook,
  },
  resolve: (params) => {
    if (
      params.rootContext.solutionType !== SolutionType.Observability &&
      params.rootContext.solutionType !== SolutionType.Default
    ) {
      return { isMatch: false };
    }

    const indexPattern = extractIndexPatternFrom(params);

    if (!services.logsContextService.isLogsIndexPattern(indexPattern)) {
      return { isMatch: false };
    }

    return {
      isMatch: true,
      context: {
        category: DataSourceCategory.Logs,
        logOverviewContext$: new BehaviorSubject<LogOverviewContext | undefined>(undefined),
      },
    };
  },
});
