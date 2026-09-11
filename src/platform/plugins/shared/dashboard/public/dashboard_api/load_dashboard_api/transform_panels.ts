/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { asyncMap } from '@kbn/std';
import type { Reference } from '@kbn/content-management-utils';
import { transformType } from '@kbn/embeddable-plugin/public';
import { flow } from 'lodash';
import { transformTimeRangeOut, transformTitlesOut } from '@kbn/presentation-publishing';
import type { DashboardState, DashboardPanel } from '@kbn/as-code-dashboard-schema';
import { getReferencesForPanelId, isDashboardSection } from '../../../common';
import { embeddableService } from '../../services/kibana_services';

export async function transformPanels(panels: DashboardState['panels'], references?: Reference[]) {
  function filterReferences(panelId?: string) {
    return !references || !panelId ? undefined : getReferencesForPanelId(panelId, references);
  }

  return await asyncMap(panels ?? [], async (panel) => {
    if (isDashboardSection(panel)) {
      const panelsInSection = await asyncMap(panel.panels, async (panelInSection) => {
        return await transformPanel(panelInSection, filterReferences(panelInSection.id));
      });
      return {
        ...panel,
        panels: panelsInSection,
      };
    }

    return await transformPanel(panel, filterReferences(panel.id));
  });
}

const defaultTransform = (config: object): object => {
  const transformsFlow = flow(transformTitlesOut, transformTimeRangeOut);
  return transformsFlow(config);
};

async function transformPanel(legacyPanel: DashboardPanel, references?: Reference[]) {
  const type = await transformType(legacyPanel.type);
  const panel = {
    ...legacyPanel,
    type,
  };
  const transformOut = await embeddableService.getLegacyURLTransform(type);
  try {
    const transformedPanelConfig = transformOut
      ? transformOut(panel.config, references)
      : defaultTransform(panel.config);
    return {
      ...panel,
      config: transformedPanelConfig,
    };
  } catch (transformOutError) {
    // eslint-disable-next-line no-console
    console.warn(
      `Unable to transform panel state, panelId: ${panel.id}, error: ${transformOutError}`
    );
    // do not prevent dashboard render on transform error
    return panel;
  }
}
