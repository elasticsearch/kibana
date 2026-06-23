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
import type { SingleMetricViewerEmbeddableState } from '@kbn/ml-server-schemas/embeddables/single_metric_viewer';
import { ANOMALY_SINGLE_METRIC_VIEWER_EMBEDDABLE_TYPE } from '@kbn/ml-common-types/embeddables/single_metric_viewer';
import { HttpService } from '../application/services/http_service';
import type { MlApi } from '../application/services/ml_api_service';
import { ML_APP_NAME, PLUGIN_ICON, PLUGIN_ID } from '../../common/constants/app';
import type { SingleMetricViewerEmbeddableApi } from '../embeddables/types';
import type { MlCoreSetup } from '../plugin';
import { EmbeddableSingleMetricViewerUserInput } from '../embeddables/single_metric_viewer/single_metric_viewer_setup_flyout';
import { checkPermissionAsync } from '../application/capabilities/check_capabilities';

export type CreateSingleMetricViewerPanelActionContext = EmbeddableApiContext & {
  embeddable: SingleMetricViewerEmbeddableApi;
};

const parentApiIsCompatible = async (
  parentApi: unknown
): Promise<PresentationContainer | undefined> => {
  const { apiIsPresentationContainer } = await import('@kbn/presentation-publishing');
  // we cannot have an async type check, so return the casted parentApi rather than a boolean
  return apiIsPresentationContainer(parentApi) ? (parentApi as PresentationContainer) : undefined;
};

export function createAddSingleMetricViewerPanelAction(
  getStartServices: MlCoreSetup['getStartServices']
): UiActionsActionDefinition<CreateSingleMetricViewerPanelActionContext> {
  // @ts-ignore
  return {
    id: 'create-single-metric-viewer',
    grouping: [
      {
        id: PLUGIN_ID,
        getDisplayName: () => ML_APP_NAME,
        getIconType: () => PLUGIN_ICON,
      },
    ],
    order: 20,
    getIconType: () => 'singleMetricViewer',
    getDisplayName: () =>
      i18n.translate('xpack.ml.components.singleMetricViewerEmbeddable.displayName', {
        defaultMessage: 'Single metric viewer',
      }),
    getDisplayNameTooltip: () =>
      i18n.translate('xpack.ml.components.singleMetricViewerEmbeddable.description', {
        defaultMessage:
          'View anomaly detection results for a single metric on a focused date range.',
      }),
    async isCompatible(context: EmbeddableApiContext) {
      if (!(await checkPermissionAsync(getStartServices, 'canGetJobs'))) return false;
      return Boolean(await parentApiIsCompatible(context.embeddable));
    },
    async execute(context) {
      const presentationContainerParent = await parentApiIsCompatible(context.embeddable);
      if (!presentationContainerParent) throw new IncompatibleActionError();

      const [coreStart, { data, share }] = await getStartServices();

      const { mlApiProvider } = await import('../application/services/ml_api_service');
      const httpService = new HttpService(coreStart.http);
      const mlApi: MlApi = mlApiProvider(httpService);

      openLazyFlyout({
        core: coreStart,
        parentApi: context.embeddable,
        flyoutProps: {
          focusedPanelId: context.embeddable.uuid,
        },
        loadContent: async ({ closeFlyout }) => {
          return (
            <EmbeddableSingleMetricViewerUserInput
              coreStart={coreStart}
              services={{ data, share }}
              mlApi={mlApi}
              onConfirm={(serializedState) => {
                presentationContainerParent.addNewPanel<SingleMetricViewerEmbeddableState>({
                  panelType: ANOMALY_SINGLE_METRIC_VIEWER_EMBEDDABLE_TYPE,
                  serializedState,
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
