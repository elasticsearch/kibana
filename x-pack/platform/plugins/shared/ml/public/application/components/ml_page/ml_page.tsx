/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC } from 'react';
import React, { createContext, useEffect, useMemo } from 'react';
import { Redirect, useLocation } from 'react-router-dom';
import { Routes, Route } from '@kbn/shared-ux-router';
import type { EuiPaddingSize } from '@elastic/eui';
import { EuiPageSection } from '@elastic/eui';

import { i18n } from '@kbn/i18n';
import { KibanaPageTemplate } from '@kbn/shared-ux-page-kibana-template';
import { RedirectAppLinks } from '@kbn/shared-ux-link-redirect-app';
import { DEPRECATED_ML_ROUTE_TO_NEW_ROUTE } from '@kbn/ml-common-types/locator_deprecated_routes';
import * as routes from '../../routing/routes';
import * as overviewRoutes from '../../routing/routes/overview_management';
import * as anomalyDetectionRoutes from '../../routing/routes/anomaly_detection_management';
import * as dfaRoutes from '../../routing/routes/data_frame_analytics_management';
import * as settingsRoutes from '../../routing/routes/settings';
import * as trainedModelsRoutes from '../../routing/routes/trained_models';
import { MlPageWrapper } from '../../routing/ml_page_wrapper';
import { useMlKibana, useMlManagementLocator, useNavigateToPath } from '../../contexts/kibana';
import type { NavigateToPath } from '../../contexts/kibana';
import type { MlRoute, PageDependencies } from '../../routing/router';
import { useActiveRoute } from '../../routing/use_active_route';
import { useDocTitle } from '../../routing/use_doc_title';

import { useSideNavItems } from './side_nav';
import { useEnabledFeatures } from '../../contexts/ml';
import { MANAGEMENT_SECTION_IDS } from '../../management';
import type { NavigateToApp } from '../../routing/breadcrumbs';

interface RouteToPath {
  [key: string]: (navigateToPath: NavigateToPath, basePath: string) => MlRoute;
}
interface RouteToApp {
  [key: string]: (navigateToApp: NavigateToApp, basePath: string) => MlRoute;
}
type RouteModules = RouteToPath | RouteToApp;

const ML_APP_SELECTOR = '[data-test-subj="mlApp"]';

export const MlPageControlsContext = createContext<{
  isManagementMode: boolean;
}>({
  isManagementMode: false,
});

/**
 * Main page component of the ML App
 * @constructor
 */
