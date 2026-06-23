/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type { MlEntityField } from '@kbn/ml-anomaly-utils';
import { ML_ENTITY_FIELD_OPERATIONS } from '@kbn/ml-anomaly-utils';
import { isPopulatedObject } from '@kbn/ml-is-populated-object';
import type { EmbeddableApiContext } from '@kbn/presentation-publishing';
import { apiIsOfType } from '@kbn/presentation-publishing';
import type { UiActionsActionDefinition } from '@kbn/ui-actions-plugin/public';
import type { SerializableRecord } from '@kbn/utility-types';
import { ML_APP_LOCATOR } from '@kbn/ml-common-types/locator_app_locator';
import type { ExplorerAppState } from '@kbn/ml-common-types/locator';
import { ANOMALY_EXPLORER_CHARTS_EMBEDDABLE_TYPE } from '@kbn/ml-common-types/embeddables/anomaly_charts';
import type { AppStateSelectedCells } from '../application/explorer/explorer_utils';
import type { AnomalyChartsApi, AnomalyChartsEmbeddableApi } from '../embeddables';
import type { AnomalySwimLaneEmbeddableApi } from '../embeddables/anomaly_swimlane/types';
import { isSwimLaneEmbeddableContext } from '../embeddables/anomaly_swimlane/types';
import type { MlCoreSetup } from '../plugin';
import { getEmbeddableTimeRange } from './get_embeddable_time_range';
import { checkPermissionAsync } from '../application/capabilities/check_capabilities';

export interface OpenInAnomalyExplorerSwimLaneActionContext extends EmbeddableApiContext {
  embeddable: AnomalySwimLaneEmbeddableApi;
  /**
   * Optional data provided by swim lane selection
   */
  data?: AppStateSelectedCells;
}

export interface OpenInAnomalyExplorerAnomalyChartsActionContext extends EmbeddableApiContext {
  embeddable: AnomalyChartsEmbeddableApi;
  /**
   * Optional fields selected using anomaly charts
   */
  data?: MlEntityField[];
}

export const OPEN_IN_ANOMALY_EXPLORER_ACTION = 'openInAnomalyExplorerAction';

export function isAnomalyChartsEmbeddableContext(arg: unknown): arg is {
  embeddable: AnomalyChartsApi;
} {
  return (
    isPopulatedObject(arg, ['embeddable']) &&
    apiIsOfType(arg.embeddable, ANOMALY_EXPLORER_CHARTS_EMBEDDABLE_TYPE)
  );
}

export function createOpenInExplorerAction(
  getStartServices: MlCoreSetup['getStartServices']
): UiActionsActionDefinition<
  OpenInAnomalyExplorerSwimLaneActionContext | OpenInAnomalyExplorerAnomalyChartsActionContext
> {
  return {
    id: 'open-in-anomaly-explorer',
    type: OPEN_IN_ANOMALY_EXPLORER_ACTION,
    order: 40,
    getIconType(): string {
      return 'table';
    },
    getDisplayName() {
      return i18n.translate('xpack.ml.actions.openInAnomalyExplorerTitle', {
        defaultMessage: 'Open in Anomaly Explorer',
      });
    },
    async getHref(context): Promise<string | undefined> {
      const [, pluginsStart] = await getStartServices();
      const locator = pluginsStart.share.url.locators.get(ML_APP_LOCATOR)!;

      if (isSwimLaneEmbeddableContext(context)) {
        const { data, embeddable } = context;

        const { viewBy, jobIds, perPage, fromPage } = embeddable;

        return locator.getUrl({
          page: 'explorer',
          pageState: {
            jobIds: jobIds.getValue(),
            timeRange: getEmbeddableTimeRange(embeddable),
            mlExplorerSwimlane: {
              viewByFromPage: fromPage.getValue(),
              viewByPerPage: perPage.getValue(),
              viewByFieldName: viewBy.getValue(),
              ...(data
                ? {
                    selectedType: data.type,
                    selectedTimes: data.times,
                    selectedLanes: data.lanes,
                  }
                : {}),
            },
          },
        });
      } else if (isAnomalyChartsEmbeddableContext(context)) {
        const { embeddable } = context;
        const { jobIds$, selectedEntities$ } = embeddable;

        const jobIds = jobIds$?.getValue() ?? [];
        let mlExplorerFilter: ExplorerAppState['mlExplorerFilter'] | undefined;
        const entityFieldsValue = selectedEntities$?.getValue();

        if (
          Array.isArray(entityFieldsValue) &&
          entityFieldsValue.length === 1 &&
          entityFieldsValue[0].operation === ML_ENTITY_FIELD_OPERATIONS.ADD
        ) {
          const { fieldName, fieldValue } = entityFieldsValue[0];
          if (fieldName !== undefined && fieldValue !== undefined) {
            const influencersFilterQuery = {
              bool: {
                should: [
                  {
                    match_phrase: {
                      [fieldName]: String(fieldValue),
                    },
                  },
                ],
                minimum_should_match: 1,
              },
            };
            const filteredFields = [fieldName, fieldValue];
            mlExplorerFilter = {
              influencersFilterQuery,
              filterActive: true,
              queryString: `${fieldName}:"${fieldValue}"`,
              ...(Array.isArray(filteredFields) ? { filteredFields } : {}),
            };
          }
        }
        return locator.getUrl({
          page: 'explorer',
          pageState: {
            jobIds,
            timeRange: getEmbeddableTimeRange(embeddable),
            // @ts-ignore QueryDslQueryContainer is not compatible with SerializableRecord
            ...(mlExplorerFilter ? ({ mlExplorerFilter } as SerializableRecord) : {}),
            query: {},
          },
        });
      }
    },
    async execute(context) {
      if (!context.embeddable) {
        throw new Error('Not possible to execute an action without the embeddable context');
      }
      const [{ application }] = await getStartServices();
      const anomalyExplorerUrl = await this.getHref!(context);
      if (anomalyExplorerUrl) {
        await application.navigateToUrl(anomalyExplorerUrl!);
      }
    },
    async isCompatible(context: EmbeddableApiContext) {
      if (!(await checkPermissionAsync(getStartServices, 'canGetJobs'))) return false;
      return isSwimLaneEmbeddableContext(context) || isAnomalyChartsEmbeddableContext(context);
    },
  };
}
