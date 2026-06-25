/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useLayoutEffect, useRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { Streams } from '@kbn/streams-schema';
import { RetentionCard } from './retention_card';
import { LifecycleAfterSaveProvider } from '../../common/hooks/lifecycle_after_save';
import { useLifecycleAfterSave } from '../../common/hooks/lifecycle_after_save';
import type { LifecyclePreviewState } from '../../common/hooks/lifecycle_preview';
import {
  LifecyclePreviewProvider,
  useLifecyclePreview,
} from '../../common/hooks/lifecycle_preview';

import { useStreamsAppFetch } from '../../../../../../hooks/use_streams_app_fetch';

jest.mock('../../../../../../hooks/use_kibana', () => ({
  useKibana: () => ({
    dependencies: {
      start: {
        streams: {
          streamsRepositoryClient: { fetch: jest.fn() },
        },
      },
    },
  }),
}));

jest.mock('../../../../../../hooks/use_streams_app_fetch', () => ({
  useStreamsAppFetch: jest.fn(() => ({
    value: undefined,
    loading: false,
    refresh: jest.fn(),
  })),
}));

const mockUseStreamsAppFetch = useStreamsAppFetch as unknown as jest.Mock;

const AfterSaveTrigger = () => {
  const { notifyAfterSave } = useLifecycleAfterSave();
  return (
    <button type="button" data-test-subj="afterSaveTrigger" onClick={notifyAfterSave}>
      trigger
    </button>
  );
};

const PreviewInitializer = ({ initialState }: { initialState: Partial<LifecyclePreviewState> }) => {
  const {
    setIsActive,
    setRetentionPeriod,
    setDataPhasesCount,
    setDownsampleStepsCount,
    setHasUnsavedChanges,
  } = useLifecyclePreview();
  const didInit = useRef(false);

  useLayoutEffect(() => {
    if (didInit.current) return;
    didInit.current = true;

    if (initialState.isActive !== undefined) setIsActive(initialState.isActive);
    if (initialState.retentionPeriod !== undefined)
      setRetentionPeriod(initialState.retentionPeriod);
    if (initialState.dataPhasesCount !== undefined)
      setDataPhasesCount(initialState.dataPhasesCount);
    if (initialState.downsampleStepsCount !== undefined)
      setDownsampleStepsCount(initialState.downsampleStepsCount);
    if (initialState.hasUnsavedChanges !== undefined)
      setHasUnsavedChanges(initialState.hasUnsavedChanges);
  }, [
    initialState.dataPhasesCount,
    initialState.downsampleStepsCount,
    initialState.hasUnsavedChanges,
    initialState.isActive,
    initialState.retentionPeriod,
    setDataPhasesCount,
    setDownsampleStepsCount,
    setHasUnsavedChanges,
    setIsActive,
    setRetentionPeriod,
  ]);

  return null;
};

