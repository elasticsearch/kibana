/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo } from 'react';
import type { EuiBasicTableColumn } from '@elastic/eui';
import { EuiFlexGroup, EuiFlexItem, EuiLink, EuiText, EuiToolTip } from '@elastic/eui';
import { useHistory } from 'react-router-dom';
import { TagsList } from '@kbn/observability-shared-plugin/public';
import { useDispatch, useSelector } from 'react-redux';
import { useKibana } from '@kbn/kibana-react-plugin/public';
import { i18n } from '@kbn/i18n';
import { selectOverviewPageState } from '../../../../../../state';
import { MonitorStatusCol } from '../components/monitor_status_col';
import { MonitorLocations } from '../../../../management/monitor_list_table/monitor_locations';
import { MonitorBarSeries } from '../components/monitor_bar_series';
import { useMonitorHistogram } from '../../../../hooks/use_monitor_histogram';
import type { OverviewStatusMetaData } from '../../../../../../../../../common/runtime_types';
import { MonitorTypeBadge } from '../../../../../common/components/monitor_type_badge';
import { SyntheticsRemoteBadge } from '../../../../../common/components/synthetics_remote_badge';
import { SyntheticsHeartbeatBadge } from '../../../../../common/components/synthetics_heartbeat_badge';
import { getFilterForTypeMessage } from '../../../../management/monitor_list_table/labels';
import type { FlyoutParamProps } from '../../types';
import { MonitorsActions } from '../components/monitors_actions';
import { getLatestDownSummary } from '../get_latest_down_summary';
import {
  STATUS,
  ACTIONS,
  LATEST_ERROR,
  LOCATIONS,
  NAME,
  NO_ERROR,
  TAGS,
  MONITOR_HISTORY,
} from '../labels';
import { useKibanaSpace } from '../../../../../../../../hooks/use_kibana_space';
import type { ClientPluginsStart } from '../../../../../../../../plugin';

