/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo } from 'react';
import {
  Axis,
  Chart,
  LineSeries,
  Position,
  RectAnnotation,
  ScaleType,
  Settings,
  Tooltip,
} from '@elastic/charts';
import type {
  ElementClickListener,
  RectAnnotationDatum,
  Theme,
  XYChartElementEvent,
} from '@elastic/charts';
import { EuiDescriptionList, EuiHealth, EuiPanel, EuiText, useEuiTheme } from '@elastic/eui';
import type { EuiThemeComputed } from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import { ALERT_EPISODE_STATUS, type AlertEpisodeStatus } from '@kbn/alerting-v2-schemas';
import type { AlertTimelineSegment, AlertTimelineSeries } from './types';
import {
  alertTimelineStatusColor,
  alertTimelineStatusLabel,
} from './alert_timeline_status_palette';
import { describeSegmentSpan, formatDuration, formatTimestamp } from './alert_timeline_format';

// Paint order: later entries paint on top.
const STATUS_ORDER: readonly AlertEpisodeStatus[] = [
  ALERT_EPISODE_STATUS.INACTIVE,
  ALERT_EPISODE_STATUS.PENDING,
  ALERT_EPISODE_STATUS.RECOVERING,
  ALERT_EPISODE_STATUS.ACTIVE,
];

const STATUS_PRIORITY: Record<string, number> = Object.fromEntries(
  STATUS_ORDER.map((s, i) => [s, i])
);

const RECT_Y0 = 0.4;
const RECT_Y1 = 0.6;

interface SegmentDetails {
  kind: 'segment';
  episodeId: string;
  status: AlertEpisodeStatus;
  x0Ms: number;
  x1Ms: number;
  trueStartMs: number;
}

interface TransitionDatum {
  x: number;
  y: number;
  episodeId: string;
  status: AlertEpisodeStatus;
  href?: string;
}

const groupBy = <T, K extends string>(items: T[], key: (item: T) => K): Record<K, T[]> => {
  return items.reduce((acc, item) => {
    const k = key(item);
    if (!acc[k]) acc[k] = [];
    acc[k].push(item);
    return acc;
  }, {} as Record<K, T[]>);
};

interface TooltipPanelProps {
  euiTheme: EuiThemeComputed;
  status: AlertEpisodeStatus;
  episodeId: string;
  listItems: Array<{
    title: NonNullable<React.ReactNode>;
    description: NonNullable<React.ReactNode>;
  }>;
}

const TooltipPanel: React.FC<TooltipPanelProps> = ({ euiTheme, status, episodeId, listItems }) => {
  return (
    <EuiPanel
      paddingSize="none"
      hasBorder
      hasShadow={false}
      color="plain"
      style={{ maxWidth: 280 }}
    >
      <EuiText size="xs">
        <div
          css={css`
            display: flex;
            align-items: center;
            padding: ${euiTheme.size.xs} ${euiTheme.size.s};
            border-bottom: 1px solid ${euiTheme.colors.lightShade};
          `}
        >
          <EuiHealth color={alertTimelineStatusColor(euiTheme, status)} textSize="xs">
            <strong>{alertTimelineStatusLabel(status)}</strong>
          </EuiHealth>
        </div>
        <div
          css={css`
            padding: ${euiTheme.size.xs} ${euiTheme.size.s};
          `}
        >
          <EuiDescriptionList
            type="column"
            compressed
            rowGutterSize="s"
            listItems={[
              ...listItems,
              {
                title: i18n.translate('xpack.alertingV2.alertTimeline.tooltip.episodeIdLabel', {
                  defaultMessage: 'Episode ID',
                }),
                description: episodeId,
              },
            ]}
          />
        </div>
      </EuiText>
    </EuiPanel>
  );
};

export interface AlertTimelineRowProps {
  row: AlertTimelineSeries;
  windowStartMs: number;
  windowEndMs: number;
  height: number;
  baseTheme: Theme;
  timeZone?: string;
  onEpisodeClick?: (episodeId: string) => void;
  getEpisodeHref?: (episodeId: string) => string;
}