export const MlPage: FC<{ pageDeps: PageDependencies; entryPoint?: string }> = React.memo(
  ({ pageDeps, entryPoint }) => {
    const navigateToPath = useNavigateToPath();
    const { pathname, search } = useLocation();
    const mlManagementLocator = useMlManagementLocator();

    useEffect(
      // Auto-redirect bookmarked jobs list and data frame analytics list
      // to the new management pages, and keep the search string as much
      function autoRedirectToManagementPages() {
        if (mlManagementLocator) {
          const searchString = decodeURIComponent(search);
          let decodedSearch = search;
          const oldPath = pathname.slice(1);
          const newPath =
            DEPRECATED_ML_ROUTE_TO_NEW_ROUTE[
              oldPath as keyof typeof DEPRECATED_ML_ROUTE_TO_NEW_ROUTE
            ];
          if (oldPath && newPath) {
            if (oldPath !== newPath) {
              decodedSearch = searchString.replace(`=(${oldPath}:`, `=('':`);
            }
            mlManagementLocator.navigate({
              sectionId: 'ml',
              appId: `${newPath}${decodedSearch}`,
            });
            return;
          }
        }
      },
      [pathname, navigateToPath, mlManagementLocator, search]
    );

    const {
      services: {
        application: { navigateToApp },
        http: { basePath },
      },
    } = useMlKibana();
    const { showMLNavMenu } = useEnabledFeatures();

    const routeList = useMemo(
      () => {
        let currentRoutes: RouteModules = routes as RouteToPath;

        switch (entryPoint) {
          case MANAGEMENT_SECTION_IDS.OVERVIEW:
            currentRoutes = overviewRoutes as RouteToApp;
            break;
          case MANAGEMENT_SECTION_IDS.ANOMALY_DETECTION:
            currentRoutes = anomalyDetectionRoutes as RouteToApp;
            break;
          case MANAGEMENT_SECTION_IDS.ANALYTICS:
            currentRoutes = dfaRoutes as RouteToApp;
            break;
          case MANAGEMENT_SECTION_IDS.TRAINED_MODELS:
            currentRoutes = trainedModelsRoutes as RouteToApp;
            break;
          case MANAGEMENT_SECTION_IDS.AD_SETTINGS:
            currentRoutes = settingsRoutes as RouteToApp;
            break;
          default:
            break;
        }

        const currentRoutesList = Object.values(currentRoutes);

        if (entryPoint !== undefined) {
          return currentRoutesList
            .map((routeFactory) => routeFactory(navigateToApp))
            .filter((d) => !d.disabled);
        } else {
          return currentRoutesList
            .map((routeFactory) => routeFactory(navigateToPath, basePath.get()))
            .filter((d) => !d.disabled);
        }
      },
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [entryPoint]
    );

    const activeRoute = useActiveRoute(routeList);

    useDocTitle(activeRoute);

    // The deprecated `KibanaPageTemplate` from`'@kbn/kibana-react-plugin/public'`
    // had a `pageBodyProps` prop where we could pass in the `data-test-subj` for
    // the `main` element. This is no longer available in the update template
    // imported from `'@kbn/shared-ux-page-kibana-template'`. The following is a
    // workaround to add the `data-test-subj` on the `main` element again.
    useEffect(() => {
      const mlApp = document.querySelector(ML_APP_SELECTOR) as HTMLElement;
      if (mlApp && typeof activeRoute?.['data-test-subj'] === 'string') {
        const mlAppMain = mlApp.querySelector('main') as HTMLElement;
        if (mlAppMain) {
          mlAppMain.setAttribute('data-test-subj', activeRoute?.['data-test-subj']);
        }
      }
    }, [activeRoute]);

    const sideNavItems = useSideNavItems(activeRoute);
    const isManagementMode = entryPoint !== undefined;

    return (
      <MlPageControlsContext.Provider value={{ isManagementMode }}>
        {entryPoint === undefined ? (
          <KibanaPageTemplate
            className={'ml-app'}
            data-test-subj={'mlApp'}
            restrictWidth={false}
            panelled
            solutionNav={
              showMLNavMenu
                ? {
                    name: i18n.translate('xpack.ml.plugin.title', {
                      defaultMessage: 'Machine Learning',
                    }),
                    icon: 'machineLearningApp',
                    items: sideNavItems,
                  }
                : undefined
            }
          >
            <CommonPageWrapper pageDeps={pageDeps} routeList={routeList} />
          </KibanaPageTemplate>
        ) : (
          <CommonPageWrapper pageDeps={pageDeps} routeList={routeList} paddingSize="none" />
        )}
      </MlPageControlsContext.Provider>
    );
  }
);

interface CommonPageWrapperProps {
  pageDeps: PageDependencies;
  routeList: MlRoute[];
  paddingSize?: EuiPaddingSize;
}

const CommonPageWrapper: FC<CommonPageWrapperProps> = React.memo(
  ({ pageDeps, routeList, paddingSize }) => {
    const {
      services: { application },
    } = useMlKibana();

    return (
      /** RedirectAppLinks intercepts all <a> tags to use navigateToUrl
       * avoiding full page reload **/
      <RedirectAppLinks coreStart={{ application }}>
        <EuiPageSection restrictWidth={false} paddingSize={paddingSize}>
          <Routes>
            {routeList.map((route) => {
              return (
                <Route
                  key={route.path}
                  path={route.path}
                  exact
                  render={(props) => {
                    window.setTimeout(() => {
                      pageDeps.setBreadcrumbs(route.breadcrumbs);
                    });
                    return (
                      <MlPageWrapper path={route.path}>
                        {route.render(props, pageDeps)}
                      </MlPageWrapper>
                    );
                  }}
                />
              );
            })}
            <Redirect to="/overview" />
          </Routes>
        </EuiPageSection>
      </RedirectAppLinks>
    );
  }
);
