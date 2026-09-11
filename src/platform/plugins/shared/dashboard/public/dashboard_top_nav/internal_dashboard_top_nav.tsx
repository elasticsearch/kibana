/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import deepEqual from 'fast-deep-equal';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { distinctUntilChanged, map } from 'rxjs';
import UseUnmount from 'react-use/lib/useUnmount';

import type { EuiBreadcrumb, UseEuiTheme } from '@elastic/eui';
import {
  EuiBadge,
  EuiButtonEmpty,
  EuiIcon,
  EuiHorizontalRule,
  EuiLink,
  EuiPopover,
  EuiScreenReaderOnly,
} from '@elastic/eui';
import { css } from '@emotion/react';
import type { MountPoint } from '@kbn/core/public';
import { useMemoCss } from '@kbn/css-utils/public/use_memo_css';
import type { Query } from '@kbn/es-query';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { getManagedContentBadge } from '@kbn/managed-content-badge';
import type { TopNavMenuBadgeProps, TopNavMenuProps } from '@kbn/navigation-plugin/public';
import {
  apiPublishesEsqlUsage,
  combineCompatibleChildrenApis,
  type PublishesEsqlUsage,
  useBatchedPublishingSubjects,
} from '@kbn/presentation-publishing';

import { AppHeader, ChromeAppHeaderRegistration } from '@kbn/app-header';
import type {
  AppHeaderBack,
  AppHeaderBadge,
  AppHeaderExperimentalDashboardAiAction,
  AppHeaderShareAction,
} from '@kbn/app-header';
import { useFavorite } from '@kbn/content-management-favorites-public';
import type { AppMenuConfig } from '@kbn/core-chrome-app-menu-components';
import { useChromeStyle } from '@kbn/core-chrome-browser-hooks';
import { DASHBOARD_APP_ID, LANDING_PAGE_PATH } from '../../common/page_bundle_constants';
import { useDashboardApi } from '../dashboard_api/use_dashboard_api';
import { useDashboardInternalApi } from '../dashboard_api/use_dashboard_internal_api';
import {
  dashboardManagedBadge,
  getDashboardBreadcrumb,
  getDashboardTitle,
  topNavStrings,
} from '../dashboard_app/_dashboard_app_strings';
import { useDashboardMountContext } from '../dashboard_app/hooks/dashboard_mount_context';
import { useDashboardMenuItems } from '../dashboard_app/top_nav/use_dashboard_menu_items';
import { useDashboardShareAction } from '../dashboard_app/top_nav/use_dashboard_share_action';
import type { DashboardEmbedSettings, DashboardRedirect } from '../dashboard_app/types';
import { openSettingsFlyout } from '../dashboard_renderer/settings/open_settings_flyout';
import { getDashboardRecentlyAccessedService } from '../services/dashboard_recently_accessed_service';
import {
  coreServices,
  dataService,
  screenshotModeService,
  serverlessService,
  unifiedSearchService,
} from '../services/kibana_services';
import { getDashboardCapabilities } from '../utils/get_dashboard_capabilities';
import { getFullEditPath } from '../utils/urls';
import { DashboardFavoritesProvider } from './dashboard_favorite_button';
import { LegacyDashboardHeader } from './legacy_dashboard_header';
import { DashboardControlsRenderer } from '../dashboard_controls_renderer';
import { usePrettifyDashboardAction } from '../dashboard_app/prettify/use_prettify_dashboard_action';

export interface InternalDashboardTopNavProps {
  customLeadingBreadCrumbs?: EuiBreadcrumb[];
  embedSettings?: DashboardEmbedSettings;
  forceHideUnifiedSearch?: boolean;
  redirectTo: DashboardRedirect;
  setCustomHeaderActionMenu?: (menuMount: MountPoint<HTMLElement> | undefined) => void;
  showBorderBottom?: boolean;
  showResetChange?: boolean;
}

interface DashboardChromeNextHeaderProps {
  headerMode: 'inline' | 'registered';
  title: string;
  back: AppHeaderBack;
  menu?: AppMenuConfig;
  badges: AppHeaderBadge[];
  dashboardId?: string;
  viewMode: string;
  share?: AppHeaderShareAction;
  experimentalDashboardAiAction?: AppHeaderExperimentalDashboardAiAction;
}

/**
 * Chrome Next header path. Must render inside `DashboardFavoritesProvider`.
 */
