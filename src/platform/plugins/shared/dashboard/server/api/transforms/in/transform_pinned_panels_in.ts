/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { omit } from 'lodash';
import { v4 as uuidv4 } from 'uuid';
import type { Writable } from 'utility-types';

import type { Reference } from '@kbn/content-management-utils';
import type { LegacyStoredPinnedControlState } from '@kbn/controls-schemas';
import type { DashboardState } from '@kbn/as-code-dashboard-schema';
import { prefixReferencesFromPanel } from '../../../../common';
import { embeddableService } from '../../../kibana_services';
import type { DashboardSavedObjectAttributes } from '../../../dashboard_saved_object/schema';
import { TransformPanelInError, TransformPanelsInError } from './transform_panels_in_error';

type PinnedPanelsState = Required<DashboardState>['pinned_panels'];

export function transformPinnedPanelsIn(pinnedPanels: PinnedPanelsState): {
  pinnedPanels: Required<DashboardSavedObjectAttributes>['pinned_panels']['panels'];
  references: Reference[];
} {
  const panelErrors: TransformPanelInError[] = [];

  let references: Reference[] = [];
  const updatedPinnedPanels = Object.fromEntries(
    pinnedPanels.map((controlState, index) => {
      const { id = uuidv4(), type } = controlState;
      const transforms = embeddableService.getTransforms(type);

      let transformedControlState = { ...controlState } as Partial<
        Required<DashboardSavedObjectAttributes>['pinned_panels']['panels'][number]
      >;

      try {
        if (transforms?.transformIn) {
          const transformed = transforms.transformIn(controlState.config);
          // prefix all the reference names with their IDs so that they are unique
          references = [
            ...references,
            ...prefixReferencesFromPanel(id, transformed.references ?? []),
          ];
          // update the reference names in the SO so that we can inject the references later
          const transformedState = transformed.state as Writable<LegacyStoredPinnedControlState>;
          if ('dataViewRefName' in transformedState) {
            transformedControlState = {
              ...transformedControlState,
              config: {
                ...transformedState,
                dataViewRefName: `${id}:${transformedState.dataViewRefName}`,
              },
            };
          }
        } else {
          transformedControlState = {
            ...transformedControlState,
            config: controlState.config,
          };
        }
      } catch (e) {
        panelErrors.push(
          new TransformPanelInError(
            `Transform error: ${e.message}`,
            controlState.type,
            controlState.config
          )
        );
      }

      const { width, grow, config } = transformedControlState;
      return [
        id,
        {
          order: index,
          type,
          width,
          grow,
          config: { ...omit(config, ['type']) },
        },
      ];
    })
  );

  if (panelErrors.length) {
    throw new TransformPanelsInError(
      `Unable to transform ${panelErrors.length} pinned panels`,
      panelErrors
    );
  }
  return {
    pinnedPanels: updatedPinnedPanels,
    references,
  };
}
