/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import { isPopulatedObject } from '@kbn/ml-is-populated-object';
import { apiIsOfType, type EmbeddableApiContext } from '@kbn/presentation-publishing';
import {
  IncompatibleActionError,
  type UiActionsActionDefinition,
} from '@kbn/ui-actions-plugin/public';
import { ML_APP_LOCATOR } from '@kbn/ml-common-types/locator_app_locator';
import { ML_PAGES } from '@kbn/ml-common-types/locator_ml_pages';
import { ANOMALY_SINGLE_METRIC_VIEWER_EMBEDDABLE_TYPE } from '@kbn/ml-common-types/embeddables/single_metric_viewer';
import type { SingleMetricViewerEmbeddableApi } from '../embeddables';

import type { MlCoreSetup } from '../plugin';
import { getEmbeddableTimeRange } from './get_embeddable_time_range';
import { checkPermissionAsync } from '../application/capabilities/check_capabilities';

export interface OpenInSingleMetricViewerActionContext extends EmbeddableApiContext {
  embeddable: SingleMetricViewerEmbeddableApi;
}

export const OPEN_IN_SINGLE_METRIC_VIEWER_ACTION = 'openInSingleMetricViewerAction';

export function isSingleMetricViewerEmbeddableContext(
  arg: unknown
): arg is OpenInSingleMetricViewerActionContext {
  return (
    isPopulatedObject(arg, ['embeddable']) &&
    apiIsOfType(arg.embeddable, ANOMALY_SINGLE_METRIC_VIEWER_EMBEDDABLE_TYPE)
  );
}

export function createOpenInSingleMetricViewerAction(
  getStartServices: MlCoreSetup['getStartServices']
): UiActionsActionDefinition<OpenInSingleMetricViewerActionContext> {
  return {
    id: 'open-in-single-metric-viewer',
    type: OPEN_IN_SINGLE_METRIC_VIEWER_ACTION,
    order: 100,
    getIconType(): string {
      return 'singleMetricViewer';
    },
    getDisplayName() {
      return i18n.translate('xpack.ml.actions.openInSingleMetricViewerTitle', {
        defaultMessage: 'Open in Single Metric Viewer',
      });
    },
    async getHref(context): Promise<string | undefined> {
      const [, pluginsStart] = await getStartServices();
      const locator = pluginsStart.share.url.locators.get(ML_APP_LOCATOR)!;

      if (isSingleMetricViewerEmbeddableContext(context)) {
        const { embeddable } = context;
        const { forecastId, jobIds, selectedEntities, selectedDetectorIndex } = embeddable;

        return locator.getUrl(
          {
            page: ML_PAGES.SINGLE_METRIC_VIEWER,
            // @ts-ignore entities is not compatible with SerializableRecord
            pageState: {
              timeRange: getEmbeddableTimeRange(embeddable),
              refreshInterval: {
                display: 'Off',
                pause: true,
                value: 0,
              },
              jobIds: jobIds.getValue(),
              query: {},
              entities: selectedEntities?.getValue(),
              detectorIndex: selectedDetectorIndex?.getValue(),
              forecastId: forecastId?.getValue(),
            },
          },
          { absolute: true }
        );
      }
    },
    async execute(context) {
      if (!isSingleMetricViewerEmbeddableContext(context)) {
        throw new IncompatibleActionError();
      }
      const [{ application }] = await getStartServices();
      const singleMetricViewerUrl = await this.getHref!(context);
      if (singleMetricViewerUrl !== undefined) {
        await application.navigateToUrl(singleMetricViewerUrl);
      }
    },
    async isCompatible(context: EmbeddableApiContext) {
      if (!(await checkPermissionAsync(getStartServices, 'canGetJobs'))) return false;
      return isSingleMetricViewerEmbeddableContext(context);
    },
  };
}
