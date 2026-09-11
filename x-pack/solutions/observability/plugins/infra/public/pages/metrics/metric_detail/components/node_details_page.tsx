/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import dateMath from '@kbn/datemath';
import moment from 'moment';
import { EuiFlexGroup, EuiFlexItem } from '@elastic/eui';
import type { InventoryTsvbType, InventoryItemType } from '@kbn/metrics-data-access-plugin/common';
import { decodeOrThrow } from '@kbn/io-ts-utils';
import { NodeDetailsMetricDataResponseRT } from '../../../../../common/http_api/node_details_api';
import { isPending, useFetcher } from '../../../../hooks/use_fetcher';
import { MetricsSideNav } from './side_nav';
import { MetricsTimeControls } from './time_controls';
import type { NavItem } from '../lib/side_nav_context';
import { SideNavContext } from '../lib/side_nav_context';
import { PageBody } from './page_body';
import type { MetricsTimeInput } from '../hooks/use_metrics_time';
import type { InfraMetadata } from '../../../../../common/http_api/metadata_api';
import { PageError } from './page_error';
import { MetadataContext } from '../containers/metadata_context';

interface Props {
  name: string;
  requiredTsvb: InventoryTsvbType[];
  nodeId: string;
  cloudId: string;
  nodeType: InventoryItemType;
  sourceId: string;
  timeRange: MetricsTimeInput;
  metadataLoading: boolean;
  isAutoReloading: boolean;
  refreshInterval: number;
  sideNav: NavItem[];
  metadata: InfraMetadata;
  addNavItem(item: NavItem): void;
  setRefreshInterval(refreshInterval: number): void;
  setAutoReload(isAutoReloading: boolean): void;
  triggerRefresh(): void;
  setTimeRange(timeRange: MetricsTimeInput): void;
}

const parseRange = (range: MetricsTimeInput) => {
  const parsedFrom = dateMath.parse(range.from.toString());
  const parsedTo = dateMath.parse(range.to.toString(), { roundUp: true });
  return {
    ...range,
    from: (parsedFrom && parsedFrom.valueOf()) || moment().subtract(1, 'hour').valueOf(),
    to: (parsedTo && parsedTo.valueOf()) || moment().valueOf(),
  };
};

export const NodeDetailsPage = (props: Props) => {
  const { data, status, error, refetch } = useFetcher(
    async (callApi) => {
      const response = await callApi('/api/metrics/node_details', {
        method: 'POST',
        body: JSON.stringify({
          metrics: props.requiredTsvb,
          nodeId: props.nodeId,
          nodeType: props.nodeType,
          timerange: parseRange(props.timeRange),
          cloudId: props.cloudId,
          sourceId: props.sourceId,
        }),
      });

      return decodeOrThrow(NodeDetailsMetricDataResponseRT)(response);
    },
    [
      props.cloudId,
      props.nodeId,
      props.nodeType,
      props.requiredTsvb,
      props.sourceId,
      props.timeRange,
    ]
  );

  const { metrics = [] } = data ?? {};

  if (error) {
    return <PageError error={error} name={props.name} />;
  }

  return (
    <>
      <EuiFlexGroup justifyContent="flexEnd">
        <EuiFlexItem grow={false}>
          <MetricsTimeControls
            currentTimeRange={props.timeRange}
            isLiveStreaming={props.isAutoReloading}
            refreshInterval={props.refreshInterval}
            setRefreshInterval={props.setRefreshInterval}
            onChangeTimeRange={props.setTimeRange}
            setAutoReload={props.setAutoReload}
            onRefresh={refetch}
          />
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiFlexGroup>
        <EuiFlexItem grow={false}>
          <MetricsSideNav loading={props.metadataLoading} name={props.name} items={props.sideNav} />
        </EuiFlexItem>
        <EuiFlexItem>
          <SideNavContext.Provider
            value={{
              items: props.sideNav,
              addNavItem: props.addNavItem,
            }}
          >
            <MetadataContext.Provider value={props.metadata}>
              <PageBody
                loading={metrics.length > 0 && props.isAutoReloading ? false : isPending(status)}
                refetch={refetch}
                type={props.nodeType}
                metrics={metrics}
                onChangeRangeTime={props.setTimeRange}
                isLiveStreaming={props.isAutoReloading}
                stopLiveStreaming={() => props.setAutoReload(false)}
              />
            </MetadataContext.Provider>
          </SideNavContext.Provider>
        </EuiFlexItem>
      </EuiFlexGroup>
    </>
  );
};