export const useMonitorsTableColumns = ({
  setFlyoutConfigCallback,
  items,
  isFlyoutOpen,
}: {
  items: OverviewStatusMetaData[];
  setFlyoutConfigCallback: (params: FlyoutParamProps) => void;
  isFlyoutOpen?: boolean;
}) => {
  const history = useHistory();
  // Skip the histogram fetch while the flyout is open — the column it feeds
  // (`MONITOR_HISTORY`) is hidden in that layout, so paying for an ES query +
  // the resulting render work just warms a cache nobody sees right now.
  const { histogramsById, minInterval } = useMonitorHistogram({
    items,
    enabled: !isFlyoutOpen,
  });
  const { space } = useKibanaSpace();
  const spaceId = space?.id;
  const { spaces } = useKibana<ClientPluginsStart>().services;

  const { showFromAllSpaces } = useSelector(selectOverviewPageState);

  // The Spaces column only adds value when monitors actually span more than
  // one space. When the visible page only contains a single unique space, the
  // 120px column degenerates into a wall of identical avatars — so hide it
  // and let the surrounding columns reclaim the room.
  const hasMultipleSpaces = useMemo(() => {
    const seen = new Set<string>();
    for (const item of items) {
      for (const sp of item.spaces ?? []) {
        seen.add(sp);
        if (seen.size > 1) return true;
      }
    }
    return false;
  }, [items]);

  const onClickMonitorFilter = useCallback(
    (filterName: string, filterValue: string) => {
      const searchParams = new URLSearchParams(history.location.search);
      searchParams.set(filterName, JSON.stringify([filterValue]));

      history.push({
        search: searchParams.toString(),
      });
    },
    [history]
  );

  const dispatch = useDispatch();

  const openFlyout = useCallback(
    (monitor: OverviewStatusMetaData) => {
      const { configId } = monitor;

      const locationId = monitor.locations[0]?.id ?? '';
      const locationLabel = monitor.locations[0]?.label ?? '';
      dispatch(
        setFlyoutConfigCallback({
          configId,
          id: configId,
          location: locationLabel,
          locationId,
          spaces: monitor.spaces,
        })
      );
    },
    [dispatch, setFlyoutConfigCallback]
  );

  const columns: Array<EuiBasicTableColumn<OverviewStatusMetaData>> = useMemo(() => {
    const LazySpaceList = spaces?.ui.components.getSpaceList ?? (() => null);

    return [
      {
        field: 'overallStatus',
        name: STATUS,
        width: '160px',
        sortable: true,
        render: (_overallStatus: string, monitor: OverviewStatusMetaData) => (
          <MonitorStatusCol monitor={monitor} openFlyout={openFlyout} />
        ),
      },
      {
        field: 'name',
        name: NAME,
        // Bumped to 25% so the folded URL has room to render readably on
        // common viewport widths before the EUI link truncates with an
        // ellipsis. The URL column it replaced was 15% wide on its own.
        // Reclaimed budget comes from the Tags column (15% → 12%).
        width: '25%',
        sortable: true,
        render: (name: OverviewStatusMetaData['name'], monitor) => (
          <EuiFlexGroup
            direction="column"
            alignItems="flexStart"
            gutterSize="xs"
            css={{ minWidth: 0 }}
          >
            <EuiFlexItem grow={false}>
              <EuiText size="s">{name}</EuiText>
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiFlexGroup gutterSize="xs" responsive={false} alignItems="center" wrap>
                <EuiFlexItem grow={false}>
                  <MonitorTypeBadge
                    monitorType={monitor.type}
                    ariaLabel={getFilterForTypeMessage(monitor.type)}
                    onClick={() => onClickMonitorFilter('monitorTypes', monitor.type)}
                  />
                </EuiFlexItem>
                {monitor.remote && (
                  <EuiFlexItem grow={false}>
                    <SyntheticsRemoteBadge remote={monitor.remote} />
                  </EuiFlexItem>
                )}
                {monitor.origin === 'heartbeat' && (
                  <EuiFlexItem grow={false}>
                    <SyntheticsHeartbeatBadge origin={monitor.origin} />
                  </EuiFlexItem>
                )}
                <EuiFlexItem grow={false}>
                  <EuiText size="xs" color="subdued" css={{ whiteSpace: 'nowrap' }}>
                    {i18n.translate('xpack.synthetics.overview.compactView.scheduleInline', {
                      defaultMessage: 'Every {schedule}m',
                      values: { schedule: monitor.schedule },
                    })}
                  </EuiText>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiFlexItem>
            {monitor.urls ? (
              // `alignSelf: stretch` overrides the outer flex group's
              // `alignItems="flexStart"` for just this row, so the URL flex
              // item spans the cell width — without that, the inner EuiText
              // shrink-wraps the URL and the truncation rules never fire.
              // `minWidth: 0` lets the flex algorithm shrink below the link's
              // intrinsic width so `text-overflow: ellipsis` can take over.
              <EuiFlexItem
                grow={false}
                css={{ alignSelf: 'stretch', maxWidth: '100%', minWidth: 0 }}
              >
                <EuiToolTip position="top" content={monitor.urls}>
                  <EuiText
                    size="xs"
                    color="subdued"
                    className="eui-textTruncate"
                    css={{ display: 'block', width: '100%' }}
                  >
                    <EuiLink
                      data-test-subj="syntheticsCompactViewUrl"
                      href={monitor.urls}
                      target="_blank"
                      color="subdued"
                      external={false}
                      // `display: block` + `width: 100%` ensure the anchor
                      // (inline by default) inherits the truncation box from
                      // its EuiText parent rather than overflowing it.
                      css={{
                        display: 'block',
                        width: '100%',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {monitor.urls}
                    </EuiLink>
                  </EuiText>
                </EuiToolTip>
              </EuiFlexItem>
            ) : null}
          </EuiFlexGroup>
        ),
      },
      {
        name: LOCATIONS,
        width: '120px',
        render: (monitor: OverviewStatusMetaData) => {
          return (
            <MonitorLocations configId={monitor.configId} locationsWithStatus={monitor.locations} />
          );
        },
      },
      ...(isFlyoutOpen
        ? []
        : [
            {
              name: LATEST_ERROR,
              // Wide enough that most error reasons fit in 1–2 lines without
              // wrap; longer messages clamp to 3 lines + tooltip below.
              width: '20%',
              render: (monitor: OverviewStatusMetaData) => {
                const { errorMessage, locationLabel } = getLatestDownSummary(monitor);
                if (!errorMessage) {
                  return (
                    <EuiText size="xs" color="subdued">
                      {NO_ERROR}
                    </EuiText>
                  );
                }
                return (
                  <EuiToolTip
                    position="top"
                    display="block"
                    content={
                      locationLabel ? (
                        <EuiText size="xs">
                          <strong>{locationLabel}</strong>
                          <br />
                          {errorMessage}
                        </EuiText>
                      ) : (
                        errorMessage
                      )
                    }
                  >
                    <EuiText
                      size="xs"
                      color="danger"
                      data-test-subj="syntheticsLatestErrorCell"
                      css={{
                        display: '-webkit-box',
                        WebkitLineClamp: 3,
                        WebkitBoxOrient: 'vertical',
                        overflow: 'hidden',
                        wordBreak: 'break-word',
                        whiteSpace: 'normal',
                      }}
                    >
                      {errorMessage}
                    </EuiText>
                  </EuiToolTip>
                );
              },
            },
            {
              name: TAGS,
              width: '12%',
              render: (monitor: OverviewStatusMetaData) => (
                <TagsList
                  tags={monitor.tags}
                  onClick={(tag) => onClickMonitorFilter('tags', tag)}
                />
              ),
            },
          ]),
      ...(isFlyoutOpen
        ? []
        : [
            {
              align: 'left' as const,
              field: 'configId' as const,
              name: MONITOR_HISTORY,
              mobileOptions: {
                show: false,
              },
              width: '180px',
              render: (configId: string, monitor: OverviewStatusMetaData) => {
                const locationId = monitor.locations[0]?.id ?? '';
                const uniqId = `${configId}-${locationId}`;
                return (
                  <MonitorBarSeries
                    histogramSeries={
                      histogramsById?.[uniqId]?.points ?? histogramsById[configId]?.points
                    }
                    minInterval={minInterval!}
                  />
                );
              },
            },
          ]),
      ...(showFromAllSpaces && hasMultipleSpaces
        ? [
            {
              name: i18n.translate('xpack.synthetics.management.monitorList.spacesColumnTitle', {
                defaultMessage: 'Spaces',
              }),
              field: 'spaces',
              width: '120px',
              render: (monSpaces: string[]) => {
                return (
                  <LazySpaceList
                    namespaces={monSpaces ?? (spaceId ? [spaceId] : [])}
                    behaviorContext="outside-space"
                  />
                );
              },
            },
          ]
        : []),
      {
        name: ACTIONS,
        render: (monitor: OverviewStatusMetaData) => <MonitorsActions monitor={monitor} />,
        align: 'right',
        width: '40px',
      },
    ];
  }, [
    hasMultipleSpaces,
    histogramsById,
    isFlyoutOpen,
    minInterval,
    onClickMonitorFilter,
    openFlyout,
    showFromAllSpaces,
    // Depending on the resolved space id (a string) instead of the whole
    // `space` object keeps the columns array referentially stable: the hook
    // returns a new object each render until the active space resolves, so
    // depending on the object would remount every cell once on resolution.
    spaceId,
    spaces?.ui.components.getSpaceList,
  ]);

  return {
    columns,
  };
};
