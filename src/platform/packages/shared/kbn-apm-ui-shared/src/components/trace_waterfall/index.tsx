/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */
import type { EuiAccordionProps } from '@elastic/eui';
import { EuiFlexGroup, EuiFlexItem, EuiSpacer, useEuiTheme } from '@elastic/eui';
import { css } from '@emotion/react';
import type {
  Error,
  IWaterfallGetRelatedErrorsHref,
  TraceItem,
  WaterfallGetErrorMarkerHref,
  WaterfallGetServiceBadgeHref,
} from '@kbn/apm-types';
import { APP_MAIN_SCROLL_CONTAINER_ID } from '@kbn/core-chrome-layout-constants';
import React, { lazy, Suspense, useCallback, useMemo, useRef, useState } from 'react';
import type { ListRowProps, ListRowRenderer } from 'react-virtualized';
import {
  AutoSizer,
  CellMeasurer,
  CellMeasurerCache,
  List,
  WindowScroller,
} from 'react-virtualized';
import { TimelineAxisContainer, VerticalLinesContainer } from '../timeline';
import { CriticalPathToggle } from './critical_path';
import { ScrollToOriginButton } from './scroll_to_origin_button';
import { ACCORDION_HEIGHT, BORDER_THICKNESS, TraceItemRow } from './trace_item_row';
import { TraceWarning } from './trace_warning';
import type { OnErrorClick, OnNodeClick } from './trace_waterfall_context';
import type { WaterfallEngine } from './use_waterfall_engine';
import { useWaterfallEngine } from './use_waterfall_engine';

const ChartsTraceWaterfall = lazy(() =>
  import('./engines/charts').then((m) => ({ default: m.ChartsTraceWaterfall }))
);
import { TraceWaterfallContextProvider, useTraceWaterfallContext } from './trace_waterfall_context';
import { useScrollToOrigin } from './use_scroll_to_origin';
import type { TraceWaterfallItem } from './use_trace_waterfall';
import { WaterfallAccordionButton } from './waterfall_accordion_button';
import { WaterfallLegends } from './waterfall_legends';
import { WaterfallSizeWarning } from './waterfall_size_warning';

/** Base props shared by all TraceWaterfall variants */
interface BaseTraceWaterfallProps {
  traceItems: TraceItem[];
  errors?: Error[];
  showAccordion?: boolean;
  onClick?: OnNodeClick;
  /** Called when an error badge on a waterfall row is clicked. Receives the trace/span context needed to navigate to or open the error. */
  onErrorClick?: OnErrorClick;
  scrollElement?: Element;
  /** Builds the href for the "related errors" link on a waterfall row error badge. Receives the span/transaction doc ID and returns a URL string. */
  getRelatedErrorsHref?: IWaterfallGetRelatedErrorsHref;
  getServiceBadgeHref?: WaterfallGetServiceBadgeHref;
  /** Builds the href for the error message link in the timeline error marker popover.
   * Receives the service name and error grouping key and returns a URL to the error group detail page.
   * When provided, the error message in the popover renders as a real anchor link; otherwise falls back to the onErrorClick callback or plain text. */
  getErrorMarkerHref?: WaterfallGetErrorMarkerHref;
  isEmbeddable?: boolean;
  showLegend?: boolean;
  serviceName?: string;
  isFiltered?: boolean;
  agentMarks?: Record<string, number>;
  showCriticalPathControl?: boolean;
  showCriticalPath?: boolean;
  defaultShowCriticalPath?: boolean;
  onShowCriticalPathChange?: (value: boolean) => void;
  children?: React.ReactNode;
  entryTransactionId?: string;
  traceDocsTotal?: number;
  maxTraceItems?: number;
  discoverHref?: string;
  // TODO: Make required once the legacy waterfall is removed. See https://github.com/elastic/kibana/issues/248693
  ebt?: {
    row: { element: string };
    errorBadge: { element: string };
    serviceBadge: { element: string };
  };
  /**
   * Rendering engine:
   * - `'dom'` (default): existing react-virtualized row list.
   * - `'charts'`: elastic-charts `<Trace>` canvas (experimental spike).
   *
   * Can also be toggled live without a rebuild via:
   *   URL: `?traceWaterfallEngine=charts`
   *   localStorage: `apm.traceWaterfall.engine`
   */
  engine?: WaterfallEngine;
}

