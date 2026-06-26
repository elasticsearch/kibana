/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { useMemo, useEffect, useState } from 'react';
import { FormattedMessage } from '@kbn/i18n-react';
import { EuiSpacer } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { TimefilterContract } from '@kbn/data-plugin/public';
import { mlTimefilterRefresh$ } from '@kbn/ml-date-picker';
import { useStorage } from '@kbn/ml-local-storage';
import { FIELD_FORMAT_IDS } from '@kbn/field-formats-plugin/common';
import { useUrlState } from '@kbn/ml-url-state';
import type { MlStorageKey, TMlStorageMapped } from '@kbn/ml-common-types/storage';
import { ML_OVERVIEW_PANELS, ML_OVERVIEW_PANELS_EXTENDED } from '@kbn/ml-common-types/storage';
import type { MlSavedObjectType } from '@kbn/ml-common-types/saved_objects';
import { OverviewStatsBar } from '../components/collapsible_panel/collapsible_panel';
import { CollapsiblePanel } from '../components/collapsible_panel';
import { usePermissionCheck } from '../capabilities/check_capabilities';
import { mlNodesAvailable } from '../ml_nodes_check';
import { OverviewContent } from './components/content';
import { NodeAvailableWarning } from '../components/node_available_warning';
import { JobsAwaitingNodeWarning } from '../components/jobs_awaiting_node_warning';
import { SavedObjectsWarning } from '../components/saved_objects_warning';
import { UpgradeWarning } from '../components/upgrade';
import { HelpMenu } from '../components/help_menu';
import { useMlKibana } from '../contexts/kibana';
import { useMlNotifications } from '../contexts/ml/ml_notifications_context';
import { NodesList } from '../memory_usage/nodes_overview';
import { MlAppHeader } from '../components/ml_app_header';
import { getMlNodesCount } from '../ml_nodes_check/check_ml_nodes';
import { MemoryPage } from '../memory_usage/memory_tree_map/memory_page';
import { NotificationsList } from '../notifications/components/notifications_list';
import { useMemoryUsage } from '../memory_usage/use_memory_usage';
import { useFieldFormatter } from '../contexts/kibana';
import { type StatEntry } from '../components/collapsible_panel/collapsible_panel';

export const overviewPanelDefaultState = Object.freeze({
  nodes: true,
  adJobs: true,
  dfaJobs: true,
});
const overviewPanelExtendedDefaultState = Object.freeze({
  memoryUsage: true,
});
const MEMORY_STATS_LABELS = {
  'anomaly-detector': i18n.translate('xpack.ml.overview.memoryUsagePanel.anomalyDetectionLabel', {
    defaultMessage: 'Anomaly detection',
  }),
  'data-frame-analytics': i18n.translate(
    'xpack.ml.overview.memoryUsagePanel.dataFrameAnalyticsLabel',
    {
      defaultMessage: 'Data frame analytics',
    }
  ),
  'trained-model': i18n.translate('xpack.ml.overview.memoryUsagePanel.trainedModelsLabel', {
    defaultMessage: 'Trained models',
  }),
};

enum TAB_IDS {
  OVERVIEW = 'overview',
  NOTIFICATIONS = 'notifications',
}
export type TabIdType = (typeof TAB_IDS)[keyof typeof TAB_IDS];

