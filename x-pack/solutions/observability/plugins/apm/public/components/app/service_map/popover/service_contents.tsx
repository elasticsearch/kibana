/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/* eslint-disable @elastic/eui/href-or-on-click */

import { EuiButton, EuiFlexItem, EuiSpacer } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import React, { useCallback } from 'react';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import type { ApmPluginStartDeps } from '../../../../plugin';
import { useAnyOfApmParams } from '../../../../hooks/use_apm_params';
import { isTimeComparison } from '../../../shared/time_comparison/get_comparison_options';
import { isEdge } from './utils';
import type { ContentsProps } from './popover_content';
import { isServiceNodeData, type ServiceNodeData } from '../../../../../common/service_map';
import { useApmRouter } from '../../../../hooks/use_apm_router';
import { FETCH_STATUS, useFetcher } from '../../../../hooks/use_fetcher';
import { StatsList } from './stats_list';
import { useTimeRange } from '../../../../hooks/use_time_range';
import type { APIReturnType } from '../../../../services/rest/create_call_apm_api';

type ServiceNodeReturn = APIReturnType<'GET /internal/apm/service-map/service/{serviceName}'>;

const INITIAL_STATE: ServiceNodeReturn = {
  currentPeriod: {},
  previousPeriod: undefined,
};

export function ServiceContents({
  onFocusClick,
  selection,
  environment,
  kuery,
  isEmbedded,
  showFocusMap,
  clearKueryOnNavigation,
}: ContentsProps) {
  const apmRouter = useApmRouter();
  const { services } = useKibana<ApmPluginStartDeps>();
  const filterManager = services.data?.query?.filterManager;
  const { query } = useAnyOfApmParams(
    '/service-map',
    '/services/{serviceName}/service-map',
    '/mobile-services/{serviceName}/service-map'
  );

  if (!('rangeFrom' in query && 'rangeTo' in query) || !query.rangeFrom || !query.rangeTo) {
    throw new Error('Expected rangeFrom and rangeTo to be set');
  }

  const { rangeFrom, rangeTo, comparisonEnabled, offset } = query;
  const { start, end } = useTimeRange({ rangeFrom, rangeTo });

  const isServiceNode = !isEdge(selection) && isServiceNodeData(selection.data);
  const nodeData: ServiceNodeData | null = isServiceNode
    ? (selection.data as ServiceNodeData)
    : null;
  const serviceName = nodeData?.id;
  const serviceGroup = ('serviceGroup' in query && query.serviceGroup) || '';

  const { data = INITIAL_STATE, status } = useFetcher(
    (callApmApi) => {
      if (serviceName && start && end) {
        return callApmApi('GET /internal/apm/service-map/service/{serviceName}', {
          params: {
            path: { serviceName },
            query: {
              environment,
              start,
              end,
              offset: comparisonEnabled && isTimeComparison(offset) ? offset : undefined,
            },
          },
        });
      }
    },
    [environment, serviceName, start, end, offset, comparisonEnabled]
  );

  const isLoading = status === FETCH_STATUS.LOADING;

  // Clear all app-level filter pills when focusing a single service — the
  // focused view starts fresh with only the service.name scope.
  const handleFocusClick = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>) => {
      filterManager?.setAppFilters([]);
      onFocusClick(event);
    },
    [filterManager, onFocusClick]
  );

  if (!isServiceNode || !nodeData || !serviceName) {
    return null;
  }

  const destinationKuery = clearKueryOnNavigation ? '' : kuery;

  const detailsUrl = apmRouter.link('/services/{serviceName}', {
    path: { serviceName },
    query: {
      rangeFrom,
      rangeTo,
      environment,
      kuery: destinationKuery,
      comparisonEnabled,
      serviceGroup,
    },
  });

  const focusUrl = apmRouter.link('/services/{serviceName}/service-map', {
    path: { serviceName },
    query: {
      rangeFrom,
      rangeTo,
      environment,
      kuery: '',
      serviceGroup,
      comparisonEnabled,
    },
  });

  return (
    <>
      <EuiFlexItem>
        <StatsList data={data} isLoading={isLoading} />
      </EuiFlexItem>
      <EuiSpacer size="s" />
      <EuiFlexItem>
        <EuiButton
          data-test-subj="apmServiceContentsServiceDetailsButton"
          href={detailsUrl}
          fill={true}
        >
          {i18n.translate('xpack.apm.serviceMap.serviceDetailsButtonText', {
            defaultMessage: 'Service Details',
          })}
        </EuiButton>
      </EuiFlexItem>
      {(showFocusMap ?? !isEmbedded) && (
        <EuiFlexItem>
          <EuiButton
            data-test-subj="apmServiceContentsFocusMapButton"
            color="success"
            href={focusUrl}
            onClick={handleFocusClick}
          >
            {i18n.translate('xpack.apm.serviceMap.focusMapButtonText', {
              defaultMessage: 'Focus map',
            })}
          </EuiButton>
        </EuiFlexItem>
      )}
    </>
  );
}
