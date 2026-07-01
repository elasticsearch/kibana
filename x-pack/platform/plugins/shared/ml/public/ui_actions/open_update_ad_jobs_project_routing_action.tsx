/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type {
  ActionExecutionContext,
  UiActionsActionDefinition,
} from '@kbn/ui-actions-plugin/public';
import {
  UPDATE_AD_JOBS_PROJECT_ROUTING_ACTION,
  type UpdateADJobsProjectRoutingContext,
} from '@kbn/ml-ui-actions';
import type { MlCoreSetup } from '../plugin';

export function updateADJobsProjectRouting(
  getStartServices: MlCoreSetup['getStartServices']
): UiActionsActionDefinition<UpdateADJobsProjectRoutingContext> {
  return {
    id: 'update-ad-jobs-project-routing-action',
    type: UPDATE_AD_JOBS_PROJECT_ROUTING_ACTION,
    getIconType(): string {
      return 'machineLearningApp';
    },
    getDisplayName: () =>
      i18n.translate('xpack.ml.actions.updateADJobsProjectRouting', {
        defaultMessage: 'Update anomaly detection job project routing',
      }),
    async execute(context: ActionExecutionContext<UpdateADJobsProjectRoutingContext>) {
      try {
        const [
          { showUpdateADJobsProjectRoutingFlyout },
          [coreStart, { share, data, dashboard, cps }],
        ] = await Promise.all([
          import('../embeddables/job_creation/update_ad_jobs_project_routing'),
          getStartServices(),
        ]);

        const { onClose, initialJobIds, allowScopeSelection } = context;
        await showUpdateADJobsProjectRoutingFlyout(
          coreStart,
          share,
          data,
          dashboard,
          cps,
          initialJobIds,
          allowScopeSelection,
          onClose
        );
      } catch (e) {
        return Promise.reject(e);
      }
    },
    async isCompatible() {
      return true;
    },
  };
}