const DashboardChromeNextHeader = ({
  headerMode,
  title,
  back,
  menu,
  badges,
  dashboardId,
  viewMode,
  share,
  experimentalDashboardAiAction,
}: DashboardChromeNextHeaderProps) => {
  const favorite = useFavorite({ id: dashboardId });

  if (headerMode === 'inline') {
    if (viewMode === 'print') {
      return null;
    }

    return (
      <AppHeader
        title={title}
        back={back}
        menu={menu}
        badges={badges}
        favorite={favorite}
        share={share}
        experimentalDashboardAiAction={experimentalDashboardAiAction}
        spacing="compact"
      />
    );
  }

  return (
    <ChromeAppHeaderRegistration
      title={title}
      menu={menu}
      badges={badges}
      favorite={favorite}
      share={share}
      experimentalDashboardAiAction={experimentalDashboardAiAction}
      spacing="compact"
    />
  );
};

export function InternalDashboardTopNav({
  customLeadingBreadCrumbs = [],
  embedSettings,
  forceHideUnifiedSearch,
  redirectTo,
  setCustomHeaderActionMenu,
  showBorderBottom = true,
  showResetChange = true,
}: InternalDashboardTopNavProps) {
  const [isChromeVisible, setIsChromeVisible] = useState(false);
  const dashboardTitleRef = useRef<HTMLHeadingElement>(null);

  const chromeStyle = useChromeStyle();
  // Header rendering mode:
  //  - `inline`: next chrome, standalone -> we render `AppHeader`.
  //  - `registered`: next chrome, embedded in a host that owns the layout (e.g. Security) -> register
  //    the content so chrome renders it in the app-header slot.
  //  - `legacy`: classic chrome -> push through the imperative chrome APIs.
  const isEmbedded = Boolean(embedSettings || setCustomHeaderActionMenu);
  const isAppHeaderActive = chromeStyle === 'project';
  const headerMode = !isAppHeaderActive ? 'legacy' : isEmbedded ? 'registered' : 'inline';

  const { onAppLeave } = useDashboardMountContext();

  const dashboardApi = useDashboardApi();
  const dashboardInternalApi = useDashboardInternalApi();

  const [
    allDataViews,
    fullScreenMode,
    hasUnsavedChanges,
    esqlApproximation,
    lastSavedId,
    query,
    title,
    viewMode,
    publishedChildFilters,
    unpublishedChildFilters,
    publishedTimeslice,
    unpublishedTimeslice,
    publishedEsqlVariables,
    unpublishedEsqlVariables,
  ] = useBatchedPublishingSubjects(
    dashboardApi.dataViews$,
    dashboardApi.fullScreenMode$,
    dashboardApi.hasUnsavedChanges$,
    dashboardApi.isApproximate$,
    dashboardApi.savedObjectId$,
    dashboardApi.query$,
    dashboardApi.title$,
    dashboardApi.viewMode$,
    dashboardApi.publishedChildFilters$,
    dashboardApi.unpublishedChildFilters$,
    dashboardApi.publishedTimeslice$,
    dashboardApi.unpublishedTimeslice$,
    dashboardInternalApi.publishedEsqlVariables$,
    dashboardInternalApi.unpublishedEsqlVariables$
  );

  const hasUnpublishedFilters = useMemo(() => {
    return !deepEqual(publishedChildFilters ?? [], unpublishedChildFilters ?? []);
  }, [publishedChildFilters, unpublishedChildFilters]);
  const hasUnpublishedTimeslice = useMemo(() => {
    return !deepEqual(publishedTimeslice, unpublishedTimeslice);
  }, [publishedTimeslice, unpublishedTimeslice]);
  const hasUnpublishedVariables = useMemo(() => {
    return !deepEqual(publishedEsqlVariables, unpublishedEsqlVariables);
  }, [publishedEsqlVariables, unpublishedEsqlVariables]);

  const [hasEsqlPanel, setHasEsqlPanel] = useState(false);
  useEffect(() => {
    const subscription = combineCompatibleChildrenApis<PublishesEsqlUsage, boolean[]>(
      dashboardApi,
      'usesEsql$',
      apiPublishesEsqlUsage,
      []
    )
      .pipe(
        map((usesEsqlValues) => usesEsqlValues.some(Boolean)),
        distinctUntilChanged()
      )
      .subscribe(setHasEsqlPanel);
    return () => subscription.unsubscribe();
  }, [dashboardApi]);

  const [savedQueryId, setSavedQueryId] = useState<string | undefined>();
  const [isPopoverOpen, setIsPopoverOpen] = useState(false);

  const dashboardTitle = useMemo(() => {
    return getDashboardTitle(title, viewMode, !lastSavedId);
  }, [title, viewMode, lastSavedId]);

  const styles = useMemoCss(topNavStyles);

  /**
   * focus on the top header when title or view mode is changed
   */
  useEffect(() => {
    dashboardTitleRef.current?.focus();
  }, [title, viewMode]);

  /*
   * Manage chrome visibility when dashboard is in print mode.
   */
  useEffect(() => {
    if (!embedSettings && viewMode === 'print') coreServices.chrome.setIsVisible(false);
  }, [embedSettings, viewMode]);

  /**
   * populate recently accessed, and set is chrome visible.
   */
  useEffect(() => {
    const subscription = coreServices.chrome
      .getIsVisible$()
      .subscribe((visible) => setIsChromeVisible(visible));

    if (lastSavedId && title) {
      const fullEditPath = getFullEditPath(lastSavedId, viewMode === 'edit');
      coreServices.chrome.recentlyAccessed.add(fullEditPath, title, lastSavedId);
      getDashboardRecentlyAccessedService().add(fullEditPath, title, lastSavedId); // used to sort the listing table
    }
    return () => subscription.unsubscribe();
  }, [lastSavedId, viewMode, title]);

  /**
   * Set breadcrumbs to dashboard title when dashboard's title or view mode changes
   */
  useEffect(() => {
    const dashboardTitleBreadcrumbs = [
      {
        text:
          viewMode === 'edit' ? (
            <>
              {dashboardTitle}
              <EuiButtonEmpty
                onClick={() => openSettingsFlyout(dashboardApi)}
                size="xs"
                aria-label={topNavStrings.settings.description}
                color="text"
                textProps={false}
                css={styles.updateEditButton}
              >
                <EuiIcon size="s" type="pencil" aria-hidden={true} />
              </EuiButtonEmpty>
            </>
          ) : (
            dashboardTitle
          ),
        'aria-label': dashboardTitle,
      },
    ];

    if (serverlessService) {
      // set serverless breadcrumbs if available,
      // set only the dashboardTitleBreadcrumbs because the main breadcrumbs automatically come as part of the navigation config
      serverlessService.setBreadcrumbs(dashboardTitleBreadcrumbs);
    } else {
      /**
       * non-serverless regular breadcrumbs
       * Dashboard embedded in other plugins (e.g. SecuritySolution)
       * will have custom leading breadcrumbs for back to their app.
       **/
      coreServices.chrome.setBreadcrumbs(
        customLeadingBreadCrumbs.concat([
          {
            text: getDashboardBreadcrumb(),
            'data-test-subj': 'dashboardListingBreadcrumb',
            onClick: () => {
              redirectTo({ destination: 'listing' });
            },
          },
          ...dashboardTitleBreadcrumbs,
        ]),
        {
          project: { value: dashboardTitleBreadcrumbs },
        }
      );
    }
  }, [
    redirectTo,
    dashboardTitle,
    dashboardApi,
    viewMode,
    customLeadingBreadCrumbs,
    styles.updateEditButton,
  ]);

  /**
   * Build app leave handler whenever hasUnsavedChanges changes
   */
  useEffect(() => {
    onAppLeave((actions) => {
      return actions.default();
    });
    return () => {
      // reset on app leave handler so leaving from the listing page doesn't trigger a confirmation
      onAppLeave((actions) => actions.default());
    };
  }, [onAppLeave, hasUnsavedChanges, viewMode]);

  // Browser refresh/close with unsaved changes - only native confirmation, no custom message
  useEffect(() => {
    if (viewMode !== 'edit' || !hasUnsavedChanges) return;

    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [hasUnsavedChanges, viewMode]);

  const visibilityProps = useMemo(() => {
    const shouldShowNavBarComponent = (forceShow: boolean): boolean =>
      (forceShow || isChromeVisible) && !fullScreenMode;
    const shouldShowFilterBar = (forceHide: boolean): boolean =>
      !forceHide && (dataService.query.filterManager.getFilters().length > 0 || !fullScreenMode);

    const showTopNavMenu = shouldShowNavBarComponent(Boolean(embedSettings?.forceShowTopNavMenu));
    const showQueryInput = Boolean(forceHideUnifiedSearch)
      ? false
      : shouldShowNavBarComponent(
          Boolean(embedSettings?.forceShowQueryInput || viewMode === 'edit')
        );
    const showDatePicker = Boolean(forceHideUnifiedSearch)
      ? false
      : shouldShowNavBarComponent(Boolean(embedSettings?.forceShowDatePicker));
    const showFilterBar = shouldShowFilterBar(Boolean(embedSettings?.forceHideFilterBar));
    const showSearchBar = showQueryInput || showDatePicker || showFilterBar;
    return {
      showTopNavMenu,
      showSearchBar,
      showFilterBar,
      showQueryInput,
      showDatePicker,
    };
  }, [embedSettings, forceHideUnifiedSearch, fullScreenMode, isChromeVisible, viewMode]);

  // Disable the date picker when the dashboard has data views but none are time-based.
  const showDatePicker = useMemo(() => {
    if (!visibilityProps.showDatePicker) {
      return false;
    }
    const disabled =
      (allDataViews?.length ?? 0) > 0 && !allDataViews?.some((dv) => dv.isTimeBased());
    return { disabled };
  }, [visibilityProps.showDatePicker, allDataViews]);

  const shareAction = useDashboardShareAction({ redirectTo });
  const prettifyAction = usePrettifyDashboardAction(dashboardApi);
  const experimentalDashboardAiAction = useMemo(
    () =>
      viewMode === 'edit' && prettifyAction
        ? {
            onClick: () => {
              void prettifyAction.execute();
            },
          }
        : undefined,
    [viewMode, prettifyAction]
  );

  const { viewModeTopNavConfig, editModeTopNavConfig } = useDashboardMenuItems({
    redirectTo,
    showResetChange,
    shareAction,
  });

  UseUnmount(() => {
    dashboardApi.clearOverlays();
  });

  const badges = useMemo(() => {
    const allBadges: TopNavMenuProps['badges'] = [];

    const { showWriteControls } = getDashboardCapabilities();
    if (showWriteControls && dashboardApi.isManaged) {
      const badgeProps = {
        ...getManagedContentBadge(dashboardManagedBadge.getBadgeAriaLabel()),
        onClick: () => setIsPopoverOpen(!isPopoverOpen),
        onClickAriaLabel: dashboardManagedBadge.getBadgeAriaLabel(),
      } as TopNavMenuBadgeProps;

      allBadges.push({
        renderCustomBadge: ({ badgeText }) => {
          const badgeButton = <EuiBadge {...badgeProps}>{badgeText}</EuiBadge>;
          return (
            <EuiPopover
              button={badgeButton}
              isOpen={isPopoverOpen}
              closePopover={() => setIsPopoverOpen(false)}
              panelStyle={{ maxWidth: 250 }}
              aria-label={dashboardManagedBadge.getBadgeAriaLabel()}
            >
              <FormattedMessage
                id="dashboard.managedContentPopoverButton"
                defaultMessage="Elastic manages this dashboard. {Duplicate} it to make changes."
                values={{
                  Duplicate: (
                    <EuiLink
                      id="dashboardManagedContentPopoverButton"
                      onClick={() => {
                        dashboardApi.runInteractiveSave(redirectTo);
                      }}
                      aria-label={dashboardManagedBadge.getDuplicateButtonAriaLabel()}
                    >
                      <FormattedMessage
                        id="dashboard.managedContentPopoverButtonText"
                        defaultMessage="Duplicate"
                      />
                    </EuiLink>
                  ),
                }}
              />
            </EuiPopover>
          );
        },
        badgeText: badgeProps.badgeText,
      });
    }
    return allBadges;
  }, [isPopoverOpen, dashboardApi, redirectTo]);

  const appHeaderBadges = useMemo<AppHeaderBadge[]>(
    () =>
      (badges ?? []).map((badge) => ({
        label: badge.badgeText,
        renderCustomBadge: badge.renderCustomBadge,
      })),
    [badges]
  );

  const appMenuConfig = useMemo(() => {
    if (!visibilityProps.showTopNavMenu) {
      return undefined;
    }
    return viewMode === 'edit' ? editModeTopNavConfig : viewModeTopNavConfig;
  }, [visibilityProps.showTopNavMenu, viewMode, editModeTopNavConfig, viewModeTopNavConfig]);

  // Chrome Next hides the classic breadcrumbs, so the header carries its own back button that leads to the dashboard listing page.
  const backToListing = useMemo<AppHeaderBack>(
    () => ({
      href: coreServices.application.getUrlForApp(DASHBOARD_APP_ID, {
        path: `#${LANDING_PAGE_PATH}`,
      }),
      label: getDashboardBreadcrumb(),
    }),
    []
  );

  return (
    <div css={styles.container}>
      <EuiScreenReaderOnly>
        <h1
          id="dashboardTitle"
          ref={dashboardTitleRef}
        >{`${getDashboardBreadcrumb()} - ${dashboardTitle}`}</h1>
      </EuiScreenReaderOnly>
      {(headerMode === 'inline' || headerMode === 'registered') && (
        <DashboardFavoritesProvider>
          <DashboardChromeNextHeader
            headerMode={headerMode}
            title={dashboardTitle}
            back={backToListing}
            menu={appMenuConfig}
            badges={appHeaderBadges}
            dashboardId={lastSavedId}
            viewMode={viewMode}
            share={shareAction}
            experimentalDashboardAiAction={experimentalDashboardAiAction}
          />
        </DashboardFavoritesProvider>
      )}
      {headerMode === 'legacy' && (
        <LegacyDashboardHeader
          badges={badges}
          config={appMenuConfig}
          lastSavedId={lastSavedId}
          enhanceAction={experimentalDashboardAiAction}
        />
      )}
      {viewMode !== 'print' && visibilityProps.showSearchBar && (
        <unifiedSearchService.ui.SearchBar
          {...visibilityProps}
          isDisabled={viewMode === 'preview'}
          showDatePicker={showDatePicker}
          query={query as Query | undefined}
          screenTitle={title}
          useDefaultBehaviors={true}
          savedQueryId={savedQueryId}
          indexPatterns={allDataViews ?? []}
          allowSavingQueries
          enableDateRangePicker
          appName={DASHBOARD_APP_ID}
          onQuerySubmit={(_payload, isUpdate) => {
            if (isUpdate === false) {
              dashboardApi.forceRefresh();
            }
            if (hasUnpublishedFilters) dashboardApi.publishFilters();
            if (hasUnpublishedTimeslice) dashboardApi.publishTimeslice();
            if (hasUnpublishedVariables) dashboardInternalApi.publishVariables();
          }}
          onSavedQueryIdChange={setSavedQueryId}
          hasDirtyState={
            hasUnpublishedFilters || hasUnpublishedTimeslice || hasUnpublishedVariables
          }
          useBackgroundSearchButton={
            dataService.search.isBackgroundSearchEnabled &&
            getDashboardCapabilities().storeSearchSession
          }
          esqlApproximation={{
            isApproximate: esqlApproximation ?? false,
            onChange: dashboardApi.setEsqlApproximation,
            disabled: !hasEsqlPanel,
            additionalText: i18n.translate('dashboard.esqlApproximationToggle.additionalText', {
              defaultMessage:
                'Fast mode requires at least one ES|QL visualization that uses STATS in the dashboard.',
            }),
          }}
        />
      )}

      <span
        // ControlsRenderer must always be rendered
        // so that control filters are applied to dashboard
        //
        // do not display ControlsRenderer in reports
        style={screenshotModeService.isScreenshotMode() ? { display: 'none' } : undefined}
      >
        <DashboardControlsRenderer />
      </span>

      {showBorderBottom && <EuiHorizontalRule margin="none" />}
    </div>
  );
}

const topNavStyles = {
  container: ({ euiTheme }: UseEuiTheme) =>
    css({
      '.kbnBody &': {
        width: '100%',
        position: 'sticky',
        zIndex: euiTheme.levels.mask,
        top: `var(--kbn-application--sticky-headers-offset, 0px)`,
        background: euiTheme.colors.backgroundBasePlain,

        [`@media (max-width: ${euiTheme.breakpoint.m}px)`]: {
          position: 'unset', // on smaller screens, the top nav should not be sticky
        },
      },
      '.controlGroup': {
        padding: euiTheme.size.s,
        paddingTop: 0,
      },
    }),
  updateEditButton: ({ euiTheme }: UseEuiTheme) =>
    css({
      blockSize: '100%',
      marginLeft: euiTheme.size.xxs,
      padding: 0,
    }),
};
