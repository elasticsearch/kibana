/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { isObject } from 'lodash';
import type { ControlsGroupState } from '@kbn/controls-schemas';
import { getControlsGroupSchema } from '@kbn/controls-schemas';
import { transformType } from '@kbn/embeddable-plugin/server';

export const transformControlPanelsOut = (
  controlGroupJson: string | undefined
): ControlsGroupState | undefined => {
  if (!controlGroupJson) {
    return undefined;
  }
  const parsed: unknown = (() => {
    try {
      return JSON.parse(controlGroupJson);
    } catch {
      throw new Error('controlGroupJson is not valid JSON');
    }
  })();

  if (!isObject(parsed) || Object.values(parsed).some((v) => !isObject(v))) {
    throw new Error(`Invalid controlGroupJson: ${controlGroupJson}`);
  }

  const panels = Object.entries(parsed)
    .filter(([, panel]) => typeof panel.type === 'string')
    .sort(([, panelA], [, panelB]) => (panelA.order ?? 0) - (panelB.order ?? 0))
    .map(([id, panel]) => {
      const { order, width, grow, type, ...config } = panel;
      return {
        id,
        type: transformType(type),
        ...(width !== undefined && { width }),
        ...(grow !== undefined && { grow }),
        config,
      };
    });

  if (!panels.length) {
    return undefined;
  }

  return getControlsGroupSchema().validate(panels, undefined, undefined, {
    stripUnknownKeys: true,
  });
};

export const transformControlPanelsIn = (
  controlPanels: ControlsGroupState | undefined
): string | undefined => {
  if (!controlPanels?.length) {
    return undefined;
  }

  const panels = Object.fromEntries(
    controlPanels.map((panel, order) => {
      const { id, type, width, grow, config } = panel;
      const flattenedConfig = isObject(config) ? config : {};

      return [
        id,
        {
          order,
          type,
          ...(width !== undefined && { width }),
          ...(grow !== undefined && { grow }),
          ...flattenedConfig,
        },
      ];
    })
  );

  return JSON.stringify(panels);
};
