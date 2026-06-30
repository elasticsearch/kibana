/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import type { EnhancedFailureStoreStats } from '../hooks/use_data_stream_stats';
import type { useFailureStoreConfig } from '../hooks/use_failure_store_config';
import { FailureStoreSummary } from './failure_store_summary';
import { LifecyclePreviewProvider } from '../common/hooks/lifecycle_preview';

jest.mock('../../../../../hooks/use_kibana');

import { useKibana } from '../../../../../hooks/use_kibana';

const mockUseKibana = useKibana as jest.MockedFunction<typeof useKibana>;

jest.mock('../hooks/use_ilm_phases_color_and_description', () => ({
  useIlmPhasesColorAndDescription: () => ({
    ilmPhases: {
      hot: { color: '#FF0000', description: 'Hot phase' },
      warm: { color: '#FFA500', description: 'Warm phase' },
      cold: { color: '#0000FF', description: 'Cold phase' },
      frozen: { color: '#00FFFF', description: 'Frozen phase' },
      delete: { color: '#808080', description: 'Delete phase' },
    },
  }),
}));

describe('FailureStoreSummary', () => {
  const createMockFailureStoreConfig = (
    overrides: Partial<ReturnType<typeof useFailureStoreConfig>> = {}
  ): ReturnType<typeof useFailureStoreConfig> => ({
    failureStoreEnabled: true,
    retentionDisabled: false,
    customRetentionPeriod: undefined,
    defaultRetentionPeriod: '7d',
    clusterDefaultRetention: undefined,
    inheritOptions: {
      canShowInherit: false,
      isWired: false,
      isCurrentlyInherited: false,
    },
    ...overrides,
  });

  const createMockStats = (size?: number): EnhancedFailureStoreStats | undefined =>
    size !== undefined ? ({ size } as EnhancedFailureStoreStats) : undefined;

  describe('Failure Store - Serverless', () => {
    beforeEach(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockUseKibana.mockReturnValue({ isServerless: true } as any);
    });

    it('should render "Failed ingest" label', () => {
      const stats = createMockStats(100000);
      const failureStoreConfig = createMockFailureStoreConfig();

      render(
        <LifecyclePreviewProvider>
          <FailureStoreSummary
            stats={stats}
            failureStoreConfig={failureStoreConfig}
            canManageLifecycle
          />
        </LifecyclePreviewProvider>
      );

      expect(
        screen.getByTestId('failureStore-lifecyclePhase-Failed ingest-name')
      ).toBeInTheDocument();
    });

    it('should display storage size', () => {
      const stats = createMockStats(100000);
      const failureStoreConfig = createMockFailureStoreConfig();

      render(
        <LifecyclePreviewProvider>
          <FailureStoreSummary
            stats={stats}
            failureStoreConfig={failureStoreConfig}
            canManageLifecycle
          />
        </LifecyclePreviewProvider>
      );

      expect(
        screen.getByTestId('failureStore-lifecyclePhase-Failed ingest-size')
      ).toHaveTextContent(/100\.0\s?KB/);
    });

    it('should render delete icon when retention period is set', () => {
      const stats = createMockStats(100000);
      const failureStoreConfig = createMockFailureStoreConfig({ defaultRetentionPeriod: '7d' });

      render(
        <LifecyclePreviewProvider>
          <FailureStoreSummary
            stats={stats}
            failureStoreConfig={failureStoreConfig}
            canManageLifecycle
          />
        </LifecyclePreviewProvider>
      );

      expect(screen.getByTestId('failureStore-dataLifecycle-delete-icon')).toBeInTheDocument();
    });

    it('should use custom retention period when set', () => {
      const stats = createMockStats(100000);
      const failureStoreConfig = createMockFailureStoreConfig({
        customRetentionPeriod: '14d',
        defaultRetentionPeriod: '7d',
      });

      render(
        <LifecyclePreviewProvider>
          <FailureStoreSummary
            stats={stats}
            failureStoreConfig={failureStoreConfig}
            canManageLifecycle
          />
        </LifecyclePreviewProvider>
      );

      expect(screen.getByTestId('failureStore-dataLifecycle-delete-icon')).toBeInTheDocument();
    });

    it('does not expose the remove delete phase action (disabling the lifecycle is not supported)', () => {
      const stats = createMockStats(100000);
      const failureStoreConfig = createMockFailureStoreConfig({ defaultRetentionPeriod: '7d' });

      render(
        <LifecyclePreviewProvider>
          <FailureStoreSummary
            stats={stats}
            failureStoreConfig={failureStoreConfig}
            canManageLifecycle
            onEditDeletePhase={jest.fn()}
            onRemoveDeletePhase={jest.fn()}
          />
        </LifecyclePreviewProvider>
      );

      fireEvent.click(screen.getByTestId('failureStore-lifecyclePhase-delete-button'));

      expect(screen.getByTestId('lifecyclePhase-delete-editButton')).toBeInTheDocument();
      expect(screen.queryByTestId('lifecyclePhase-delete-removeButton')).not.toBeInTheDocument();
    });
  });

  describe('Failure Store - Non-Serverless', () => {
    beforeEach(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockUseKibana.mockReturnValue({ isServerless: false } as any);
    });

    it('should render "Hot" label', () => {
      const stats = createMockStats(250000);
      const failureStoreConfig = createMockFailureStoreConfig({ defaultRetentionPeriod: '30d' });

      render(
        <LifecyclePreviewProvider>
          <FailureStoreSummary
            stats={stats}
            failureStoreConfig={failureStoreConfig}
            canManageLifecycle
          />
        </LifecyclePreviewProvider>
      );

      expect(screen.getByTestId('failureStore-lifecyclePhase-Hot-name')).toBeInTheDocument();
    });

    it('should display storage size', () => {
      const stats = createMockStats(250000);
      const failureStoreConfig = createMockFailureStoreConfig({ defaultRetentionPeriod: '30d' });

      render(
        <LifecyclePreviewProvider>
          <FailureStoreSummary
            stats={stats}
            failureStoreConfig={failureStoreConfig}
            canManageLifecycle
          />
        </LifecyclePreviewProvider>
      );

      expect(screen.getByTestId('failureStore-lifecyclePhase-Hot-size')).toHaveTextContent(
        /250\.0\s?KB/
      );
    });

    it('should render delete icon when retention period is set', () => {
      const stats = createMockStats(250000);
      const failureStoreConfig = createMockFailureStoreConfig({ defaultRetentionPeriod: '30d' });

      render(
        <LifecyclePreviewProvider>
          <FailureStoreSummary
            stats={stats}
            failureStoreConfig={failureStoreConfig}
            canManageLifecycle
          />
        </LifecyclePreviewProvider>
      );

      expect(screen.getByTestId('failureStore-dataLifecycle-delete-icon')).toBeInTheDocument();
    });

    it('exposes the remove delete phase action', () => {
      const stats = createMockStats(250000);
      const failureStoreConfig = createMockFailureStoreConfig({ defaultRetentionPeriod: '30d' });

      render(
        <LifecyclePreviewProvider>
          <FailureStoreSummary
            stats={stats}
            failureStoreConfig={failureStoreConfig}
            canManageLifecycle
            onEditDeletePhase={jest.fn()}
            onRemoveDeletePhase={jest.fn()}
          />
        </LifecyclePreviewProvider>
      );

      fireEvent.click(screen.getByTestId('failureStore-lifecyclePhase-delete-button'));

      expect(screen.getByTestId('lifecyclePhase-delete-editButton')).toBeInTheDocument();
      expect(screen.getByTestId('lifecyclePhase-delete-removeButton')).toBeInTheDocument();
    });

    it('disables "Add delete phase" and shows tooltip when delete phase already exists', async () => {
      const stats = createMockStats(250000);
      const failureStoreConfig = createMockFailureStoreConfig({ defaultRetentionPeriod: '30d' });

      render(
        <LifecyclePreviewProvider>
          <FailureStoreSummary
            stats={stats}
            failureStoreConfig={failureStoreConfig}
            canManageLifecycle
            onAddDeletePhase={jest.fn()}
          />
        </LifecyclePreviewProvider>
      );

      const addDeletePhaseButton = screen.getByTestId('failureStoreSummaryAddDeletePhase');
      expect(addDeletePhaseButton).toBeDisabled();

      fireEvent.mouseOver(addDeletePhaseButton.parentElement ?? addDeletePhaseButton);
      expect(await screen.findByText('Delete phase is already in use')).toBeInTheDocument();
    });
  });

  describe('Infinite Retention', () => {
    beforeEach(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockUseKibana.mockReturnValue({ isServerless: true } as any);
    });

    it('should not render delete icon when retention is disabled', () => {
      const stats = createMockStats(50000);
      const failureStoreConfig = createMockFailureStoreConfig({ retentionDisabled: true });

      render(
        <LifecyclePreviewProvider>
          <FailureStoreSummary
            stats={stats}
            failureStoreConfig={failureStoreConfig}
            canManageLifecycle
          />
        </LifecyclePreviewProvider>
      );

      expect(
        screen.queryByTestId('failureStore-dataLifecycle-delete-icon')
      ).not.toBeInTheDocument();
    });

    it('should render infinite symbol when retention is disabled', () => {
      const stats = createMockStats(50000);
      const failureStoreConfig = createMockFailureStoreConfig({ retentionDisabled: true });

      render(
        <LifecyclePreviewProvider>
          <FailureStoreSummary
            stats={stats}
            failureStoreConfig={failureStoreConfig}
            canManageLifecycle
          />
        </LifecyclePreviewProvider>
      );

      expect(screen.getByText('∞')).toBeInTheDocument();
    });
  });

  describe('Inherited badge', () => {
    beforeEach(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mockUseKibana.mockReturnValue({ isServerless: false } as any);
    });

    it('shows the Inherited badge for classic streams inheriting from index template', () => {
      const stats = createMockStats(50000);
      const failureStoreConfig = createMockFailureStoreConfig({
        inheritOptions: { canShowInherit: true, isWired: false, isCurrentlyInherited: true },
      });

      render(
        <LifecyclePreviewProvider>
          <FailureStoreSummary
            stats={stats}
            failureStoreConfig={failureStoreConfig}
            canManageLifecycle
          />
        </LifecyclePreviewProvider>
      );

      expect(screen.getByText('Inherited')).toBeInTheDocument();
    });

    it('shows the Inherited badge for wired child streams inheriting from parent', () => {
      const stats = createMockStats(50000);
      const failureStoreConfig = createMockFailureStoreConfig({
        inheritOptions: { canShowInherit: true, isWired: true, isCurrentlyInherited: true },
      });

      render(
        <LifecyclePreviewProvider>
          <FailureStoreSummary
            stats={stats}
            failureStoreConfig={failureStoreConfig}
            canManageLifecycle
          />
        </LifecyclePreviewProvider>
      );

      expect(screen.getByText('Inherited')).toBeInTheDocument();
    });

    it('does not show the Inherited badge for wired root streams', () => {
      const stats = createMockStats(50000);
      const failureStoreConfig = createMockFailureStoreConfig({
        inheritOptions: { canShowInherit: false, isWired: true, isCurrentlyInherited: true },
      });

      render(
        <LifecyclePreviewProvider>
          <FailureStoreSummary
            stats={stats}
            failureStoreConfig={failureStoreConfig}
            canManageLifecycle
          />
        </LifecyclePreviewProvider>
      );

      expect(screen.queryByText('Inherited')).not.toBeInTheDocument();
    });
  });
});
