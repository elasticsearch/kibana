/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiFlyout, EuiFlyoutBody, EuiFlyoutHeader, EuiTitle } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { FullTraceWaterfallOnErrorClick } from '@kbn/apm-types';
import { UnifiedDocViewerObservabilityTraceDocFlyout } from '@kbn/unified-doc-viewer-plugin/public';
import type { UnifiedDocViewerObservabilityTracesDocumentType } from '@kbn/unified-doc-viewer-plugin/public';
import React, { useCallback, useMemo, useState } from 'react';
import { TRACE_WATERFALL_EBT_ELEMENTS, TraceWaterfallWithFetching } from '@kbn/apm-ui-shared';
import { useApmPluginContext } from '../../../../../context/apm_plugin/use_apm_plugin_context';
import { useAdHocApmDataView } from '../../../../../hooks/use_adhoc_apm_data_view';
import { TraceWaterfallFlyoutFooter } from './flyout_footer';
import { useLogsIndexPattern } from '../../../../../hooks/use_logs_index_pattern';
import { useTimeRange } from '../../../../../hooks/use_time_range';
import { getApmInternalServices } from '../../../../../plugin';
import { useGetErrorMarkerHrefFromRouter } from '../waterfall_container/use_get_error_marker_href_from_router';

const TRACE_WATERFALL_FLYOUT_HISTORY_KEY = Symbol.for('apmTraceWaterfallFlyout');

interface Props {
  traceId: string;
  rangeFrom: string;
  rangeTo: string;
  isOpen: boolean;
  onClose: () => void;
  contextSpanIds?: string[];
}

export function TraceWaterfallFlyout({
  traceId,
  rangeFrom,
  rangeTo,
  isOpen,
  onClose,
  contextSpanIds,
}: Props) {
  const { callApmApi } = getApmInternalServices();
  const { core, config } = useApmPluginContext();
  const { start, end } = useTimeRange({ rangeFrom, rangeTo });
  const getErrorMarkerHref = useGetErrorMarkerHrefFromRouter();
  const { dataView, apmIndices } = useAdHocApmDataView();
  const [selectedDocId, setSelectedDocId] = useState<string | null>(null);
  const [selectedDocIndex, setSelectedDocIndex] = useState<string | undefined>(undefined);
  const [activeFlyoutType, setActiveFlyoutType] =
    useState<UnifiedDocViewerObservabilityTracesDocumentType>('span');
  const [activeSection, setActiveSection] = useState<'errors-table' | undefined>(undefined);
  const { logsIndexPattern } = useLogsIndexPattern();

  const indexes = useMemo(
    () => ({
      logs: logsIndexPattern,
      apm: {
        traces: apmIndices?.transaction,
        errors: apmIndices?.error,
      },
    }),
    [logsIndexPattern, apmIndices?.transaction, apmIndices?.error]
  );

  const onNodeClick = useCallback((nodeSpanId: string) => {
    setActiveFlyoutType('span');
    setActiveSection(undefined);
    setSelectedDocIndex(undefined);
    setSelectedDocId(nodeSpanId);
  }, []);

  const onErrorClick = useCallback<FullTraceWaterfallOnErrorClick>(
    ({ docId, errorCount, errorDocId, docIndex }) => {
      if (errorCount > 1) {
        setActiveFlyoutType('span');
        setActiveSection('errors-table');
        setSelectedDocIndex(undefined);
        setSelectedDocId(docId);
      } else if (errorDocId) {
        setActiveFlyoutType('log');
        setActiveSection(undefined);
        setSelectedDocIndex(docIndex);
        setSelectedDocId(errorDocId);
      }
    },
    []
  );

  const closeDetailFlyout = useCallback(() => {
    setSelectedDocId(null);
    setSelectedDocIndex(undefined);
    setActiveSection(undefined);
  }, []);

  if (!isOpen) return null;

  return (
    <EuiFlyout
      session="start"
      historyKey={TRACE_WATERFALL_FLYOUT_HISTORY_KEY}
      onClose={onClose}
      size="m"
      aria-label={i18n.translate('xpack.apm.traceWaterfallFlyout.ariaLabel', {
        defaultMessage: 'Full trace waterfall flyout',
      })}
    >
      <EuiFlyoutHeader hasBorder>
        <EuiTitle size="m">
          <h2>
            {i18n.translate('xpack.apm.traceWaterfallFlyout.title', {
              defaultMessage: 'Full trace',
            })}
          </h2>
        </EuiTitle>
      </EuiFlyoutHeader>
      <EuiFlyoutBody>
        <TraceWaterfallWithFetching
          traceId={traceId}
          rangeFrom={start}
          rangeTo={end}
          engine={config.featureFlags.traceChartEngine ? 'charts' : undefined}
          core={core}
          contextSpanIds={contextSpanIds}
          callApmApi={callApmApi}
          onNodeClick={onNodeClick}
          onErrorClick={onErrorClick}
          getErrorMarkerHref={getErrorMarkerHref}
          ebt={{
            row: { element: TRACE_WATERFALL_EBT_ELEMENTS.FLYOUT_WATERFALL_ROW },
            errorBadge: { element: TRACE_WATERFALL_EBT_ELEMENTS.FLYOUT_WATERFALL_ERROR_BADGE },
            serviceBadge: { element: TRACE_WATERFALL_EBT_ELEMENTS.FLYOUT_WATERFALL_SERVICE_BADGE },
          }}
        />
      </EuiFlyoutBody>
      <TraceWaterfallFlyoutFooter traceId={traceId} rangeFrom={rangeFrom} rangeTo={rangeTo} />
      {selectedDocId && dataView && (
        <UnifiedDocViewerObservabilityTraceDocFlyout
          type={activeFlyoutType}
          docId={selectedDocId}
          docIndex={selectedDocIndex}
          traceId={traceId}
          dataView={dataView}
          indexes={indexes}
          activeSection={activeSection}
          onCloseFlyout={closeDetailFlyout}
          dataTestSubj="apmTraceWaterfallSpanDetailFlyout"
          size="fill"
        />
      )}
    </EuiFlyout>
  );
}
