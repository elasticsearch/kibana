/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useEffect, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom';
import useObservable from 'react-use/lib/useObservable';
import type { RouteComponentProps } from 'react-router-dom';
import { Redirect } from 'react-router-dom';
import { HashRouter as Router, Routes, Route } from '@kbn/shared-ux-router';
import { EuiIconTip, EuiTab, EuiTabs, EuiToolTip, useEuiTheme } from '@elastic/eui';
import { i18n } from '@kbn/i18n';

import type {
  ApplicationStart,
  ChromeStart,
  ScopedHistory,
  ExecutionContextStart,
} from '@kbn/core/public';
import type { RenderingService } from '@kbn/core-rendering-browser';
import { css } from '@emotion/react';
import { AppHeader } from '@kbn/app-header';
import type { AppHeaderBadge, AppHeaderTab } from '@kbn/app-header';
import type { DocTitleService, BreadcrumbService } from './services';

import type { DevToolApp } from './dev_tool';
import type { DevToolsStartServices } from './types';

export interface AppServices {
  docTitleService: DocTitleService;
  breadcrumbService: BreadcrumbService;
  executionContext: ExecutionContextStart;
}

interface DevToolsWrapperProps {
  devTools: readonly DevToolApp[];
  activeDevTool: DevToolApp;
  history: RouteComponentProps['history'];
  appServices: AppServices;
  location: RouteComponentProps['location'];
  startServices: DevToolsStartServices;
  chrome: ChromeStart;
  badges?: AppHeaderBadge[];
}

interface MountedDevToolDescriptor {
  devTool: DevToolApp;
  mountpoint: HTMLElement;
  unmountHandler: () => void;
}

const devAppContainerStyles = css`
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;

  > * {
    flex-shrink: 0;
  }
`;

export const staticStyles = {
  devAppContainer: devAppContainerStyles,

  devApp: devAppContainerStyles,
};

const BETA_BADGE_ICON_TYPE = 'flask';

const getBetaTooltip = () =>
  i18n.translate('devTools.badge.beta.tooltip', {
    defaultMessage: 'Beta',
  });

const useStyles = () => {
  const { euiTheme } = useEuiTheme();

  return {
    ...staticStyles,
    tabs: css`
      padding-left: ${euiTheme.size.s};
    `,
  };
};

