/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React from 'react';
import { BehaviorSubject } from 'rxjs';

import { EuiThemeProvider } from '@elastic/eui';
import { DEFAULT_DASHBOARD_NAVIGATION_OPTIONS } from '@kbn/dashboard-navigation-options-common';
import type { AggregateQuery, Filter, Query, TimeRange } from '@kbn/es-query';
import { createEvent, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { LINKS_VERTICAL_LAYOUT } from '../../../common/constants';
import { getMockLinksParentApi } from '../../mocks';
import type { ResolvedLink } from '../../types';
import type { DashboardLinkProps } from './dashboard_link_component';
import { DashboardLinkComponent } from './dashboard_link_component';
import { DashboardLinkStrings } from './dashboard_link_strings';

function createMockLinksParent({
  initialQuery,
  initialFilters,
}: {
  initialQuery?: Query | AggregateQuery;
  initialFilters?: Filter[];
}) {
  const parent = {
    ...getMockLinksParentApi({ title: 'Test', ref_id: '456' }),
    locator: {
      getRedirectUrl: jest.fn().mockReturnValue('https://my-kibana.com/dashboard/123'),
      navigate: jest.fn(),
    },
    getSerializedStateForChild: jest.fn(),
    query$: new BehaviorSubject<Query | AggregateQuery | undefined>(initialQuery),
    filters$: new BehaviorSubject<Filter[] | undefined>(initialFilters ?? []),
  };
  return parent;
}

describe('Dashboard link component', () => {
  const resolvedLink: ResolvedLink = {
    id: 'foo',
    type: 'dashboardLink',
    label: '',
    destination: '456',
    title: 'Dashboard 1',
    description: 'Dashboard 1 description',
    options: DEFAULT_DASHBOARD_NAVIGATION_OPTIONS,
  };

  const renderComponent = (overrides?: Partial<DashboardLinkProps>) => {
    const parentApi = createMockLinksParent({});
    const { rerender, ...rtlRest } = render(
      <EuiThemeProvider>
        <DashboardLinkComponent
          link={resolvedLink}
          layout={LINKS_VERTICAL_LAYOUT}
          parentApi={parentApi}
          {...overrides}
        />
      </EuiThemeProvider>
    );

    return {
      ...rtlRest,
      rerender: (newOverrides: Partial<DashboardLinkProps>) => {
        return rerender(
          <EuiThemeProvider>
            <DashboardLinkComponent
              link={resolvedLink}
              layout={LINKS_VERTICAL_LAYOUT}
              parentApi={parentApi}
              {...overrides}
              {...newOverrides}
            />
          </EuiThemeProvider>
        );
      },
    };
  };

  beforeEach(async () => {
    window.open = jest.fn();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  test('by default uses navigate to open in same tab', async () => {
    const parentApi = createMockLinksParent({});
    renderComponent({ parentApi });

    // renders dashboard title
    const link = screen.getByTestId('dashboardLink--Dashboard 1');
    expect(link).toHaveTextContent('Dashboard 1');

    // does not render external link icon
    const externalIcon = link.querySelector('[data-euiicon-type="external"]');
    expect(externalIcon).toBeNull();

    // calls `navigate` on click
    await userEvent.click(link);
    expect(parentApi.locator?.getRedirectUrl).toBeCalledWith({
      dashboardId: '456',
      filters: [],
      time_range: {
        from: 'now-15m',
        to: 'now',
      },
    });
    expect(parentApi.locator?.navigate).toBeCalledTimes(1);
  });

  test('modified click does not trigger event.preventDefault', async () => {
    renderComponent();
    const link = screen.getByTestId('dashboardLink--Dashboard 1');
    const clickEvent = createEvent.click(link, { ctrlKey: true });
    const preventDefault = jest.spyOn(clickEvent, 'preventDefault');
    fireEvent(link, clickEvent);
    expect(preventDefault).toHaveBeenCalledTimes(0);
  });

  test('open_in_new_tab uses window.open, not navigateToApp, and renders external icon', async () => {
    const parentApi = createMockLinksParent({});
    renderComponent({
      link: {
        ...resolvedLink,
        options: { ...DEFAULT_DASHBOARD_NAVIGATION_OPTIONS, open_in_new_tab: true },
      },
      parentApi,
    });

    const link = screen.getByTestId('dashboardLink--Dashboard 1');
    expect(link).toBeInTheDocument();
    // external link icon is rendered
    const externalIcon = link.querySelector('[data-euiicon-type="external"]');
    expect(externalIcon).toBeInTheDocument();

    // calls `window.open`
    await userEvent.click(link);
    expect(parentApi.locator?.navigate).toBeCalledTimes(0);
    expect(window.open).toHaveBeenCalledWith('https://my-kibana.com/dashboard/123', '_blank');
  });

  test('passes query, filters, and timeRange to locator.getRedirectUrl by default', async () => {
    const initialFilters = [
      {
        query: { match_phrase: { foo: 'bar' } },
        meta: { alias: null, disabled: false, negate: false },
      },
    ];
    const initialQuery = { query: 'fiddlesticks: "*"', language: 'lucene' };
    const parentApi = createMockLinksParent({
      initialQuery,
      initialFilters,
    });

    parentApi.timeRange$ = new BehaviorSubject<TimeRange | undefined>({
      from: 'now-7d',
      to: 'now',
    });

    renderComponent({
      link: {
        ...resolvedLink,
        options: DEFAULT_DASHBOARD_NAVIGATION_OPTIONS,
      },
      parentApi,
    });

    expect(parentApi.locator?.getRedirectUrl).toBeCalledWith({
      dashboardId: '456',
      time_range: { from: 'now-7d', to: 'now' },
      filters: initialFilters,
      query: initialQuery as Query,
    });
  });

  test('does not pass timeRange to locator.getRedirectUrl if use_time_range is false', async () => {
    const initialFilters = [
      {
        query: { match_phrase: { foo: 'bar' } },
        meta: { alias: null, disabled: false, negate: false },
      },
    ];
    const initialQuery = { query: 'fiddlesticks: "*"', language: 'lucene' };
    const parentApi = createMockLinksParent({
      initialQuery,
      initialFilters,
    });

    parentApi.timeRange$ = new BehaviorSubject<TimeRange | undefined>({
      from: 'now-7d',
      to: 'now',
    });

    renderComponent({
      link: {
        ...resolvedLink,
        options: {
          ...DEFAULT_DASHBOARD_NAVIGATION_OPTIONS,
          use_time_range: false,
        },
      },
      parentApi,
    });

    expect(parentApi.locator?.getRedirectUrl).toBeCalledWith({
      dashboardId: '456',
      filters: initialFilters,
      query: initialQuery as Query,
    });
  });

  test('does not pass filters or query to locator.getRedirectUrl if use_filters is false', async () => {
    const initialFilters = [
      {
        query: { match_phrase: { foo: 'bar' } },
        meta: { alias: null, disabled: false, negate: false },
      },
    ];
    const initialQuery = { query: 'fiddlesticks: "*"', language: 'lucene' };
    const parentApi = createMockLinksParent({
      initialQuery,
      initialFilters,
    });

    parentApi.timeRange$ = new BehaviorSubject<TimeRange | undefined>({
      from: 'now-7d',
      to: 'now',
    });

    renderComponent({
      link: {
        ...resolvedLink,
        options: {
          ...DEFAULT_DASHBOARD_NAVIGATION_OPTIONS,
          use_filters: false,
        },
      },
      parentApi,
    });

    expect(parentApi.locator?.getRedirectUrl).toBeCalledWith({
      dashboardId: '456',
      time_range: { from: 'now-7d', to: 'now' },
      filters: [],
    });
  });

  test('shows an error when fetchDashboard fails', async () => {
    renderComponent({
      link: {
        ...resolvedLink,
        title: 'Error fetching dashboard',
        error: new Error('not found'),
      },
    });

    const link = await screen.findByTestId('dashboardLink--Error fetching dashboard--error');
    expect(link).toHaveTextContent(DashboardLinkStrings.getDashboardErrorLabel());
  });

  test('current dashboard is not a clickable href', async () => {
    const parentApi = createMockLinksParent({});
    parentApi.savedObjectId$ = new BehaviorSubject<string | undefined>('123');
    parentApi.title$ = new BehaviorSubject<string | undefined>('current dashboard');

    renderComponent({
      link: {
        ...resolvedLink,
        destination: '123',
        id: 'bar',
      },
      parentApi,
    });

    const link = screen.getByTestId('dashboardLink--Dashboard 1');
    expect(link).toHaveTextContent('current dashboard');
    await userEvent.click(link);
    expect(parentApi.locator?.navigate).toBeCalledTimes(0);
    expect(window.open).toBeCalledTimes(0);
  });

  test('shows dashboard title and description in tooltip', async () => {
    renderComponent({
      link: {
        ...resolvedLink,
        title: 'another dashboard',
        description: 'something awesome',
      },
    });

    const link = screen.getByTestId('dashboardLink--another dashboard');
    await userEvent.hover(link);
    const tooltip = await screen.findByTestId('dashboardLink--another dashboard--tooltip');
    expect(tooltip).toHaveTextContent('another dashboard'); // title
    expect(tooltip).toHaveTextContent('something awesome'); // description
  });

  test('current dashboard title updates when parent changes', async () => {
    const parentApi = {
      ...createMockLinksParent({}),
      title$: new BehaviorSubject<string | undefined>('old title'),
      description$: new BehaviorSubject<string | undefined>('old description'),
      savedObjectId$: new BehaviorSubject<string | undefined>('123'),
    };

    const { rerender } = renderComponent({
      link: {
        ...resolvedLink,
        destination: '123',
        id: 'bar',
      },
      parentApi,
    });

    expect(await screen.findByTestId('dashboardLink--Dashboard 1')).toHaveTextContent('old title');

    parentApi.title$.next('new title');
    rerender({
      link: {
        ...resolvedLink,
        destination: '123',
        id: 'bar',
        label: undefined,
      },
    });
    expect(await screen.findByTestId('dashboardLink--Dashboard 1')).toHaveTextContent('new title');
  });

  test('can override link label', async () => {
    const label = 'my custom label';
    renderComponent({
      link: {
        ...resolvedLink,
        label,
      },
    });

    const link = screen.getByTestId('dashboardLink--Dashboard 1');
    expect(link).toHaveTextContent(label);
    await userEvent.hover(link);
    const tooltip = await screen.findByTestId('dashboardLink--Dashboard 1--tooltip');
    expect(tooltip).toHaveTextContent(label);
  });

  test('can override link label for the current dashboard', async () => {
    const customLabel = 'my new label for the current dashboard';
    const parentApi = createMockLinksParent({});
    parentApi.savedObjectId$ = new BehaviorSubject<string | undefined>('123');

    renderComponent({
      link: {
        ...resolvedLink,
        destination: '123',
        id: 'bar',
        label: customLabel,
      },
      parentApi,
    });

    const link = screen.getByTestId('dashboardLink--Dashboard 1');
    expect(link).toHaveTextContent(customLabel);
  });
});
