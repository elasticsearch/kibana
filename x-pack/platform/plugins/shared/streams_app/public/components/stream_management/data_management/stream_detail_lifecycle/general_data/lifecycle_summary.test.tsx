/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { LifecycleSummary } from './lifecycle_summary';
import { Streams, type IngestStreamLifecycle } from '@kbn/streams-schema';
import { LifecycleAfterSaveProvider } from '../common/hooks/lifecycle_after_save';
import { LifecyclePreviewProvider } from '../common/hooks/lifecycle_preview';

// Mock the hooks
const mockFetch = jest.fn();
const mockStreamsRepositoryClient = { fetch: mockFetch };
const mockAddSuccess = jest.fn();
const mockAddError = jest.fn();

const mockKibana = {
  core: {
    application: {
      navigateToApp: jest.fn(),
    },
    notifications: {
      toasts: {
        addSuccess: mockAddSuccess,
        addError: mockAddError,
      },
    },
  },
  dependencies: {
    start: {
      streams: {
        streamsRepositoryClient: mockStreamsRepositoryClient,
      },
    },
  },
  isServerless: false,
};

jest.mock('../../../../../hooks/use_kibana', () => ({
  useKibana: () => mockKibana,
}));

import { useStreamsAppFetch } from '../../../../../hooks/use_streams_app_fetch';

jest.mock('../../../../../hooks/use_streams_app_fetch', () => ({
  useStreamsAppFetch: jest.fn(() => ({
    value: undefined,
    loading: false,
    refresh: jest.fn(),
  })),
}));

const mockUseStreamsAppFetch = useStreamsAppFetch as jest.Mock;

jest.mock('../hooks/use_ilm_phases_color_and_description', () => ({
  useIlmPhasesColorAndDescription: () => ({
    ilmPhases: {
      hot: { color: '#FF0000', hoverColor: '#FF3333', description: 'Hot phase' },
      warm: { color: '#FFA500', hoverColor: '#FFB833', description: 'Warm phase' },
      cold: { color: '#0000FF', hoverColor: '#3333FF', description: 'Cold phase' },
      frozen: { color: '#00FFFF', hoverColor: '#33FFFF', description: 'Frozen phase' },
      delete: { color: '#808080', hoverColor: '#999999', description: 'Delete phase' },
    },
  }),
}));

