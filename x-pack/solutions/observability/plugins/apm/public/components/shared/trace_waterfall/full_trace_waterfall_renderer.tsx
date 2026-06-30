/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiCallOut } from '@elastic/eui';
import type { FullTraceWaterfallProps } from '@kbn/apm-types';
import { i18n } from '@kbn/i18n';
import React from 'react';
import type { CoreStart } from '@kbn/core/public';
import useEffectOnce from 'react-use/lib/useEffectOnce';
import { TraceWaterfall } from '.';
import { isPending, useFetcher } from '../../../hooks/use_fetcher';
import { FETCHER_OPERATION_IDS } from '../../../hooks/fetcher_operation_ids';
import { Loading } from './loading';
import { createCallApmApi } from '../../../services/rest/create_call_apm_api';
import { useGetServiceBadgeHrefFromCore } from './use_get_service_badge_href_from_core';

type Props = FullTraceWaterfallProps & { core: CoreStart };

export function FullTraceWaterfallRenderer({
  traceId,
  rangeFrom,
  rangeTo,
  serviceName,
  scrollElement,
  onNodeClick,
  onErrorClick,
  core,
  ebt,
  ...scrollProps
}: Props) {
  useEffectOnce(() => {
    createCallApmApi(core);
  });

  const getServiceBadgeHref = useGetServiceBadgeHrefFromCore(core, rangeFrom, rangeTo);

  const { data, status } = useFetcher(
    (callApmApi) => {
      return callApmApi('GET /internal/apm/unified_traces/{traceId}', {
        params: {
          path: { traceId },
          query: {
            start: rangeFrom,
            end: rangeTo,
          },
        },
      });
    },
    [rangeFrom, rangeTo, traceId],
    { operationId: FETCHER_OPERATION_IDS.FETCH_FULL_TRACE_WATERFALL }
  );

  if (isPending(status)) {
    return <Loading />;
  }

  if (data === undefined) {
    return (
      <EuiCallOut
        announceOnMount
        data-test-subj="TraceWaterfallEmbeddableNoData"
        color="danger"
        size="s"
        title={i18n.translate('xpack.apm.traceWaterfallEmbeddable.noDataCalloutLabel', {
          defaultMessage: 'Trace waterfall could not be loaded.',
        })}
      />
    );
  }

  return (
    <TraceWaterfall
      traceItems={data.traceItems}
      errors={data.errors}
      onClick={onNodeClick}
      scrollElement={scrollElement}
      {...scrollProps}
      isEmbeddable
      showLegend
      serviceName={serviceName}
      onErrorClick={onErrorClick}
      ebt={ebt}
      getServiceBadgeHref={getServiceBadgeHref}
      agentMarks={data.agentMarks}
      showCriticalPathControl
      traceDocsTotal={data.traceDocsTotal}
      maxTraceItems={data.maxTraceItems}
    />
  );
}
