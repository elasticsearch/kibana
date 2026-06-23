/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Filter } from '@kbn/es-query';
import { FilterStateStore } from '@kbn/es-query';
import { i18n } from '@kbn/i18n';
import type { UiActionsActionDefinition } from '@kbn/ui-actions-plugin/public';
import { ML_ENTITY_FIELD_OPERATIONS } from '@kbn/ml-anomaly-utils';
import { ANOMALY_EXPLORER_CHARTS_EMBEDDABLE_TYPE } from '@kbn/ml-common-types/embeddables/anomaly_charts';
import { ANOMALY_SINGLE_METRIC_VIEWER_EMBEDDABLE_TYPE } from '@kbn/ml-common-types/embeddables/single_metric_viewer';
import type { MlCoreSetup } from '../plugin';
import type { AnomalyChartsFieldSelectionContext } from '../embeddables';
import { CONTROLLED_BY_ANOMALY_CHARTS_FILTER } from './constants';
import { checkPermissionAsync } from '../application/capabilities/check_capabilities';

export const APPLY_ENTITY_FIELD_FILTERS_ACTION = 'applyEntityFieldFiltersAction';

export function createApplyEntityFieldFiltersAction(
  getStartServices: MlCoreSetup['getStartServices'],
  constrolledBy?: string
): UiActionsActionDefinition<AnomalyChartsFieldSelectionContext> {
  return {
    id: constrolledBy ? 'smv-apply-entity-field-filters' : 'apply-entity-field-filters',
    type: APPLY_ENTITY_FIELD_FILTERS_ACTION,
    getIconType(context: AnomalyChartsFieldSelectionContext): string {
      return 'filter';
    },
    getDisplayName() {
      return i18n.translate('xpack.ml.actions.applyEntityFieldsFiltersTitle', {
        defaultMessage: 'Filter for value',
      });
    },
    async execute({ data }) {
      if (!data) {
        throw new Error('No entities provided');
      }
      const [, pluginStart] = await getStartServices();
      const filterManager = pluginStart.data.query.filterManager;

      filterManager.addFilters(
        data
          .filter(
            (d) =>
              d.operation === ML_ENTITY_FIELD_OPERATIONS.ADD ||
              d.operation === ML_ENTITY_FIELD_OPERATIONS.REMOVE
          )
          .map<Filter>(({ fieldName, fieldValue, operation }) => {
            return {
              $state: {
                store: FilterStateStore.APP_STATE,
              },
              meta: {
                alias: i18n.translate('xpack.ml.actions.entityFieldFilterAliasLabel', {
                  defaultMessage: '{labelValue}',
                  values: {
                    labelValue: `${fieldName}:${fieldValue}`,
                  },
                }),
                controlledBy: constrolledBy ?? CONTROLLED_BY_ANOMALY_CHARTS_FILTER,
                negate: operation === ML_ENTITY_FIELD_OPERATIONS.REMOVE,
                disabled: false,
                type: 'phrase',
                key: fieldName,
                params: {
                  query: fieldValue,
                },
              },
              query: {
                match_phrase: {
                  [fieldName]: fieldValue,
                },
              },
            };
          })
      );
    },
    async isCompatible({ embeddable, data }) {
      if (!(await checkPermissionAsync(getStartServices, 'canGetJobs'))) return false;
      return (
        (embeddable.type === ANOMALY_EXPLORER_CHARTS_EMBEDDABLE_TYPE ||
          embeddable.type === ANOMALY_SINGLE_METRIC_VIEWER_EMBEDDABLE_TYPE) &&
        data !== undefined
      );
    },
  };
}
