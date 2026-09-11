/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { FunctionComponent } from 'react';
import type { DataGridCellValueElementProps } from '@kbn/unified-data-table';
import type { DataSourceProfileProvider } from '../../../profiles';
import { DataSourceCategory, SolutionType } from '../../../profiles';
import { extractIndexPatternFrom } from '../../extract_index_pattern_from';
import type { ProfileProviderServices } from '../../profile_provider_services';
import { createCellRendererAccessor } from '../accessors/get_cell_renderer_accessor';
import { createDefaultSecuritySolutionAppStateGetter } from '../accessors/get_default_app_state';
import { getAlertEventRowIndicator } from '../accessors/get_row_indicator';
import {
  ALERTS_INDEX_PATTERN,
  ALLOWED_CELL_RENDER_FIELDS,
  SECURITY_PROFILE_ID,
} from '../constants';
import {
  containsOnlySecuritySourcePatterns,
  isSecurityDataViewId,
} from './is_security_data_source';

export interface SecurityDataSourceContext {
  getSecuritySolutionCellRenderer?: (
    fieldName: string
  ) => FunctionComponent<DataGridCellValueElementProps> | undefined;
}

export const createSecurityDataSourceProfileProvider = (
  services: ProfileProviderServices
): DataSourceProfileProvider<SecurityDataSourceContext> => {
  const cellRendererFeature = services.discoverShared.features.registry.getById(
    'security-solution-cell-renderer'
  );

  return {
    profileId: SECURITY_PROFILE_ID.dataSource,
    profile: {
      getCellRenderers:
        (prev, { context }) =>
        (params) => {
          const entries = prev(params);
          if (!params.dataView.getIndexPattern().includes(ALERTS_INDEX_PATTERN)) {
            return entries;
          }

          ALLOWED_CELL_RENDER_FIELDS.forEach((fieldName) => {
            entries[fieldName] =
              context.getSecuritySolutionCellRenderer?.(fieldName) ?? entries[fieldName];
          });

          for (const field of params.dataView.fields.getByType('ip')) {
            if (!entries[field.name]) {
              const renderer = context.getSecuritySolutionCellRenderer?.(field.name);
              if (renderer) {
                entries[field.name] = renderer;
              }
            }
          }

          return entries;
        },
      getRowIndicatorProvider: () => () => getAlertEventRowIndicator,
      getDefaultAppState: createDefaultSecuritySolutionAppStateGetter(),
    },
    resolve: async (params) => {
      const { solutionType } = params.rootContext;
      if (solutionType !== SolutionType.Security && solutionType !== SolutionType.Default) {
        return { isMatch: false };
      }

      if (
        solutionType === SolutionType.Default &&
        !isSecurityDataViewId(params.dataView?.id) &&
        !containsOnlySecuritySourcePatterns(extractIndexPatternFrom(params))
      ) {
        return { isMatch: false };
      }

      const getCellRenderer = await createCellRendererAccessor(cellRendererFeature);

      return {
        isMatch: true,
        context: {
          category: DataSourceCategory.Security,
          getSecuritySolutionCellRenderer: getCellRenderer,
        },
      };
    },
  };
};
