/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { EuiCallOut } from '@elastic/eui';
import type { APMClientV2 } from '@kbn/apm-api-shared';
import type { FullTraceWaterfallProps } from '@kbn/apm-types';
import type { CoreStart } from '@kbn/core/public';
import { i18n } from '@kbn/i18n';
import { useAbortableAsync } from '@kbn/react-hooks';
import React from 'react';
import { TraceWaterfall } from '.';
import { Loading } from './loading';
import { useGetServiceBadgeHrefFromCore } from './use_get_service_badge_href_from_core';

type Props = FullTraceWaterfallProps & { core: CoreStart; callApmApi: APMClientV2 };

export function TraceWaterfallWithFetching({
  traceId,
  rangeFrom,
  rangeTo,
  engine,
  serviceName,
  scrollElement,
  onNodeClick,
  onErrorClick,
  core,
  ebt,
  callApmApi,
  getErrorMarkerHref,
  ...scrollProps
}: Props) {
  const getServiceBadgeHref = useGetServiceBadgeHrefFromCore(core, rangeFrom, rangeTo);

  const {
    value: data,
    loading,
    error,
  } = useAbortableAsync(
    ({ signal }) => {
      return callApmApi('GET /internal/apm/unified_traces/{traceId}', {
        signal,
        params: {
          path: { traceId },
          query: {
            start: rangeFrom,
            end: rangeTo,
          },
        },
      });
    },
    [rangeFrom, rangeTo, traceId]
  );

  if (loading || (!error && data === undefined)) {
    return <Loading />;
  }

  if (error || data === undefined) {
    return (
      <EuiCallOut
        announceOnMount
        data-test-subj="TraceWaterfallEmbeddableNoData"
        color="danger"
        size="s"
        title={i18n.translate('apmUiShared.traceWaterfallEmbeddable.noDataCalloutLabel', {
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
      engine={engine}
      isEmbeddable
      showLegend
      serviceName={serviceName}
      onErrorClick={onErrorClick}
      ebt={ebt}
      getServiceBadgeHref={getServiceBadgeHref}
      getErrorMarkerHref={getErrorMarkerHref}
      agentMarks={data.agentMarks}
      showCriticalPathControl
      traceDocsTotal={data.traceDocsTotal}
      maxTraceItems={data.maxTraceItems}
    />
  );
}
