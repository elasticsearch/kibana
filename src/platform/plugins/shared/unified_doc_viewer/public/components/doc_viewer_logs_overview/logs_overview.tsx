/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import type { DocViewRenderProps } from '@kbn/unified-doc-viewer/types';
import { EuiSpacer } from '@elastic/eui';
import {
  SERVICE_NAME_FIELD,
  SPAN_ID_FIELD,
  TRACE_ID_FIELD,
  TRANSACTION_ID_FIELD,
  getLogDocumentOverview,
} from '@kbn/discover-utils';
import type {
  ObservabilityLogsAIAssistantFeature,
  ObservabilityLogsAIInsightFeature,
  ObservabilityStreamsFeature,
} from '@kbn/discover-shared-plugin/public';
import { FieldActionsProvider } from '@kbn/unified-doc-viewer';
import type { LogDocument, ObservabilityIndexes } from '@kbn/discover-utils/src';
import { getStacktraceFields } from '@kbn/discover-utils/src';
import { css } from '@emotion/react';
import type { DocViewActions } from '@kbn/unified-doc-viewer/src/services/types';
import type { RestorableStateProviderProps } from '@kbn/restorable-state';
import { LogsOverviewHeader } from './logs_overview_header';
import { getUnifiedDocViewerServices } from '../../plugin';
import { LogsOverviewDegradedFields } from './logs_overview_degraded_fields';
import { LogsOverviewStacktraceSection } from './logs_overview_stacktrace_section';
import type { ScrollableSectionWrapperApi } from './scrollable_section_wrapper';
import {
  DEFAULT_MARGIN_BOTTOM,
  getTabContentAvailableHeight,
} from '../doc_viewer_source/get_height';
import {
  TraceWaterfall,
  type TraceWaterfallRestorableState,
} from '../observability/traces/components/trace_waterfall';
import { LOGS_DOC_VIEWER_EBT_DETAILS } from './ebt_constants';
import { DataSourcesProvider } from '../../hooks/use_data_sources';
import { SimilarErrors } from './sub_components/similar_errors';
import { hasErrorFields } from './utils/has_error_fields';
import { DocViewerExtensionActionsProvider } from '../../hooks/use_doc_viewer_extension_actions';

export type LogsOverviewProps = DocViewRenderProps &
  RestorableStateProviderProps<TraceWaterfallRestorableState> & {
    renderAIAssistant?: ObservabilityLogsAIAssistantFeature['render'];
    renderAIInsight?: ObservabilityLogsAIInsightFeature['render'];
    renderFlyoutStreamField?: ObservabilityStreamsFeature['renderFlyoutStreamField'];
    renderFlyoutStreamProcessingLink?: ObservabilityStreamsFeature['renderFlyoutStreamProcessingLink'];
    cpsHasLinkedProjects?: boolean;
    indexes: ObservabilityIndexes;
    showTraceWaterfall?: boolean;
    docViewActions?: DocViewActions;
    profileId: string;
  };

export interface LogsOverviewApi {
  openAndScrollToSection: (section: 'stacktrace' | 'quality_issues') => void;
}

export const LogsOverview = forwardRef<LogsOverviewApi, LogsOverviewProps>(
  (
    {
      columns,
      dataView,
      hit,
      decreaseAvailableHeightBy = DEFAULT_MARGIN_BOTTOM,
      filter,
      onAddColumn,
      onRemoveColumn,
      renderAIAssistant,
      renderAIInsight,
      renderFlyoutStreamField,
      renderFlyoutStreamProcessingLink,
      cpsHasLinkedProjects,
      indexes,
      showTraceWaterfall = true,
      docViewActions,
      initialState,
      onInitialStateChange,
      profileId,
    },
    ref
  ) => {
    const { fieldFormats } = getUnifiedDocViewerServices();
    const parsedDoc = getLogDocumentOverview(hit, { dataView, fieldFormats });
    const LogsOverviewAIAssistant = renderAIAssistant;
    const LogsOverviewAIInsight = renderAIInsight;
    const stacktraceFields = getStacktraceFields(hit as LogDocument);
    const isStacktraceAvailable = Object.values(stacktraceFields).some(Boolean);
    const traceId = parsedDoc[TRACE_ID_FIELD];
    const showSimilarErrors = traceId && hasErrorFields(parsedDoc);
    const qualityIssuesSectionRef = useRef<ScrollableSectionWrapperApi>(null);
    const stackTraceSectionRef = useRef<ScrollableSectionWrapperApi>(null);
    const [containerRef, setContainerRef] = useState<HTMLDivElement | null>(null);

    const containerHeight = containerRef
      ? getTabContentAvailableHeight(containerRef, decreaseAvailableHeightBy)
      : 0;

    useImperativeHandle(
      ref,
      () => ({
        openAndScrollToSection: (section) => {
          if (section === 'quality_issues') {
            qualityIssuesSectionRef.current?.openAndScrollToSection();
          } else if (section === 'stacktrace') {
            stackTraceSectionRef.current?.openAndScrollToSection();
          }
        },
      }),
      []
    );

    return (
      <FieldActionsProvider
        columns={columns}
        filter={filter}
        onAddColumn={onAddColumn}
        onRemoveColumn={onRemoveColumn}
      >
        <div
          ref={setContainerRef}
          css={
            containerHeight
              ? css`
                  height: ${containerHeight}px;
                  overflow: auto;
                `
              : undefined
          }
        >
          <EuiSpacer size="m" />
          <LogsOverviewHeader
            formattedDoc={parsedDoc}
            hit={hit}
            renderFlyoutStreamProcessingLink={renderFlyoutStreamProcessingLink}
            cpsHasLinkedProjects={cpsHasLinkedProjects}
            filter={filter}
            onAddColumn={onAddColumn}
            onRemoveColumn={onRemoveColumn}
            dataView={dataView}
          />
          <DataSourcesProvider indexes={indexes} profileId={profileId}>
            <DocViewerExtensionActionsProvider actions={docViewActions}>
              {showSimilarErrors ? <SimilarErrors hit={hit} /> : null}
              <div>
                {renderFlyoutStreamField &&
                  renderFlyoutStreamField({
                    dataView,
                    doc: hit,
                    cpsHasLinkedProjects,
                  })}
              </div>
              <LogsOverviewDegradedFields ref={qualityIssuesSectionRef} rawDoc={hit.raw} />
              {isStacktraceAvailable && (
                <LogsOverviewStacktraceSection
                  ref={stackTraceSectionRef}
                  hit={hit}
                  dataView={dataView}
                />
              )}
              {traceId && showTraceWaterfall ? (
                <TraceWaterfall
                  traceId={traceId}
                  docId={parsedDoc[TRANSACTION_ID_FIELD] || parsedDoc[SPAN_ID_FIELD]}
                  serviceName={parsedDoc[SERVICE_NAME_FIELD]}
                  dataView={dataView}
                  ebtDetail={LOGS_DOC_VIEWER_EBT_DETAILS.LOG_DOC}
                  initialState={initialState}
                  onInitialStateChange={onInitialStateChange}
                />
              ) : null}
            </DocViewerExtensionActionsProvider>
          </DataSourcesProvider>
          {LogsOverviewAIAssistant && <LogsOverviewAIAssistant doc={hit} />}
          <EuiSpacer size="m" />
          {LogsOverviewAIInsight && <LogsOverviewAIInsight doc={hit} />}
        </div>
      </FieldActionsProvider>
    );
  }
);
