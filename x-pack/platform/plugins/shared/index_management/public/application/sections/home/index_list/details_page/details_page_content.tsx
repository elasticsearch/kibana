/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FunctionComponent } from 'react';
import React, { useCallback, useMemo } from 'react';
import { EuiBadge, EuiSpacer } from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import type { RouteComponentProps } from 'react-router-dom';
import { openWiredConnectionDetails } from '@kbn/cloud/connection_details';
import { ROLLUP_DEPRECATION_BADGE_LABEL, RollupDeprecationTooltip } from '@kbn/rollup';

import { AppHeader, type AppHeaderTab, type AppHeaderBadge } from '@kbn/app-header';
import type { AppMenuConfig } from '@kbn/core-chrome-app-menu-components';
import { useIndexErrors } from '../../../../hooks/use_index_errors';
import { resetIndexUrlParams } from './reset_index_url_params';
import { useLoadIndexDocumentsSample } from '../../../../services/api';
import type { Index } from '../../../../../../common';
import type { IndexDetailsTab, IndexDetailsTabId } from '../../../../../../common/constants';
import { INDEX_OPEN, IndexDetailsSection, Section } from '../../../../../../common/constants';
import { getIndexDetailsLink } from '../../../../services/routing';
import { useAppContext } from '../../../../app_context';
import { useManageIndexMenu } from './use_manage_index_menu';
import { DetailsPageMappings } from './details_page_mappings';
import { DetailsPageSettings } from './details_page_settings';
import { DetailsPageStats } from './details_page_stats';
import { DetailsPageTab } from './details_page_tab';
import { IndexErrorCallout } from './index_error_callout';
import { DetailsPageOverview } from './details_page_overview/details_page_overview';

const defaultTabs: IndexDetailsTab[] = [
  // Overview tab is injected in component to pass live docs sample data.
  {
    id: IndexDetailsSection.Mappings,
    name: i18n.translate('xpack.idxMgmt.indexDetails.mappingsTitle', {
      defaultMessage: 'Mappings',
    }),
    renderTabContent: ({ index }) => <DetailsPageMappings index={index} />,
    order: 20,
  },
  {
    id: IndexDetailsSection.Settings,
    name: i18n.translate('xpack.idxMgmt.indexDetails.settingsTitle', {
      defaultMessage: 'Settings',
    }),
    renderTabContent: ({ index }) => <DetailsPageSettings indexName={index.name} />,
    order: 30,
  },
];

const statsTab: IndexDetailsTab = {
  id: IndexDetailsSection.Stats,
  name: i18n.translate('xpack.idxMgmt.indexDetails.statsTitle', {
    defaultMessage: 'Statistics',
  }),
  renderTabContent: ({ index }) => (
    <DetailsPageStats indexName={index.name} isIndexOpen={index.status === INDEX_OPEN} />
  ),
  order: 40,
};

