/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiIconTip,
  EuiText,
  EuiToolTip,
} from '@elastic/eui';
import moment from 'moment';
import type { Moment } from 'moment';
import { i18n } from '@kbn/i18n';
import { useSelector } from 'react-redux';
import {
  getShortTimeStamp,
  parseTimestamp,
} from '../../../../../../../../../common/utils/date_util';
import type { OverviewStatusMetaData } from '../../../../../../../../../common/runtime_types';
import { MonitorTypeEnum } from '../../../../../../../../../common/runtime_types';
import { MONITOR_STATUS_ENUM } from '../../../../../../../../../common/constants/monitor_management';
import { BadgeStatus } from '../../../../../common/components/monitor_status';
import { selectOverviewShowLastRun } from '../../../../../../state';
import { resolveDisplayStatus } from '../../../../../../state/overview_status';
import { useOverviewDisplayOptions } from '../../../../common/use_overview_display_options';
import { getLatestDownSummary } from '../get_latest_down_summary';

export const MonitorStatusCol = ({
  monitor,
  openFlyout,
}: {
  monitor: OverviewStatusMetaData;
  openFlyout: (monitor: OverviewStatusMetaData) => void;
}) => {
  const timestamp = monitor.timestamp ? parseTimestamp(monitor.timestamp) : null;
  // Per-user, per-space display preference set from the overview's display
  // options popover; controls whether the "Checked …" label (and its tooltip)
  // render an absolute timestamp or a relative "5m ago".
  const { options } = useOverviewDisplayOptions();
  const absoluteTimestamps = options.absoluteTimestamps;

  const showLastRun = useSelector(selectOverviewShowLastRun);
  // Keep the monitor in its `stale` bucket; only surface the last-known
  // up/down on the badge when "Show last run" is on, with a stale marker so the
  // row is still identifiable as a monitor that stopped reporting.
  const isStaleLastRun = monitor.overallStatus === MONITOR_STATUS_ENUM.STALE && showLastRun;
  const displayStatus = resolveDisplayStatus(monitor, showLastRun);

  // The most recent down-since across this monitor's currently-down locations.
  // The error message itself lives in its own column now; here we only need
  // the duration to render "Down · 4m" beneath the badge.
  const downSummary = useMemo(() => getLatestDownSummary(monitor), [monitor]);

  const isDown = monitor.overallStatus === MONITOR_STATUS_ENUM.DOWN;
  const totalLocations = monitor.locations?.length ?? 0;
  const downCount =
    monitor.locations?.filter((loc) => loc.status === MONITOR_STATUS_ENUM.DOWN).length ?? 0;
  const showRatio = isDown && downCount > 0 && totalLocations > 1;
  const showAuxLine = showRatio || (isDown && Boolean(downSummary.downSince));

  // Three-line layout matches the Name column for visual rhythm:
  //   1. Status badge
  //   2. (down only) "{down}/{total} · Down 4m"
  //   3. "Checked {timestamp}"
  // Per-location dots used to live here but the Locations column already
  // surfaces that info, so we drop them to reduce noise.
  return (
    <EuiFlexGroup direction="column" gutterSize="xs" responsive={false} alignItems="flexStart">
      <EuiFlexItem grow={false}>
        <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false}>
          <EuiFlexItem grow={false}>
            <BadgeStatus
              monitor={monitor}
              status={displayStatus}
              isBrowserType={monitor.type === MonitorTypeEnum.BROWSER}
              onClickBadge={() => openFlyout(monitor)}
            />
          </EuiFlexItem>
          {isStaleLastRun ? (
            <EuiFlexItem grow={false}>
              <EuiIconTip
                type="warning"
                color="warning"
                content={STALE_LAST_RUN_TOOLTIP}
                position="top"
                iconProps={{ 'data-test-subj': 'syntheticsStatusColStaleIcon' }}
              />
            </EuiFlexItem>
          ) : null}
        </EuiFlexGroup>
      </EuiFlexItem>

      {showAuxLine ? (
        <EuiFlexItem grow={false}>
          <EuiFlexGroup gutterSize="xs" alignItems="center" responsive={false} wrap={false}>
            {showRatio ? (
              <EuiFlexItem grow={false}>
                <EuiText size="xs" color="subdued" className="eui-textNoWrap">
                  {i18n.translate('xpack.synthetics.monitorList.statusColumn.locationsRatio', {
                    defaultMessage: '{down}/{total}',
                    values: { down: downCount, total: totalLocations },
                  })}
                </EuiText>
              </EuiFlexItem>
            ) : null}
            {isDown && downSummary.downSince ? (
              <EuiFlexItem grow={false}>
                <EuiToolTip
                  // The duration is always displayed as a relative value
                  // ("for 21 hours") because at-a-glance scanning of "how
                  // long has this been broken?" is more useful than the
                  // exact timestamp. The tooltip surfaces the absolute
                  // "Down since ..." for users who need the precise time.
                  content={i18n.translate(
                    'xpack.synthetics.monitorList.statusColumn.downSinceTooltip',
                    {
                      defaultMessage: 'Down since {timestamp}',
                      values: {
                        timestamp: getShortTimeStamp(parseTimestamp(downSummary.downSince)),
                      },
                    }
                  )}
                >
                  <EuiText
                    size="xs"
                    color="danger"
                    className="eui-textNoWrap"
                    data-test-subj="syntheticsStatusColDownSince"
                  >
                    {i18n.translate('xpack.synthetics.monitorList.statusColumn.downForDuration', {
                      // Reads as a continuation of the Down badge above
                      // ("Down" + "for 21 hours") without repeating the
                      // word.
                      defaultMessage: 'for {duration}',
                      values: {
                        duration: moment(downSummary.downSince).fromNow(true),
                      },
                    })}
                  </EuiText>
                </EuiToolTip>
              </EuiFlexItem>
            ) : null}
          </EuiFlexGroup>
        </EuiFlexItem>
      ) : null}

      <EuiFlexItem grow={false}>
        {timestamp ? (
          <EuiToolTip
            content={
              <>
                <EuiText color="text" size="xs">
                  <strong>
                    {absoluteTimestamps ? getShortTimeStamp(timestamp) : timestamp.fromNow()}
                  </strong>
                </EuiText>
                <EuiHorizontalRule margin="xs" />
                <EuiText color="ghost" size="xs">
                  {absoluteTimestamps ? timestamp.fromNow() : getShortTimeStamp(timestamp)}
                </EuiText>
              </>
            }
          >
            <EuiText tabIndex={0} size="xs" color="subdued" className="eui-textNoWrap">
              {getCheckedLabel(timestamp, absoluteTimestamps)}
            </EuiText>
          </EuiToolTip>
        ) : (
          <EuiText size="xs" color="subdued">
            {'--'}
          </EuiText>
        )}
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};

const STALE_LAST_RUN_TOOLTIP = i18n.translate(
  'xpack.synthetics.monitorList.statusColumn.staleLastRunTooltip',
  {
    defaultMessage:
      'This monitor stopped reporting; showing its last known status, which may be stale.',
  }
);

const getCheckedLabel = (timestamp: Moment, absolute: boolean) => {
  // Absolute mode shows a clean compact stamp ("3:45:23 PM" today,
  // "Jan 15, 2026 3:45:23 PM" otherwise) — the same format used elsewhere
  // in the app so the column stays visually consistent.
  // Relative mode reads more naturally for at-a-glance scanning.
  return i18n.translate('xpack.synthetics.monitorList.statusColumn.checkedTimestamp', {
    defaultMessage: 'Checked {timestamp}',
    values: {
      timestamp: absolute ? getShortTimeStamp(timestamp) : timestamp.fromNow(),
    },
  });
};
