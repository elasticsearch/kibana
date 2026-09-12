/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Use of this file is governed by the
 * Elastic License 2.0.
 */

import React, { useEffect, useMemo, useRef } from 'react';
import { css } from '@emotion/react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiPanel,
  EuiSpacer,
  EuiText,
  useEuiTheme,
} from '@elastic/eui';
import type { Worker } from '@kbn/alertzero-common';
import * as i18n from '../settings_translations';
import * as watchesI18n from '../translations';
import { workerName } from '../workers/translations';
import { formatRelativeTime } from './format_relative_time';

/** DOM id for the scroll-to target of a Worker section in the settings column. */
export const workerSectionDomId = (workerId: string): string => `worker-section-${workerId}`;

interface WorkerStatus {
  label: string;
  /** EUI color token for the status dot; `subdued` maps to `textSubdued` for backgrounds. */
  dotColor: 'success' | 'warning' | 'danger' | 'textSubdued';
}

const resolveStatus = (worker: Worker): WorkerStatus => {
  if (!worker.enabled) {
    return { label: i18n.RAIL_STATUS_DISABLED, dotColor: 'textSubdued' };
  }
  switch (worker.state) {
    case 'paused':
      return { label: i18n.RAIL_STATUS_PAUSED, dotColor: 'warning' };
    case 'unavailable':
      return { label: i18n.RAIL_STATUS_UNAVAILABLE, dotColor: 'danger' };
    case 'degraded':
      return { label: i18n.RAIL_STATUS_DEGRADED, dotColor: 'warning' };
    default:
      return { label: i18n.RAIL_STATUS_ENABLED, dotColor: 'success' };
  }
};

/** Label column width for the per-Worker data rows, kept wide enough for the longest label. */
const DATA_LABEL_COL_PX = 72;

function DataLine({ label, value }: { label: string; value: string }) {
  const { euiTheme } = useEuiTheme();

  const styles = useMemo(
    () => ({
      row: css`
        display: grid;
        grid-template-columns: ${DATA_LABEL_COL_PX}px minmax(0, 1fr);
        gap: ${euiTheme.size.s};
        align-items: baseline;
        padding-block: 5px;
      `,
      label: css`
        font-size: 10.5px;
        font-weight: 600;
        line-height: 1.3;
        color: ${euiTheme.colors.textSubdued};
        text-transform: uppercase;
        letter-spacing: 0.04em;
        white-space: nowrap;
      `,
      value: css`
        font-size: 12.5px;
        font-weight: 400;
        line-height: 1.3;
        color: ${euiTheme.colors.textParagraph};
        text-align: left;
        font-variant-numeric: tabular-nums;
      `,
    }),
    [euiTheme]
  );

  return (
    <div css={styles.row}>
      <span css={styles.label}>{label}</span>
      <span css={styles.value}>{value}</span>
    </div>
  );
}

interface WatchWorkersSummaryRailProps {
  workers: Worker[];
  activeWorkerId: string | null;
}

/**
 * Right-hand column of the two-column Worker layout. One compact card per Worker; clicking a card
 * expands and scrolls to that Worker's settings panel. The active card tracks scroll position.
 * Memoized: the active-card highlight changes on scroll, which must not re-render Worker panels.
 */
