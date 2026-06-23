/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { i18n } from '@kbn/i18n';
import { openLazyFlyout } from '@kbn/presentation-util';
import type { PresentationContainer } from '@kbn/presentation-publishing';
import type { EmbeddableApiContext } from '@kbn/presentation-publishing';
import type { UiActionsActionDefinition } from '@kbn/ui-actions-plugin/public';
import { IncompatibleActionError } from '@kbn/ui-actions-plugin/public';
import { ANOMALY_EXPLORER_CHARTS_EMBEDDABLE_TYPE } from '@kbn/ml-common-types/embeddables/anomaly_charts';
import { ML_APP_NAME, PLUGIN_ICON, PLUGIN_ID } from '../../common/constants/app';
import type { AnomalyChartsEmbeddableApi } from '../embeddables';
import type { MlCoreSetup } from '../plugin';
import { EmbeddableAnomalyChartsUserInput } from '../embeddables/anomaly_charts/anomaly_charts_setup_flyout';
import { checkPermissionAsync } from '../application/capabilities/check_capabilities';

export const EDIT_ANOMALY_CHARTS_PANEL_ACTION = 'editAnomalyChartsPanelAction';

export type CreateAnomalyChartsPanelActionContext = EmbeddableApiContext & {
  embeddable: AnomalyChartsEmbeddableApi;
};

const parentApiIsCompatible = async (
  parentApi: unknown
): Promise<PresentationContainer | undefined> => {
  const { apiIsPresentationContainer } = await import('@kbn/presentation-publishing');
  // we cannot have an async type check, so return the casted parentApi rather than a boolean
  return apiIsPresentationContainer(parentApi) ? (parentApi as PresentationContainer) : undefined;
};

export function createAddAnomalyChartsPanelAction(
  getStartServices: MlCoreSetup['getStartServices']
): UiActionsActionDefinition<CreateAnomalyChartsPanelActionContext> {
  return {
    id: 'create-anomaly-charts',
    grouping: [
      {
        id: PLUGIN_ID,
        getDisplayName: () => ML_APP_NAME,
        getIconType: () => PLUGIN_ICON,
      },
    ],
    order: 30,
    getIconType: () => 'chartAnomaly',
    getDisplayName: () =>
      i18n.translate('xpack.ml.components.mlAnomalyExplorerEmbeddable.displayName', {
        defaultMessage: 'Anomaly chart',
      }),
    getDisplayNameTooltip: () =>
      i18n.translate('xpack.ml.components.mlAnomalyExplorerEmbeddable.description', {
        defaultMessage: 'View anomaly detection results in a chart.',
      }),
    async isCompatible(context: EmbeddableApiContext) {
      if (!(await checkPermissionAsync(getStartServices, 'canGetJobs'))) return false;
      return Boolean(await parentApiIsCompatible(context.embeddable));
    },
    async execute(context) {
      const presentationContainerParent = await parentApiIsCompatible(context.embeddable);
      if (!presentationContainerParent) throw new IncompatibleActionError();

      const [coreStart, pluginStart] = await getStartServices();

      openLazyFlyout({
        core: coreStart,
        parentApi: context.embeddable,
        flyoutProps: {
          'data-test-subj': 'mlAnomalyChartsEmbeddableInitializer',
          focusedPanelId: context.embeddable.uuid,
        },
        loadContent: async ({ closeFlyout }) => {
          return (
            <EmbeddableAnomalyChartsUserInput
              coreStart={coreStart}
              pluginStart={pluginStart}
              onConfirm={(initialState) => {
                presentationContainerParent.addNewPanel({
                  panelType: ANOMALY_EXPLORER_CHARTS_EMBEDDABLE_TYPE,
                  serializedState: initialState,
                });
                closeFlyout();
              }}
              onCancel={closeFlyout}
            />
          );
        },
      });
    },
  };
}
