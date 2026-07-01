/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { ComponentProps } from 'react';
import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithEuiTheme } from '@kbn/test-jest-helpers';
import type { SerializableRecord } from '@kbn/utility-types';

import type { NavExtensionPointContext } from '../types';
import type { ListTemplateConfig } from './list_template';
import { ListTemplate } from './list_template';

interface TestRow extends SerializableRecord {
  id: string;
  label: string;
  href: string;
  iconType?: string;
}

interface RawDashboard extends SerializableRecord {
  dashboardId: string;
  title: string;
  url: string;
  icon?: string;
}

const SLOT_ID = 'recent-dashboards';
const EXTENSION_ID = 'recentlyAccessedDashboards';

const defaultContext: NavExtensionPointContext = {
  slotId: SLOT_ID,
  extensionId: EXTENSION_ID,
};

const defaultConfig: ListTemplateConfig<TestRow> = {
  emptyMessage: 'No dashboards yet',
};

const testRows: TestRow[] = [
  { id: '1', label: 'Alpha dashboard', href: '/app/dashboards#/view/1' },
  { id: '2', label: 'Beta dashboard', href: '/app/dashboards#/view/2' },
  { id: '3', label: 'Gamma dashboard', href: '/app/dashboards#/view/3' },
];

const renderListTemplate = ({
  data = testRows,
  config = defaultConfig,
  context = defaultContext,
}: Partial<ComponentProps<typeof ListTemplate<TestRow>>> = {}) => {
  const view = renderWithEuiTheme(<ListTemplate data={data} config={config} context={context} />);

  return { ...view };
};