describe('RetentionCard', () => {
  const renderWithSync = (
    ui: React.ReactElement,
    initialState?: Partial<LifecyclePreviewState>
  ) => {
    return render(
      <LifecycleAfterSaveProvider>
        <LifecyclePreviewProvider>
          {initialState ? <PreviewInitializer initialState={initialState} /> : null}
          {ui}
        </LifecyclePreviewProvider>
      </LifecycleAfterSaveProvider>
    );
  };

  const createMockDefinition = (
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    effectiveLifecycle: any,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ingestLifecycle: any = { inherit: {} },
    streamName: string = 'logs-test',
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    privileges: any = { lifecycle: true },
    indexMode?: 'time_series' | 'standard'
  ): Streams.ingest.all.GetResponse =>
    ({
      stream: {
        name: streamName,
        ingest: {
          lifecycle: ingestLifecycle,
        },
      },
      effective_lifecycle: effectiveLifecycle,
      index_mode: indexMode,
      privileges,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any);

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseStreamsAppFetch.mockReturnValue({
      value: undefined,
      loading: false,
      refresh: jest.fn(),
    });
  });

  describe('ILM lifecycle', () => {
    it('renders em dash when ILM stats are unavailable', () => {
      const definition = createMockDefinition({ ilm: { policy: 'my-ilm-policy' } });

      renderWithSync(<RetentionCard definition={definition} />);

      expect(screen.getByTestId('retention-metric')).toHaveTextContent('—');
    });

    it('refetches ILM _stats after after-save notification', async () => {
      const refresh = jest.fn();
      mockUseStreamsAppFetch.mockReturnValue({
        value: {
          phases: {
            hot: { name: 'hot', min_age: '0ms', size_in_bytes: 1000, rollover: {} },
            delete: { name: 'delete', min_age: '60d' },
          },
        },
        loading: false,
        refresh,
      });

      const definition = createMockDefinition({ ilm: { policy: 'my-ilm-policy' } });

      renderWithSync(
        <>
          <RetentionCard definition={definition} />
          <AfterSaveTrigger />
        </>
      );

      expect(refresh).not.toHaveBeenCalled();

      await userEvent.click(screen.getByTestId('afterSaveTrigger'));

      expect(refresh).toHaveBeenCalledTimes(1);
    });

    it('renders ILM retention + phase count from lifecycle stats', () => {
      mockUseStreamsAppFetch.mockReturnValue({
        value: {
          phases: {
            hot: { name: 'hot', min_age: '0ms', size_in_bytes: 1000, rollover: {} },
            delete: { name: 'delete', min_age: '60d' },
          },
        },
        loading: false,
        refresh: jest.fn(),
      });

      const definition = createMockDefinition({
        ilm: {
          policy: 'my-ilm-policy',
        },
      });

      renderWithSync(<RetentionCard definition={definition} />);

      expect(screen.getByTestId('retentionCard-title')).toBeInTheDocument();
      expect(screen.getByTestId('retention-metric')).toHaveTextContent('60 days');
      expect(screen.getByTestId('retention-metric-subtitle')).toHaveTextContent('2 data phases');
    });

    it('updates phase count and metric using preview phases when editing', () => {
      const definition = createMockDefinition(
        {
          ilm: {
            policy: 'my-ilm-policy',
          },
        },
        { inherit: {} },
        'logs-test',
        { lifecycle: true },
        'time_series'
      );

      renderWithSync(<RetentionCard definition={definition} />, {
        isActive: true,
        retentionPeriod: '60d',
        dataPhasesCount: 3,
        downsampleStepsCount: 1,
      });

      expect(screen.getByTestId('retention-metric')).toHaveTextContent('60 days');
      expect(screen.getByTestId('retention-metric-subtitle')).toHaveTextContent('3 data phases');
      expect(screen.getByTestId('retention-metric-subtitle')).toHaveTextContent(
        '1 downsample step'
      );
    });

    it('does not show inherited/override labels', () => {
      mockUseStreamsAppFetch.mockReturnValue({
        value: {
          phases: {
            hot: { name: 'hot', min_age: '0ms', size_in_bytes: 1000, rollover: {} },
          },
        },
        loading: false,
        refresh: jest.fn(),
      });

      const definition: Streams.WiredStream.GetResponse = {
        stream: {
          type: 'wired',
          name: 'logs-test.child',
          description: '',
          updated_at: new Date().toISOString(),
          ingest: {
            lifecycle: { inherit: {} },
            processing: { steps: [], updated_at: new Date().toISOString() },
            settings: {},
            wired: { fields: {}, routing: [] },
            failure_store: { inherit: {} },
          },
        },
        effective_lifecycle: { ilm: { policy: 'test-policy' }, from: 'logs-test' },
        effective_settings: {},
        data_stream_exists: true,
        inherited_fields: {},
        dashboards: [],
        rules: [],
        queries: [],
        privileges: {
          manage: true,
          monitor: true,
          lifecycle: true,
          simulate: true,
          text_structure: true,
          read_failure_store: true,
          manage_failure_store: true,
          view_index_metadata: true,
          create_snapshot_repository: true,
        },
        effective_failure_store: {
          lifecycle: { enabled: { is_default_retention: true } },
          from: 'logs-test',
        },
      };

      renderWithSync(<RetentionCard definition={definition} />);

      const subtitle = screen.getByTestId('retention-metric-subtitle');
      expect(subtitle).not.toHaveTextContent('Inherit from');
      expect(subtitle).not.toHaveTextContent('Override');
    });
  });

  describe('DSL lifecycle', () => {
    it('does not refetch ILM _stats after after-save notification', async () => {
      const refresh = jest.fn();
      mockUseStreamsAppFetch.mockReturnValue({
        value: undefined,
        loading: false,
        refresh,
      });

      const definition = createMockDefinition(
        { dsl: { data_retention: '30d' } },
        { inherit: {} },
        'logs-test',
        { lifecycle: true },
        'time_series'
      );

      renderWithSync(
        <>
          <RetentionCard definition={definition} />
          <AfterSaveTrigger />
        </>
      );

      await userEvent.click(screen.getByTestId('afterSaveTrigger'));
      expect(refresh).not.toHaveBeenCalled();
    });

    it('renders custom retention period in days', () => {
      const definition = createMockDefinition(
        {
          dsl: {
            data_retention: '30d',
            downsample: [{ after: '10d', fixed_interval: '1h' }],
          },
        },
        { inherit: {} },
        'logs-test',
        { lifecycle: true },
        'time_series'
      );

      renderWithSync(<RetentionCard definition={definition} />);

      expect(screen.getByTestId('retentionCard-title')).toBeInTheDocument();
      expect(screen.getByTestId('retention-metric')).toHaveTextContent('30 days');
      expect(screen.getByTestId('retention-metric-subtitle')).toHaveTextContent('2 data phases');
      expect(screen.getByTestId('retention-metric-subtitle')).toHaveTextContent(
        '1 downsample step'
      );
    });

    it('renders indefinite symbol when no data_retention', () => {
      const definition = createMockDefinition(
        { dsl: {} },
        { inherit: {} },
        'logs-test',
        { lifecycle: true },
        'time_series'
      );

      renderWithSync(<RetentionCard definition={definition} />);

      expect(screen.getByTestId('retention-metric')).toHaveTextContent('∞');
      expect(screen.getByTestId('retention-metric-subtitle')).toHaveTextContent('1 data phase');
    });

    it('uses preview downsample step count while editing DSL downsampling', () => {
      const definition = createMockDefinition(
        { dsl: {} },
        { inherit: {} },
        'logs-test',
        { lifecycle: true },
        'time_series'
      );

      renderWithSync(<RetentionCard definition={definition} />, {
        isActive: true,
        retentionPeriod: null,
        dataPhasesCount: 1,
        downsampleStepsCount: 2,
      });

      expect(screen.getByTestId('retention-metric-subtitle')).toHaveTextContent(
        '2 downsample steps'
      );
    });
  });

  describe('Disabled lifecycle', () => {
    it('renders disabled state with infinity symbol', () => {
      const definition = createMockDefinition({
        disabled: {},
      });

      renderWithSync(<RetentionCard definition={definition} />);

      expect(screen.getByTestId('retention-metric')).toHaveTextContent('∞');
      expect(screen.getByTestId('retention-metric-subtitle')).toHaveTextContent('1 data phase');
    });
  });

  describe('Unknown lifecycle', () => {
    it('renders em dash for unknown lifecycle', () => {
      const definition = createMockDefinition({
        unknown: {},
      });

      renderWithSync(<RetentionCard definition={definition} />);

      expect(screen.getByTestId('retention-metric')).toHaveTextContent('—');
    });
  });
});
