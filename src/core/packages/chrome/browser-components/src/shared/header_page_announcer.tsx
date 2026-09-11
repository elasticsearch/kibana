/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { FC } from 'react';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { EuiLiveAnnouncer, EuiSkipLink, keys } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FLYOUT_SELECTOR, MAIN_CONTENT_SELECTORS } from '@kbn/ui-chrome-layout';
import type { ChromeBreadcrumb } from '@kbn/core-chrome-browser';
import { useObservable } from '@kbn/use-observable';
import { useChromeService } from '@kbn/core-chrome-browser-context';
import { useChromeComponentsDeps } from '../context';
import { useCustomBranding } from './chrome_hooks';
import { resolveChromeNextAnnouncement } from './resolve_chrome_next_announcement';

// Classic and Chrome Next both append this brand. Revisit in https://github.com/elastic/kibana/issues/289752
const DEFAULT_BRAND = 'Elastic';
const TITLE_SEPARATOR = ' - ';

const PageAnnouncerView: FC<{
  routeTitle: string;
  shouldHandleTab: boolean;
  onInteraction: () => void;
}> = ({ routeTitle, shouldHandleTab, onInteraction }) => {
  const skipLinkRef = useRef<HTMLAnchorElement | null>(null);
  const onInteractionRef = useRef(onInteraction);
  onInteractionRef.current = onInteraction;

  useEffect(() => {
    const events: Array<keyof WindowEventMap> = ['keydown', 'mousedown'];

    const handleTabFn: EventListener = (e) => {
      if (shouldHandleTab && e instanceof KeyboardEvent && e.key === keys.TAB) {
        const activeElement = document.activeElement;
        const mainContent = document.querySelector(MAIN_CONTENT_SELECTORS.join(','));
        const openFlyout = document.querySelector(FLYOUT_SELECTOR);
        const isWithinMainContent = mainContent && mainContent.contains(activeElement);
        const isWithinFlyout = openFlyout && openFlyout.contains(activeElement);

        if (!isWithinMainContent && !isWithinFlyout) {
          skipLinkRef.current?.focus();
          e.preventDefault?.();
        }
      }
      onInteractionRef.current();
    };

    const removeListeners = () =>
      events.forEach((event) => window.removeEventListener(event, handleTabFn));

    if (shouldHandleTab) {
      events.forEach((event) => window.addEventListener(event, handleTabFn, { once: true }));
    } else {
      removeListeners();
    }
    return removeListeners;
  }, [shouldHandleTab]);

  return (
    <>
      <EuiLiveAnnouncer
        clearAfterMs={false}
        aria-label={i18n.translate('core.ui.pageChangeAnnouncements', {
          defaultMessage: 'Page change announcements',
        })}
      >
        {routeTitle}
      </EuiLiveAnnouncer>

      <EuiSkipLink
        buttonRef={skipLinkRef}
        position="fixed"
        destinationId=""
        fallbackDestination={[FLYOUT_SELECTOR, ...MAIN_CONTENT_SELECTORS]}
        overrideLinkBehavior
        data-test-subj="skipToMainButton"
        role="button"
      >
        {i18n.translate('core.ui.skipToMainButton', {
          defaultMessage: 'Skip to main content',
        })}
      </EuiSkipLink>
    </>
  );
};

export const HeaderPageAnnouncer: FC<{
  breadcrumbs: ChromeBreadcrumb[];
}> = ({ breadcrumbs }) => {
  const [routeTitle, setRouteTitle] = useState('');
  const branding = useCustomBranding()?.pageTitle || DEFAULT_BRAND;
  const [shouldHandleTab, setShouldHandleTab] = useState(false);

  useEffect(() => {
    if (!breadcrumbs.length) {
      setRouteTitle('');
      return;
    }

    const breadcrumbText = [...breadcrumbs]
      .reverse()
      .map((breadcrumb) => {
        if (typeof breadcrumb['aria-label'] === 'string') {
          return breadcrumb['aria-label'];
        }

        if (typeof breadcrumb.text === 'string') {
          return breadcrumb.text;
        }

        return null;
      })
      .filter(Boolean) as string[];

    breadcrumbText.push(branding);

    const joinedBreadcrumbs = breadcrumbText.join(TITLE_SEPARATOR);

    if (routeTitle !== joinedBreadcrumbs) {
      setRouteTitle(joinedBreadcrumbs);
      setShouldHandleTab(true);
    }
  }, [breadcrumbs, branding, routeTitle]);

  return (
    <PageAnnouncerView
      routeTitle={routeTitle}
      shouldHandleTab={shouldHandleTab}
      onInteraction={() => setShouldHandleTab(false)}
    />
  );
};

export const ChromeNextPageAnnouncer: FC = () => {
  const chrome = useChromeService();
  const { application } = useChromeComponentsDeps();

  const inline$ = useMemo(() => chrome.inlineAppHeader.get$(), [chrome]);
  const registered$ = useMemo(() => chrome.appHeader.get$(), [chrome]);
  const navigation$ = useMemo(() => chrome.project.getNavigation$(), [chrome]);

  const inline = useObservable(inline$, undefined);
  const registered = useObservable(registered$, undefined);
  const navigation = useObservable(navigation$, undefined);
  const docTitleParts = useObservable(chrome.componentDeps.docTitleParts$, []);
  const location = useObservable(application.currentLocation$, '');
  const brand = useCustomBranding()?.pageTitle || DEFAULT_BRAND;

  const pageTitle = resolveChromeNextAnnouncement({
    inline,
    registeredTitle: registered?.title,
    docTitleParts,
    activeNodes: navigation?.activeNodes,
  });
  const announcement = pageTitle ? `${pageTitle}${TITLE_SEPARATOR}${brand}` : '';

  const [routeTitle, setRouteTitle] = useState('');
  const [shouldHandleTab, setShouldHandleTab] = useState(false);
  const previousLocationRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    const locationChanged = previousLocationRef.current !== location;
    previousLocationRef.current = location;

    if (locationChanged) {
      setRouteTitle('');
      setShouldHandleTab(true);
    }

    let timeout: ReturnType<typeof setTimeout> | undefined;
    const frame = requestAnimationFrame(() => {
      timeout = setTimeout(() => setRouteTitle(announcement), 0);
    });

    return () => {
      cancelAnimationFrame(frame);
      if (timeout !== undefined) {
        clearTimeout(timeout);
      }
    };
  }, [announcement, location]);

  return (
    <PageAnnouncerView
      routeTitle={routeTitle}
      shouldHandleTab={shouldHandleTab}
      onInteraction={() => setShouldHandleTab(false)}
    />
  );
};
