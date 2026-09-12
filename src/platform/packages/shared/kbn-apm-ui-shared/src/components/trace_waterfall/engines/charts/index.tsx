/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  Chart,
  Settings,
  Tooltip,
  TooltipType,
  Trace,
  TraceLaneAnnotation,
  TraceTimeAnnotation,
  isTraceBadgeElementEvent,
  isTraceAnnotationElementEvent,
  isTraceElementEvent,
} from '@elastic/charts';
import type {
  ElementClickListener,
  TraceControlCallbacks,
  TraceDataDiagnostics,
} from '@elastic/charts';
import { EuiFlexGroup, EuiFlexItem, useEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { useChartThemes } from '../../../../hooks/use_chart_theme';
import { CriticalPathToggle } from '../../critical_path';
import { ScrollToOriginButton } from '../../scroll_to_origin_button';
import type { ErrorMark } from '../../../timeline/marker/error_marker';
import { WaterfallLegends } from '../../waterfall_legends';
import { useTraceWaterfallContext } from '../../trace_waterfall_context';
import type { BadgeAction } from './badges';
import { createWaterfallBadgeAccessor } from './badges';
import {
  toCriticalPath,
  toCollapsedSpanIds,
  toFailureSpanIds,
  toMarkAnnotationProps,
  toTraceData,
} from './to_trace_data';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Height of the time bar at the top of the chart, in px (matches timeBarHeight default). */
const TIME_BAR_H = 32;
/** Lane height — matches ACCORDION_HEIGHT from trace_item_row.tsx. */
const LANE_H = 48;
/** Maximum lanes to size for without scrolling. */
const MAX_VISIBLE_LANES = 20;
/** Minimum chart height, in px. */
const MIN_CHART_H = 200;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

/**
 * Experimental elastic-charts `<Trace>` canvas engine for `TraceWaterfall`.
 *
 * Reads from `TraceWaterfallContext` (exactly as `TraceWaterfallComponent` does) and
 * renders an `@elastic/charts` `<Chart><Trace/></Chart>` instead of the react-virtualized
 * row list.
 *
 * **Accepted divergences (spike scope):**
 * - Hover chrome (EUI popover on error badge, `EuiIconTip` for orphan/sync/missing-dest,
 *   `TruncateWithTooltip`) is absent — badges are inert text; clicks are re-wired.
 * - Critical path: native charts treatment (colored bottom-edge line, all lanes kept) rather
 *   than Kibana's opacity+filter approach.
 * - Both `scrollStrategy` variants use in-chart vertical scrolling (no `WindowScroller`).
 * - `ScrollToOriginButton` is always enabled (canvas cannot report lane visibility).
 * - All `data-test-subj` and `EuiAccordion`/`role="row"` DOM are absent.
 */
export function ChartsTraceWaterfall() {
  const {
    traceWaterfall,
    traceWaterfallMap,
    accordionStatesMap,
    toggleAccordionState,
    criticalPathSegmentsById,
    showCriticalPath,
    setShowCriticalPath,
    showCriticalPathControl,
    contextSpanIds,
    scrollStrategy,
    scrollToContextOnMount,
    legends,
    colorBy,
    showLegend,
    serviceName,
    showAccordion,
    marks,
    onClick,
    onErrorClick,
    getServiceBadgeHref,
    getErrorMarkerHref,
    isEmbeddable,
  } = useTraceWaterfallContext();

  const { euiTheme, colorMode } = useEuiTheme();
  const { baseTheme } = useChartThemes();

  // -------------------------------------------------------------------------
  // Data derivation — all pure, memo-guarded
  // -------------------------------------------------------------------------

  const data = useMemo(() => toTraceData(traceWaterfall), [traceWaterfall]);

  const badgeAccessor = useMemo(
    () => createWaterfallBadgeAccessor(colorMode === 'DARK'),
    [colorMode]
  );

  const collapsedSpanIds = useMemo(
    () =>
      showAccordion
        ? toCollapsedSpanIds(accordionStatesMap, traceWaterfallMap, traceWaterfall)
        : [],
    [showAccordion, accordionStatesMap, traceWaterfallMap, traceWaterfall]
  );

  const criticalPath = useMemo(
    () => (showCriticalPath ? toCriticalPath(criticalPathSegmentsById) : undefined),
    [showCriticalPath, criticalPathSegmentsById]
  );

  const annotations = useMemo(() => toMarkAnnotationProps(marks), [marks]);

  const failureSpanIds = useMemo(() => toFailureSpanIds(traceWaterfall), [traceWaterfall]);

  // -------------------------------------------------------------------------
  // Visible span count — O(N) preorder walk that mirrors the chart's own
  // collapseLanes logic: skip every span whose ancestor is collapsed.
  // Used for chart height so a trace with 600 spans but only 3 visible doesn't
  // produce a 1000px canvas with 3 tiny bars at the top.
  // -------------------------------------------------------------------------

  const visibleSpanCount = useMemo(() => {
    let count = 0;
    let collapsedAt = -1; // depth of the last collapsed span (-1 = none active)
    for (const item of traceWaterfall) {
      if (collapsedAt !== -1 && item.depth > collapsedAt) {
        continue; // hidden under a collapsed ancestor
      }
      collapsedAt = -1; // exited that subtree
      count++;
      if (
        accordionStatesMap[item.id] === 'closed' &&
        (traceWaterfallMap[item.id]?.length ?? 0) > 0
      ) {
        collapsedAt = item.depth;
      }
    }
    return count;
  }, [traceWaterfall, accordionStatesMap, traceWaterfallMap]);

  // -------------------------------------------------------------------------
  // Chart height — sized to fit visible lanes, capped at MAX_VISIBLE_LANES
  // -------------------------------------------------------------------------

  const chartHeight = useMemo(
    () =>
      Math.max(MIN_CHART_H, TIME_BAR_H + Math.min(visibleSpanCount, MAX_VISIBLE_LANES) * LANE_H),
    [visibleSpanCount]
  );

  // -------------------------------------------------------------------------
  // Imperative control — scrollToSpan via controlProviderCallback
  // -------------------------------------------------------------------------

  const controlsRef = useRef<TraceControlCallbacks | null>(null);

  const handleControls = useCallback((callbacks: TraceControlCallbacks) => {
    controlsRef.current = callbacks;
  }, []);

  // Scroll to context span on mount when requested
  useEffect(() => {
    const targetId = contextSpanIds?.[0];
    if (!scrollToContextOnMount || !targetId || !controlsRef.current) return;
    controlsRef.current.scrollToSpan(targetId);
  }, [scrollToContextOnMount, contextSpanIds]);

  // -------------------------------------------------------------------------
  // Toolbar helpers
  // -------------------------------------------------------------------------

  const showScrollToOrigin = scrollStrategy === 'parent' && (contextSpanIds?.length ?? 0) > 0;
  const showToolbar = showCriticalPathControl || showScrollToOrigin;

  const handleScrollToOrigin = useCallback(() => {
    const targetId = contextSpanIds?.[0];
    if (targetId) controlsRef.current?.scrollToSpan(targetId);
  }, [contextSpanIds]);

  // -------------------------------------------------------------------------
  // Collapse synchronization
  // -------------------------------------------------------------------------

  const handleCollapseChange = useCallback(
    (next: string[]) => {
      if (!showAccordion) return;
      const nextSet = new Set(next);
      // Toggle any id whose state diverges from the new set
      for (const [id, state] of Object.entries(accordionStatesMap)) {
        const shouldBeClosed = nextSet.has(id);
        const isClosed = state === 'closed';
        if (shouldBeClosed !== isClosed && (traceWaterfallMap[id]?.length ?? 0) > 0) {
          toggleAccordionState(id);
        }
      }
    },
    [showAccordion, accordionStatesMap, traceWaterfallMap, toggleAccordionState]
  );

  // -------------------------------------------------------------------------
  // Element click dispatch
  // -------------------------------------------------------------------------

  const handleElementClick = useCallback<ElementClickListener>(
    (elements) => {
      for (const element of elements) {
        if (isTraceElementEvent(element)) {
          onClick?.(element.span.id);
        } else if (isTraceBadgeElementEvent(element)) {
          const action = element.badge.meta as BadgeAction | undefined;
          if (!action) continue;
          if (action.type === 'openError') {
            onErrorClick?.({
              traceId: action.traceId,
              docId: action.docId,
              errorCount: action.errorCount,
              errorDocId: action.errorDocId,
              docIndex: action.docIndex,
            });
          } else if (action.type === 'openSpanLinks') {
            onClick?.(action.spanId, { flyoutDetailTab: action.flyoutTab });
          } else if (action.type === 'openSpanDetail') {
            onClick?.(action.spanId);
          } else if (action.type === 'openServiceOverview') {
            const href = getServiceBadgeHref?.(action.serviceName);
            if (href) window.location.href = href;
          }
        } else if (isTraceAnnotationElementEvent(element)) {
          const mark = element.annotation.meta as ErrorMark | undefined;
          if (!mark) continue;
          if (mark.type === 'errorMark') {
            if (mark.errorMarkerHref && getErrorMarkerHref) {
              window.location.href = mark.errorMarkerHref;
            } else {
              mark.onClick?.();
            }
          }
        }
      }
    },
    [onClick, onErrorClick, getServiceBadgeHref, getErrorMarkerHref]
  );

  // -------------------------------------------------------------------------
  // Diagnostics (dev-mode console fallback)
  // -------------------------------------------------------------------------

  const handleDiagnostics = useCallback((diagnostics: TraceDataDiagnostics) => {
    if (diagnostics.issues.length > 0 && typeof console !== 'undefined') {
      // eslint-disable-next-line no-console
      console.warn('[ChartsTraceWaterfall] trace data diagnostics', diagnostics);
    }
  }, []);

  // -------------------------------------------------------------------------
  // Sticky header positioning (matches TraceWaterfallComponent)
  // -------------------------------------------------------------------------

  const stickyTop = isEmbeddable
    ? '0px'
    : 'var(--kbnAppHeadersOffset, var(--euiFixedHeadersOffset, 0))';

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------

  return (
    <EuiFlexGroup direction="column" gutterSize="none">
      {showToolbar && (
        <EuiFlexItem grow={false}>
          <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
            {showCriticalPathControl && (
              <EuiFlexItem grow={false}>
                <CriticalPathToggle checked={showCriticalPath} onChange={setShowCriticalPath} />
              </EuiFlexItem>
            )}
            {showScrollToOrigin && (
              <EuiFlexItem
                grow={false}
                css={css`
                  margin-left: auto;
                `}
              >
                {/* Always enabled: canvas cannot report lane visibility */}
                <ScrollToOriginButton isDisabled={false} onClick={handleScrollToOrigin} />
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        </EuiFlexItem>
      )}
      <EuiFlexItem grow={false}>
        {showLegend && (
          <div
            css={css`
              position: sticky;
              top: ${stickyTop};
              z-index: ${euiTheme.levels.menu};
              background-color: ${euiTheme.colors.emptyShade};
              border-bottom: ${euiTheme.border.thin};
              padding-top: ${euiTheme.size.base};
              padding-bottom: ${euiTheme.size.xs};
            `}
          >
            <WaterfallLegends serviceName={serviceName} legends={legends} type={colorBy} />
          </div>
        )}
        <div>
          <Chart
            size={{ width: '100%', height: chartHeight }}
            aria-label={i18n.translate('apmUiShared.chartsTraceWaterfall.ariaLabel', {
              defaultMessage: 'APM trace waterfall chart',
            })}
          >
            <Tooltip type={TooltipType.None} />
            <Settings
              baseTheme={baseTheme}
              theme={{
                trace: {
                  labelPosition: 'inline',
                  laneHeight: LANE_H,
                  gutterLabel: { fontSize: 14 },
                  criticalPathThickness: 4,
                  badge: {
                    palette: {
                      danger: {
                        background: euiTheme.colors.backgroundLightDanger,
                        text: euiTheme.colors.textDanger,
                      },
                    },
                  },
                },
              }}
              onElementClick={handleElementClick}
            />
            <Trace
              id="apm-trace-waterfall"
              data={data}
              xScaleType="linear"
              spanDisplay="segments"
              laneOrder="tree"
              showDisplayChildCount={showAccordion}
              showTreeGuides={false}
              badgeSize="m"
              collapsedSpanIds={collapsedSpanIds}
              onCollapseChange={handleCollapseChange}
              criticalPath={criticalPath}
              badgeAccessor={badgeAccessor}
              controlProviderCallback={handleControls}
              onDataDiagnosticsChange={handleDiagnostics}
            >
              {annotations.map((a) => (
                <TraceTimeAnnotation
                  key={a.id}
                  id={a.id}
                  time={a.timeMs}
                  color={a.color}
                  placement="timebar"
                  ariaLabel={a.ariaLabel}
                  meta={a.meta}
                />
              ))}
              {failureSpanIds.map((spanId) => (
                <TraceLaneAnnotation
                  key={`failure-${spanId}`}
                  id={`failure-${spanId}`}
                  spanId={spanId}
                  color="danger"
                  ariaLabel="failure"
                />
              ))}
            </Trace>
          </Chart>
        </div>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
}
