/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  TraceDatum,
  TraceSpanBadge,
  TraceSpanBadgeImage,
  TraceSpanBadgeAccessor,
} from '@elastic/charts';
import { getAgentIcon } from '@kbn/custom-icons';
import { getSyncLabel } from '../../badges/sync_badge';
import type { TraceWaterfallItem } from '../../use_trace_waterfall';
import { isFailureOrError } from '../../utils/is_failure_or_error';
import { asDuration } from '../../../../utils';
import { asInteger } from '../../../../utils/formatters/numeric';

// ---------------------------------------------------------------------------
// SVG icon images for badge rendering.
// Canvas drawImage ignores CSS currentColor so the fill is hardcoded:
//   #69707D — EUI subdued-text gray, readable on hollow/default badge backgrounds
//   #FFFFFF — white, readable on the danger (red) badge background
// ---------------------------------------------------------------------------

const toSvgImage = (svgContent: string): TraceSpanBadgeImage => ({
  src: `data:image/svg+xml,${encodeURIComponent(svgContent)}`,
});

const ICON_CLOCK = toSvgImage(
  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="#69707D"><path d="M8.5 7.5V4h-1v4.5H12v-1H8.5Z"/><path fill-rule="evenodd" d="M15 8A7 7 0 1 1 1 8a7 7 0 0 1 14 0Zm-1 0A6 6 0 1 1 2 8a6 6 0 0 1 12 0Z" clip-rule="evenodd"/></svg>`
);

// White chevron — readable on the filled danger background (#C61E25)
const ICON_CHEVRON_RIGHT_WHITE = toSvgImage(
  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="#FFFFFF"><path fill-rule="evenodd" d="M10.293 8 4.646 2.354l.708-.708L11.707 8l-6.353 6.354-.708-.707L10.293 8Z" clip-rule="evenodd"/></svg>`
);

const ICON_LINK_SLASH = toSvgImage(
  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="#69707D"><path d="m15.354 1.354-14 14-.708-.707 14-14 .707.707ZM7 15H6v-2.5h1V15Zm7.121-5.121A3 3 0 1 1 9.88 14.12l-2.234-2.23.708-.707 2.232 2.232a2 2 0 1 0 2.828-2.828l-2.232-2.232.707-.708L14.12 9.88ZM3 10H1V9h2v1ZM1.879 1.879a3 3 0 0 1 4.242 0L8.39 4.146l-.707.708-2.268-2.268a2 2 0 1 0-2.828 2.828l2.268 2.268-.708.707L1.88 6.12a3 3 0 0 1 0-4.242ZM15 7h-2V6h2v1Zm-5-4H9V1h1v2Z"/></svg>`
);

// ---------------------------------------------------------------------------
// Badge action discriminants — stored in badge.meta so the element-click
// handler in the engine component can dispatch without re-reading item fields.
// ---------------------------------------------------------------------------

export type BadgeAction =
  | { type: 'openServiceOverview'; serviceName: string }
  | {
      type: 'openError';
      traceId: string;
      docId: string;
      errorCount: number;
      errorDocId?: string;
      docIndex?: string;
    }
  | { type: 'openSpanLinks'; spanId: string; flyoutTab: string }
  | { type: 'openSpanDetail'; spanId: string };

const SPAN_LINKS_FLYOUT_TAB = 'span_links';

// ---------------------------------------------------------------------------
// Accessor
// ---------------------------------------------------------------------------

/**
 * Factory for the `TraceSpanBadgeAccessor` used by the elastic-charts `<Trace>` engine.
 *
 * Badge order mirrors `BarDetails` in `trace_item_row.tsx`:
 * service name (with agent icon) → duration → token usage → failure status → error count →
 * orphan → sync → span links → cold start.
 *
 * `datum.meta` is the original `TraceWaterfallItem` placed there by `toTraceData`.
 * Each badge that carries a click action stores a `BadgeAction` in `badge.meta`
 * so the engine component can dispatch it via `onElementClick`.
 *
 * Note: the composite span name prefix ("Nx ") is already embedded in `datum.name`
 * by `toTraceData`, so no separate badge is needed for it here.
 */
export const createWaterfallBadgeAccessor =
  (isDarkMode: boolean): TraceSpanBadgeAccessor =>
  (datum: TraceDatum) => {
    const item = datum.meta as TraceWaterfallItem | undefined;
    if (!item) return [];

    const badges: TraceSpanBadge[] = [];
    const statusIsFailureOrError = isFailureOrError(item.status?.value);

    if (item.result) {
      badges.push({ id: 'result', text: item.result, color: 'hollow' });
    }

    if (item.serviceName) {
      const action: BadgeAction = { type: 'openServiceOverview', serviceName: item.serviceName };
      const agentIconSrc = getAgentIcon(item.agentName, isDarkMode);
      badges.push({
        id: 'service',
        text: item.serviceName,
        color: 'hollow',
        image: { src: agentIconSrc },
        meta: action,
      });
    }

    badges.push({
      id: 'duration',
      text: asDuration(item.duration) ?? '',
      color: 'hollow',
      image: ICON_CLOCK,
    });

    if (item.inputTokens != null) {
      badges.push({
        id: 'input-tokens',
        text: `input.tokens: ${asInteger(item.inputTokens)}`,
        color: 'hollow',
      });
    }
    if (item.outputTokens != null) {
      badges.push({
        id: 'output-tokens',
        text: `output.tokens: ${asInteger(item.outputTokens)}`,
        color: 'hollow',
      });
    }

    if (item.status && statusIsFailureOrError) {
      const statusAction: BadgeAction = { type: 'openSpanDetail', spanId: item.id };
      badges.push({
        id: 'status',
        text: item.status.value,
        color: 'danger',
        meta: statusAction,
      });
    }

    const errorCount = item.errors.length;
    if (errorCount > 0) {
      const action: BadgeAction = {
        type: 'openError',
        traceId: item.traceId,
        docId: item.id,
        errorCount,
        errorDocId: errorCount > 1 ? undefined : item.errors[0]?.errorDocId,
        docIndex: errorCount > 1 ? undefined : item.errors[0]?.errorDocIndex,
      };
      badges.push({
        id: 'errors',
        // #C61E25 = EUI danger90 (filled danger) — text auto-picks white via luminance
        text: errorCount === 1 ? 'View error' : `View ${errorCount} errors`,
        color: '#C61E25',
        image: ICON_CHEVRON_RIGHT_WHITE,
        meta: action,
      });
    }

    if (item.isOrphan) {
      badges.push({ id: 'orphan', text: 'Orphan', color: 'default', image: ICON_LINK_SLASH });
    }

    const syncLabel = getSyncLabel(item.agentName, item.sync);
    if (syncLabel) {
      badges.push({ id: 'sync', text: syncLabel, color: 'hollow' });
    }

    const spanLinksTotal = item.spanLinksCount.incoming + item.spanLinksCount.outgoing;
    if (spanLinksTotal > 0) {
      const action: BadgeAction = {
        type: 'openSpanLinks',
        spanId: item.id,
        flyoutTab: SPAN_LINKS_FLYOUT_TAB,
      };
      badges.push({
        id: 'span-links',
        text: `${spanLinksTotal} ${spanLinksTotal === 1 ? 'span link' : 'span links'}`,
        color: 'hollow',
        meta: action,
      });
    }

    if (item.coldstart) {
      badges.push({ id: 'cold-start', text: 'Cold start', color: 'hollow' });
    }

    return badges;
  };
