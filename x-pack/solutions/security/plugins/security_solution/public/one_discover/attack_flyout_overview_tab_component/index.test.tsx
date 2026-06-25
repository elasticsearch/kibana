/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DataTableRecord } from '@kbn/discover-utils';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import { createStore } from 'redux';
import { AttackFlyoutOverviewTab } from '.';
import type { StartServices } from '../../types';

const mockFlyoutProviders = jest.fn(({ children }: { children: React.ReactNode }) => (
  <>{children}</>
));

jest.mock('../../flyout_v2/shared/components/flyout_provider', () => ({
  flyoutProviders: (props: unknown) => mockFlyoutProviders(props as { children: React.ReactNode }),
}));

jest.mock('../../flyout_v2/attack/main/tabs/overview_tab', () => ({
  OverviewTab: ({ hit }: { hit: DataTableRecord }) => (
    <div data-test-subj="attackOverviewTabMock" data-hit-id={String((hit as DataTableRecord).id)}>
      {'overview'}
    </div>
  ),
}));

describe('AttackFlyoutOverviewTab', () => {
  beforeEach(() => {
    mockFlyoutProviders.mockClear();
  });

  const servicesMock = {
    overlays: { openSystemFlyout: jest.fn() },
    uiActions: {
      getTriggerCompatibleActions: jest.fn().mockResolvedValue([]),
    },
  } as unknown as StartServices;

  const hit = {
    id: '1',
    raw: { _id: 'attack-1', _index: 'test-index' },
    flattened: { _id: 'attack-1', _index: 'test-index' },
  } as unknown as DataTableRecord;

  it('does not render before promises resolve', () => {
    render(
      <AttackFlyoutOverviewTab
        hit={hit}
        servicesPromise={new Promise<StartServices>(() => undefined)}
        storePromise={new Promise<ReturnType<typeof createStore>>(() => undefined) as never}
      />
    );

    expect(mockFlyoutProviders).not.toHaveBeenCalled();
  });

  it('renders overview tab through flyoutProviders when dependencies resolve', async () => {
    const store = createStore(() => ({}));

    render(
      <AttackFlyoutOverviewTab
        hit={hit}
        servicesPromise={Promise.resolve(servicesMock)}
        storePromise={Promise.resolve(store as never)}
      />
    );

    await waitFor(() => {
      expect(mockFlyoutProviders).toHaveBeenCalledWith(
        expect.objectContaining({
          services: servicesMock,
          store,
        })
      );
    });

    expect(screen.getByTestId('attackOverviewTabMock')).toBeInTheDocument();
    expect(screen.getByTestId('attackOverviewTabMock')).toHaveAttribute('data-hit-id', '1');
  });

  it('forwards the latest hit to OverviewTab when Discover rerenders', async () => {
    const updatedHit = {
      id: '2',
      raw: {
        _id: 'attack-2',
        _index: 'test-index',
        _source: { 'kibana.alert.workflow_status': 'closed' },
      },
      flattened: { _id: 'attack-2', _index: 'test-index' },
    } as unknown as DataTableRecord;
    const store = createStore(() => ({}));

    const { rerender } = render(
      <AttackFlyoutOverviewTab
        hit={hit}
        servicesPromise={Promise.resolve(servicesMock)}
        storePromise={Promise.resolve(store as never)}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId('attackOverviewTabMock')).toBeInTheDocument();
    });

    expect(screen.getByTestId('attackOverviewTabMock')).toHaveAttribute('data-hit-id', '1');

    rerender(
      <AttackFlyoutOverviewTab
        hit={updatedHit}
        servicesPromise={Promise.resolve(servicesMock)}
        storePromise={Promise.resolve(store as never)}
      />
    );
    expect(screen.getByTestId('attackOverviewTabMock')).toHaveAttribute('data-hit-id', '2');
  });

  it('does not render when resolving dependencies fails', async () => {
    const store = createStore(() => ({}));

    render(
      <AttackFlyoutOverviewTab
        hit={hit}
        servicesPromise={Promise.reject(new Error('services failed'))}
        storePromise={Promise.resolve(store as never)}
      />
    );

    await waitFor(() => {
      expect(mockFlyoutProviders).not.toHaveBeenCalled();
    });
  });
});