interface Props {
  index: Index;
  tab: IndexDetailsTabId;
  history: RouteComponentProps['history'];
  search: string;
  fetchIndexDetails: () => Promise<void>;
  navigateToIndicesList: () => void;
}
export const DetailsPageContent: FunctionComponent<Props> = ({
  index,
  tab,
  history,
  search,
  fetchIndexDetails,
  navigateToIndicesList,
}) => {
  const {
    core: {
      application: { capabilities },
    },
    config: { enableIndexStats },
    plugins: { console: consolePlugin, ml },
    services: { extensionsService, notificationService },
    url,
  } = useAppContext();
  const discoverLocator = url?.locators.get('DISCOVER_APP_LOCATOR');
  const hasMLPermissions = capabilities?.ml?.canGetTrainedModels ? true : false;

  const indexErrors = useIndexErrors(index, ml, hasMLPermissions);
  const {
    data: documentsSampleData,
    isLoading: isDocumentsSampleLoading,
    error: documentsSampleError,
    resendRequest: resendDocumentsSampleRequest,
  } = useLoadIndexDocumentsSample(index.name);

  const tabs = useMemo(() => {
    const sortedTabs: IndexDetailsTab[] = [
      {
        id: IndexDetailsSection.Overview,
        name: i18n.translate('xpack.idxMgmt.indexDetails.overviewTitle', {
          defaultMessage: 'Overview',
        }),
        renderTabContent: ({ index: selectedIndex }) => (
          <DetailsPageOverview
            indexDetails={selectedIndex}
            sampleDocuments={documentsSampleData?.results ?? []}
            isDocumentsLoading={isDocumentsSampleLoading}
            documentsError={documentsSampleError}
          />
        ),
        order: 10,
      },
      ...defaultTabs,
    ];
    if (enableIndexStats) {
      sortedTabs.push(statsTab);
    }
    extensionsService.indexDetailsTabs.forEach((dynamicTab) => {
      if (!dynamicTab.shouldRenderTab || dynamicTab.shouldRenderTab({ index })) {
        sortedTabs.push(dynamicTab);
      }
    });

    sortedTabs.sort((tabA, tabB) => {
      return tabA.order - tabB.order;
    });
    return sortedTabs;
  }, [
    documentsSampleData,
    isDocumentsSampleLoading,
    documentsSampleError,
    enableIndexStats,
    extensionsService.indexDetailsTabs,
    index,
  ]);

  const onSectionChange = useCallback(
    (newSection: IndexDetailsTabId) => {
      return history.push(getIndexDetailsLink(index.name, resetIndexUrlParams(search), newSection));
    },
    [history, index.name, search]
  );

  // An internal app link; the global redirectAppLinks wrapper turns the click into SPA navigation.
  // The preserved indices-list params (filter, hidden toggle, …) are carried in the href itself.
  const indicesListHref = useMemo(() => {
    const paramsString = resetIndexUrlParams(search);
    return `/app/management/data/index_management/${Section.Indices}${
      paramsString ? `?${paramsString}` : ''
    }`;
  }, [search]);

  const onIndexRefresh = useCallback(() => {
    return resendDocumentsSampleRequest();
  }, [resendDocumentsSampleRequest]);

  const { manageIndexItems, modalHost } = useManageIndexMenu({
    index,
    reloadIndexDetails: fetchIndexDetails,
    navigateToIndicesList,
    onIndexRefresh,
  });

  const headerTabs = useMemo<AppHeaderTab[]>(
    () =>
      tabs.map((tabConfig) => ({
        id: tabConfig.id,
        label: tabConfig.name as string,
        isSelected: tabConfig.id === tab,
        onClick: () => onSectionChange(tabConfig.id),
        'data-test-subj': `indexDetailsTab-${tabConfig.id}`,
      })),
    [tabs, tab, onSectionChange]
  );

  const badges = useMemo<AppHeaderBadge[]>(() => {
    const result: AppHeaderBadge[] = [];
    extensionsService.badges.forEach((indexBadge) => {
      if (indexBadge.matchIndex(index)) {
        const badge: AppHeaderBadge = {
          label: indexBadge.label,
          color: indexBadge.color as AppHeaderBadge['color'],
        };

        if (indexBadge.label === ROLLUP_DEPRECATION_BADGE_LABEL) {
          badge.renderCustomBadge = ({ badgeText }) => (
            <RollupDeprecationTooltip>
              <EuiBadge color={indexBadge.color}>{badgeText}</EuiBadge>
            </RollupDeprecationTooltip>
          );
        }

        result.push(badge);
      }
    });
    return result;
  }, [extensionsService.badges, index]);

  const appMenu = useMemo<AppMenuConfig>(
    () => ({
      primaryActionItem: discoverLocator
        ? {
            id: 'discoverIndex',
            label: i18n.translate('xpack.idxMgmt.indexDetails.openInDiscoverMenuLabel', {
              defaultMessage: 'Open in Discover',
            }),
            iconType: 'discoverApp' as const,
            run: () => {
              discoverLocator.navigate({ dataViewSpec: { title: index.name } });
            },
            testId: 'discoverButtonLink',
          }
        : undefined,
      items: [
        {
          id: 'connectionDetails',
          order: 1,
          label: i18n.translate('xpack.idxMgmt.indexDetails.connectionDetailsMenuLabel', {
            defaultMessage: 'Connection details',
          }),
          iconType: 'plugs' as const,
          run: () => {
            openWiredConnectionDetails({
              props: { options: { defaultTabId: 'apiKeys' } },
            }).catch((error) => {
              notificationService.showDangerToast(
                error?.body?.message ?? error?.message ?? 'An unexpected error occurred'
              );
            });
          },
          testId: 'openConnectionDetails',
        },
        {
          id: 'manageIndex',
          order: 2,
          label: i18n.translate('xpack.idxMgmt.indexDetails.manageIndexMenuLabel', {
            defaultMessage: 'Manage index',
          }),
          iconType: 'managementApp' as const,
          items: manageIndexItems,
          testId: 'indexActionsContextMenuButton',
        },
      ],
    }),
    [index.name, discoverLocator, notificationService, manageIndexItems]
  );

  return (
    <>
      <AppHeader
        title={index.name}
        back={indicesListHref}
        tabs={headerTabs}
        badges={badges}
        menu={appMenu}
        padding={{ bleed: 'l' }}
      />
      <EuiSpacer size="l" />
      {indexErrors.length > 0 && <IndexErrorCallout errors={indexErrors} />}
      <div
        data-test-subj={`indexDetailsContent`}
        css={css`
          height: 100%;
        `}
      >
        <DetailsPageTab tabs={tabs} tab={tab} index={index} />
      </div>
      {consolePlugin?.EmbeddableConsole ? <consolePlugin.EmbeddableConsole /> : null}
      {modalHost}
    </>
  );
};
