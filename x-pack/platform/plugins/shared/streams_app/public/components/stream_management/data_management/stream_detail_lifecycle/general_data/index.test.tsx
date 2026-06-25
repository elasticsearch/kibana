/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { StreamDetailGeneralData } from '.';
import { useUnsavedChangesPrompt } from '@kbn/unsaved-changes-prompt';
import type { Streams } from '@kbn/streams-schema';
import type { useDataStreamStats } from '../hooks/use_data_stream_stats';

let mockFlyoutOpen = false;
let mockFlyoutHasUnsavedChanges = false;

interface MockLifecycleSummaryProps {
  onFlyoutOpenChange?: (isOpen: boolean) => void;
  onFlyoutUnsavedChangesChange?: (hasUnsavedChanges: boolean) => void;
}

let mockLifecycleSummaryProps: MockLifecycleSummaryProps | undefined;

jest.mock('@kbn/unsaved-changes-prompt', () => ({
  useUnsavedChangesPrompt: jest.fn(),
}));

jest.mock('../../../../../hooks/use_kibana', () => ({
  useKibana: () => ({
    core: {
      notifications: { toasts: { addSuccess: jest.fn(), addError: jest.fn() } },
      http: {},
      overlays: { openConfirm: jest.fn() },
      application: { navigateToUrl: jest.fn() },
    },
    appParams: { history: {} },
    dependencies: {
      start: {
        streams: {
          streamsRepositoryClient: { fetch: jest.fn() },
        },
        share: {
          url: {
            locators: {
              get: jest.fn(() => ({
                getUrl: jest.fn(async () => '/mock-index-template-url'),
              })),
            },
          },
        },
      },
    },
    services: { telemetryClient: { trackRetentionChanged: jest.fn() } },
  }),
}));

jest.mock('../../../../../hooks/use_streams_app_router', () => ({
  useStreamsAppRouter: () => ({ link: jest.fn(() => '/mock-router-link') }),
}));

jest.mock('../../../../../hooks/use_timefilter', () => ({
  useTimefilter: () => ({
    timeState: {},
    timeState$: { subscribe: () => ({ unsubscribe: () => {} }) },
  }),
}));

jest.mock('@kbn/react-hooks', () => ({
  useAbortController: () => ({ signal: undefined }),
  useAbortableAsync: () => ({
    value: undefined,
    loading: false,
    error: undefined,
    refresh: () => {},
  }),
}));

jest.mock('../common/section_panel', () => ({
  SectionPanel: ({
    children,
    topCard,
    bottomCard,
  }: {
    children: React.ReactNode;
    topCard?: React.ReactNode;
    bottomCard?: React.ReactNode;
  }) => (
    <div>
      {topCard}
      {children}
      {bottomCard}
    </div>
  ),
}));

jest.mock('./cards/retention_card', () => ({
  RetentionCard: () => <div data-test-subj="retentionCard" />,
}));

jest.mock('./cards/storage_size_card', () => ({
  StorageSizeCard: () => <div data-test-subj="storageSizeCard" />,
}));

jest.mock('./cards/ingestion_card', () => ({
  IngestionCard: () => <div data-test-subj="ingestionCard" />,
}));

jest.mock('./ingestion_rate', () => ({
  IngestionRate: () => <div data-test-subj="ingestionRate" />,
}));

jest.mock('./lifecycle_summary', () => ({
  LifecycleSummary: () => {
    // Keep this unit test focused on StreamDetailGeneralData + unsaved prompt wiring.
    // We emulate the lifecycle flyout updating the shared preview state.
    const { useLifecyclePreview } = jest.requireActual(
      '../common/hooks/lifecycle_preview'
    ) as typeof import('../common/hooks/lifecycle_preview');
    const preview = useLifecyclePreview();

    mockLifecycleSummaryProps = {
      onFlyoutOpenChange: (isOpen: boolean) => {
        preview.setIsActive(isOpen);
        if (!isOpen) {
          preview.setHasUnsavedChanges(false);
        }
      },
      onFlyoutUnsavedChangesChange: (hasUnsavedChanges: boolean) => {
        preview.setHasUnsavedChanges(hasUnsavedChanges);
      },
    };

    return <div data-test-subj="mockLifecycleSummary" />;
  },
}));

const mockUseUnsavedChangesPrompt = useUnsavedChangesPrompt as unknown as jest.Mock;

const getPromptHasUnsavedChanges = (): boolean => {
  const lastCall = mockUseUnsavedChangesPrompt.mock.calls.at(-1)?.[0];
  return Boolean(lastCall?.hasUnsavedChanges);
};

describe('StreamDetailGeneralData unsaved changes prompt', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFlyoutOpen = false;
    mockFlyoutHasUnsavedChanges = false;
    mockLifecycleSummaryProps = undefined;
  });

  const definition = {
    stream: {
      name: 'test-stream',
      ingest: { lifecycle: { inherit: {} }, processing: { steps: [], updated_at: '2023-10-31' } },
    },
    privileges: { lifecycle: true, monitor: true, create_snapshot_repository: false },
    effective_lifecycle: { ilm: { policy: 'test-policy' } },
  } as unknown as Streams.ingest.all.GetResponse;

  const data: ReturnType<typeof useDataStreamStats> = {
    stats: undefined,
    error: undefined,
    isLoading: false,
    refresh: jest.fn(),
    timeSeriesCountLoading: false,
    timeSeriesCountError: undefined,
  };

  it('does not mark unsaved changes just because flyout is open', async () => {
    mockFlyoutOpen = true;
    mockFlyoutHasUnsavedChanges = false;

    render(
      <StreamDetailGeneralData definition={definition} refreshDefinition={jest.fn()} data={data} />
    );

    act(() => {
      mockLifecycleSummaryProps?.onFlyoutOpenChange?.(mockFlyoutOpen);
      mockLifecycleSummaryProps?.onFlyoutUnsavedChangesChange?.(mockFlyoutHasUnsavedChanges);
    });

    await waitFor(() => {
      expect(getPromptHasUnsavedChanges()).toBe(false);
    });
  });

  it('marks unsaved changes when flyout reports edits', async () => {
    mockFlyoutOpen = true;
    mockFlyoutHasUnsavedChanges = true;

    render(
      <StreamDetailGeneralData definition={definition} refreshDefinition={jest.fn()} data={data} />
    );

    act(() => {
      mockLifecycleSummaryProps?.onFlyoutOpenChange?.(mockFlyoutOpen);
      mockLifecycleSummaryProps?.onFlyoutUnsavedChangesChange?.(mockFlyoutHasUnsavedChanges);
    });

    await waitFor(() => {
      expect(getPromptHasUnsavedChanges()).toBe(true);
    });
  });
});
