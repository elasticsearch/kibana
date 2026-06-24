/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useState } from 'react';
import type {
  ElementClickListener,
  HeatmapElementEvent,
  HeatmapStyle,
  RecursivePartial,
} from '@elastic/charts';
import { Chart, Heatmap, Predicate, ScaleType, Settings, Tooltip } from '@elastic/charts';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
  useEuiTheme,
} from '@elastic/eui';
import { i18n as kbnI18n } from '@kbn/i18n';
import { css } from '@emotion/react';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import type { ChartsPluginStart } from '@kbn/charts-plugin/public';
import type { EpisodeEventRow } from '../../queries/episode_events_query';
import { resolveEpisodeEventData } from '../../utils/resolve_episode_event_data';
import {
  EPISODE_SEVERITY_CHART_VALUE,
  getEpisodeSeverityHeatmapColor,
  getEpisodeSeverityLabel,
  getHeatmapDatumFromElementClick,
  isSupportedEpisodeSeverity,
  normalizeEpisodeSeverity,
  shouldSuppressSeverityHeatmapTooltip,
  toEpisodeSeverityChartColorBands,
  type EpisodeSeverity,
  type HeatmapTableDatum,
} from '../severity/severity_utils';
import { SeverityHeatmapDetailPanel } from './severity_heatmap_detail_panel';
import { SeverityHeatmapHoverSummary } from './severity_heatmap_hover_summary';
import * as i18n from './translations';

interface AlertEpisodeSeverityHeatmapServices {
  charts: ChartsPluginStart;
}

/** Short strip: one heatmap row. Timestamps are rendered outside the chart. */
const CHART_HEIGHT = 20;

function formatTimestamp(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'medium' });
}

function compactAxisTime(iso: string): string {
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return iso;
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const SEVERITY_Y = 'Severity';

export interface HeatmapDatum {
  x: number;
  y: string;
  value: number;
  ts: string;
  severity: EpisodeSeverity;
  eventData: Record<string, unknown> | null;
}

export interface AlertEpisodeSeverityHeatmapProps {
  eventRows: EpisodeEventRow[];
}

export const AlertEpisodeSeverityHeatmap = ({ eventRows }: AlertEpisodeSeverityHeatmapProps) => {
  const { euiTheme } = useEuiTheme();
  const { services } = useKibana<AlertEpisodeSeverityHeatmapServices>();
  const baseTheme = services.charts.theme.useChartsBaseTheme();
  const [selectedDatum, setSelectedDatum] = useState<HeatmapDatum | null>(null);

  const data: HeatmapDatum[] = useMemo(() => {
    const rows = eventRows
      .filter((row): row is EpisodeEventRow & { severity: string } =>
        isSupportedEpisodeSeverity(row.severity)
      )
      .map((row, rowIndex) => {
        const { '@timestamp': ts, severity } = row;
        const normalized = normalizeEpisodeSeverity(severity);
        const tsMs = ts ? Date.parse(ts) : Number.NaN;
        return {
          ts,
          tsMs: Number.isFinite(tsMs) ? tsMs : Number.POSITIVE_INFINITY,
          y: SEVERITY_Y,
          value: EPISODE_SEVERITY_CHART_VALUE[normalized],
          severity: normalized,
          eventData: resolveEpisodeEventData(row),
          rowIndex,
        };
      });

    rows.sort((a, b) => {
      if (a.tsMs !== b.tsMs) return a.tsMs - b.tsMs;
      return a.rowIndex - b.rowIndex;
    });

    return rows.map((row, index) => ({
      x: index,
      y: row.y,
      value: row.value,
      ts: row.ts,
      severity: row.severity,
      eventData: row.eventData,
    }));
  }, [eventRows]);

  const firstTimestamp = data[0]?.ts;
  const lastTimestamp = data.length > 1 ? data[data.length - 1]?.ts : undefined;

  const heatmapTheme: RecursivePartial<HeatmapStyle> = useMemo(
    () => ({
      grid: { stroke: { width: 0 } },
      cell: {
        maxWidth: 'fill',
        maxHeight: 14,
        label: { visible: false },
        border: { strokeWidth: 1, stroke: euiTheme.colors.emptyShade },
      },
      yAxisLabel: { visible: false },
      xAxisLabel: { visible: false },
    }),
    [euiTheme]
  );

  const colorBands = useMemo(
    () =>
      toEpisodeSeverityChartColorBands((severity) =>
        getEpisodeSeverityHeatmapColor(euiTheme, severity)
      ),
    [euiTheme]
  );

  const handleElementClick = useCallback<ElementClickListener>(
    (elements) => {
      const datum = getHeatmapDatumFromElementClick(elements as HeatmapElementEvent[], data);
      if (!datum) {
        return;
      }

      setSelectedDatum((current) => (current?.x === datum.x ? null : datum));
    },
    [data]
  );

  return (
    <EuiPanel hasBorder paddingSize="m" data-test-subj="alertingV2EpisodeSeverityHeatmap">
      <EuiTitle size="xxs">
        <h2>{i18n.SEVERITY_HEATMAP_TITLE}</h2>
      </EuiTitle>
      <EuiSpacer size="m" />
      <Chart size={{ height: CHART_HEIGHT }}>
        <Tooltip
          body={({ items: values }) => {
            if (shouldSuppressSeverityHeatmapTooltip(selectedDatum)) {
              return null;
            }

            const tableDatum = values?.[0]?.datum as HeatmapTableDatum | undefined;
            if (tableDatum == null) {
              return null;
            }

            const original = data[tableDatum.originalIndex];
            if (!original) {
              return null;
            }

            return (
              <SeverityHeatmapHoverSummary
                severityLabel={getEpisodeSeverityLabel(original.severity)}
                timestamp={original.ts ? formatTimestamp(original.ts) : undefined}
              />
            );
          }}
        />
        <Settings
          showLegend={false}
          theme={{ heatmap: heatmapTheme }}
          baseTheme={baseTheme}
          locale={kbnI18n.getLocale()}
          onElementClick={handleElementClick}
        />
        <Heatmap
          id="episode-severity-heatmap"
          colorScale={{ type: 'bands', bands: colorBands }}
          data={data}
          xAccessor="x"
          yAccessor="y"
          valueAccessor="value"
          xScale={{ type: ScaleType.Ordinal }}
          xSortPredicate={Predicate.NumAsc}
          xAxisLabelName=""
          yAxisLabelName=""
        />
      </Chart>
      {(firstTimestamp || lastTimestamp) && (
        <EuiFlexGroup
          justifyContent="spaceBetween"
          responsive={false}
          gutterSize="none"
          css={css`
            padding-top: ${euiTheme.size.xs};
          `}
        >
          <EuiFlexItem grow={false}>
            <EuiText size="xs" color="subdued">
              {firstTimestamp ? compactAxisTime(firstTimestamp) : ''}
            </EuiText>
          </EuiFlexItem>
          {lastTimestamp && (
            <EuiFlexItem grow={false}>
              <EuiText size="xs" color="subdued">
                {compactAxisTime(lastTimestamp)}
              </EuiText>
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
      )}
      {selectedDatum && (
        <>
          <EuiSpacer size="s" />
          <SeverityHeatmapDetailPanel
            severityLabel={getEpisodeSeverityLabel(selectedDatum.severity)}
            timestamp={selectedDatum.ts ? formatTimestamp(selectedDatum.ts) : ''}
            eventData={selectedDatum.eventData}
            euiTheme={euiTheme}
            onClose={() => setSelectedDatum(null)}
          />
        </>
      )}
    </EuiPanel>
  );
};
