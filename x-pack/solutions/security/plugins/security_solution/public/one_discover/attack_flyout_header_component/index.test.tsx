/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { DataTableRecord } from '@kbn/discover-utils';
import React from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Router } from '@kbn/shared-ux-router';
import { createMemoryHistory } from 'history';
import { createStore } from 'redux';
import { DOC_VIEWER_FLYOUT_HISTORY_KEY } from '@kbn/unified-doc-viewer';
import { AttackFlyoutHeader } from '.';
import type { StartServices } from '../../types';
import { useIsInSecurityApp } from '../../common/hooks/is_in_security_app';
import { documentFlyoutHistoryKey } from '../../flyout_v2/shared/constants/flyout_history';

const mockAttackHeader = jest.fn((props: unknown) => {
  const { onShowNotes } = props as { onShowNotes?: () => void };

  return (
    <button type="button" onClick={onShowNotes}>
      {'MockAttackHeader'}
    </button>
  );
});

jest.mock('../../flyout_v2/attack/main/header', () => ({
  Header: (props: unknown) => mockAttackHeader(props),
}));

jest.mock('../../flyout_v2/shared/tools/notes', () => ({
  NotesDetails: () => <div>{'MockNotesDetails'}</div>,
}));

jest.mock('../../common/components/user_privileges/user_privileges_context', () => ({
  UserPrivilegesProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('../../common/components/discover_in_timeline/provider', () => ({
  DiscoverInTimelineContextProvider: ({ children }: { children: React.ReactNode }) => (
    <>{children}</>
  ),
}));

jest.mock('../../cases/components/provider/provider', () => ({
  CaseProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('../../assistant/provider', () => ({
  AssistantProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('../../common/hooks/is_in_security_app', () => ({
  useIsInSecurityApp: jest.fn(),
}));

const mockFlyoutProviders = jest.fn(({ children }: { children: React.ReactNode }) => (
  <>{children}</>
));

jest.mock('../../flyout_v2/shared/components/flyout_provider', () => ({
  flyoutProviders: (props: unknown) => mockFlyoutProviders(props as { children: React.ReactNode }),
}));

describe('AttackFlyoutHeader', () => {
  const mockUseIsInSecurityApp = jest.mocked(useIsInSecurityApp);

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseIsInSecurityApp.mockReturnValue(false);
  });

  const servicesMock = {
    overlays: { openSystemFlyout: jest.fn() },
    uiActions: {
      getTriggerCompatibleActions: jest.fn().mockResolvedValue([]),
    },
    application: {
      capabilities: {
        securitySolution: { show: true, crud: true },
      },
    },
    upselling: {},
  } as unknown as StartServices;

  it('does not render before promises resolve', () => {
    const hit = { id: '1', raw: {}, flattened: {} } as unknown as DataTableRecord;
    const history = createMemoryHistory({ initialEntries: ['/discover'] });

    render(
      <Router history={history}>
        <AttackFlyoutHeader
          hit={hit}
          servicesPromise={new Promise<StartServices>(() => undefined)}
          storePromise={new Promise<ReturnType<typeof createStore>>(() => undefined) as never}
          onAttackUpdated={jest.fn()}
        />
      </Router>
    );

    expect(mockFlyoutProviders).not.toHaveBeenCalled();
  });

  it('renders the attack header through flyoutProviders when dependencies resolve', async () => {
    const hit = {
      id: '1',
      raw: { _id: '1', _index: 'test' },
      flattened: {},
    } as unknown as DataTableRecord;
    const store = createStore(() => ({}));
    const history = createMemoryHistory({ initialEntries: ['/discover'] });

    render(
      <Router history={history}>
        <AttackFlyoutHeader
          hit={hit}
          servicesPromise={Promise.resolve(servicesMock)}
          storePromise={Promise.resolve(store as never)}
          onAttackUpdated={jest.fn()}
        />
      </Router>
    );

    await waitFor(() => {
      expect(screen.getByText('MockAttackHeader')).toBeInTheDocument();
    });

    expect(mockFlyoutProviders).toHaveBeenCalledWith(
      expect.objectContaining({
        services: servicesMock,
        store,
      })
    );

    expect(mockAttackHeader).toHaveBeenCalledWith(
      expect.objectContaining({
        hit,
        onAttackUpdated: expect.any(Function),
        onShowNotes: expect.any(Function),
      })
    );
  });

  it('does not render when resolving dependencies fails', async () => {
    const hit = { id: '1', raw: {}, flattened: {} } as unknown as DataTableRecord;
    const store = createStore(() => ({}));
    const history = createMemoryHistory({ initialEntries: ['/discover'] });

    render(
      <Router history={history}>
        <AttackFlyoutHeader
          hit={hit}
          servicesPromise={Promise.reject(new Error('services failed'))}
          storePromise={Promise.resolve(store as never)}
          onAttackUpdated={jest.fn()}
        />
      </Router>
    );

    await waitFor(() => {
      expect(mockFlyoutProviders).not.toHaveBeenCalled();
    });
  });

  it('opens notes in a nested system flyout when notes button is clicked', async () => {
    const hit = { id: '1', raw: { _id: '1' }, flattened: {} } as unknown as DataTableRecord;
    const store = createStore(() => ({}));
    const history = createMemoryHistory({ initialEntries: ['/discover'] });

    render(
      <Router history={history}>
        <AttackFlyoutHeader
          hit={hit}
          servicesPromise={Promise.resolve(servicesMock)}
          storePromise={Promise.resolve(store as never)}
          onAttackUpdated={jest.fn()}
        />
      </Router>
    );

    await waitFor(() => {
      expect(screen.getByText('MockAttackHeader')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('MockAttackHeader'));

    expect(servicesMock.overlays.openSystemFlyout).toHaveBeenCalledTimes(1);
    expect(servicesMock.overlays.openSystemFlyout).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        historyKey: DOC_VIEWER_FLYOUT_HISTORY_KEY,
        ownFocus: false,
        resizable: true,
        size: 'm',
      })
    );
  });

  it('uses Security history key when opened inside the Security app', async () => {
    mockUseIsInSecurityApp.mockReturnValue(true);

    const hit = { id: '1', raw: { _id: '1' }, flattened: {} } as unknown as DataTableRecord;
    const store = createStore(() => ({}));
    const history = createMemoryHistory({ initialEntries: ['/security'] });

    render(
      <Router history={history}>
        <AttackFlyoutHeader
          hit={hit}
          servicesPromise={Promise.resolve(servicesMock)}
          storePromise={Promise.resolve(store as never)}
          onAttackUpdated={jest.fn()}
        />
      </Router>
    );

    await waitFor(() => {
      expect(screen.getByText('MockAttackHeader')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('MockAttackHeader'));

    expect(servicesMock.overlays.openSystemFlyout).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        historyKey: documentFlyoutHistoryKey,
      })
    );
  });

  it('calls onAttackUpdated when the header mutation callback is triggered', async () => {
    const onAttackUpdated = jest.fn();
    const hit = {
      id: '1',
      raw: { _id: '1', _index: 'test' },
      flattened: {},
    } as unknown as DataTableRecord;
    const store = createStore(() => ({}));
    const history = createMemoryHistory({ initialEntries: ['/discover'] });

    render(
      <Router history={history}>
        <AttackFlyoutHeader
          hit={hit}
          servicesPromise={Promise.resolve(servicesMock)}
          storePromise={Promise.resolve(store as never)}
          onAttackUpdated={onAttackUpdated}
        />
      </Router>
    );

    await waitFor(() => {
      expect(screen.getByText('MockAttackHeader')).toBeInTheDocument();
    });

    const lastCall = mockAttackHeader.mock.calls[mockAttackHeader.mock.calls.length - 1];
    const props = lastCall?.[0] as { onAttackUpdated?: () => void } | undefined;
    props?.onAttackUpdated?.();

    expect(onAttackUpdated).toHaveBeenCalledTimes(1);
  });
});
