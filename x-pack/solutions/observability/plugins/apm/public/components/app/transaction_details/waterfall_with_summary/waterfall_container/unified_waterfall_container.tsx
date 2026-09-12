/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { Error } from '@kbn/apm-types';
import { TRACE_WATERFALL_EBT_ELEMENTS } from '@kbn/apm-ui-shared';
import type { History } from 'history';
import React, { useMemo } from 'react';
import { useHistory } from 'react-router-dom';
import type { TraceItem } from '../../../../../../common/waterfall/unified_trace_item';
import { fromQuery, toQuery } from '../../../../shared/links/url_helpers';
import { UnifiedWaterfallFlyout } from './unified_waterfall_flyout';
import { useErrorClickHandler } from './use_error_click_handler';
import { useGetErrorMarkerHrefFromRouter } from './use_get_error_marker_href_from_router';
import { useGetServiceBadgeHrefFromRouter } from './use_get_service_badge_href_from_router';
import { useKibana } from '../../../../../context/kibana_context/use_kibana';
import { useApmPluginContext } from '../../../../../context/apm_plugin/use_apm_plugin_context';

interface Props {
  traceItems: TraceItem[];
  errors: Error[];
  agentMarks: Record<string, number>;
  waterfallItemId?: string;
  serviceName?: string;
  showCriticalPath: boolean;
  onShowCriticalPathChange: (value: boolean) => void;
  entryTransactionId?: string;
  traceDocsTotal?: number;
  maxTraceItems?: number;
  discoverHref?: string;
}

const toggleFlyout = ({
  history,
  waterfallItemId,
  flyoutDetailTab,
}: {
  history: History;
  waterfallItemId?: string;
  flyoutDetailTab?: string;
}) => {
  history.replace({
    ...history.location,
    search: fromQuery({
      ...toQuery(history.location.search),
      flyoutDetailTab,
      waterfallItemId,
    }),
  });
};

export function UnifiedWaterfallContainer({
  traceItems,
  errors,
  agentMarks,
  serviceName,
  waterfallItemId,
  showCriticalPath,
  onShowCriticalPathChange,
  entryTransactionId,
  traceDocsTotal,
  maxTraceItems,
  discoverHref,
}: Props) {
  const {
    services: { apmShared },
  } = useKibana();
  const TraceWaterfall = useMemo(() => apmShared.TraceWaterfall, [apmShared.TraceWaterfall]);
  const { config } = useApmPluginContext();
  const history = useHistory();
  const handleErrorClick = useErrorClickHandler(traceItems);
  const getServiceBadgeHref = useGetServiceBadgeHrefFromRouter();
  const getErrorMarkerHref = useGetErrorMarkerHrefFromRouter();

  const handleNodeClick = (id: string, options?: { flyoutDetailTab?: string }) => {
    toggleFlyout({
      history,
      waterfallItemId: id,
      flyoutDetailTab: options?.flyoutDetailTab ?? 'metadata',
    });
  };

  return (
    <div data-test-subj="waterfallContainer">
      <TraceWaterfall
        traceItems={traceItems}
        errors={errors}
        engine={config.featureFlags.traceChartEngine ? 'charts' : undefined}
        onClick={handleNodeClick}
        onErrorClick={handleErrorClick}
        getServiceBadgeHref={getServiceBadgeHref}
        getErrorMarkerHref={getErrorMarkerHref}
        serviceName={serviceName}
        showLegend
        showCriticalPathControl
        agentMarks={agentMarks}
        showCriticalPath={showCriticalPath}
        onShowCriticalPathChange={onShowCriticalPathChange}
        entryTransactionId={entryTransactionId}
        traceDocsTotal={traceDocsTotal}
        maxTraceItems={maxTraceItems}
        discoverHref={discoverHref}
        ebt={{
          row: { element: TRACE_WATERFALL_EBT_ELEMENTS.WATERFALL_ROW },
          errorBadge: { element: TRACE_WATERFALL_EBT_ELEMENTS.WATERFALL_ERROR_BADGE },
          serviceBadge: { element: TRACE_WATERFALL_EBT_ELEMENTS.WATERFALL_SERVICE_BADGE },
        }}
      >
        <UnifiedWaterfallFlyout
          waterfallItemId={waterfallItemId}
          traceItems={traceItems}
          toggleFlyout={toggleFlyout}
        />
      </TraceWaterfall>
    </div>
  );
}
