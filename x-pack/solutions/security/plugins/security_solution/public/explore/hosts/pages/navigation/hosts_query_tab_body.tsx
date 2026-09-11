/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getOr } from 'lodash/fp';
import React, { useEffect, useState } from 'react';
import { useAllEntityStoreHosts, useAllHost, ID } from '../../containers/hosts';
import type { HostsComponentsQueryProps } from './types';
import { HostsTable } from '../../components/hosts_table';
import { manageQuery } from '../../../../common/components/page/manage_query';
import { useQueryToggle } from '../../../../common/containers/query_toggle';
import { useExploreEntityStoreV2Enabled } from '../../../hooks/use_explore_entity_store_v2_enabled';

const HostsTableManage = manageQuery(HostsTable);

export const HostsQueryTabBody = ({
  deleteQuery,
  endDate,
  filterQuery,
  indexNames,
  skip,
  setQuery,
  startDate,
  type,
}: HostsComponentsQueryProps) => {
  const entityStoreV2Enabled = useExploreEntityStoreV2Enabled();
  const { toggleStatus } = useQueryToggle(ID);
  const [querySkip, setQuerySkip] = useState(skip || !toggleStatus);
  useEffect(() => {
    setQuerySkip(skip || !toggleStatus);
  }, [skip, toggleStatus]);
  const commonHostQueryArgs = {
    endDate,
    filterQuery,
    indexNames,
    startDate,
    type,
  };
  const [legacyLoading, legacyHostsArgs] = useAllHost({
    ...commonHostQueryArgs,
    skip: querySkip || entityStoreV2Enabled,
  });
  const [entityStoreLoading, entityStoreHostsArgs] = useAllEntityStoreHosts({
    ...commonHostQueryArgs,
    skip: querySkip || !entityStoreV2Enabled,
  });
  const loading = entityStoreV2Enabled ? entityStoreLoading : legacyLoading;
  const { hosts, totalCount, pageInfo, loadPage, id, inspect, isInspected, refetch } =
    entityStoreV2Enabled ? entityStoreHostsArgs : legacyHostsArgs;

  return (
    <HostsTableManage
      deleteQuery={deleteQuery}
      data={hosts}
      fakeTotalCount={getOr(50, 'fakeTotalCount', pageInfo)}
      id={id}
      inspect={inspect}
      isInspect={isInspected}
      loading={loading}
      loadPage={loadPage}
      refetch={refetch}
      setQuery={setQuery}
      setQuerySkip={setQuerySkip}
      showMorePagesIndicator={getOr(false, 'showMorePagesIndicator', pageInfo)}
      totalCount={totalCount}
      type={type}
    />
  );
};

HostsQueryTabBody.displayName = 'HostsQueryTabBody';
