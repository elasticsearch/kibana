/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { TRACES_PRODUCT_FEATURE_ID } from '../../../../../common/constants';
import {
  SolutionType,
  DataSourceCategory,
  type DataSourceProfileProvider,
} from '../../../profiles';
import { extractIndexPatternFrom } from '../../extract_index_pattern_from';
import type { ProfileProviderServices } from '../../profile_provider_services';
import {
  getCellRenderers,
  getDefaultAppState,
  getChartSectionConfiguration,
  getDeepAnalysisPlaybook,
} from './accessors';
import { isValidNonTransformationalESQLQuery } from '../../../utils/is_valid_non_transformational_esql_query';
import { DataSourceType } from '../../../../../common/data_sources';

export const OBSERVABILITY_TRACES_DATA_SOURCE_PROFILE_ID =
  'observability-traces-data-source-profile';

export const createTracesDataSourceProfileProvider = ({
  apmContextService,
}: ProfileProviderServices): DataSourceProfileProvider => ({
  profileId: OBSERVABILITY_TRACES_DATA_SOURCE_PROFILE_ID,
  restrictedToProductFeature: TRACES_PRODUCT_FEATURE_ID,
  profile: {
    getDefaultAppState,
    getCellRenderers,
    getChartSectionConfiguration: getChartSectionConfiguration(),
    getDeepAnalysisPlaybook,
  },
  resolve: (params) => {
    if (
      (params.rootContext.solutionType === SolutionType.Observability ||
        params.rootContext.solutionType === SolutionType.Default) &&
      apmContextService.tracesService.isTracesIndexPattern(extractIndexPatternFrom(params)) &&
      (params.dataSource?.type === DataSourceType.DataView ||
        isValidNonTransformationalESQLQuery(params.query))
    ) {
      return {
        isMatch: true,
        context: {
          category: DataSourceCategory.Traces,
        },
      };
    }

    return { isMatch: false };
  },
});
