/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { flow } from 'lodash';

import type { Reference } from '@kbn/content-management-utils';
import {
  type LegacyIgnoreParentSettings,
  type LegacyStoredPinnedControlState,
} from '@kbn/controls-schemas';
import { transformType } from '@kbn/embeddable-plugin/server';
import { pinnedControlSchema } from '@kbn/controls-schemas/src/controls_group_schema';

import type {
  DashboardPinnedPanel,
  DashboardPinnedPanelsState,
} from '@kbn/as-code-dashboard-schema';
import type { DashboardSavedObjectAttributes } from '../../../dashboard_saved_object';
import { embeddableService } from '../../../kibana_services';
import type { Warnings } from '../../types';

export type StoredPinnedPanels =
  Required<DashboardSavedObjectAttributes>['pinned_panels']['panels'];

export function transformPinnedPanelsOut(
  controlGroupInput: DashboardSavedObjectAttributes['controlGroupInput'], // legacy
  pinnedPanels: DashboardSavedObjectAttributes['pinned_panels'],
  containerReferences: Reference[] = []
): { panels: DashboardPinnedPanelsState; warnings: Warnings } {
  let warnings: Warnings = [];
  let transformedPanels: DashboardPinnedPanelsState = [];
  if (pinnedPanels) {
    /**
     * >=9.4, pinned panels are stored in the SO under the key `pinned_panels` without any JSON bucketing
     */
    ({ warnings, panels: transformedPanels } = transformPanels(
      flow(transformPinnedPanelsObjectToArray, transformPinnedPanelProperties)(pinnedPanels.panels),
      containerReferences
    ));
  } else if (controlGroupInput) {
    /**
     * <9.4, pinned panels were stored in the SO under `controlGroupInput` with the JSON bucket `panelsJSON`
     * This was before pinned panels were transformed to be generic - they **only** stored controls
     */
    ({ warnings, panels: transformedPanels } = controlGroupInput.panelsJSON
      ? transformPanels(
          flow(
            JSON.parse,
            transformPinnedPanelsObjectToArray,
            transformPinnedPanelProperties
          )(controlGroupInput.panelsJSON),
          containerReferences
        )
      : { warnings: [], panels: [] });
    /** For legacy controls (<v9.2.0), pass relevant ignoreParentSettings into each individual control panel */
    const legacyControlGroupOptions: LegacyIgnoreParentSettings | undefined =
      controlGroupInput.ignoreParentSettingsJSON
        ? JSON.parse(controlGroupInput.ignoreParentSettingsJSON)
        : undefined;
    if (legacyControlGroupOptions) {
      // Ignore filters if the legacy control group option is set to ignore filters, or if the legacy chaining system
      // is set to NONE. Including the chaining system check inside this if block is okay to do, because we don't expect
      // a legacy chaining system to be defined without legacyCon4trolGroupOptions also being defined
      const ignoreFilters =
        controlGroupInput.chainingSystem === 'NONE' ||
        legacyControlGroupOptions.ignoreFilters ||
        legacyControlGroupOptions.ignoreQuery;
      transformedPanels.map(({ config, ...rest }) => ({
        ...rest,
        config: {
          use_global_filters: !ignoreFilters,
          ignore_validations: legacyControlGroupOptions.ignoreValidations,
          ...config,
        },
      }));
    }
  }

  return { warnings, panels: transformedPanels };
}

/**
 * The SO stores pinned panel as an object with `order` while the Dashboard API expects an array
 */
export function transformPinnedPanelsObjectToArray(
  controls: StoredPinnedPanels
): Array<StoredPinnedPanels[string] & { id: string }> {
  return Object.entries(controls).map(([id, control]) => ({ ...control, id }));
}

/**
 * <9.4 The SO stores the panel config under `explicitInput`
 * >=9.4 the SO stores the panel config under `config`
 */
export function transformPinnedPanelProperties(
  controls: Array<
    (
      | LegacyStoredPinnedControlState[number]
      | Required<DashboardSavedObjectAttributes>['pinned_panels']['panels'][number]
    ) & { id: string }
  >
): DashboardPinnedPanelsState {
  return controls
    .sort(({ order: orderA = 0 }, { order: orderB = 0 }) => orderA - orderB)
    .map(({ id, type, grow, width, ...rest }) => {
      return {
        id,
        type: transformType(type),
        ...(grow !== undefined && { grow }),
        ...(width !== undefined && { width }),
        config: 'explicitInput' in rest ? rest.explicitInput : rest.config,
      } as DashboardPinnedPanel;
    });
}

/**
 * Inject references via the embeddable transforms
 */
function transformPanels(
  panels: DashboardPinnedPanelsState,
  containerReferences: Reference[]
): { panels: DashboardPinnedPanelsState; warnings: Warnings } {
  const transformedPanels: DashboardPinnedPanelsState = [];
  const warnings: Warnings = [];

  panels.forEach((panel) => {
    const { transformOut, schema } = embeddableService.getTransforms(panel.type) ?? {};
    // eslint-disable-next-line prefer-const
    let { config, type, ...rest } = panel;
    try {
      if (transformOut) {
        config = transformOut(
          config,
          [],
          containerReferences,
          panel.id
        ) as DashboardPinnedPanel['config'];
      }
      if (schema) {
        config = schema.parse(config) as DashboardPinnedPanel['config'];
      }
      transformedPanels.push({
        ...pinnedControlSchema.parse(rest),
        config,
        type,
      } as DashboardPinnedPanel);
    } catch (e) {
      warnings.push({
        type: 'dropped_panel',
        panel_type: panel.type,
        panel_config: panel.config,
        message: `Unable to transform pinned panel config. Error: ${e.message}`,
      });
    }
  });
  return { warnings, panels: transformedPanels };
}