/** Default: 'window' (page scroll). Use 'parent' for flyout. */
export type TraceWaterfallProps = BaseTraceWaterfallProps &
  (
    | { scrollStrategy?: 'window'; contextSpanIds?: string[] }
    | { scrollStrategy: 'parent'; contextSpanIds?: string[]; scrollToContextOnMount?: boolean }
  );

export function TraceWaterfall(props: TraceWaterfallProps) {
  const {
    traceItems,
    errors,
    showAccordion = true,
    onClick,
    onErrorClick,
    scrollElement,
    getRelatedErrorsHref,
    getServiceBadgeHref,
    getErrorMarkerHref,
    isEmbeddable = false,
    showLegend = false,
    serviceName,
    isFiltered,
    agentMarks,
    showCriticalPathControl = false,
    showCriticalPath,
    defaultShowCriticalPath,
    onShowCriticalPathChange,
    children,
    entryTransactionId,
    traceDocsTotal = 0,
    maxTraceItems = 0,
    discoverHref,
    ebt,
  } = props;
  const contextSpanIds = props.contextSpanIds;
  const scrollToContextOnMount =
    props.scrollStrategy === 'parent' ? props.scrollToContextOnMount : undefined;
  const exceedMax = traceDocsTotal > maxTraceItems;

  const resolvedEngine = useWaterfallEngine(props.engine);

  return (
    <TraceWaterfallContextProvider
      traceItems={traceItems}
      showAccordion={showAccordion}
      contextSpanIds={contextSpanIds}
      scrollStrategy={props.scrollStrategy ?? 'window'}
      onClick={onClick}
      onErrorClick={onErrorClick}
      scrollElement={scrollElement}
      getRelatedErrorsHref={getRelatedErrorsHref}
      getServiceBadgeHref={getServiceBadgeHref}
      getErrorMarkerHref={getErrorMarkerHref}
      isEmbeddable={isEmbeddable}
      showLegend={showLegend}
      serviceName={serviceName}
      isFiltered={isFiltered}
      errors={errors}
      agentMarks={agentMarks}
      showCriticalPathControl={showCriticalPathControl}
      showCriticalPath={showCriticalPath}
      defaultShowCriticalPath={defaultShowCriticalPath}
      onShowCriticalPathChange={onShowCriticalPathChange}
      entryTransactionId={entryTransactionId}
      scrollToContextOnMount={scrollToContextOnMount}
      ebt={ebt}
    >
      {exceedMax && (
        <>
          <WaterfallSizeWarning
            traceDocsTotal={traceDocsTotal}
            maxTraceItems={maxTraceItems}
            discoverHref={discoverHref}
          />
          <EuiSpacer size="m" />
        </>
      )}
      <TraceWarning>
        {resolvedEngine === 'charts' ? (
          <Suspense fallback={null}>
            <ChartsTraceWaterfall />
          </Suspense>
        ) : (
          <TraceWaterfallComponent />
        )}
      </TraceWarning>
      {children}
    </TraceWaterfallContextProvider>
  );
}