export const OverviewPage: FC<{ timefilter: TimefilterContract }> = ({ timefilter }) => {
  const [canViewMlNodes, canCreateJob] = usePermissionCheck(['canViewMlNodes', 'canCreateJob']);

  const disableCreateAnomalyDetectionJob = !canCreateJob || !mlNodesAvailable();
  const {
    services: { docLinks },
  } = useMlKibana();
  const helpLink = docLinks.links.ml.guide;
  const {
    data: memoryUsageData,
    error: memoryUsageError,
    loading: memoryUsageLoading,
  } = useMemoryUsage();
  const bytesFormatter = useFieldFormatter(FIELD_FORMAT_IDS.BYTES);
  const { notificationsCounts } = useMlNotifications();
  const errorsAndWarningCount =
    (notificationsCounts?.error ?? 0) + (notificationsCounts?.warning ?? 0);
  const [pageState, setPageState] = useUrlState('_g');

  const selectedTabId = pageState?.tab ?? TAB_IDS.OVERVIEW;
  const setSelectedTabId = (tabId: TabIdType) => {
    setPageState({ tab: tabId });
  };
  const [adLazyJobCount, setAdLazyJobCount] = useState(0);
  const [dfaLazyJobCount, setDfaLazyJobCount] = useState(0);
  const [memoryUsageStats, setMemoryUsageStats] = useState<StatEntry[]>([]);

  const [panelsState, setPanelsState] = useStorage<
    MlStorageKey,
    TMlStorageMapped<typeof ML_OVERVIEW_PANELS>
  >(ML_OVERVIEW_PANELS, overviewPanelDefaultState);

  const [panelsExtendedState, setPanelsExtendedState] = useStorage<
    MlStorageKey,
    TMlStorageMapped<typeof ML_OVERVIEW_PANELS_EXTENDED>
  >(ML_OVERVIEW_PANELS_EXTENDED, overviewPanelExtendedDefaultState);

  useEffect(
    function setUpMemoryUsageStats() {
      if (memoryUsageLoading || memoryUsageError) return;

      const sumSizeByType = memoryUsageData.reduce((acc, current) => {
        const { type, size } = current;
        if (acc[type] === undefined) {
          acc[type] = size;
        } else {
          acc[type] = (acc[type] as number) + size;
        }
        return acc;
      }, {} as Record<MlSavedObjectType, number>);

      const formattedSizes: StatEntry[] = [];

      Object.keys(sumSizeByType).forEach((type) => {
        const size = sumSizeByType[type as MlSavedObjectType];
        formattedSizes.push({
          label: MEMORY_STATS_LABELS[type as MlSavedObjectType],
          value: bytesFormatter(size),
          'data-test-subj': `mlMemoryUsageStatsCount ${type}`,
        });
      });

      setMemoryUsageStats(formattedSizes);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [memoryUsageLoading, memoryUsageError]
  );

  const tabs = useMemo(
    () => [
      {
        id: TAB_IDS.OVERVIEW,
        name: (
          <FormattedMessage id="xpack.ml.overview.overviewTabLabel" defaultMessage="Overview" />
        ),
        content: (
          <>
            <>
              <CollapsiblePanel
                dataTestSubj="mlMemoryUsagePanel"
                isOpen={panelsExtendedState.memoryUsage}
                onToggle={(update) => {
                  setPanelsExtendedState({ ...panelsExtendedState, memoryUsage: update });
                }}
                header={
                  <FormattedMessage
                    id="xpack.ml.overview.memoryUsagePanel.header"
                    defaultMessage="Memory Usage"
                  />
                }
                headerItems={[
                  <OverviewStatsBar
                    inputStats={memoryUsageStats}
                    dataTestSub={'mlOverviewMemoryUsageStatsBar'}
                  />,
                ]}
                ariaLabel={i18n.translate('xpack.ml.overview.memoryUsagePanel.ariaLabel', {
                  defaultMessage: 'Memory usage panel',
                })}
              >
                <MemoryPage />
              </CollapsiblePanel>
              <EuiSpacer size="m" />
            </>
            {canViewMlNodes ? (
              <>
                <CollapsiblePanel
                  dataTestSubj="mlNodesPanel"
                  isOpen={panelsState.nodes}
                  onToggle={(update) => {
                    setPanelsState({ ...panelsState, nodes: update });
                  }}
                  header={
                    <FormattedMessage
                      id="xpack.ml.overview.nodesPanel.header"
                      defaultMessage="Nodes"
                    />
                  }
                  headerItems={[
                    <OverviewStatsBar
                      inputStats={[
                        {
                          label: i18n.translate('xpack.ml.overview.nodesPanel.totalNodesLabel', {
                            defaultMessage: 'Total',
                          }),
                          value: getMlNodesCount(),
                          'data-test-subj': 'mlTotalNodesCount',
                        },
                      ]}
                      dataTestSub={'mlOverviewAnalyticsStatsBar'}
                    />,
                  ]}
                  ariaLabel={i18n.translate('xpack.ml.overview.nodesPanel.ariaLabel', {
                    defaultMessage: 'Nodes panel',
                  })}
                >
                  <NodesList />
                </CollapsiblePanel>
                <EuiSpacer size="m" />
              </>
            ) : null}

            <OverviewContent
              createAnomalyDetectionJobDisabled={disableCreateAnomalyDetectionJob}
              setAdLazyJobCount={setAdLazyJobCount}
              setDfaLazyJobCount={setDfaLazyJobCount}
            />
          </>
        ),
      },
      {
        id: TAB_IDS.NOTIFICATIONS,
        name: (
          <FormattedMessage
            id="xpack.ml.overview.notificationsTabLabel"
            defaultMessage="Notifications"
          />
        ),
        append: errorsAndWarningCount ? true : undefined,
        content: <NotificationsList />,
      },
    ],
    [
      canViewMlNodes,
      disableCreateAnomalyDetectionJob,
      errorsAndWarningCount,
      memoryUsageStats,
      panelsState,
      panelsExtendedState,
      setPanelsState,
      setPanelsExtendedState,
    ]
  );

  return (
    <div data-test-subj="mlStackManagementOverviewPage">
      <MlAppHeader
        title={i18n.translate('xpack.ml.management.machineLearningOverview.overviewLabel', {
          defaultMessage: 'Machine Learning Overview',
        })}
        showDatePicker
        tabs={tabs.map((tab) => ({
          id: tab.id,
          label:
            tab.id === TAB_IDS.OVERVIEW
              ? i18n.translate('xpack.ml.overview.overviewTabLabel', {
                  defaultMessage: 'Overview',
                })
              : i18n.translate('xpack.ml.overview.notificationsTabLabel', {
                  defaultMessage: 'Notifications',
                }),
          isSelected: tab.id === selectedTabId,
          onClick: () => setSelectedTabId(tab.id),
          badge: tab.append ? errorsAndWarningCount : undefined,
          'data-test-subj': `mlManagementOverviewPageTabs ${tab.id}`,
        }))}
      />
      <NodeAvailableWarning />
      <JobsAwaitingNodeWarning jobCount={adLazyJobCount + dfaLazyJobCount} />
      <SavedObjectsWarning
        onCloseFlyout={() => {
          const { from, to } = timefilter.getTime();
          const timeRange = { start: from, end: to };
          mlTimefilterRefresh$.next({
            lastRefresh: Date.now(),
            timeRange,
          });
        }}
      />
      <UpgradeWarning />
      <EuiSpacer />
      {tabs.find((tab) => tab.id === selectedTabId)?.content}
      <HelpMenu docLink={helpLink} />
    </div>
  );
};

// required for dynamic import using React.lazy()
// eslint-disable-next-line import/no-default-export
export default OverviewPage;