describe('LifecycleSummary', () => {
  const renderWithSync = (ui: React.ReactElement) => {
    return render(
      <LifecycleAfterSaveProvider>
        <LifecyclePreviewProvider>{ui}</LifecyclePreviewProvider>
      </LifecycleAfterSaveProvider>
    );
  };

  const createDslDefinition = (
    dataRetention?: string,
    downsample?: Array<{ after: string; fixed_interval: string }>,
    ingestLifecycle: IngestStreamLifecycle = { inherit: {} }
  ) =>
    ({
      stream: {
        name: 'test-stream',
        ingest: {
          lifecycle: ingestLifecycle,
          processing: { steps: [], updated_at: '2023-10-31' },
        },
      },
      privileges: {
        lifecycle: true,
      },
      effective_lifecycle: {
        dsl: {
          data_retention: dataRetention,
          downsample,
        },
      },
    } as unknown as Streams.ingest.all.GetResponse);

  const createWiredDslDefinition = ({
    name,
    isRoot,
  }: {
    name: string;
    isRoot: boolean;
  }): Streams.ingest.all.GetResponse =>
    ({
      stream: {
        type: 'wired' as const,
        name,
        description: '',
        updated_at: new Date().toISOString(),
        ingest: {
          lifecycle: { inherit: {} },
          processing: { steps: [], updated_at: '2023-10-31T00:00:00.000Z' },
          settings: {},
          failure_store: { inherit: {} },
          wired: {
            fields: {},
            routing: [],
          },
        },
      },
      privileges: {
        lifecycle: true,
        manage: true,
        monitor: true,
        simulate: true,
        text_structure: true,
        read_failure_store: true,
        manage_failure_store: true,
        view_index_metadata: true,
        create_snapshot_repository: true,
      },
      effective_lifecycle: {
        dsl: {
          data_retention: '60d',
          downsample: [{ after: '10d', fixed_interval: '1h' }],
        },
        from: isRoot ? name : 'logs',
      },
      effective_failure_store: {
        disabled: {},
        from: isRoot ? name : 'logs',
      },
      effective_settings: {},
      inherited_fields: {},
      data_stream_exists: true,
      dashboards: [],
      queries: [],
      rules: [],
    } as unknown as Streams.WiredStream.GetResponse);

  const createIlmDefinition = () =>
    ({
      stream: { name: 'test-stream' },
      privileges: {
        lifecycle: true,
      },
      effective_lifecycle: {
        ilm: {
          policy: 'test-policy',
        },
      },
    } as unknown as Streams.ingest.all.GetResponse);

  const createDisabledDefinition = () =>
    ({
      stream: { name: 'test-stream' },
      privileges: {
        lifecycle: true,
      },
      effective_lifecycle: { disabled: {} },
    } as Streams.ingest.all.GetResponse);

  beforeEach(() => {
    jest.clearAllMocks();
    mockKibana.isServerless = false;

    // Default: avoid noisy async errors from useSnapshotRepositories
    mockFetch.mockImplementation((endpoint: string) => {
      if (endpoint === 'GET /internal/streams/lifecycle/_snapshot_repositories') {
        return Promise.resolve({ repositories: [] });
      }
      return Promise.resolve(undefined);
    });

    // Default: avoid leaking per-test overrides
    mockUseStreamsAppFetch.mockReturnValue({
      value: undefined,
      loading: false,
      refresh: jest.fn(),
    });
  });

  describe('DSL Lifecycle', () => {
    it('should render DSL lifecycle with retention period', () => {
      const definition = createDslDefinition('30d');

      renderWithSync(<LifecycleSummary definition={definition} isMetricsStream />);

      expect(screen.getByTestId('dataLifecycleSummary-title')).toBeInTheDocument();
    });

    it('should show "Add downsample step" button and open the DSL flyout', async () => {
      const definition = createDslDefinition('60d', [{ after: '10d', fixed_interval: '1h' }]);

      renderWithSync(<LifecycleSummary definition={definition} isMetricsStream />);

      fireEvent.click(screen.getByTestId('dataLifecycleSummaryAddDownsampleStep'));
      await waitFor(() =>
        expect(screen.getByTestId('streamsEditDslStepsFlyoutFromSummary')).toBeInTheDocument()
      );
    });

    it('should disable "Add delete phase" when the DSL downsample flyout is open', async () => {
      const definition = createDslDefinition(undefined, [{ after: '1d', fixed_interval: '1d' }]);

      renderWithSync(
        <LifecycleSummary definition={definition} isMetricsStream onAddDeletePhase={jest.fn()} />
      );

      const addDeletePhaseButton = screen.getByTestId('dataLifecycleSummaryAddDeletePhase');
      expect(addDeletePhaseButton).toBeEnabled();

      fireEvent.click(screen.getByTestId('downsamplingPhase-1d-label'));
      await waitFor(() =>
        expect(screen.getByTestId('downsamplingPopover-step1-editButton')).toBeInTheDocument()
      );
      fireEvent.click(screen.getByTestId('downsamplingPopover-step1-editButton'));

      await waitFor(() =>
        expect(screen.getByTestId('streamsEditDslStepsFlyoutFromSummary')).toBeInTheDocument()
      );

      await waitFor(() => expect(addDeletePhaseButton).toBeDisabled());
    });

    it('should disable "Add delete phase" and show tooltip when delete phase already exists', async () => {
      const definition = createDslDefinition('30d');

      renderWithSync(
        <LifecycleSummary definition={definition} isMetricsStream onAddDeletePhase={jest.fn()} />
      );

      const addDeletePhaseButton = screen.getByTestId('dataLifecycleSummaryAddDeletePhase');
      expect(addDeletePhaseButton).toBeDisabled();

      fireEvent.mouseOver(addDeletePhaseButton.parentElement ?? addDeletePhaseButton);

      expect(await screen.findByText('Delete phase is already in use')).toBeInTheDocument();
    });

    it('should disable "Add downsample step" button when there are 10 steps', () => {
      const manySteps = Array.from({ length: 10 }, (_, i) => ({
        after: `${i + 1}d`,
        fixed_interval: '1h',
      }));
      const definition = createDslDefinition('60d', manySteps);

      renderWithSync(<LifecycleSummary definition={definition} isMetricsStream />);

      expect(screen.getByTestId('dataLifecycleSummaryAddDownsampleStep')).toBeDisabled();
    });

    it('should render DSL lifecycle with infinite retention', () => {
      const definition = createDslDefinition(undefined);

      renderWithSync(<LifecycleSummary definition={definition} isMetricsStream />);

      expect(screen.getByTestId('dataLifecycleTimeline-infinite')).toBeInTheDocument();
    });

    it('should render DSL lifecycle with downsampling when isMetricsStream is true', () => {
      const definition = createDslDefinition('60d', [
        { after: '10d', fixed_interval: '1h' },
        { after: '30d', fixed_interval: '1d' },
      ]);

      renderWithSync(<LifecycleSummary definition={definition} isMetricsStream />);

      expect(screen.getByTestId('downsamplingBar-label')).toBeInTheDocument();
    });

    it('should not render downsampling bar when isMetricsStream is false', () => {
      const definition = createDslDefinition('60d', [
        { after: '10d', fixed_interval: '1h' },
        { after: '30d', fixed_interval: '1d' },
      ]);

      renderWithSync(<LifecycleSummary definition={definition} isMetricsStream={false} />);

      expect(screen.queryByTestId('downsamplingBar-label')).not.toBeInTheDocument();
    });

    it('should only show override settings modal after saving DSL downsampling edits', async () => {
      const definition = createDslDefinition(
        '60d',
        [
          { after: '10d', fixed_interval: '1h' },
          { after: '30d', fixed_interval: '1d' },
        ],
        { inherit: {} }
      );

      renderWithSync(<LifecycleSummary definition={definition} isMetricsStream />);

      // Open the step popover then click edit (flyout should open, modal should not)
      fireEvent.click(screen.getByTestId('downsamplingPhase-1h-label'));
      await waitFor(() =>
        expect(screen.getByTestId('downsamplingPopover-step1-editButton')).toBeInTheDocument()
      );
      fireEvent.click(screen.getByTestId('downsamplingPopover-step1-editButton'));

      await waitFor(() =>
        expect(screen.getByTestId('streamsEditDslStepsFlyoutFromSummary')).toBeInTheDocument()
      );
      expect(screen.queryByTestId('overrideSettingsModal-overrideButton')).not.toBeInTheDocument();

      // Saving should prompt for override (since lifecycle is inherited)
      fireEvent.click(screen.getByTestId('streamsEditDslStepsFlyoutFromSummarySaveButton'));
      await waitFor(() =>
        expect(screen.getByTestId('overrideSettingsModal-overrideButton')).toBeInTheDocument()
      );

      // Confirm override triggers the ingest update API call
      fireEvent.click(screen.getByTestId('overrideSettingsModal-overrideButton'));
      await waitFor(() =>
        expect(mockFetch).toHaveBeenCalledWith(
          'PUT /api/streams/{name}/_ingest 2023-10-31',
          expect.any(Object)
        )
      );
    });

    it('should require override confirmation when removing a downsampling step and lifecycle is inherited', async () => {
      const definition = createDslDefinition('60d', [{ after: '10d', fixed_interval: '1h' }], {
        inherit: {},
      });

      renderWithSync(<LifecycleSummary definition={definition} isMetricsStream />);

      fireEvent.click(screen.getByTestId('downsamplingPhase-1h-label'));
      await waitFor(() =>
        expect(screen.getByTestId('downsamplingPopover-step1-removeButton')).toBeInTheDocument()
      );
      fireEvent.click(screen.getByTestId('downsamplingPopover-step1-removeButton'));

      await waitFor(() =>
        expect(screen.getByTestId('overrideSettingsModal-overrideButton')).toBeInTheDocument()
      );

      fireEvent.click(screen.getByTestId('overrideSettingsModal-overrideButton'));
      await waitFor(() =>
        expect(mockFetch).toHaveBeenCalledWith(
          'PUT /api/streams/{name}/_ingest 2023-10-31',
          expect.any(Object)
        )
      );
    });

    it('should remove a downsampling step immediately when lifecycle is not inherited', async () => {
      const definition = createDslDefinition('60d', [{ after: '10d', fixed_interval: '1h' }], {
        dsl: { data_retention: '60d', downsample: [{ after: '10d', fixed_interval: '1h' }] },
      });

      renderWithSync(<LifecycleSummary definition={definition} isMetricsStream />);

      fireEvent.click(screen.getByTestId('downsamplingPhase-1h-label'));
      await waitFor(() =>
        expect(screen.getByTestId('downsamplingPopover-step1-removeButton')).toBeInTheDocument()
      );
      fireEvent.click(screen.getByTestId('downsamplingPopover-step1-removeButton'));

      await waitFor(() =>
        expect(mockFetch).toHaveBeenCalledWith(
          'PUT /api/streams/{name}/_ingest 2023-10-31',
          expect.any(Object)
        )
      );
      expect(screen.queryByTestId('overrideSettingsModal-overrideButton')).not.toBeInTheDocument();
    });

    it('should not require override confirmation for wired non-root streams even when lifecycle is inherited', async () => {
      const definition = createWiredDslDefinition({ name: 'logs.wired-non-root', isRoot: false });

      expect(
        Streams.WiredStream.GetResponse.is(definition as unknown as Streams.WiredStream.GetResponse)
      ).toBe(true);

      renderWithSync(<LifecycleSummary definition={definition} isMetricsStream />);

      fireEvent.click(screen.getByTestId('downsamplingPhase-1h-label'));
      await waitFor(() =>
        expect(screen.getByTestId('downsamplingPopover-step1-removeButton')).toBeInTheDocument()
      );
      fireEvent.click(screen.getByTestId('downsamplingPopover-step1-removeButton'));

      await waitFor(() =>
        expect(mockFetch).toHaveBeenCalledWith(
          'PUT /api/streams/{name}/_ingest 2023-10-31',
          expect.any(Object)
        )
      );
      expect(screen.queryByTestId('overrideSettingsModal-overrideButton')).not.toBeInTheDocument();
    });

    it('shows the Inherited badge for wired non-root streams inheriting from parent', () => {
      const definition = createWiredDslDefinition({ name: 'logs.wired-non-root', isRoot: false });

      renderWithSync(<LifecycleSummary definition={definition} isMetricsStream />);

      expect(screen.getByText('Inherited')).toBeInTheDocument();
    });

    it('does not show the Inherited badge for wired root streams', () => {
      const definition = createWiredDslDefinition({ name: 'logs', isRoot: true });

      renderWithSync(<LifecycleSummary definition={definition} isMetricsStream />);

      expect(screen.queryByText('Inherited')).not.toBeInTheDocument();
    });

    it('does not show edit lifecycle method button for serverless wired root streams', async () => {
      mockKibana.isServerless = true;
      const definition = createWiredDslDefinition({ name: 'logs', isRoot: true });

      renderWithSync(
        <LifecycleSummary
          definition={definition}
          isMetricsStream
          onAddDeletePhase={jest.fn()}
          onEditSuccessfulLifecycle={jest.fn()}
        />
      );

      expect(
        screen.queryByTestId('dataLifecycleSummaryEditLifecycleMethod')
      ).not.toBeInTheDocument();
      expect(screen.getByTestId('dataLifecycleSummaryAddDeletePhase')).toBeInTheDocument();
    });

    it('should require override confirmation for wired root streams when lifecycle is inherited', async () => {
      const definition = createWiredDslDefinition({ name: 'logs', isRoot: true });

      expect(
        Streams.WiredStream.GetResponse.is(definition as unknown as Streams.WiredStream.GetResponse)
      ).toBe(true);

      renderWithSync(<LifecycleSummary definition={definition} isMetricsStream />);

      fireEvent.click(screen.getByTestId('downsamplingPhase-1h-label'));
      await waitFor(() =>
        expect(screen.getByTestId('downsamplingPopover-step1-removeButton')).toBeInTheDocument()
      );
      fireEvent.click(screen.getByTestId('downsamplingPopover-step1-removeButton'));

      await waitFor(() =>
        expect(screen.getByTestId('overrideSettingsModal-overrideButton')).toBeInTheDocument()
      );

      fireEvent.click(screen.getByTestId('overrideSettingsModal-overrideButton'));
      await waitFor(() =>
        expect(mockFetch).toHaveBeenCalledWith(
          'PUT /api/streams/{name}/_ingest 2023-10-31',
          expect.any(Object)
        )
      );
    });

    it('should render lifecycle summary for disabled lifecycle', () => {
      const definition = createDisabledDefinition();
      renderWithSync(<LifecycleSummary definition={definition} isMetricsStream />);

      expect(screen.getByTestId('dataLifecycleSummary-title')).toBeInTheDocument();
      expect(screen.getByTestId('lifecyclePhase-Hot-name')).toBeInTheDocument();
    });
  });

  describe('ILM Lifecycle', () => {
    it('should render ILM lifecycle', () => {
      const definition = createIlmDefinition();

      renderWithSync(<LifecycleSummary definition={definition} isMetricsStream />);

      expect(screen.getByTestId('dataLifecycleSummary-title')).toBeInTheDocument();
    });

    it('should show loading skeleton while fetching ILM stats', () => {
      mockUseStreamsAppFetch.mockReturnValue({
        value: undefined,
        loading: true,
        refresh: jest.fn(),
      });

      const definition = createIlmDefinition();

      renderWithSync(<LifecycleSummary definition={definition} isMetricsStream />);

      expect(screen.getByTestId('dataLifecycleSummary-skeleton')).toBeInTheDocument();
    });
    it('should open edit policy modal when removing an ILM phase with affected resources', async () => {
      const policies = [
        {
          name: 'test-policy',
          phases: { hot: { min_age: '0d' }, warm: { min_age: '30d' } },
          in_use_by: { data_streams: ['other-stream'], indices: [] },
        },
      ];
      const ilmStatsValue = {
        phases: {
          hot: { name: 'hot', min_age: '0ms', size_in_bytes: 1000, rollover: {} },
          warm: { name: 'warm', min_age: '30d', size_in_bytes: 1000 },
          delete: { name: 'delete', min_age: '60d' },
        },
      };

      mockUseStreamsAppFetch.mockReturnValue({
        value: ilmStatsValue,
        loading: false,
        refresh: jest.fn(),
      });

      mockFetch.mockImplementation((endpoint: string) => {
        if (endpoint === 'GET /internal/streams/lifecycle/_policies') {
          return Promise.resolve(policies);
        }
        if (endpoint === 'GET /internal/streams/lifecycle/_snapshot_repositories') {
          return Promise.resolve({ repositories: [] });
        }
        return Promise.resolve(undefined);
      });

      const definition = createIlmDefinition();

      renderWithSync(<LifecycleSummary definition={definition} isMetricsStream />);

      await waitFor(() => {
        expect(screen.getByTestId('lifecyclePhase-warm-name')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('lifecyclePhase-warm-button'));

      // Wait for the popover to open and remove button to appear
      await waitFor(() => {
        expect(screen.getByTestId('lifecyclePhase-warm-removeButton')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('lifecyclePhase-warm-removeButton'));

      // Wait for async openDeleteModal -> fetchPolicies -> modal render
      await waitFor(() => {
        expect(screen.getByTestId('editPolicyModalTitle')).toBeInTheDocument();
      });
    });

    it('should save directly when removing an ILM phase with no affected resources', async () => {
      const policies = [
        {
          name: 'test-policy',
          phases: { hot: { min_age: '0d' }, warm: { min_age: '30d' } },
          in_use_by: { data_streams: ['test-stream'], indices: [] },
        },
      ];
      const ilmStatsValue = {
        phases: {
          hot: { name: 'hot', min_age: '0ms', size_in_bytes: 1000, rollover: {} },
          warm: { name: 'warm', min_age: '30d', size_in_bytes: 1000 },
          delete: { name: 'delete', min_age: '60d' },
        },
      };

      mockUseStreamsAppFetch.mockReturnValue({
        value: ilmStatsValue,
        loading: false,
        refresh: jest.fn(),
      });

      mockFetch.mockImplementation((endpoint: string) => {
        if (endpoint === 'GET /internal/streams/lifecycle/_policies') {
          return Promise.resolve(policies);
        }
        if (endpoint === 'GET /internal/streams/lifecycle/_snapshot_repositories') {
          return Promise.resolve({ repositories: [] });
        }
        return Promise.resolve(undefined);
      });

      const definition = createIlmDefinition();

      renderWithSync(<LifecycleSummary definition={definition} isMetricsStream />);

      await waitFor(() => {
        expect(screen.getByTestId('lifecyclePhase-warm-name')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('lifecyclePhase-warm-button'));

      // Wait for the popover to open and remove button to appear
      await waitFor(() => {
        expect(screen.getByTestId('lifecyclePhase-warm-removeButton')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('lifecyclePhase-warm-removeButton'));

      // Wait for async openDeleteModal -> fetchPolicies -> applyOverwrite -> saveIlmPolicy
      await waitFor(() =>
        expect(mockFetch).toHaveBeenCalledWith(
          'POST /internal/streams/lifecycle/_policy',
          expect.any(Object)
        )
      );

      // Modal should not be shown since there are no affected resources
      expect(screen.queryByTestId('editPolicyModalTitle')).not.toBeInTheDocument();
    });

    it('should render ILM lifecycle with downsampling when isMetricsStream is true', () => {
      const ilmStatsValue = {
        phases: {
          hot: {
            name: 'hot',
            min_age: '0ms',
            size_in_bytes: 1000,
            rollover: {},
            downsample: { after: '10d', fixed_interval: '1h' },
          },
          warm: { name: 'warm', min_age: '30d', size_in_bytes: 1000 },
          delete: { name: 'delete', min_age: '60d' },
        },
      };

      mockUseStreamsAppFetch.mockReturnValue({
        value: ilmStatsValue,
        loading: false,
        refresh: jest.fn(),
      });

      const definition = createIlmDefinition();

      renderWithSync(<LifecycleSummary definition={definition} isMetricsStream />);

      expect(screen.getByTestId('downsamplingBar-label')).toBeInTheDocument();
    });

    it('should not render ILM downsampling bar when isMetricsStream is false', () => {
      const ilmStatsValue = {
        phases: {
          hot: {
            name: 'hot',
            min_age: '0ms',
            size_in_bytes: 1000,
            rollover: {},
            downsample: { after: '10d', fixed_interval: '1h' },
          },
          warm: { name: 'warm', min_age: '30d', size_in_bytes: 1000 },
          delete: { name: 'delete', min_age: '60d' },
        },
      };

      mockUseStreamsAppFetch.mockReturnValue({
        value: ilmStatsValue,
        loading: false,
        refresh: jest.fn(),
      });

      const definition = createIlmDefinition();

      renderWithSync(<LifecycleSummary definition={definition} isMetricsStream={false} />);

      expect(screen.queryByTestId('downsamplingBar-label')).not.toBeInTheDocument();
    });
  });
});