function TraceWaterfallComponent() {
  const { euiTheme } = useEuiTheme();
  const {
    duration,
    margin: { left, right },
    isEmbeddable,
    legends,
    colorBy,
    showLegend,
    serviceName,
    showAccordion,
    isAccordionOpen,
    toggleAllAccordions,
    marks,
    showCriticalPath,
    setShowCriticalPath,
    showCriticalPathControl,
    contextSpanIds,
    scrollStrategy,
  } = useTraceWaterfallContext();

  const [isContextSpanVisible, setIsContextSpanVisible] = useState(true);
  const scrollToOriginRef = useRef<() => void>(() => {});

  const showScrollToOrigin = scrollStrategy === 'parent' && (contextSpanIds?.length ?? 0) > 0;
  const showToolbar = showCriticalPathControl || showScrollToOrigin;

  const stickyTop = isEmbeddable
    ? '0px'
    : 'var(--kbnAppHeadersOffset, var(--euiFixedHeadersOffset, 0))';

  return (
    <EuiFlexGroup
      direction="column"
      gutterSize="none"
      css={css`
        flex: 1;
        min-height: 0;
      `}
    >
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
                <ScrollToOriginButton
                  isDisabled={isContextSpanVisible}
                  onClick={() => scrollToOriginRef.current()}
                />
              </EuiFlexItem>
            )}
          </EuiFlexGroup>
        </EuiFlexItem>
      )}
      <EuiFlexItem
        css={css`
          min-height: 0;
        `}
      >
        <div
          css={css`
            display: flex;
            flex-direction: column;
            height: 100%;
          `}
        >
          <EuiFlexGroup
            direction="column"
            gutterSize="m"
            css={css`
              flex: none;
              position: sticky;
              top: ${stickyTop};
              z-index: ${euiTheme.levels.menu};
              background-color: ${euiTheme.colors.emptyShade};
              border-bottom: ${euiTheme.border.thin};
            `}
          >
            {showLegend && (
              <EuiFlexItem
                grow={false}
                css={css`
                  padding-top: ${euiTheme.size.base};
                `}
              >
                <WaterfallLegends serviceName={serviceName} legends={legends} type={colorBy} />
              </EuiFlexItem>
            )}
            <EuiFlexItem grow={false}>
              <EuiFlexGroup
                direction="row"
                gutterSize="none"
                responsive={false}
                css={css`
                  position: relative;
                `}
              >
                {showAccordion && (
                  <EuiFlexItem grow={false}>
                    <WaterfallAccordionButton
                      isOpen={isAccordionOpen}
                      onClick={toggleAllAccordions}
                    />
                  </EuiFlexItem>
                )}
                <EuiFlexItem>
                  <TimelineAxisContainer
                    xMax={duration}
                    margins={{
                      top: 40,
                      left,
                      right,
                      bottom: 0,
                    }}
                    numberOfTicks={3}
                    marks={marks}
                  />
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
          </EuiFlexGroup>
          <div
            css={css`
              flex: 1;
              min-height: 0;
            `}
          >
            <TraceTree
              setIsContextSpanVisible={setIsContextSpanVisible}
              scrollToOriginRef={scrollToOriginRef}
            />
          </div>
        </div>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
}