function DevToolsWrapper({
  devTools,
  activeDevTool,
  history,
  appServices,
  location,
  startServices,
  chrome,
  badges,
}: DevToolsWrapperProps) {
  const styles = useStyles();
  const { docTitleService, breadcrumbService } = appServices;
  const mountedTool = useRef<MountedDevToolDescriptor | null>(null);
  const chromeStyle = useObservable(chrome.getChromeStyle$(), chrome.getChromeStyle());

  useEffect(
    () => () => {
      if (mountedTool.current) {
        mountedTool.current.unmountHandler();
      }
    },
    []
  );

  useEffect(() => {
    docTitleService.setTitle(activeDevTool.title);
    breadcrumbService.setBreadcrumbs(activeDevTool.title);
  }, [activeDevTool, docTitleService, breadcrumbService]);

  const isReadOnly = Boolean(badges?.length);

  useEffect(() => {
    // In solution view the read only badge is rendered by AppHeader via the `badges` prop.
    // In classic view AppHeader is not rendered, so the badge is set on the chrome header instead.
    if (chromeStyle !== 'classic' || !isReadOnly) {
      return;
    }

    chrome.setBadge({
      text: i18n.translate('devTools.badge.readOnly.text', {
        defaultMessage: 'Read only',
      }),
      tooltip: i18n.translate('devTools.badge.readOnly.tooltip', {
        defaultMessage: 'Unable to save',
      }),
      iconType: 'readOnly',
    });

    return () => {
      chrome.setBadge(undefined);
    };
  }, [chrome, chromeStyle, isReadOnly]);

  const headerTabs = useMemo<AppHeaderTab[]>(
    () =>
      devTools.map((currentDevTool) => ({
        id: currentDevTool.id,
        label: currentDevTool.title,
        isSelected: currentDevTool === activeDevTool,
        disabled: currentDevTool.isDisabled(),
        toolTipContent: currentDevTool.tooltipContent,
        badge: currentDevTool.isBeta
          ? { iconType: BETA_BADGE_ICON_TYPE, tooltip: getBetaTooltip() }
          : undefined,
        onClick: () => {
          if (!currentDevTool.isDisabled()) {
            history.push(`/${currentDevTool.id}`);
          }
        },
      })),
    [devTools, activeDevTool, history]
  );

  return (
    <main css={styles.devApp}>
      {chromeStyle === 'classic' ? (
        <EuiTabs css={styles.tabs}>
          {devTools.map((currentDevTool) => (
            <EuiTab
              key={currentDevTool.id}
              disabled={currentDevTool.isDisabled()}
              isSelected={currentDevTool === activeDevTool}
              onClick={() => {
                if (!currentDevTool.isDisabled()) {
                  history.push(`/${currentDevTool.id}`);
                }
              }}
              append={
                currentDevTool.isBeta ? (
                  <EuiIconTip
                    type={BETA_BADGE_ICON_TYPE}
                    content={getBetaTooltip()}
                    position="bottom"
                  />
                ) : undefined
              }
            >
              <EuiToolTip content={currentDevTool.tooltipContent}>
                <span tabIndex={0}>{currentDevTool.title}</span>
              </EuiToolTip>
            </EuiTab>
          ))}
        </EuiTabs>
      ) : (
        <AppHeader
          title={i18n.translate('devTools.appHeader.devToolsTitle', {
            defaultMessage: 'Dev Tools',
          })}
          tabs={headerTabs}
          badges={badges}
        />
      )}
      <div
        css={staticStyles.devAppContainer}
        role="tabpanel"
        data-test-subj={activeDevTool.id}
        ref={async (element) => {
          if (
            element &&
            (mountedTool.current === null ||
              mountedTool.current.devTool !== activeDevTool ||
              mountedTool.current.mountpoint !== element)
          ) {
            if (mountedTool.current) {
              mountedTool.current.unmountHandler();
            }

            const params = {
              element,
              location,
              history,
              ...startServices,
            };

            const unmountHandler = await activeDevTool.mount(params);

            mountedTool.current = {
              devTool: activeDevTool,
              mountpoint: element,
              unmountHandler,
            };
          }
        }}
      />
    </main>
  );
}

function redirectOnMissingCapabilities(application: ApplicationStart) {
  if (!application.capabilities.dev_tools.show) {
    application.navigateToApp('home');
    return true;
  }
  return false;
}

function getBadges(application: ApplicationStart): AppHeaderBadge[] {
  if (application.capabilities.dev_tools.save) {
    return [];
  }

  return [
    {
      label: i18n.translate('devTools.badge.readOnly.text', {
        defaultMessage: 'Read only',
      }),
      tooltip: i18n.translate('devTools.badge.readOnly.tooltip', {
        defaultMessage: 'Unable to save',
      }),
      'data-test-subj': 'headerBadge',
    },
  ];
}

export function renderApp(
  element: HTMLElement,
  application: ApplicationStart,
  chrome: ChromeStart,
  history: ScopedHistory,
  devTools: readonly DevToolApp[],
  appServices: AppServices,
  startServices: DevToolsStartServices,
  rendering: RenderingService
) {
  if (redirectOnMissingCapabilities(application)) {
    return () => {};
  }

  const badges = getBadges(application);

  ReactDOM.render(
    rendering.addContext(
      <Router>
        <Routes>
          {devTools
            // Only create routes for devtools that are not disabled
            .filter((devTool) => !devTool.isDisabled())
            .map((devTool) => (
              <Route
                key={devTool.id}
                path={`/${devTool.id}`}
                exact={!devTool.enableRouting}
                render={(props) => (
                  <DevToolsWrapper
                    history={props.history}
                    location={props.location}
                    activeDevTool={devTool}
                    devTools={devTools}
                    appServices={appServices}
                    startServices={startServices}
                    chrome={chrome}
                    badges={badges}
                  />
                )}
              />
            ))}
          <Route path="/">
            <Redirect to={`/${devTools[0].id}`} />
          </Route>
        </Routes>
      </Router>
    ),
    element
  );

  // dispatch synthetic hash change event to update hash history objects
  // this is necessary because hash updates triggered by using popState won't trigger this event naturally.
  const unlisten = history.listen(() => {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });

  return () => {
    chrome.docTitle.reset();
    ReactDOM.unmountComponentAtNode(element);
    unlisten();
  };
}
