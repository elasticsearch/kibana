/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { noop } from 'lodash/fp';

import { EuiPanel } from '@elastic/eui';
import {
  EMPTY_SEVERITY_COUNT,
  EntityType,
  type RiskScoreSortField,
} from '../../../common/search_strategy';
import { useEntityStoreRiskScoreKpi } from '../api/hooks/use_entity_store_risk_score_kpi';
import { useEntityStoreRiskScore } from '../api/hooks/use_entity_store_risk_score';
import { UserRiskScoreQueryId } from '../common/utils';
import { EnableRiskScore } from './enable_risk_score';
import type { UsersComponentsQueryProps } from '../../explore/users/pages/navigation/types';
import { manageQuery } from '../../common/components/page/manage_query';
import { useDeepEqualSelector } from '../../common/hooks/use_selector';
import type { State } from '../../common/store';
import { UserRiskScoreTable } from './user_risk_score_table';
import { usersSelectors } from '../../explore/users/store';
import { useQueryToggle } from '../../common/containers/query_toggle';
import { useMissingRiskEnginePrivileges } from '../hooks/use_missing_risk_engine_privileges';
import { RiskEnginePrivilegesCallOut } from './risk_engine_privileges_callout';
import { useUpsellingComponent } from '../../common/hooks/use_upselling';
import { RiskScoresNoDataDetected } from './risk_score_no_data_detected';

const UserRiskScoreTableManage = manageQuery(UserRiskScoreTable);

const useUserRiskScoreTabData = ({
  filterQuery,
  pagination,
  querySkip,
  sort,
  timerange,
}: {
  filterQuery?: UsersComponentsQueryProps['filterQuery'];
  pagination: { cursorStart: number; querySize: number };
  querySkip: boolean;
  sort: RiskScoreSortField;
  timerange: { from: string; to: string };
}) => {
  const entityStoreRiskScore = useEntityStoreRiskScore({
    filterQuery,
    pagination,
    riskEntity: EntityType.user,
    skip: querySkip,
    sort,
    timerange,
  });

  const entityStoreKpi = useEntityStoreRiskScoreKpi({
    filterQuery,
    skip: querySkip,
    riskEntity: EntityType.user,
  });

  return {
    ...entityStoreRiskScore,
    isKpiLoading: entityStoreKpi.loading,
    severityCount: entityStoreKpi.severityCount,
  };
};

export const UserRiskScoreQueryTabBody = ({
  deleteQuery,
  endDate: to,
  filterQuery,
  setQuery,
  skip,
  startDate: from,
  type,
}: UsersComponentsQueryProps) => {
  const getUserRiskScoreSelector = useMemo(() => usersSelectors.userRiskScoreSelector(), []);
  const { activePage, limit, sort } = useDeepEqualSelector((state: State) =>
    getUserRiskScoreSelector(state)
  );
  const getUserRiskScoreFilterQuerySelector = useMemo(
    () => usersSelectors.userRiskScoreSeverityFilterSelector(),
    []
  );
  const userSeveritySelectionRedux = useDeepEqualSelector((state: State) =>
    getUserRiskScoreFilterQuerySelector(state)
  );
  const pagination = useMemo(
    () => ({
      cursorStart: activePage * limit,
      querySize: limit,
    }),
    [activePage, limit]
  );

  const { toggleStatus } = useQueryToggle(UserRiskScoreQueryId.USERS_BY_RISK);
  const [querySkip, setQuerySkip] = useState(skip || !toggleStatus);
  useEffect(() => {
    setQuerySkip(skip || !toggleStatus);
  }, [skip, toggleStatus]);

  const timerange = useMemo(() => ({ from, to }), [from, to]);

  const privileges = useMissingRiskEnginePrivileges({ readonly: true });

  const {
    data,
    inspect,
    isInspected,
    hasEngineBeenInstalled,
    loading,
    refetch,
    totalCount,
    isKpiLoading,
    severityCount,
  } = useUserRiskScoreTabData({
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
        <EnableRiskScore isDisabled={isDisabled} entityType={EntityType.user} />
      </EuiPanel>
    );
  }

  if (
    !loading &&
    hasEngineBeenInstalled &&
    userSeveritySelectionRedux.length === 0 &&
    data &&
    data.length === 0
  ) {
    return <RiskScoresNoDataDetected entityType={EntityType.user} />;
  }

  return (
    <>
      <UserRiskScoreTableManage
        deleteQuery={deleteQuery}
        data={data ?? []}
        id={UserRiskScoreQueryId.USERS_BY_RISK}
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

UserRiskScoreQueryTabBody.displayName = 'UserRiskScoreQueryTabBody';
