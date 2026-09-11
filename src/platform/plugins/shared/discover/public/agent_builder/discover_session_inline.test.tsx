/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import React, { useEffect } from 'react';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EuiProvider } from '@elastic/eui';
import { AS_CODE_ESQL_DATA_SOURCE_TYPE } from '@kbn/as-code-data-views-schema';
import { DataGridDensity, DiscoverTabType, SEARCH_EMBEDDABLE_TYPE } from '@kbn/discover-utils';
import type { ApplicationStart } from '@kbn/core/public';
import type { EmbeddableStart } from '@kbn/embeddable-plugin/public';
import { EmbeddableRenderer } from '@kbn/embeddable-plugin/public';
import type { UnifiedSearchPublicPluginStart } from '@kbn/unified-search-plugin/public';
import type { ActionButton } from '@kbn/agent-builder-browser/attachments';
import type { DiscoverAppLocator } from '../../common';
import type { DiscoverSessionApiData, DiscoverSessionEmbeddableByValueState } from '../../server';
import { useSearchEmbeddableToolbar } from '../embeddable/components/search_embeddable_toolbar_context';
import { DiscoverSessionInline } from './discover_session_inline';

const liveSerializedState: DiscoverSessionEmbeddableByValueState & {
  nonPersistedDisplayOptions: { wrapToolbar: boolean; showKeyboardShortcuts: boolean };
} = {
  title: 'Live table',
  description: '',
  time_range: { from: 'now-15m', to: 'now' },
  nonPersistedDisplayOptions: { wrapToolbar: false, showKeyboardShortcuts: false },
  tabs: [
    {
      data_source: { type: AS_CODE_ESQL_DATA_SOURCE_TYPE, query: 'FROM logs-* | LIMIT 100' },
      column_order: ['@timestamp'],
      density: DataGridDensity.COMPACT,
      row_height: 2,
      sort: [],
    },
  ],
};

const embeddableApi = {
  setTimeRange: jest.fn(),
  getSerializedStateByValue: jest.fn(() => liveSerializedState),
};

const navigateToWithEmbeddablePackages = jest.fn();

let exposeApi = true;
let capturedOnSave: ((args: Record<string, unknown>) => Promise<void>) | undefined;
const capturedSearchBarProps: Array<{
  appName?: string;
  disableSubscribingToGlobalDataServices?: boolean;
  showTimeWindowButtons?: boolean;
}> = [];

jest.mock('@kbn/embeddable-plugin/public', () => ({
  EmbeddableRenderer: jest.fn(),
}));

jest.mock('@kbn/presentation-util-plugin/public', () => ({
  SavedObjectSaveModalDashboard: (props: {
    onSave: (args: Record<string, unknown>) => Promise<void>;
  }) => {
    capturedOnSave = props.onSave;
    return <span data-test-subj="discoverAgentBuilderSaveModal" />;
  },
}));

const sessionData: DiscoverSessionApiData = {
  title: 'Nginx errors',
  description: '',
  tabs: [
    {
      id: 'tab-1',
      label: 'Documents',
      type: DiscoverTabType.Default,
      data_source: {
        type: AS_CODE_ESQL_DATA_SOURCE_TYPE,
        query: 'FROM logs-* | LIMIT 100',
      },
      hide_chart: true,
      hide_table: false,
      time_range: { from: 'now-24h', to: 'now' },
      column_order: ['@timestamp', 'message'],
      sort: [],
    },
  ],
};

const SearchBar = (props: {
  appName?: string;
  disableSubscribingToGlobalDataServices?: boolean;
  showTimeWindowButtons?: boolean;
  onQuerySubmit?: (payload: { dateRange: { from: string; to: string } }) => void;
}) => {
  capturedSearchBarProps.push(props);
  return (
    <button
      type="button"
      onClick={() => props.onQuerySubmit?.({ dateRange: { from: 'now-15m', to: 'now' } })}
    >
      change time
    </button>
  );
};

const renderInline = ({
  registerActionButtons,
  canWriteDashboards = true,
}: {
  registerActionButtons?: jest.Mock;
  canWriteDashboards?: boolean;
} = {}) => {
  const navigate = jest.fn();
  render(
    <EuiProvider>
      <DiscoverSessionInline
        data={sessionData}
        unifiedSearch={{ ui: { SearchBar } } as unknown as UnifiedSearchPublicPluginStart}
        locator={{ navigate } as unknown as DiscoverAppLocator}
        embeddable={
          {
            getStateTransfer: () => ({ navigateToWithEmbeddablePackages }),
          } as unknown as EmbeddableStart
        }
        application={
          {
            capabilities: { dashboard_v2: { showWriteControls: canWriteDashboards } },
          } as unknown as ApplicationStart
        }
        registerActionButtons={registerActionButtons}
      />
    </EuiProvider>
  );
  return { navigate };
};

