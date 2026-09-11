/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { EuiButton, EuiCallOut, EuiLoadingElastic, EuiSpacer } from '@elastic/eui';
import type { AppHeaderMenu } from '@kbn/app-header';
import { NIGHTSHIFT_APP_ID } from '@kbn/deeplinks-observability';
import { i18n } from '@kbn/i18n';
import React, { useCallback, useEffect, useMemo } from 'react';
import { useKibana } from '../../hooks/use_kibana';
import { getFormattedError } from '../../util/errors';
import { useSignificantEventsAppParams } from '../../hooks/use_significant_events_app_params';
import { useSignificantEventsAppRouter } from '../../hooks/use_significant_events_app_router';
import { useSignificantEventsAvailability } from '../../hooks/use_significant_events_availability';
import { useBlocksNewActivity } from '../../hooks/use_significant_events_maintenance';
import { RedirectTo } from '../../components/redirect_to';
import { SignificantEventsNotEnabledPrompt } from '../../components/not_enabled_prompt';
import {
  SignificantEventsAppHeader,
  SignificantEventsAppPageTemplate,
} from '../../components/page_template';
import {
  KnowledgeIndicatorsTable,
  KiGenerationProvider,
} from './components/knowledge_indicators_table';
import { SignificantEventsPageProvider } from './context/significant_events_page_context';
import { ONBOARDING_FAILURE_TITLE } from './components/streams_view/translations';
import { QueriesTable } from './components/queries_table/queries_table';
import { StreamsView } from './components/streams_view/streams_view';
import { SettingsTab } from './components/settings/tab';
import { MemoryTab } from './components/memory/tab';
import { CortexTab } from './components/cortex/tab';
import { useCortexEnabled } from './components/cortex/use_cortex';
import { DetectionsTab } from './components/detections_tab';
import { SignificantEventsTab } from './components/significant_events_tab';
import { RunLimitsBanner } from './components/run_limits_banner';

const significantEventsTabs = [
  'streams',
  'knowledge_indicators',
  'queries',
  'detections',
  'significant_events',
  'memory',
  'cortex',
  'settings',
] as const;
type SignificantEventsTabId = (typeof significantEventsTabs)[number];

function isValidSignificantEventsTab(value: string): value is SignificantEventsTabId {
  return significantEventsTabs.includes(value as SignificantEventsTabId);
}

