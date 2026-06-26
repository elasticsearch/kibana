/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { FC, PropsWithChildren } from 'react';
import React from 'react';
import type { RouteProps } from 'react-router-dom';
import { type Location } from 'history';
import { Router } from '@kbn/shared-ux-router';

import type { AppMountParameters, ChromeStart, ChromeBreadcrumb } from '@kbn/core/public';

import { EuiSkeletonText } from '@elastic/eui';
import { UrlStateProvider } from '@kbn/ml-url-state';
import { MlNotificationsContextProvider } from '../contexts/ml/ml_notifications_context';

import { MlPage } from '../components/ml_page';
import type { MlPages } from '../../locator';
import { type RouteResolverContext } from './use_resolver';

// custom RouteProps making location non-optional
interface MlRouteProps extends RouteProps {
  location: Location;
}

export interface MlRoute {
  /**
   * Route ID.
   * Used for tab IDs
   */
  id?: string;
  path: string;
  /**
   * Route name.
   * Used for side nav items and page titles.
   */
  title?: string;
  render(props: MlRouteProps, deps: PageDependencies): JSX.Element;
  breadcrumbs: ChromeBreadcrumb[];
  /**
   * Indicated if page contains a global date picker.
   */
  enableDatePicker?: boolean;
  'data-test-subj'?: string;
  actionMenu?: React.ReactNode;
  disabled?: boolean;
}

export interface PageProps {
  location: Location;
  deps: PageDependencies;
}

export interface PageDependencies {
  history: AppMountParameters['history'];
  setBreadcrumbs: ChromeStart['setBreadcrumbs'];
}

export const PageLoader: FC<PropsWithChildren<{ context: RouteResolverContext }>> = ({
  context,
  children,
}) => {
  const isLoading = !context.initialized;

  if (context?.resolvedComponent) {
    return context.resolvedComponent;
  }

  return (
    <EuiSkeletonText lines={10} isLoading={isLoading}>
      {!isLoading ? children : null}
    </EuiSkeletonText>
  );
};

/**
 * `MlRouter` is based on `BrowserRouter` and takes in `ScopedHistory` provided
 * by Kibana. `LegacyHashUrlRedirect` provides compatibility with legacy hash based URLs.
 * `UrlStateProvider` manages state stored in `_g/_a` URL parameters which can be
 * use in components further down via `useUrlState()`.
 */
export const MlRouter: FC<{
  pageDeps: PageDependencies;
  entryPoint?: string; // update this to finite set of possible ids - now 'jobs' - maybe make part of the context to avoid prop drilling?
}> = ({ pageDeps, entryPoint }) => (
  <Router history={pageDeps.history}>
    <UrlStateProvider>
      <MlNotificationsContextProvider>
        <MlPage pageDeps={pageDeps} entryPoint={entryPoint} />
      </MlNotificationsContextProvider>
    </UrlStateProvider>
  </Router>
);

export function createPath(page: MlPages, additionalPrefix?: string) {
  return `/${page}${additionalPrefix ? `${additionalPrefix}` : ''}`;
}
