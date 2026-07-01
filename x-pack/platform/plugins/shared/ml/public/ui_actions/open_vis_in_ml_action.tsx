/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import { type EmbeddableApiContext, apiHasType, apiIsOfType } from '@kbn/presentation-publishing';
import type { UiActionsActionDefinition } from '@kbn/ui-actions-plugin/public';
import { isLensApi } from '@kbn/lens-plugin/public';
import { isMapApi } from '@kbn/maps-plugin/public';
import { isOfAggregateQueryType } from '@kbn/es-query';
import { LENS_EMBEDDABLE_TYPE } from '@kbn/lens-common';
import type { ActionApi } from './types';
import type { MlCoreSetup } from '../plugin';
import { checkPermissionAsync } from '../application/capabilities/check_capabilities';

export const CREATE_LENS_VIS_TO_ML_AD_JOB_ACTION = 'createMLADJobAction';

export const isApiCompatible = (api: unknown | null): api is ActionApi => apiHasType(api);

export function createVisToADJobAction(
  getStartServices: MlCoreSetup['getStartServices']
): UiActionsActionDefinition<EmbeddableApiContext> {
  return {
    id: 'create-ml-ad-job-action',
    type: CREATE_LENS_VIS_TO_ML_AD_JOB_ACTION,
    order: 8,
    grouping: [{ id: 'ml', order: 3 }],
    getIconType(context): string {
      return 'machineLearningApp';
    },
    getDisplayName: () =>
      i18n.translate('xpack.ml.actions.createADJobFromLens', {
        defaultMessage: 'Detect anomalies',
      }),
    async execute({ embeddable }: EmbeddableApiContext) {
      if (!embeddable) {
        throw new Error('Not possible to execute an action without the embeddable context');
      }

      try {
        if (isLensApi(embeddable)) {
          const [{ showLensVisToADJobFlyout }, [coreStart, { share, data, lens, dashboard, cps }]] =
            await Promise.all([import('../embeddables/job_creation/lens'), getStartServices()]);
          if (lens === undefined) {
            return;
          }
          await showLensVisToADJobFlyout(embeddable, coreStart, share, data, dashboard, lens, cps);
        } else if (isMapApi(embeddable)) {
          const [{ showMapVisToADJobFlyout }, [coreStart, { share, data, dashboard, cps }]] =
            await Promise.all([import('../embeddables/job_creation/map'), getStartServices()]);
          await showMapVisToADJobFlyout(embeddable, coreStart, share, data, dashboard, cps);
        }
      } catch (e) {
        return Promise.reject();
      }
    },
    async isCompatible({ embeddable }: EmbeddableApiContext) {
      if (!(await checkPermissionAsync(getStartServices, 'canGetJobs'))) return false;
      if (
        !isApiCompatible(embeddable) ||
        !(apiIsOfType(embeddable, LENS_EMBEDDABLE_TYPE) || apiIsOfType(embeddable, 'map'))
      )
        return false;

      const [coreStart, { lens }] = await getStartServices();

      if (
        !coreStart.application.capabilities.ml?.canCreateJob ||
        !coreStart.application.capabilities.ml?.canStartStopDatafeed
      ) {
        return false;
      }

      try {
        if (isLensApi(embeddable) && lens) {
          const vis = embeddable.getSavedVis();
          if (!vis || isOfAggregateQueryType(vis.state.query)) {
            return false;
          }

          const { getChartInfoFromVisualization, isCompatibleVisualizationType } = await import(
            '../application/jobs/new_job/job_from_lens'
          );

          const chartInfo = await getChartInfoFromVisualization(lens, vis);
          return isCompatibleVisualizationType(chartInfo);
        } else if (isMapApi(embeddable)) {
          const { isCompatibleMapVisualization } = await import(
            '../application/jobs/new_job/job_from_map'
          );

          return isCompatibleMapVisualization(embeddable);
        }
        return false;
      } catch (error) {
        // eslint-disable-next-line no-console
        console.error('Error attempting to check for ML job compatibility', error);
        return false;
      }
    },
  };
}