export function SignificantEventsPage() {
  const {
    path: { tab },
  } = useSignificantEventsAppParams('/{tab}');

  const router = useSignificantEventsAppRouter();
  const {
    core: {
      application: {
        getUrlForApp,
        capabilities: { streams },
      },
      chrome,
      notifications: { toasts },
    },
    dependencies: {
      start: { agentBuilder },
    },
  } = useKibana();

  const canManageStreams = streams?.manage === true;

  const { availability, isLoading: isAvailabilityLoading } = useSignificantEventsAvailability();
  const isCortexEnabled = useCortexEnabled();
  const {
    isBlocked,
    isLoading: isMaintenanceStatusLoading,
    isError: isMaintenanceStatusError,
    status: maintenanceStatus,
  } = useBlocksNewActivity();
  const showMaintenanceBanners = tab !== 'settings';

  const onOnboardingFailed = useCallback(
    (error: string) => {
      toasts.addError(getFormattedError(new Error(error)), {
        title: ONBOARDING_FAILURE_TITLE,
      });
    },
    [toasts]
  );

  const pageTitle = i18n.translate('xpack.significantEventsApp.pageHeaderTitle', {
    defaultMessage: 'Nightshift Management',
  });

  const nightshiftLabel = i18n.translate('xpack.significantEventsApp.nightshiftButtonLabel', {
    defaultMessage: 'Nightshift',
  });

  const systemOnboardingLabel = i18n.translate(
    'xpack.significantEventsApp.systemOnboardingButton',
    { defaultMessage: 'Tell us about your system' }
  );

  const handleOpenSystemOnboarding = useCallback(() => {
    agentBuilder?.openChat({
      newConversation: true,
      initialMessage: i18n.translate('xpack.significantEventsApp.onboardingInitialMessage', {
        defaultMessage:
          'Start the significant-events-onboarding skill. First check whether there is already memory about my system. If there is, summarise what you know and ask whether I have something specific to add or correct, or whether I want a general review of the gaps. If memory is empty, go straight into gathering information.',
      }),
      autoSendInitialMessage: true,
    });
  }, [agentBuilder]);

  const menu = useMemo<AppHeaderMenu>(() => {
    const items: NonNullable<AppHeaderMenu['items']> = [
      {
        id: 'nightshift',
        order: 1,
        label: nightshiftLabel,
        iconType: 'moon',
        href: getUrlForApp(NIGHTSHIFT_APP_ID),
      },
    ];

    if (agentBuilder) {
      items.push({
        id: 'significantEventsSystemOnboarding',
        order: 2,
        label: systemOnboardingLabel,
        iconType: 'sparkles',
        run: handleOpenSystemOnboarding,
        testId: 'significantEventsSystemOnboardingButton',
      });
    }

    return { items };
  }, [
    agentBuilder,
    getUrlForApp,
    handleOpenSystemOnboarding,
    nightshiftLabel,
    systemOnboardingLabel,
  ]);

  useEffect(() => {
    chrome.setBreadcrumbs([
      {
        text: i18n.translate('xpack.significantEventsApp.breadcrumb', {
          defaultMessage: 'Nightshift Management',
        }),
      },
    ]);
  }, [chrome]);

  const tabs = useMemo(
    () => [
      {
        id: 'streams',
        label: i18n.translate('xpack.significantEventsApp.streamsTab', {
          defaultMessage: 'Streams',
        }),
        href: router.link('/{tab}', { path: { tab: 'streams' } }),
        isSelected: tab === 'streams',
      },
      {
        id: 'knowledge_indicators',
        label: i18n.translate('xpack.significantEventsApp.knowledgeIndicatorsTab', {
          defaultMessage: 'Knowledge Indicators',
        }),
        href: router.link('/{tab}', { path: { tab: 'knowledge_indicators' } }),
        isSelected: tab === 'knowledge_indicators',
      },
      {
        id: 'queries',
        label: i18n.translate('xpack.significantEventsApp.queriesTab', {
          defaultMessage: 'Rules',
        }),
        href: router.link('/{tab}', { path: { tab: 'queries' } }),
        isSelected: tab === 'queries',
      },

      {
        id: 'detections',
        label: i18n.translate('xpack.significantEventsApp.detectionsTab', {
          defaultMessage: 'Detections',
        }),
        href: router.link('/{tab}', { path: { tab: 'detections' } }),
        isSelected: tab === 'detections',
      },
      {
        id: 'significant_events',
        label: i18n.translate('xpack.significantEventsApp.significantEventsTab', {
          defaultMessage: 'Significant Events',
        }),
        href: router.link('/{tab}', { path: { tab: 'significant_events' } }),
        isSelected: tab === 'significant_events',
      },
      {
        id: 'memory',
        label: i18n.translate('xpack.significantEventsApp.memoryTab', {
          defaultMessage: 'Memory',
        }),
        href: router.link('/{tab}', { path: { tab: 'memory' } }),
        isSelected: tab === 'memory',
      },
      ...(isCortexEnabled
        ? [
            {
              id: 'cortex',
              label: i18n.translate('xpack.significantEventsApp.cortexTab', {
                defaultMessage: 'Cortex',
              }),
              href: router.link('/{tab}', { path: { tab: 'cortex' } }),
              isSelected: tab === 'cortex',
            },
          ]
        : []),
      {
        id: 'settings',
        label: i18n.translate('xpack.significantEventsApp.settingsTab', {
          defaultMessage: 'Settings',
        }),
        href: router.link('/{tab}', { path: { tab: 'settings' } }),
        isSelected: tab === 'settings',
      },
    ],
    [tab, router, isCortexEnabled]
  );

  if (isAvailabilityLoading) {
    return <EuiLoadingElastic size="xxl" />;
  }

  if (!availability || !availability.available) {
    const reason =
      availability && !availability.available ? availability.reason : ('unknown' as const);
    return (
      <SignificantEventsAppPageTemplate.Body grow>
        <SignificantEventsNotEnabledPrompt reason={reason} />
      </SignificantEventsAppPageTemplate.Body>
    );
  }

  // Legacy alias from an earlier tab name; keep until bookmarks are gone.
  if (tab === 'discoveries') {
    return <RedirectTo path="/{tab}" params={{ path: { tab: 'significant_events' } }} />;
  }

  if (!isValidSignificantEventsTab(tab)) {
    return <RedirectTo path="/{tab}" params={{ path: { tab: 'streams' } }} />;
  }

  return (
    <>
      <SignificantEventsAppHeader title={pageTitle} menu={menu} tabs={tabs} />
      <KiGenerationProvider onFailed={onOnboardingFailed}>
        <SignificantEventsPageProvider>
          <SignificantEventsAppPageTemplate.Body grow>
            {showMaintenanceBanners && isMaintenanceStatusLoading && (
              <>
                <EuiCallOut
                  announceOnMount
                  color="primary"
                  iconType="clock"
                  data-test-subj="significantEventsStatusLoadingBanner"
                  title={i18n.translate('xpack.significantEventsApp.statusLoadingBannerTitle', {
                    defaultMessage: 'Checking Significant Events activity status',
                  })}
                >
                  <p>
                    {i18n.translate('xpack.significantEventsApp.statusLoadingBannerBody', {
                      defaultMessage:
                        'Manual triggers stay disabled until activity status is known.',
                    })}
                  </p>
                </EuiCallOut>
                <EuiSpacer />
              </>
            )}
            {showMaintenanceBanners && isMaintenanceStatusError && (
              <>
                <EuiCallOut
                  announceOnMount
                  color="danger"
                  iconType="error"
                  data-test-subj="significantEventsStatusErrorBanner"
                  title={i18n.translate('xpack.significantEventsApp.statusErrorBannerTitle', {
                    defaultMessage: 'Could not load Significant Events activity status',
                  })}
                >
                  <p>
                    {i18n.translate('xpack.significantEventsApp.statusErrorBannerBody', {
                      defaultMessage:
                        'Manual triggers stay disabled until status can be loaded. Open Settings to retry, or refresh the page.',
                    })}
                  </p>
                  {canManageStreams && (
                    <EuiButton
                      href={router.link('/{tab}', { path: { tab: 'settings' } })}
                      color="danger"
                      size="s"
                      data-test-subj="significantEventsStatusErrorBannerSettingsLink"
                    >
                      {i18n.translate(
                        'xpack.significantEventsApp.statusErrorBannerSettingsButton',
                        { defaultMessage: 'Go to Settings' }
                      )}
                    </EuiButton>
                  )}
                </EuiCallOut>
                <EuiSpacer />
              </>
            )}
            {showMaintenanceBanners && isBlocked && (
              <>
                <EuiCallOut
                  announceOnMount
                  color="warning"
                  iconType="pause"
                  data-test-subj="significantEventsPausedBanner"
                  title={i18n.translate('xpack.significantEventsApp.pausedBannerTitle', {
                    defaultMessage: 'Significant Events activity is paused',
                  })}
                >
                  <p>
                    {canManageStreams
                      ? i18n.translate('xpack.significantEventsApp.pausedBannerBody', {
                          defaultMessage:
                            'Significant Events activity is stopped across the deployment: scheduled discovery, continuous onboarding, detections, memory, investigations, and the alerting rules backing knowledge indicator queries. Manual triggers are blocked until you resume from Settings.',
                        })
                      : i18n.translate('xpack.significantEventsApp.pausedBannerBodyReadOnly', {
                          defaultMessage:
                            'Significant Events activity is stopped across the deployment: scheduled discovery, continuous onboarding, detections, memory, investigations, and the alerting rules backing knowledge indicator queries. Manual triggers are blocked. An administrator with the Streams manage privilege must resume activity from Settings.',
                        })}
                  </p>
                  {(maintenanceStatus?.lastSummary?.partialFailures.length ?? 0) > 0 && (
                    <p>
                      {i18n.translate('xpack.significantEventsApp.pausedBannerPartialFailures', {
                        defaultMessage:
                          'Some maintenance operations could not be completed. Check Settings and the Kibana server logs for details.',
                      })}
                    </p>
                  )}
                  {canManageStreams && (
                    <EuiButton
                      href={router.link('/{tab}', { path: { tab: 'settings' } })}
                      color="warning"
                      size="s"
                      data-test-subj="significantEventsPausedBannerSettingsLink"
                    >
                      {i18n.translate('xpack.significantEventsApp.pausedBannerSettingsButton', {
                        defaultMessage: 'Go to Settings',
                      })}
                    </EuiButton>
                  )}
                </EuiCallOut>
                <EuiSpacer />
              </>
            )}
            {showMaintenanceBanners && <RunLimitsBanner />}
            {tab === 'streams' && <StreamsView />}
            {tab === 'knowledge_indicators' && <KnowledgeIndicatorsTable />}
            {tab === 'queries' && <QueriesTable />}
            {tab === 'detections' && <DetectionsTab />}
            {tab === 'significant_events' && <SignificantEventsTab />}
            {tab === 'memory' && <MemoryTab />}
            {tab === 'cortex' && isCortexEnabled && <CortexTab />}
            {tab === 'settings' && <SettingsTab />}
          </SignificantEventsAppPageTemplate.Body>
        </SignificantEventsPageProvider>
      </KiGenerationProvider>
    </>
  );
}
