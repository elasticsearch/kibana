/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { i18n } from '@kbn/i18n';
import type { RouteMap } from '@kbn/typed-react-router-config';
import { createRouter, Outlet } from '@kbn/typed-react-router-config';
import * as t from 'io-ts';
import React from 'react';
import { StreamsAppPageTemplate } from '../components/streams_app_page_template';
import { StreamsAppRouterBreadcrumb } from '../components/streams_app_router_breadcrumb';
import { RedirectTo } from '../components/redirect_to';
import { StreamManagementDefaultRedirect } from '../components/stream_management_default_redirect';
import { StreamListView } from '../components/stream_list_view';
import { StreamDetailRoot } from '../components/stream_root';
import { StreamDetailManagement } from '../components/stream_management/data_management/stream_detail_management';
import { SignificantEventsDiscoveryPage } from '../components/significant_events/significant_events_discovery/page';

/**
 * Optional time range query params.
 * DateRangeRedirect ensures these are present at runtime.
 */
const timeRangeQueryParams = t.partial({
  rangeFrom: t.string,
  rangeTo: t.string,
});

/**
 * Extended query params for management routes that may include
 * additional feature-specific params (e.g., significant events flyout).
 */
const managementQueryParams = t.partial({
  rangeFrom: t.string,
  rangeTo: t.string,
  // Significant events flyout params
  openFlyout: t.string,
  // Data quality page state
  pageState: t.string,
});

/**
 * The array of route definitions to be used when the application
 * creates the routes.
 *
 * Query params (rangeFrom/rangeTo) are optional - navigation calls can omit them
 * and DateRangeRedirect will ensure they're populated from the global timefilter.
 */
const streamsAppRoutes = {
  '/': {
    element: (
      <StreamsAppRouterBreadcrumb
        title={i18n.translate('xpack.streams.appBreadcrumbTitle', {
          defaultMessage: 'Streams',
        })}
        path="/"
      >
        <StreamsAppPageTemplate>
          <Outlet />
        </StreamsAppPageTemplate>
      </StreamsAppRouterBreadcrumb>
    ),
    children: {
      '/': {
        element: <StreamListView />,
        params: t.partial({
          query: timeRangeQueryParams,
        }),
      },
      '/_discovery': {
        element: <Outlet />,
        children: {
          '/_discovery': {
            element: <RedirectTo path="/_discovery/{tab}" params={{ path: { tab: 'streams' } }} />,
          },
          '/_discovery/{tab}': {
            element: <SignificantEventsDiscoveryPage />,
            params: t.intersection([
              t.type({
                path: t.type({
                  tab: t.string,
                }),
              }),
              t.partial({
                query: t.partial({
                  rangeFrom: t.string,
                  rangeTo: t.string,
                  search: t.string,
                  status: t.string,
                  type: t.union([t.string, t.array(t.string)]),
                  subtype: t.union([t.string, t.array(t.string)]),
                  stream: t.union([t.string, t.array(t.string)]),
                  showComputed: t.string,
                  selectedItem: t.string,
                }),
              }),
            ]),
          },
        },
      },
      '/{key}': {
        element: (
          <StreamDetailRoot>
            <Outlet />
          </StreamDetailRoot>
        ),
        params: t.intersection([
          t.type({
            path: t.type({
              key: t.string,
            }),
          }),
          t.partial({
            query: timeRangeQueryParams,
          }),
        ]),
        children: {
          '/{key}': {
            element: <StreamManagementDefaultRedirect />,
          },
          /**
           * This route redirects from legacy overview/dashboard links to the management page
           */
          '/{key}/{tab}': {
            element: <StreamManagementDefaultRedirect />,
            params: t.intersection([
              t.type({
                path: t.type({
                  tab: t.string,
                }),
              }),
              t.partial({
                query: timeRangeQueryParams,
              }),
            ]),
          },
          '/{key}/management/{tab}': {
            element: <StreamDetailManagement />,
            params: t.intersection([
              t.type({
                path: t.type({
                  tab: t.string,
                }),
              }),
              t.partial({
                query: managementQueryParams,
              }),
            ]),
          },
          /**
           * This route is added as a catch-all route to redirect to the retention tab in case of a
           * invalid subtab or a missing subtab.
           * Works on more in-depth routes as well, e.g. /{key}/management/{tab}/{subtab}/random-path.
           */
          '/*': {
            element: <StreamManagementDefaultRedirect />,
          },
        },
      },
    },
  },
} satisfies RouteMap;

export type StreamsAppRoutes = typeof streamsAppRoutes;

export const streamsAppRouter = createRouter(streamsAppRoutes);

export type StreamsAppRouter = typeof streamsAppRouter;