export const AlertTimelineRow: React.FC<AlertTimelineRowProps> = ({
  row,
  windowStartMs,
  windowEndMs,
  height,
  baseTheme,
  timeZone,
  onEpisodeClick,
  getEpisodeHref,
}) => {
  const { euiTheme } = useEuiTheme();

  const segmentsByStatus = useMemo(
    () => groupBy<AlertTimelineSegment, AlertEpisodeStatus>(row.segments, (s) => s.status),
    [row.segments]
  );

  const sortedTransitions = useMemo(
    () => [...row.transitions].sort((a, b) => a.tsMs - b.tsMs),
    [row.transitions]
  );

  const handleAnnotationClick = useCallback(
    (annotations: { rects: Array<{ datum: RectAnnotationDatum }> }) => {
      const candidates = annotations.rects
        .map((r) => r.datum?.details as SegmentDetails | undefined)
        .filter((d): d is SegmentDetails => d?.kind === 'segment');

      if (candidates.length === 0 || !onEpisodeClick) return;

      candidates.sort((a, b) => {
        const p = (STATUS_PRIORITY[b.status] ?? 0) - (STATUS_PRIORITY[a.status] ?? 0);
        return p !== 0 ? p : b.x0Ms - a.x0Ms;
      });

      onEpisodeClick(candidates[0].episodeId);
    },
    [onEpisodeClick]
  );

  const handleElementClick = useCallback<ElementClickListener>(
    (elements) => {
      if (!onEpisodeClick) return;

      const candidates = elements
        .filter((el): el is XYChartElementEvent => Array.isArray(el))
        .map(([geometry]) => geometry?.datum as TransitionDatum | undefined)
        .filter((d): d is TransitionDatum => d != null && d.episodeId != null);

      if (candidates.length === 0) return;

      candidates.sort((a, b) => {
        const p = (STATUS_PRIORITY[b.status] ?? 0) - (STATUS_PRIORITY[a.status] ?? 0);
        return p !== 0 ? p : b.x - a.x;
      });

      onEpisodeClick(candidates[0].episodeId);
    },
    [onEpisodeClick]
  );

  return (
    <div
      css={css`
        height: ${height}px;
        border-top: 1px solid ${euiTheme.colors.lightestShade};
      `}
      data-test-subj="alertTimelineRow"
    >
      <Chart size={{ height }}>
        <Settings
          showLegend={false}
          baseTheme={baseTheme}
          locale={i18n.getLocale()}
          xDomain={{ min: windowStartMs, max: windowEndMs }}
          onAnnotationClick={onEpisodeClick ? handleAnnotationClick : undefined}
          onElementClick={onEpisodeClick ? handleElementClick : undefined}
          theme={{
            chartMargins: { top: 0, right: 0, bottom: 0, left: 0 },
            chartPaddings: { top: 0, right: 0, bottom: 0, left: 0 },
          }}
        />
        <Tooltip
          header="none"
          body={({ items }) => {
            const datum = items?.[0]?.datum as TransitionDatum | undefined;
            if (!datum?.episodeId) return null;
            return (
              <TooltipPanel
                euiTheme={euiTheme}
                status={datum.status}
                episodeId={datum.episodeId}
                listItems={[
                  {
                    title: i18n.translate(
                      'xpack.alertingV2.alertTimeline.tooltip.transitionedAtLabel',
                      { defaultMessage: 'Transitioned at' }
                    ),
                    description: formatTimestamp(datum.x, timeZone),
                  },
                ]}
              />
            );
          }}
        />
        <Axis id="left" position={Position.Left} hide domain={{ min: 0, max: 1, fit: false }} />
        {STATUS_ORDER.map((status) => {
          const segments = segmentsByStatus[status] ?? [];
          if (segments.length === 0) return null;
          const fill = alertTimelineStatusColor(euiTheme, status);
          return (
            <RectAnnotation
              key={`rect-${status}`}
              id={`alert-timeline-row-${row.groupHash}-rect-${status}`}
              dataValues={segments.map((s) => ({
                coordinates: { x0: s.x0Ms, x1: s.x1Ms, y0: RECT_Y0, y1: RECT_Y1 },
                details: {
                  kind: 'segment',
                  episodeId: s.episodeId,
                  status: s.status,
                  x0Ms: s.x0Ms,
                  x1Ms: s.x1Ms,
                  trueStartMs: s.trueStartMs,
                } as unknown as string,
              }))}
              style={{ fill, strokeWidth: 0, opacity: 1 }}
              customTooltip={({ details }) => {
                const d = details as SegmentDetails | undefined;
                if (!d) return null;
                const { isOngoing } = describeSegmentSpan({
                  x1Ms: d.x1Ms,
                  status: d.status,
                  windowEndMs,
                });
                const listItems = [
                  {
                    title: i18n.translate('xpack.alertingV2.alertTimeline.tooltip.fromLabel', {
                      defaultMessage: 'From',
                    }),
                    description: formatTimestamp(d.trueStartMs, timeZone),
                  },
                  {
                    title: i18n.translate('xpack.alertingV2.alertTimeline.tooltip.toLabel', {
                      defaultMessage: 'To',
                    }),
                    description: isOngoing
                      ? i18n.translate('xpack.alertingV2.alertTimeline.tooltip.ongoing', {
                          defaultMessage: 'Ongoing',
                        })
                      : formatTimestamp(d.x1Ms, timeZone),
                  },
                ];
                // Only show a duration when the episode has ended; an open end
                // would make the span the in-view portion, not the true duration.
                // Measure from the true start, not the clamped render edge.
                if (!isOngoing) {
                  listItems.push({
                    title: i18n.translate('xpack.alertingV2.alertTimeline.tooltip.durationLabel', {
                      defaultMessage: 'Duration',
                    }),
                    description: formatDuration(d.x1Ms - d.trueStartMs),
                  });
                }
                return (
                  <TooltipPanel
                    euiTheme={euiTheme}
                    status={d.status}
                    episodeId={d.episodeId}
                    listItems={listItems}
                  />
                );
              }}
            />
          );
        })}
        <LineSeries
          id={`alert-timeline-row-${row.groupHash}-anchor`}
          xScaleType={ScaleType.Time}
          yScaleType={ScaleType.Linear}
          xAccessor="x"
          yAccessors={['y']}
          data={[
            { x: windowStartMs, y: 0 },
            { x: windowEndMs, y: 1 },
          ]}
          hideInLegend
          filterSeriesInTooltip={() => false}
          lineSeriesStyle={{
            line: { visible: false, opacity: 0 },
            point: { visible: 'never' },
          }}
        />
        {sortedTransitions.length > 0 && (
          <LineSeries
            id={`alert-timeline-row-${row.groupHash}-dots`}
            xScaleType={ScaleType.Time}
            yScaleType={ScaleType.Linear}
            xAccessor="x"
            yAccessors={['y']}
            data={sortedTransitions.map<TransitionDatum>((t) => ({
              x: t.tsMs,
              y: 0.5,
              episodeId: t.episodeId,
              status: t.status,
              href: getEpisodeHref?.(t.episodeId),
            }))}
            hideInLegend
            lineSeriesStyle={{
              line: { visible: false, opacity: 0 },
              point: {
                visible: 'always',
                radius: 3,
                fill: euiTheme.colors.emptyShade,
                strokeWidth: 2,
              },
            }}
            pointStyleAccessor={(datum) => {
              const d = datum.datum as TransitionDatum;
              return { stroke: alertTimelineStatusColor(euiTheme, d.status) };
            }}
          />
        )}
      </Chart>
    </div>
  );
};