function TraceTree({
  setIsContextSpanVisible,
  scrollToOriginRef,
}: {
  setIsContextSpanVisible: (visible: boolean) => void;
  scrollToOriginRef: React.MutableRefObject<() => void>;
}) {
  const {
    traceWaterfallMap,
    traceWaterfall,
    accordionStatesMap,
    toggleAccordionState,
    contextSpanIds,
    scrollStrategy = 'window',
    duration,
    margin: { left, right },
    marks,
    scrollToContextOnMount,
  } = useTraceWaterfallContext();

  const listRef = useRef<List>(null);

  const rowHeightCache = useRef(
    new CellMeasurerCache({
      fixedWidth: true,
      defaultHeight: ACCORDION_HEIGHT + BORDER_THICKNESS,
    })
  );

  const visibleList = useMemo(
    () => convertTreeToList(traceWaterfallMap, accordionStatesMap, traceWaterfall[0]),
    [accordionStatesMap, traceWaterfall, traceWaterfallMap]
  );

  const totalContentHeight = useMemo(
    () =>
      visibleList.reduce((sum, _, index) => sum + rowHeightCache.current.rowHeight({ index }), 0),
    [visibleList]
  );

  const [scrollComplete, setScrollComplete] = useState(false);

  const scrollToIndex = useMemo(() => {
    if (!scrollToContextOnMount || scrollStrategy !== 'parent') {
      return undefined;
    }
    const scrollTarget = contextSpanIds?.[0];
    if (scrollComplete || !scrollTarget || visibleList.length === 0) {
      return undefined;
    }
    const index = visibleList.findIndex((item) => item.id === scrollTarget);
    return index >= 0 ? index : undefined;
  }, [scrollToContextOnMount, scrollStrategy, scrollComplete, contextSpanIds, visibleList]);

  const { onScrolled } = useScrollToOrigin({
    contextSpanId: contextSpanIds?.[0],
    visibleList,
    listRef,
    scrollToOriginRef,
    setIsContextSpanVisible,
  });

  const onRowsRendered = useCallback(
    ({ startIndex, stopIndex }: { startIndex: number; stopIndex: number }) => {
      if (
        scrollToIndex !== undefined &&
        startIndex <= scrollToIndex &&
        scrollToIndex <= stopIndex
      ) {
        setScrollComplete(true);
      }
      onScrolled({ startIndex, stopIndex });
    },
    [scrollToIndex, onScrolled]
  );

  const rowRenderer: ListRowRenderer = useCallback(
    ({ index, style, key, parent }) => {
      const item = visibleList[index];
      const children = traceWaterfallMap[item.id] || [];

      return (
        <VirtualRow
          key={key}
          index={index}
          style={style}
          parent={parent}
          rowHeightCache={rowHeightCache.current}
          item={item}
          childrenCount={children.length}
          accordionState={accordionStatesMap[item.id] || 'open'}
          onToggle={toggleAccordionState}
        />
      );
    },
    [visibleList, traceWaterfallMap, accordionStatesMap, toggleAccordionState]
  );

  const listProps = {
    ref: listRef,
    rowCount: visibleList.length,
    deferredMeasurementCache: rowHeightCache.current,
    rowHeight: rowHeightCache.current.rowHeight,
    rowRenderer,
    containerRole: 'rowgroup',
  };

  const verticalLines = (
    <VerticalLinesContainer
      xMax={duration}
      margins={{ top: 0, left, right, bottom: 0 }}
      marks={marks}
      height={totalContentHeight}
    />
  );

  if (scrollStrategy === 'window') {
    return (
      <div
        css={css`
          position: relative;
        `}
      >
        {verticalLines}
        <WindowScroller
          scrollElement={document.getElementById(APP_MAIN_SCROLL_CONTAINER_ID) ?? undefined}
        >
          {({ height, onChildScroll, scrollTop, registerChild }) => (
            <AutoSizer disableHeight>
              {({ width }) => (
                <div data-test-subj="waterfall" ref={registerChild}>
                  <List
                    ref={listRef}
                    autoHeight
                    height={height}
                    onScroll={onChildScroll}
                    scrollTop={scrollTop}
                    width={width}
                    rowCount={visibleList.length}
                    deferredMeasurementCache={rowHeightCache.current}
                    rowHeight={rowHeightCache.current.rowHeight}
                    rowRenderer={rowRenderer}
                    containerRole="rowgroup"
                  />
                </div>
              )}
            </AutoSizer>
          )}
        </WindowScroller>
      </div>
    );
  }

  return (
    <div
      css={css`
        position: relative;
        height: 100%;
      `}
    >
      {verticalLines}
      <AutoSizer>
        {({ width, height }) => (
          <div data-test-subj="waterfall">
            <List
              {...listProps}
              scrollToIndex={scrollToIndex}
              scrollToAlignment="center"
              onRowsRendered={onRowsRendered}
              height={height}
              width={width}
            />
          </div>
        )}
      </AutoSizer>
    </div>
  );
}

interface VirtualRowProps extends Pick<ListRowProps, 'index' | 'style' | 'parent'> {
  rowHeightCache: CellMeasurerCache;
  item: TraceWaterfallItem;
  childrenCount: number;
  accordionState: EuiAccordionProps['forceState'];
  onToggle: (id: string) => void;
}

function VirtualRow({
  index,
  style,
  parent,
  rowHeightCache,
  item,
  childrenCount,
  accordionState,
  onToggle,
}: VirtualRowProps) {
  return (
    <CellMeasurer cache={rowHeightCache} parent={parent} rowIndex={index}>
      <div style={style} role="row">
        <div role="gridcell">
          <TraceItemRow
            key={item.id}
            item={item}
            childrenCount={childrenCount}
            state={accordionState}
            onToggle={onToggle}
          />
        </div>
      </div>
    </CellMeasurer>
  );
}

export function convertTreeToList(
  treeMap: Record<string, TraceWaterfallItem[]>,
  accordionsState: Record<string, EuiAccordionProps['forceState']>,
  root?: TraceWaterfallItem
) {
  if (!root) {
    return [];
  }

  const result: TraceWaterfallItem[] = [];
  const stack: TraceWaterfallItem[] = [root];
  while (stack.length > 0) {
    const current = stack.pop();
    if (current) {
      const children = treeMap[current.id] || [];
      result.push(current);
      const state = accordionsState[current.id] || 'open';
      if (state === 'open') {
        for (let i = children.length - 1; i >= 0; i--) {
          stack.push(children[i]);
        }
      }
    }
  }
  return result;
}
