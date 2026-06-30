/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect, useRef, useState } from 'react';
import type { ExceptionListItemSchema } from '@kbn/securitysolution-io-ts-list-types';
import type { RuntimeFieldType } from '../../../../common/api/detection_engine/signals/set_signal_status/set_signals_status_route.gen';
import {
  buildAlertsFilterByRuleIds,
  buildAlertStatusesFilter,
} from '../../../detections/components/alerts_table/default_config';
import { getEsQueryFilter } from '../utils/get_es_query_filter';
import type { IndexPatternArray } from '../../../../common/api/detection_engine/model/rule_schema';
import { prepareExceptionItemsForBulkClose } from '../utils/helpers';
import * as i18nCommon from '../../../common/translations';
import * as i18n from './translations';
import { useAppToasts } from '../../../common/hooks/use_app_toasts';
import { updateAlertStatus } from '../../../common/components/toolbar/bulk_actions/update_alerts';

/**
 * Closes alerts.
 *
 * @param ruleStaticIds static id of the rules (rule.ruleId, not rule.id) whose
 *   alerts the bulk close should be scoped to. Used to build a
 *   `kibana.alert.rule.rule_id` filter — only alerts produced by these rules
 *   are matched.
 * @param exceptionItems array of ExceptionListItemSchema to add or update
 * @param alertIdToClose - optional string representing alert to close
 * @param bulkCloseIndex - optional index used to create bulk close query
 * @param runtimeFields - optional map of field name to ES runtime field type
 *   for any fields referenced by the exception that aren't natively mapped on
 *   the alerts index (e.g. runtime fields on the rule's source index). The
 *   server synthesizes `_source`-reading runtime mappings from this map.
 *
 */
export type AddOrUpdateExceptionItemsFunc = (
  ruleStaticIds: string[],
  exceptionItems: ExceptionListItemSchema[],
  alertIdToClose?: string,
  bulkCloseIndex?: IndexPatternArray,
  runtimeFields?: Record<string, RuntimeFieldType>
) => Promise<void>;

export type ReturnUseCloseAlertsFromExceptions = [boolean, AddOrUpdateExceptionItemsFunc | null];

/**
 * Hook for closing alerts from exceptions
 */
export const useCloseAlertsFromExceptions = (): ReturnUseCloseAlertsFromExceptions => {
  const { addSuccess, addError, addWarning } = useAppToasts();

  const [isLoading, setIsLoading] = useState(false);
  const closeAlertsRef = useRef<AddOrUpdateExceptionItemsFunc | null>(null);

  useEffect(() => {
    let isSubscribed = true;
    const abortCtrl = new AbortController();

    const onUpdateAlerts: AddOrUpdateExceptionItemsFunc = async (
      ruleStaticIds,
      exceptionItems,
      alertIdToClose,
      bulkCloseIndex,
      runtimeFields
    ) => {
      try {
        setIsLoading(true);
        let alertIdUpdated = 0;
        let bulkUpdated = 0;
        let bulkConflicts = 0;
        if (alertIdToClose != null) {
          const alertIdResponse = await updateAlertStatus({
            signalIds: [alertIdToClose],
            status: 'closed',
            signal: abortCtrl.signal,
          });
          alertIdUpdated = alertIdResponse.updated;
        }

        if (bulkCloseIndex != null) {
          const alertStatusFilter = buildAlertStatusesFilter([
            'open',
            'acknowledged',
            'in-progress',
          ]);

          const filterByRuleIds = buildAlertsFilterByRuleIds(ruleStaticIds);

          const filter = await getEsQueryFilter(
            '',
            'kuery',
            [...filterByRuleIds, ...alertStatusFilter],
            bulkCloseIndex,
            prepareExceptionItemsForBulkClose(exceptionItems),
            false
          );

          const bulkResponse = await updateAlertStatus({
            query: filter,
            status: 'closed',
            signal: abortCtrl.signal,
            runtimeFields,
          });
          bulkUpdated = bulkResponse.updated;
          bulkConflicts = bulkResponse.version_conflicts ?? 0;
        }

        // NOTE: there could be some overlap here... it's possible that the first response had conflicts
        // but that the alert was closed in the second call. In this case, a conflict will be reported even
        // though it was already resolved. I'm not sure that there's an easy way to solve this, but it should
        // have minimal impact on the user... they'd see a warning that indicates a possible conflict, but the
        // state of the alerts and their representation in the UI would be consistent.
        const updated = alertIdUpdated + bulkUpdated;
        const conflicts = bulkConflicts;
        if (isSubscribed) {
          setIsLoading(false);
          addSuccess(i18n.CLOSE_ALERTS_SUCCESS(updated));
          if (conflicts > 0) {
            addWarning({
              title: i18nCommon.UPDATE_ALERT_STATUS_FAILED(conflicts),
              text: i18nCommon.UPDATE_ALERT_STATUS_FAILED_DETAILED(updated, conflicts),
            });
          }
        }
      } catch (error) {
        if (isSubscribed) {
          setIsLoading(false);
          addError(error, { title: i18n.CLOSE_ALERTS_ERROR });
        }
      }
    };

    closeAlertsRef.current = onUpdateAlerts;
    return (): void => {
      isSubscribed = false;
      abortCtrl.abort();
    };
  }, [addSuccess, addError, addWarning]);

  return [isLoading, closeAlertsRef.current];
};
