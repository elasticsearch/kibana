/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { SavedObjectReference } from '@kbn/core-saved-objects-api-server';
import { toAsCodeTags } from '@kbn/as-code-shared-transforms';

import { DEFAULT_DASHBOARD_STATE } from '../../../../common/default_dashboard_state';
import type { DashboardSavedObjectAttributes } from '../../../dashboard_saved_object';
import type { getDashboardStateSchema } from '../../dashboard_state_schemas';
import type { DashboardState, Warnings } from '../../types';
import { transformOptionsOut } from './transform_options_out';
import { transformPanelsOut } from './transform_panels_out';
import { transformPinnedPanelsOut } from './transform_pinned_panels_out';
import { transformSearchSourceOut } from './transform_search_source_out';
import { logger } from '../../../kibana_services';

export function transformDashboardOut(
  attributes: DashboardSavedObjectAttributes | Partial<DashboardSavedObjectAttributes>,
  references: SavedObjectReference[] | undefined = undefined,
  isDashboardAppRequest: boolean = false,
  strictValidationSchema: ReturnType<typeof getDashboardStateSchema>
): {
  dashboardState: DashboardState;
  warnings: Warnings;
} {
  const {
    pinned_panels,
    controlGroupInput: legacyControls,
    description,
    kibanaSavedObjectMeta,
    optionsJSON,
    panelsJSON,
    sections,
    refreshInterval,
    timeFrom,
    timeRestore,
    timeTo,
    title,
    projectRouting,
  } = attributes;

  const { tags } = toAsCodeTags(references);

  const { panels, warnings } = transformPanelsOut(
    panelsJSON,
    sections,
    references,
    isDashboardAppRequest
  );

  const { panels: pinnedPanels, warnings: pinnedPanelWarnings } = transformPinnedPanelsOut(
    legacyControls,
    pinned_panels,
    references
  );

  const timeRange =
    timeRestore && timeFrom && timeTo
      ? {
          from: timeFrom,
          to: timeTo,
        }
      : undefined;

  const options = transformOptionsOut(optionsJSON ?? '{}', legacyControls?.showApplySelections);

  const {
    filters,
    query,
    warnings: searchSourceWarnings,
  } = transformSearchSourceOut(kibanaSavedObjectMeta, references, strictValidationSchema);

  /**
   * Handle validating each state key that wasn't already validated above; if any validation fails,
   * just default back to the default state for that key
   */
  const otherStateWarnings: Warnings = [];
  let validatedState: Partial<
    Pick<
      DashboardState,
      | 'description'
      | 'project_routing'
      | 'refresh_interval'
      | 'tags'
      | 'time_range'
      | 'title'
      | 'options'
    >
  > = {
    description,
    options: options as DashboardState['options'], // defaults will be injected, so safe to remove partial typing
    project_routing: projectRouting,
    ...(refreshInterval && {
      refresh_interval: { pause: refreshInterval.pause, value: refreshInterval.value },
    }),
    tags,
    time_range: timeRange,
    title: title ?? '',
  };
  (Object.keys(validatedState) as Array<keyof typeof validatedState>).forEach((key) => {
    try {
      validatedState = {
        ...validatedState,
        [key]: strictValidationSchema.validateKey(key, validatedState[key]),
      };
    } catch (error) {
      const warningMessage = `Unexpected error transforming ${key}. Error: ${error.message}`;
      logger.warn(warningMessage);
      otherStateWarnings.push({
        type: 'dropped_property',
        message: warningMessage,
        key,
        value: validatedState[key],
      });
      // fallback to default state
      validatedState = {
        ...validatedState,
        [key]: DEFAULT_DASHBOARD_STATE[key],
      };
    }
  });
  // drop keys that are undefined
  validatedState = Object.fromEntries(
    Object.entries(validatedState).filter(([_, value]) => value !== undefined)
  );

  // try to maintain a consistent (alphabetical) order of keys
  return {
    dashboardState: {
      ...(validatedState as DashboardState), // defaults have been injected at this point, so casting is safe
      /** These keys were validated seperately, since they each have unique error handling */
      ...(filters && { filters }),
      panels,
      pinned_panels: pinnedPanels,
      ...(query && { query }),
    },
    warnings: [...warnings, ...pinnedPanelWarnings, ...searchSourceWarnings, ...otherStateWarnings],
  };
}
