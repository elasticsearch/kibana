/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { EuiPanel } from '@elastic/eui';
import { noop } from 'lodash/fp';
import { RiskScoresNoDataDetected } from '../../../../entity_analytics/components/risk_score_no_data_detected';
import { useUpsellingComponent } from '../../../../common/hooks/use_upselling';
import { RiskEnginePrivilegesCallOut } from '../../../../entity_analytics/components/risk_engine_privileges_callout';
import { useMissingRiskEnginePrivileges } from '../../../../entity_analytics/hooks/use_missing_risk_engine_privileges';
import { HostRiskScoreQueryId } from '../../../../entity_analytics/common/utils';
import { useEntityStoreRiskScoreKpi } from '../../../../entity_analytics/api/hooks/use_entity_store_risk_score_kpi';
import { useEntityStoreRiskScore } from '../../../../entity_analytics/api/hooks/use_entity_store_risk_score';
import { EnableRiskScore } from '../../../../entity_analytics/components/enable_risk_score';
import { manageQuery } from '../../../../common/components/page/manage_query';
import { HostRiskScoreTable } from '../../../../entity_analytics/components/host_risk_score_table';
import { useDeepEqualSelector } from '../../../../common/hooks/use_selector';
import { hostsModel, hostsSelectors } from '../../store';
import type { State } from '../../../../common/store';
import { useQueryToggle } from '../../../../common/containers/query_toggle';
import {
  EMPTY_SEVERITY_COUNT,
  EntityType,
  type RiskScoreSortField,
} from '../../../../../common/search_strategy';
import type { HostsComponentsQueryProps } from './types';

const HostRiskScoreTableManage = manageQuery(HostRiskScoreTable);

const useHostRiskScoreTabData = ({
  filterQuery,
  pagination,
  querySkip,
  sort,
  timerange,
}: {
  filterQuery?: HostsComponentsQueryProps['filterQuery'];
  pagination: { cursorStart: number; querySize: number };
  querySkip: boolean;
  sort: RiskScoreSortField;
  timerange: { from: string; to: string };
}) => {
  const entityStoreRiskScore = useEntityStoreRiskScore({
    filterQuery,
    pagination,
    riskEntity: EntityType.host,
    skip: querySkip,
    sort,
    timerange,
  });

  const entityStoreKpi = useEntityStoreRiskScoreKpi({
    filterQuery,
    skip: querySkip,
    riskEntity: EntityType.host,
  });

  return {
    ...entityStoreRiskScore,
    isKpiLoading: entityStoreKpi.loading,
    severityCount: entityStoreKpi.severityCount,
  };
};

export const HostRiskScoreQueryTabBody = ({
  deleteQuery,
  endDate: to,
  filterQuery,
  setQuery,
  skip,
  startDate: from,
  type,
}: HostsComponentsQueryProps) => {
  const getHostRiskScoreSelector = useMemo(() => hostsSelectors.hostRiskScoreSelector(), []);
  const { activePage, limit, sort } = useDeepEqualSelector((state: State) =>
    getHostRiskScoreSelector(state, hostsModel.HostsType.page)
  );
  const getHostRiskScoreFilterQuerySelector = useMemo(
    () => hostsSelectors.hostRiskScoreSeverityFilterSelector(),
    []
  );
  const severitySelectionRedux = useDeepEqualSelector((state: State) =>
    getHostRiskScoreFilterQuerySelector(state, hostsModel.HostsType.page)
  );

  const pagination = useMemo(
    () => ({
      cursorStart: activePage * limit,
      querySize: limit,
    }),
    [activePage, limit]
  );

  const { toggleStatus } = useQueryToggle(HostRiskScoreQueryId.HOSTS_BY_RISK);
  const [querySkip, setQuerySkip] = useState(skip || !toggleStatus);
  useEffect(() => {
    setQuerySkip(!toggleStatus);
  }, [toggleStatus]);
  const timerange = useMemo(() => ({ from, to }), [from, to]);

  const privileges = useMissingRiskEnginePrivileges({ readonly: true });
  const {
    data,
    hasEngineBeenInstalled,
    inspect,
    isInspected,
    isKpiLoading,
    loading,
    refetch,
    severityCount,
    totalCount,
  } = useHostRiskScoreTabData({
    filterQuery,
    pagination,
    querySkip,
    sort,
    timerange,
  });

  const isDisabled = !hasEngineBeenInstalled && !loading;
  const RiskScoreUpsell = useUpsellingComponent('entity_analytics_panel');

  if (RiskScoreUpsell) {
    return <RiskScoreUpsell />;
  }

  if (!privileges.isLoading && !privileges.hasAllRequiredPrivileges) {
    return (
      <EuiPanel hasBorder>
        <RiskEnginePrivilegesCallOut privileges={privileges} />
      </EuiPanel>
    );
  }

  if (isDisabled) {
    return (
      <EuiPanel hasBorder>
        <EnableRiskScore isDisabled={isDisabled} entityType={EntityType.host} />
      </EuiPanel>
    );
  }

  if (
    !loading &&
    hasEngineBeenInstalled &&
    severitySelectionRedux.length === 0 &&
    data &&
    data.length === 0
  ) {
    return <RiskScoresNoDataDetected entityType={EntityType.host} />;
  }

  return (
    <>
      <HostRiskScoreTableManage
        deleteQuery={deleteQuery}
        data={data ?? []}
        id={HostRiskScoreQueryId.HOSTS_BY_RISK}
        inspect={inspect}
        isInspect={isInspected}
        loading={loading || isKpiLoading}
        loadPage={noop} // It isn't necessary because PaginatedTable updates redux store and we load the page when activePage updates on the store
        refetch={refetch}
        setQuery={setQuery}
        setQuerySkip={setQuerySkip}
        severityCount={severityCount ?? EMPTY_SEVERITY_COUNT}
        totalCount={totalCount}
        type={type}
      />
    </>
  );
};

HostRiskScoreQueryTabBody.displayName = 'HostRiskScoreQueryTabBody';
