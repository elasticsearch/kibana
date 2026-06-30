/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo } from 'react';
import moment from 'moment';
import { EuiLink } from '@elastic/eui';
import type { RuleAlertingOutcome } from '@kbn/alerting-plugin/common';
import { useHistory } from 'react-router-dom';
import { getRuleDetailsRoute as internalGetRuleDetailsRoute } from '@kbn/rule-data-utils';
import { asSpaceId, getSpaceUrlPrefix } from '@kbn/core-spaces-common';
import { formatRuleAlertCount } from '../../../../../common/lib/format_rule_alert_count';
import { useKibana, useSpacesData } from '../../../../../common/lib/kibana';
import { EventLogListStatus } from './event_log_list_status';
import { RuleDurationFormat } from '../../../rules_list/components/rule_duration_format';
import type {
  RULE_EXECUTION_LOG_COLUMN_IDS,
  CONNECTOR_EXECUTION_LOG_COLUMN_IDS,
} from '../../../../constants';
import {
  RULE_EXECUTION_LOG_DURATION_COLUMNS,
  RULE_EXECUTION_LOG_ALERT_COUNT_COLUMNS,
} from '../../../../constants';

export const DEFAULT_DATE_FORMAT = 'MMM D, YYYY @ HH:mm:ss.SSS';

export type ColumnId =
  | (typeof RULE_EXECUTION_LOG_COLUMN_IDS)[number]
  | (typeof CONNECTOR_EXECUTION_LOG_COLUMN_IDS)[number];

interface EventLogListCellRendererProps {
  columnId: ColumnId;
  version?: string;
  value?: string | string[];
  dateFormat?: string;
  ruleId?: string;
  spaceIds?: string[];
  useExecutionStatus?: boolean;
  getRuleDetailsRoute?: (ruleId: string) => string;
}

export const EventLogListCellRenderer = (props: EventLogListCellRendererProps) => {
  const {
    columnId,
    value,
    version,
    dateFormat = DEFAULT_DATE_FORMAT,
    ruleId,
    spaceIds,
    useExecutionStatus = true,
    getRuleDetailsRoute,
  } = props;
  const spacesData = useSpacesData();
  const { http } = useKibana().services;

  const history = useHistory();

  const activeSpace = useMemo(
    () => spacesData?.spacesMap.get(spacesData?.activeSpaceId),
    [spacesData]
  );

  const ruleOnDifferentSpace = useMemo(
    () => activeSpace && !spaceIds?.includes(activeSpace.id),
    [activeSpace, spaceIds]
  );

  const ruleNamePathname = useMemo(() => {
    if (!ruleId) return '';

    const ruleRoute = getRuleDetailsRoute
      ? getRuleDetailsRoute(ruleId)
      : internalGetRuleDetailsRoute(ruleId);

    if (ruleOnDifferentSpace) {
      const [linkedSpaceId] = spaceIds ?? [];
      const basePath = http.basePath.get();
      // linkedSpaceId / activeSpace.id come from event metadata and the Spaces plugin
      // Space.id (both typed as string); validate-and-brand at this boundary.
      const spacePath = getSpaceUrlPrefix(asSpaceId(linkedSpaceId));
      const historyPathname = history.location.pathname;
      const newPathname = `${basePath.replace(
        getSpaceUrlPrefix(asSpaceId(activeSpace!.id)),
        ''
      )}${spacePath}${window.location.pathname
        .replace(basePath, '')
        .replace(historyPathname, ruleRoute)}`;
      return newPathname;
    }
    return ruleRoute;
  }, [ruleId, ruleOnDifferentSpace, history, activeSpace, http, spaceIds, getRuleDetailsRoute]);

  const onClickRuleName = useCallback(() => {
    if (!ruleId) return;
    if (ruleOnDifferentSpace) {
      const newUrl = window.location.href.replace(window.location.pathname, ruleNamePathname);
      window.open(newUrl, '_blank');
      return;
    }
    history.push(ruleNamePathname);
  }, [ruleNamePathname, history, ruleOnDifferentSpace, ruleId]);

  if (typeof value === 'undefined') {
    return null;
  }

  if (columnId === 'status') {
    return (
      <EventLogListStatus
        status={value as RuleAlertingOutcome}
        useExecutionStatus={useExecutionStatus}
      />
    );
  }

  if (columnId === 'timestamp') {
    return <>{moment(value).format(dateFormat)}</>;
  }

  if (columnId === 'rule_name' && ruleId) {
    return (
      <EuiLink onClick={onClickRuleName} data-href={ruleNamePathname}>
        {value}
      </EuiLink>
    );
  }

  if (columnId === 'space_ids') {
    if (activeSpace && value.includes(activeSpace.id)) return <>{activeSpace.name}</>;
    if (spacesData) return <>{spacesData.spacesMap.get(value[0])?.name ?? value[0]}</>;
  }

  if (RULE_EXECUTION_LOG_ALERT_COUNT_COLUMNS.includes(columnId)) {
    return <>{formatRuleAlertCount(value as string, version)}</>;
  }

  if (RULE_EXECUTION_LOG_DURATION_COLUMNS.includes(columnId)) {
    return <RuleDurationFormat duration={parseInt(value as string, 10)} />;
  }

  if (columnId === 'timed_out') {
    return <>{value ? 'true' : 'false'}</>;
  }

  if (columnId === 'maintenance_window_ids') {
    return <>{Array.isArray(value) ? value.join(', ') : ''}</>;
  }

  return <>{value}</>;
};
