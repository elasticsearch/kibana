/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { ZodError } from '@kbn/zod';
import { transformType } from '@kbn/embeddable-plugin/server';
import { stringifyZodError } from '@kbn/zod-helpers/v4';
import {
  discoverSessionControlPanelSchema,
  discoverSessionControlPanelsSchema,
} from '@kbn/as-code-discover-schema';
import {
  getControlOrder,
  isRecord,
  convertControlGroupEntryToApi,
} from '../../../common/session/control_panels';
import type { DiscoverSessionControlPanels, DiscoverSessionWarning } from '../schema';

export { serializeEsqlControls as transformControlPanelsIn } from '../../../common/session/control_panels';

const createDroppedControlPanelsWarning = (
  tabId: string,
  reason: string
): DiscoverSessionWarning => ({
  type: 'dropped_property',
  tab_id: tabId,
  key: 'control_panels',
  message: `Unable to transform control panels. Error: ${reason}`,
});

const createDroppedPanelWarning = (
  tabId: string,
  panelId: string,
  error: unknown
): DiscoverSessionWarning => {
  let message = error instanceof Error ? error.message : 'Unknown error';

  if (error instanceof ZodError) {
    message = stringifyZodError(error);
  }

  return {
    type: 'dropped_panel',
    tab_id: tabId,
    panel_id: panelId,
    message: `Unable to transform control panel [${panelId}]. Error: ${message}`,
  };
};

/*
 * Converts one stored panel to the API shape and validates it.
 * Throws so the caller can drop only that panel and return a warning.
 */
const parseControlPanelEntry = (
  id: string,
  panel: unknown
): DiscoverSessionControlPanels[number] => {
  const control = convertControlGroupEntryToApi(id, panel);

  return discoverSessionControlPanelSchema.parse({
    ...control,
    type: transformType(control.type),
  });
};

/*
 * Transforms stored control panels for the API response while preserving valid panels.
 * Warns for each panel dropped individually, or for the whole property if its JSON is unreadable.
 */
export const transformControlPanelsOut = (
  controlGroupJson: string | undefined,
  tabId: string
): { panels: DiscoverSessionControlPanels | undefined; warnings: DiscoverSessionWarning[] } => {
  if (!controlGroupJson) {
    return { panels: undefined, warnings: [] };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(controlGroupJson);
  } catch {
    return {
      panels: undefined,
      warnings: [createDroppedControlPanelsWarning(tabId, 'controlGroupJson is not valid JSON')],
    };
  }

  if (!isRecord(parsed)) {
    return {
      panels: undefined,
      warnings: [
        createDroppedControlPanelsWarning(tabId, 'controlGroupJson must be a JSON object'),
      ],
    };
  }

  const entries = Object.entries(parsed).sort(
    ([, panelA], [, panelB]) => getControlOrder(panelA) - getControlOrder(panelB)
  );

  const panels: DiscoverSessionControlPanels = [];
  const warnings: DiscoverSessionWarning[] = [];

  for (const [id, panel] of entries) {
    try {
      panels.push(parseControlPanelEntry(id, panel));
    } catch (error) {
      warnings.push(createDroppedPanelWarning(tabId, id, error));
    }
  }

  return {
    panels: panels.length ? discoverSessionControlPanelsSchema.parse(panels) : undefined,
    warnings,
  };
};
