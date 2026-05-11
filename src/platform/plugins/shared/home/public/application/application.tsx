/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { createRoot } from 'react-dom/client';
import type { ScopedHistory, CoreStart } from '@kbn/core/public';
import { KibanaContextProvider } from '@kbn/kibana-react-plugin/public';
import { SampleDataTabKibanaProvider } from '@kbn/home-sample-data-tab';
import { HomeApp } from './components/home_app';
import { getServices } from './kibana_services';

export const renderApp = async (
  element: HTMLElement,
  coreStart: CoreStart,
  history: ScopedHistory
) => {
  const {
    featureCatalogue,
    chrome,
    dataViewsService: dataViews,
    trackUiMetric,
    sampleDataIngest,
  } = getServices();

  // FIXME: use featureCatalogue.getFeatures$()
  const directories = featureCatalogue.get();

  const root = createRoot(element);

  // Filters solutions by available nav links
  const navLinksSubscription = chrome.navLinks.getNavLinks$().subscribe((navLinks) => {
    const solutions = featureCatalogue
      .getSolutions()
      .filter(({ id }) =>
        navLinks.find(
          ({ visibleIn, category }) => visibleIn.includes('home') && category?.id === id
        )
      );

    root.render(
      coreStart.rendering.addContext(
        <KibanaContextProvider services={{ ...coreStart }}>
          <SampleDataTabKibanaProvider
            {...{ coreStart, dataViews, trackUiMetric, sampleDataIngest }}
          >
            <HomeApp directories={directories} solutions={solutions} />
          </SampleDataTabKibanaProvider>
        </KibanaContextProvider>
      )
    );
  });

  // dispatch synthetic hash change event to update hash history objects
  // this is necessary because hash updates triggered by using popState won't trigger this event naturally.
  // This must be called before the app is mounted to avoid call this after the redirect to default app logic kicks in
  const unlisten = history.listen((_location) => {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });

  return () => {
    root.unmount();
    unlisten();
    navLinksSubscription.unsubscribe();
  };
};