export const WatchWorkersSummaryRail = React.memo(function WatchWorkersSummaryRail({
  workers,
  activeWorkerId,
}: WatchWorkersSummaryRailProps) {
  const { euiTheme } = useEuiTheme();

  const styles = useMemo(
    () => ({
      aside: css`
        position: sticky;
        top: ${euiTheme.size.l};
      `,
      heading: css`
        text-transform: uppercase;
        letter-spacing: 0.04em;
      `,
      statusDot: (dotColor: WorkerStatus['dotColor']) => css`
        width: 8px;
        height: 8px;
        border-radius: 50%;
        background: ${euiTheme.colors[dotColor]};
        flex-shrink: 0;
      `,
      card: (isActive: boolean) => css`
        padding: 14px 16px;
        border-color: ${isActive ? euiTheme.colors.primary : euiTheme.border.color};
      `,
      workerNameStrong: (enabled: boolean) => css`
        color: ${enabled ? undefined : euiTheme.colors.textSubdued};
      `,
    }),
    [euiTheme]
  );

  return (
    <aside css={styles.aside} data-test-subj="alertZeroWatchWorkersRail">
      <EuiText size="xs" color="subdued">
        <strong css={styles.heading}>{i18n.WORKERS_RAIL_HEADING}</strong>
      </EuiText>
      <EuiSpacer size="s" />
      <EuiFlexGroup direction="column" gutterSize="m" responsive={false}>
        {workers.map((worker) => {
          const name = workerName(worker.id, worker.name);
          const status = resolveStatus(worker);
          const isActive = worker.id === activeWorkerId;
          return (
            <EuiFlexItem key={worker.id} grow={false}>
              <EuiPanel
                hasBorder
                hasShadow={false}
                paddingSize="none"
                color="transparent"
                aria-current={isActive ? 'true' : undefined}
                data-test-subj={`alertZeroWatchWorkerSummary-${worker.id}`}
                css={styles.card(isActive)}
              >
                <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false} wrap={false}>
                  <EuiFlexItem grow={false}>
                    <span aria-hidden css={styles.statusDot(status.dotColor)} />
                  </EuiFlexItem>
                  <EuiFlexItem grow>
                    <EuiText size="s">
                      <strong css={styles.workerNameStrong(worker.enabled)}>{name}</strong>
                    </EuiText>
                  </EuiFlexItem>
                  <EuiFlexItem grow={false}>
                    <EuiText size="xs" color="subdued">
                      {status.label}
                    </EuiText>
                  </EuiFlexItem>
                </EuiFlexGroup>
                <EuiSpacer size="s" />
                <EuiHorizontalRule margin="none" />
                <EuiSpacer size="s" />
                <DataLine
                  label={i18n.RAIL_LAST_RUN}
                  value={
                    worker.lastRun != null
                      ? formatRelativeTime(worker.lastRun)
                      : watchesI18n.NOT_RUN_YET
                  }
                />
                <DataLine
                  label={i18n.RAIL_AUTONOMY}
                  value={i18n.autonomyLevelName(worker.settings.autonomy)}
                />
              </EuiPanel>
            </EuiFlexItem>
          );
        })}
      </EuiFlexGroup>
    </aside>
  );
});

/**
 * Tracks which Worker section is most in view and reports it, so the summary rail's active card
 * follows the reader as they scroll. No-op when disabled (single-Worker Watches have no rail
 * navigation to synchronise).
 */
export const useWorkerScrollSpy = (
  workerIds: readonly string[],
  enabled: boolean,
  onActiveChange: (workerId: string) => void
): void => {
  const onActiveRef = useRef(onActiveChange);
  onActiveRef.current = onActiveChange;

  const key = workerIds.join('\u0000');

  useEffect(() => {
    if (!enabled) {
      return;
    }
    const sections = workerIds
      .map((workerId) => document.getElementById(workerSectionDomId(workerId)))
      .filter((element): element is HTMLElement => element != null);
    if (sections.length === 0) {
      return;
    }

    const visible = new Map<string, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const workerId = entry.target.id.slice(workerSectionDomId('').length);
          if (entry.isIntersecting) {
            visible.set(workerId, entry.intersectionRatio);
          } else {
            visible.delete(workerId);
          }
        }
        let bestId = '';
        let bestRatio = -1;
        for (const [workerId, ratio] of visible) {
          if (ratio > bestRatio) {
            bestRatio = ratio;
            bestId = workerId;
          }
        }
        if (bestId) {
          onActiveRef.current(bestId);
        }
      },
      { root: null, threshold: [0, 0.1, 0.25, 0.5, 0.75, 1] }
    );

    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
    // workerIds membership changes are folded into `key` above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);
};