describe('ListTemplate', () => {
  it('renders list items with labels and hrefs', () => {
    renderListTemplate();

    const alphaLink = screen.getByRole('link', { name: 'Alpha dashboard' });
    const betaLink = screen.getByRole('link', { name: 'Beta dashboard' });

    expect(alphaLink).toHaveAttribute('href', '/app/dashboards#/view/1');
    expect(betaLink).toHaveAttribute('href', '/app/dashboards#/view/2');
  });

  it('caps rendered rows when max is configured', () => {
    renderListTemplate({
      config: {
        ...defaultConfig,
        max: 2,
      },
    });

    expect(screen.getByRole('link', { name: 'Alpha dashboard' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Beta dashboard' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Gamma dashboard' })).not.toBeInTheDocument();
  });

  it('skips rows missing required fields', () => {
    renderListTemplate({
      data: [
        { id: '1', label: 'Valid row', href: '/valid' },
        { id: '2', label: '', href: '/missing-label' },
        { id: '', label: 'Missing id', href: '/missing-id' },
        { id: '4', label: 'Missing href', href: '' },
      ],
    });

    expect(screen.getByRole('link', { name: 'Valid row' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Missing label' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Missing id' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Missing href' })).not.toBeInTheDocument();
  });

  it('does not render the template when there are no rows', () => {
    renderListTemplate({
      data: [],
    });

    expect(screen.queryByTestId(`nav-extension-${SLOT_ID}-list-template`)).not.toBeInTheDocument();
  });

  it('renders the heading when configured', () => {
    renderListTemplate({
      config: {
        ...defaultConfig,
        heading: 'Recently viewed',
      },
    });

    expect(screen.getByRole('heading', { name: 'Recently viewed' })).toBeInTheDocument();
  });

  it('filters rows client-side when search is enabled', async () => {
    const user = userEvent.setup();
    renderListTemplate({
      config: {
        ...defaultConfig,
        heading: 'Recently viewed',
        search: { enabled: true, placeholder: 'Search dashboards' },
      },
    });

    await user.click(screen.getByTestId(`nav-extension-${SLOT_ID}-toggle-search-field-button`));

    const searchInput = await screen.findByTestId(`nav-extension-${SLOT_ID}-search`);
    await user.type(searchInput, 'beta');

    await waitFor(() => {
      expect(screen.getByRole('link', { name: 'Beta dashboard' })).toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Alpha dashboard' })).not.toBeInTheDocument();
      expect(screen.queryByRole('link', { name: 'Gamma dashboard' })).not.toBeInTheDocument();
    });
  });

  it('renders the empty message when searching yields no results', async () => {
    const user = userEvent.setup();

    renderListTemplate({
      config: {
        ...defaultConfig,
        heading: 'Recently viewed',
        search: { enabled: true, placeholder: 'Search dashboards' },
        emptyMessage: 'No matching dashboards for query',
      },
    });

    await user.click(screen.getByTestId(`nav-extension-${SLOT_ID}-toggle-search-field-button`));

    const searchInput = await screen.findByTestId(`nav-extension-${SLOT_ID}-search`);

    await user.type(searchInput, 'kibanana');

    expect(screen.getByTestId(`nav-extension-${SLOT_ID}-empty`)).toHaveTextContent(
      'No matching dashboards for query'
    );
  });

  it('invokes onAction with add when the add-item button is clicked', async () => {
    const user = userEvent.setup();
    const onAddItemHandler = jest.fn();

    renderListTemplate({
      config: {
        ...defaultConfig,
        heading: 'Recently viewed',
        supportAddItem: { enabled: true, onClick: onAddItemHandler },
        search: { enabled: true },
      },
    });

    await user.click(screen.getByTestId(`nav-extension-${SLOT_ID}-add-item-button`));

    expect(onAddItemHandler).toHaveBeenCalledTimes(1);
  });

  it('invokes onAction when a row action is selected from the menu', async () => {
    const user = userEvent.setup();
    const onAction = jest.fn();

    renderListTemplate({
      config: {
        ...defaultConfig,
        heading: 'Recently viewed',
        actions: [
          { id: 'delete', label: 'Delete', icon: 'trash', onClick: onAction },
          { id: 'edit', label: 'Edit', icon: 'pencil', onClick: onAction },
        ],
      },
    });

    await user.click(screen.getByTestId(`nav-extension-${SLOT_ID}-action-menu-1`));

    const deleteAction = await screen.findByTestId(`nav-extension-${EXTENSION_ID}-action-delete`);
    await user.click(deleteAction);

    await waitFor(() => {
      expect(onAction).toHaveBeenCalledTimes(1);
    });
  });

  it('does not render row action menus when actions are not configured', () => {
    renderListTemplate();

    expect(screen.queryByTestId(`nav-extension-${SLOT_ID}-action-menu-1`)).not.toBeInTheDocument();
  });

  it('renders list items from mapped data when mapData is configured', () => {
    const rawDashboards: RawDashboard[] = [
      {
        dashboardId: 'dash-1',
        title: 'Sales overview',
        url: '/app/dashboards#/view/dash-1',
        icon: 'dashboardApp',
      },
      { dashboardId: 'dash-2', title: 'Ops metrics', url: '/app/dashboards#/view/dash-2' },
    ];

    renderWithEuiTheme(
      <ListTemplate<RawDashboard>
        data={rawDashboards}
        config={{
          emptyMessage: 'No dashboards yet',
          mapData: ({ dashboardId, title, url, icon }) => ({
            id: dashboardId,
            label: title,
            href: url,
            iconType: icon,
          }),
        }}
        context={defaultContext}
      />
    );

    const salesLink = screen.getByRole('link', { name: 'Sales overview' });
    const opsLink = screen.getByRole('link', { name: 'Ops metrics' });

    expect(salesLink).toHaveAttribute('href', '/app/dashboards#/view/dash-1');
    expect(opsLink).toHaveAttribute('href', '/app/dashboards#/view/dash-2');
    expect(salesLink.querySelector('[data-euiicon-type="dashboardApp"]')).toBeInTheDocument();
  });

  it('passes original data to row actions when mapData is configured', async () => {
    const user = userEvent.setup();
    const onAction = jest.fn();

    const rawDashboards: RawDashboard[] = [
      { dashboardId: 'dash-1', title: 'Sales overview', url: '/app/dashboards#/view/dash-1' },
    ];

    renderWithEuiTheme(
      <ListTemplate<RawDashboard>
        data={rawDashboards}
        config={{
          emptyMessage: 'No dashboards yet',
          heading: 'Recently viewed',
          mapData: ({ dashboardId, title, url }) => ({
            id: dashboardId,
            label: title,
            href: url,
          }),
          actions: [{ id: 'delete', label: 'Delete', icon: 'trash', onClick: onAction }],
        }}
        context={defaultContext}
      />
    );

    await user.click(screen.getByTestId(`nav-extension-${SLOT_ID}-action-menu-dash-1`));

    const deleteAction = await screen.findByTestId(`nav-extension-${EXTENSION_ID}-action-delete`);
    await user.click(deleteAction);

    await waitFor(() => {
      expect(onAction).toHaveBeenCalledWith(SLOT_ID, rawDashboards[0], expect.any(Object));
    });
  });

  it('renders icons when iconField is configured', () => {
    renderListTemplate({
      data: [
        {
          id: '1',
          label: 'Dashboard with icon',
          href: '/app/dashboards#/view/1',
          iconType: 'dashboardApp',
        },
      ],
      config: {
        emptyMessage: 'No dashboards yet',
      },
    });

    const dashboardLink = screen.getByRole('link', { name: 'Dashboard with icon' });

    expect(dashboardLink.querySelector('[data-euiicon-type="dashboardApp"]')).toBeInTheDocument();
  });
});
