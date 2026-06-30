/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Logger } from '@kbn/core/server';
import type { IEventLogClient } from '@kbn/event-log-plugin/server';

import type {
  ReadRuleExecutionResultsResponse,
  UnifiedExecutionResultSortField,
} from '../../../../../../../common/api/detection_engine/rule_monitoring';
import { assertUnreachable } from '../../../../../../../common/utility_types';

import { withSecuritySpan } from '../../../../../../utils/with_security_span';
import type { ExtMeta } from '../../utils/console_logging';

import { ALERTING_V2_RULE_SAVED_OBJECT_TYPE } from '../../event_log/v2_event_log_constants';
import { constructV2ExecutionEventKqlFilter } from '../event_log/construct_v2_execution_event_kql_filter';
import { mapV2EventToUnifiedResult } from '../event_log/map_v2_event_to_unified_result';

interface GetV2ExecutionResultsArgs {
  ruleId: string;
  filter?: {
    from?: string;
    to?: string;
    outcome?: string[];
  };
  sort?: {
    field?: UnifiedExecutionResultSortField;
    order?: 'asc' | 'desc';
  };
  page?: number;
  perPage?: number;
}

export interface IRuleExecutionLogV2ForRoutes {
  getV2ExecutionResults(args: GetV2ExecutionResultsArgs): Promise<ReadRuleExecutionResultsResponse>;
}

export const createRuleExecutionLogV2ClientForRoutes = (
  eventLog: IEventLogClient,
  logger: Logger
): IRuleExecutionLogV2ForRoutes => {
  return {
    getV2ExecutionResults: (
      args: GetV2ExecutionResultsArgs
    ): Promise<ReadRuleExecutionResultsResponse> => {
      return withSecuritySpan('IRuleExecutionLogV2ForRoutes.getV2ExecutionResults', async () => {
        const { ruleId } = args;
        try {
          const { filter: filterParams, sort, page, perPage } = args;
          const { from, to, outcome } = filterParams ?? {};
          const sortField = sort?.field ?? 'execution_start';
          const sortOrder = sort?.order ?? 'desc';

          const findResult = await eventLog.findEventsBySavedObjectIds(
            ALERTING_V2_RULE_SAVED_OBJECT_TYPE,
            [ruleId],
            {
              filter: constructV2ExecutionEventKqlFilter({ outcome }),
              sort: [{ sort_field: mapSortField(sortField), sort_order: sortOrder }],
              page,
              per_page: perPage,
              start: from,
              end: to,
            }
          );

          return {
            data: findResult.data.map(mapV2EventToUnifiedResult),
            total: findResult.total,
            page: findResult.page,
            per_page: findResult.per_page,
          };
        } catch (e) {
          const logMessage = 'Error getting v2 execution results from event log';
          const logReason = e instanceof Error ? e.message : String(e);
          const logSuffix = `[rule id ${ruleId}]`;
          const logMeta: ExtMeta = { rule: { id: ruleId } };

          logger.error(`${logMessage}: ${logReason} ${logSuffix}`, logMeta);
          throw e;
        }
      });
    },
  };
};

const mapSortField = (sortField: UnifiedExecutionResultSortField): string => {
  switch (sortField) {
    case 'execution_start':
      return 'event.start';
    case 'execution_duration_ms':
      return 'event.duration';
    default:
      return assertUnreachable(sortField);
  }
};
