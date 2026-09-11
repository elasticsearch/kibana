/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiTabbedContentProps } from '@elastic/eui';
import { EuiLoadingSpinner, EuiSpacer, EuiTabbedContent } from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import { ProfilingEmptyState } from '@kbn/observability-shared-plugin/public';
import React, { useMemo } from 'react';
import { ApmDocumentType } from '@kbn/apm-types';
import { isJavaAgentName as getIsJavaAgentName } from '../../../../common/agent_name';
import { useApmServiceContext } from '../../../context/apm_service/use_apm_service_context';
import { useApmParams } from '../../../hooks/use_apm_params';
import { usePreferredDataSourceAndBucketSize } from '../../../hooks/use_preferred_data_source_and_bucket_size';
import { useProfilingPlugin } from '../../../hooks/use_profiling_plugin';
import { useTimeRange } from '../../../hooks/use_time_range';
import { ProfilingFlamegraph } from '../../shared/profiling/flamegraph';
import { ProfilingTopNFunctions } from '../../shared/profiling/top_functions';
import { ProfilingHostsCallout } from './profiling_hosts_callout';
import { ProfilingHostsFlamegraph } from './profiling_hosts_flamegraph';
import { ProfilingHostsTopNFunctions } from './profiling_hosts_top_functions';

export { ProfilingHeaderSearchBar } from './profiling_header_search_bar';

export function ProfilingOverview() {
  const {
    path: { serviceName },
    query: { rangeFrom, rangeTo, environment, kuery },
  } = useApmParams('/services/{serviceName}/profiling');
  const { isProfilingAvailable, isLoading } = useProfilingPlugin();
  const { start, end } = useTimeRange({ rangeFrom, rangeTo });
  const preferred = usePreferredDataSourceAndBucketSize({
    start,
    end,
    kuery,
    type: ApmDocumentType.TransactionMetric,
    numBuckets: 20,
  });

  const { agentName, transactionType } = useApmServiceContext();
  const isJavaAgent = getIsJavaAgentName(agentName);

  const tabs = useMemo((): EuiTabbedContentProps['tabs'] => {
    return [
      {
        id: 'flamegraph',
        name: i18n.translate('xpack.apm.profiling.tabs.flamegraph', {
          defaultMessage: 'Flamegraph',
        }),
        content: (
          <>
            <EuiSpacer />
            {isJavaAgent ? (
              <ProfilingFlamegraph
                serviceName={serviceName}
                kuery={kuery}
                rangeFrom={rangeFrom}
                rangeTo={rangeTo}
                environment={environment}
                transactionType={transactionType}
              />
            ) : (
              <ProfilingHostsFlamegraph
                serviceName={serviceName}
                start={start}
                end={end}
                environment={environment}
                dataSource={preferred?.source}
                kuery={kuery}
                rangeFrom={rangeFrom}
                rangeTo={rangeTo}
              />
            )}
          </>
        ),
      },
      {
        id: 'topNFunctions',
        name: i18n.translate('xpack.apm.profiling.tabs.topNFunctions', {
          defaultMessage: 'Top 10 Functions',
        }),
        content: (
          <>
            <EuiSpacer />
            {isJavaAgent ? (
              <ProfilingTopNFunctions
                serviceName={serviceName}
                kuery={kuery}
                rangeFrom={rangeFrom}
                rangeTo={rangeTo}
                environment={environment}
                transactionType={transactionType}
              />
            ) : (
              <ProfilingHostsTopNFunctions
                serviceName={serviceName}
                start={start}
                end={end}
                environment={environment}
                startIndex={0}
                endIndex={10}
                dataSource={preferred?.source}
                kuery={kuery}
                rangeFrom={rangeFrom}
                rangeTo={rangeTo}
              />
            )}
          </>
        ),
      },
    ];
  }, [
    end,
    environment,
    isJavaAgent,
    kuery,
    preferred?.source,
    rangeFrom,
    rangeTo,
    serviceName,
    start,
    transactionType,
  ]);

  if (isLoading) {
    return (
      <div
        css={css`
          display: flex;
          justify-content: center;
        `}
      >
        <EuiLoadingSpinner size="m" />
      </div>
    );
  }

  if (isProfilingAvailable === false) {
    return <ProfilingEmptyState />;
  }

  return (
    <>
      {!isJavaAgent && (
        <>
          <ProfilingHostsCallout serviceName={serviceName} />
          <EuiSpacer />
        </>
      )}
      <EuiTabbedContent tabs={tabs} initialSelectedTab={tabs[0]} autoFocus="selected" />
    </>
  );
}
