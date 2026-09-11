/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiProvider } from '@elastic/eui';
import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { I18nProvider } from '@kbn/i18n-react';
import { ML_PAGES } from '@kbn/ml-common-types/locator_ml_pages';
import type { ActionButton } from '@kbn/agent-builder-browser/attachments';
import type { AnomalySwimLaneEmbeddableState } from '@kbn/ml-server-schemas/embeddables/anomaly_swimlane';
import type { AnomalyChartsEmbeddableState } from '@kbn/ml-server-schemas/embeddables/anomaly_charts';
import type { SingleMetricViewerEmbeddableState } from '@kbn/ml-server-schemas/embeddables/single_metric_viewer';
import {
  InlineAnomalyCharts,
  InlineSingleMetricViewer,
  InlineSwimLane,
  type InlineMlChartServices,
} from './inline_ml_charts';

const mockNavigateToWithEmbeddablePackages = jest.fn();

jest.mock('@kbn/embeddable-plugin/public', () => ({
  EmbeddableRenderer: () => <div data-test-subj="mockMlEmbeddable" />,
}));

jest.mock('@kbn/presentation-util-plugin/public', () => ({
  SavedObjectSaveModalDashboard: ({
    onSave,
  }: {
    onSave: (args: { dashboardId: string; newTitle: string; newDescription: string }) => void;
  }) => (
    <button
      type="button"
      onClick={() =>
        onSave({ dashboardId: 'new', newTitle: 'Saved chart', newDescription: 'desc' })
      }
    >
      confirm-save
    </button>
  ),
}));

const renderWithProviders = (ui: React.ReactElement) =>
  render(ui, {
    wrapper: ({ children }) => (
      <EuiProvider>
        <I18nProvider>{children}</I18nProvider>
      </EuiProvider>
    ),
  });

const createServices = (overrides?: Partial<InlineMlChartServices>): InlineMlChartServices => ({
  application: {
    capabilities: { dashboard_v2: { showWriteControls: true } },
  } as unknown as InlineMlChartServices['application'],
  unifiedSearch: {
    ui: {
      SearchBar: () => <div data-test-subj="mockSearchBar" />,
    },
  } as unknown as InlineMlChartServices['unifiedSearch'],
  embeddable: {
    getStateTransfer: () => ({
      navigateToWithEmbeddablePackages: mockNavigateToWithEmbeddablePackages,
    }),
  } as unknown as InlineMlChartServices['embeddable'],
  locator: {
    getRedirectUrl: jest.fn((params: { page: string }) => `/app/ml/${params.page}`),
  } as unknown as InlineMlChartServices['locator'],
  ...overrides,
});

const getLastRegisteredButtons = (registerActionButtons: jest.Mock): ActionButton[] => {
  const { calls } = registerActionButtons.mock;
  return calls[calls.length - 1]?.[0] ?? [];
};

describe('inline ML chart visualizations', () => {
  beforeEach(() => {
    mockNavigateToWithEmbeddablePackages.mockReset();
  });

  it('registers View in Anomaly Explorer and Save to dashboard for swim lanes', () => {
    const registerActionButtons = jest.fn();
    const services = createServices();

    renderWithProviders(
      <InlineSwimLane
        attachment={{
          id: 'att-1',
          type: 'ml.anomaly_swimlane',
          data: {
            job_ids: ['job-1'],
            swimlane_type: 'viewBy',
            view_by: 'host.name',
            time_range: { from: 'now-7d', to: 'now' },
          } as AnomalySwimLaneEmbeddableState,
        }}
        isSidebar={false}
        services={services}
        registerActionButtons={registerActionButtons}
      />
    );

    expect(screen.getByTestId('agentBuilderMlVisualization')).toBeInTheDocument();
    expect(screen.getByTestId('mockSearchBar')).toBeInTheDocument();

    const buttons = getLastRegisteredButtons(registerActionButtons);
    expect(buttons.map((button) => button.label)).toEqual([
      'View in Anomaly Explorer',
      'Save to dashboard',
    ]);
    expect(buttons[0].href).toBe(`/app/ml/${ML_PAGES.ANOMALY_EXPLORER}`);
    expect(services.locator?.getRedirectUrl).toHaveBeenCalledWith(
      expect.objectContaining({
        page: ML_PAGES.ANOMALY_EXPLORER,
        pageState: expect.objectContaining({
          jobIds: ['job-1'],
          mlExplorerSwimlane: { viewByFieldName: 'host.name' },
        }),
      })
    );
  });

  it('registers View in Single Metric Viewer for the single metric viewer', () => {
    const registerActionButtons = jest.fn();

    renderWithProviders(
      <InlineSingleMetricViewer
        attachment={{
          id: 'att-2',
          type: 'ml.single_metric_viewer',
          data: {
            job_ids: ['job-1'],
            selected_detector_index: 0,
            selected_entities: { 'host.name': 'web-01' },
          } as SingleMetricViewerEmbeddableState,
        }}
        isSidebar={false}
        services={createServices()}
        registerActionButtons={registerActionButtons}
      />
    );

    const buttons = getLastRegisteredButtons(registerActionButtons);
    expect(buttons.map((button) => button.label)).toEqual([
      'View in Single Metric Viewer',
      'Save to dashboard',
    ]);
  });

  it('saves anomaly charts to a dashboard without a pinned time range', async () => {
    const user = userEvent.setup();
    const registerActionButtons = jest.fn();

    renderWithProviders(
      <InlineAnomalyCharts
        attachment={{
          id: 'att-3',
          type: 'ml.anomaly_charts',
          data: {
            job_ids: ['job-1'],
            time_range: { from: 'now-7d', to: 'now' },
          } as AnomalyChartsEmbeddableState,
        }}
        isSidebar={false}
        services={createServices()}
        registerActionButtons={registerActionButtons}
      />
    );

    const saveButton = getLastRegisteredButtons(registerActionButtons).find(
      (button) => button.label === 'Save to dashboard'
    );
    await act(async () => {
      await saveButton?.handler();
    });
    await user.click(screen.getByText('confirm-save'));

    expect(mockNavigateToWithEmbeddablePackages).toHaveBeenCalledWith(
      'dashboards',
      expect.objectContaining({
        path: '#/create',
        state: [
          expect.objectContaining({
            type: 'ml_anomaly_charts',
            serializedState: expect.objectContaining({
              job_ids: ['job-1'],
              title: 'Saved chart',
              description: 'desc',
            }),
          }),
        ],
      })
    );
    expect(
      mockNavigateToWithEmbeddablePackages.mock.calls[0][1].state[0].serializedState
    ).not.toHaveProperty('time_range');
  });

  it('disables Save to dashboard without dashboard write permissions', () => {
    const registerActionButtons = jest.fn();

    renderWithProviders(
      <InlineSwimLane
        attachment={{
          id: 'att-4',
          type: 'ml.anomaly_swimlane',
          data: {
            job_ids: ['job-1'],
            swimlane_type: 'overall',
          } as AnomalySwimLaneEmbeddableState,
        }}
        isSidebar={false}
        services={createServices({
          application: {
            capabilities: { dashboard_v2: { showWriteControls: false } },
          } as unknown as InlineMlChartServices['application'],
        })}
        registerActionButtons={registerActionButtons}
      />
    );

    const saveButton = getLastRegisteredButtons(registerActionButtons).find(
      (button) => button.label === 'Save to dashboard'
    );
    expect(saveButton?.disabled).toBe(true);
  });
});
