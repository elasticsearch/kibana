/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type { UiActionsActionDefinition } from '@kbn/ui-actions-plugin/public';
import {
  CREATE_PATTERN_ANALYSIS_TO_ML_AD_JOB_ACTION,
  type CreateCategorizationADJobContext,
} from '@kbn/ml-ui-actions';
import type { MlCoreSetup } from '../plugin';
import { checkPermissionAsync } from '../application/capabilities/check_capabilities';

export function createCategorizationADJobAction(
  getStartServices: MlCoreSetup['getStartServices']
): UiActionsActionDefinition<CreateCategorizationADJobContext> {
  return {
    id: 'create-ml-categorization-ad-job-action',
    type: CREATE_PATTERN_ANALYSIS_TO_ML_AD_JOB_ACTION,
    getIconType(context): string {
      return 'machineLearningApp';
    },
    getDisplayName: () =>
      i18n.translate('xpack.ml.actions.createADJobFromPatternAnalysis', {
        defaultMessage: 'Create categorization anomaly detection job',
      }),
    async execute({ dataView, field, query, timeRange }: CreateCategorizationADJobContext) {
      if (!dataView) {
        throw new Error('Not possible to execute an action without the embeddable context');
      }

      try {
        const [{ showPatternAnalysisToADJobFlyout }, [coreStart, { share, data, dashboard, cps }]] =
          await Promise.all([import('../embeddables/job_creation/aiops'), getStartServices()]);

        await showPatternAnalysisToADJobFlyout(
          dataView,
          field,
          query,
          timeRange,
          coreStart,
          share,
          data,
          dashboard,
          undefined,
          cps
        );
      } catch (e) {
        return Promise.reject();
      }
    },
    async isCompatible({ dataView, field }: CreateCategorizationADJobContext) {
      if (!(await checkPermissionAsync(getStartServices, 'canCreateJob'))) return false;
      return (
        dataView.timeFieldName !== undefined &&
        dataView.fields.find((f) => f.name === field.name) !== undefined
      );
    },
  };
}