const MockEmbeddableRenderer = ({ onApiAvailable }: { onApiAvailable?: (api: never) => void }) => {
  const { leftSide, saveToDashboardButton, onVisibleColumnsChange } = useSearchEmbeddableToolbar();

  useEffect(() => {
    if (exposeApi) {
      onApiAvailable?.(embeddableApi as never);
    }
  }, [onApiAvailable]);

  useEffect(() => {
    onVisibleColumnsChange?.(['event.action', '@timestamp']);
  }, [onVisibleColumnsChange]);

  return (
    <div data-test-subj="mockedSearchEmbeddable">
      {leftSide}
      {saveToDashboardButton}
    </div>
  );
};

describe('DiscoverSessionInline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    exposeApi = true;
    capturedOnSave = undefined;
    capturedSearchBarProps.length = 0;
    jest
      .mocked(EmbeddableRenderer)
      .mockImplementation(({ onApiAvailable }) => (
        <MockEmbeddableRenderer onApiAvailable={onApiAvailable} />
      ));
  });

  it('keeps a local time picker and opens Discover with the selected range', async () => {
    const user = userEvent.setup();
    const registerActionButtons = jest.fn();
    const { navigate } = renderInline({ registerActionButtons });

    expect(screen.getByTestId('discoverAgentBuilderSessionTimePicker')).toBeInTheDocument();
    expect(capturedSearchBarProps[0]).toEqual(
      expect.objectContaining({
        appName: 'agentBuilder',
        disableSubscribingToGlobalDataServices: true,
        showTimeWindowButtons: false,
      })
    );
    await waitFor(() => {
      expect(embeddableApi.setTimeRange).toHaveBeenCalledTimes(1);
    });

    await user.click(screen.getByRole('button', { name: 'change time' }));

    await waitFor(() => {
      expect(embeddableApi.setTimeRange).toHaveBeenCalledTimes(2);
      expect(embeddableApi.setTimeRange).toHaveBeenCalledWith({ from: 'now-15m', to: 'now' });
    });

    const actionButtons = registerActionButtons.mock.calls.at(-1)?.[0] as ActionButton[];
    actionButtons.find((button) => button.icon === 'discoverApp')?.handler();

    expect(navigate).toHaveBeenCalledWith(
      expect.objectContaining({
        query: { esql: 'FROM logs-* | LIMIT 100' },
        timeRange: { from: 'now-15m', to: 'now' },
      })
    );
  });

  it('does not register a Save action button', async () => {
    const registerActionButtons = jest.fn();
    renderInline({ registerActionButtons });

    await waitFor(() => {
      expect(screen.getByTestId('saveDiscoverTableToDashboardButton')).toBeInTheDocument();
    });

    const actionButtons = registerActionButtons.mock.calls.at(-1)?.[0] as ActionButton[];
    expect(actionButtons.find((button) => button.icon === 'save')).toBeUndefined();
    expect(actionButtons.find((button) => button.icon === 'discoverApp')).toBeDefined();
  });

  it('does not render the toolbar save control until the embeddable API is available', () => {
    exposeApi = false;
    renderInline();

    expect(screen.queryByTestId('saveDiscoverTableToDashboardButton')).not.toBeInTheDocument();
  });

  it('opens the save modal and transfers live table state without a time range', async () => {
    const user = userEvent.setup();
    renderInline();

    await user.click(await screen.findByTestId('saveDiscoverTableToDashboardButton'));

    expect(await screen.findByTestId('discoverAgentBuilderSaveModal')).toBeInTheDocument();

    await act(async () => {
      await capturedOnSave?.({
        dashboardId: 'dash-1',
        newTitle: 'Saved from chat',
        newDescription: 'Visible columns',
      });
    });

    expect(navigateToWithEmbeddablePackages).toHaveBeenCalledWith('dashboards', {
      path: '#/view/dash-1',
      state: [
        {
          type: SEARCH_EMBEDDABLE_TYPE,
          serializedState: {
            title: 'Saved from chat',
            description: 'Visible columns',
            tabs: [
              {
                data_source: {
                  type: AS_CODE_ESQL_DATA_SOURCE_TYPE,
                  query: 'FROM logs-* | LIMIT 100',
                },
                column_order: ['event.action', '@timestamp'],
                density: 'compact',
                row_height: 2,
                sort: [],
              },
            ],
          },
        },
      ],
    });
  });

  it('disables saving without dashboard write permissions', async () => {
    renderInline({ canWriteDashboards: false });

    const saveButton = await screen.findByTestId('saveDiscoverTableToDashboardButton');
    expect(saveButton).toBeDisabled();
    expect(screen.queryByTestId('discoverAgentBuilderSaveModal')).not.toBeInTheDocument();
  });

  it('clears action buttons on unmount', () => {
    const registerActionButtons = jest.fn();
    const { unmount } = render(
      <EuiProvider>
        <DiscoverSessionInline
          data={sessionData}
          unifiedSearch={{ ui: { SearchBar } } as unknown as UnifiedSearchPublicPluginStart}
          registerActionButtons={registerActionButtons}
        />
      </EuiProvider>
    );

    unmount();
    expect(registerActionButtons).toHaveBeenLastCalledWith([]);
  });
});
