/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import '@testing-library/jest-dom';
import { I18nProvider } from '@kbn/i18n-react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import { ChangeHistoryProvider } from '../../provider/change_history_provider';
import type { ChangeHistoryAdapter } from '../../types/change_history_adapter';
import type { ChangeHistoryDetail } from '../../types/change_history_detail';
import type { ChangeHistoryListItem } from '../../types/change_history_list_item';
import { ChangeHistoryRestoreButton } from './change_history_restore_button';
import {
  TEST_OBJECT_ID,
  TEST_OBJECT_TITLE,
  TEST_CHANGE_HISTORY_SCOPE,
  TEST_SNAPSHOT_OLD,
} from '../../test_utils/change_history_test_fixtures';
import { createQueryClientWrapper } from '../../test_utils/create_query_client_wrapper';
import { ChangeHistoryTelemetryEventTypes } from '../../telemetry/types';

const testScope = TEST_CHANGE_HISTORY_SCOPE;

const historicalChange: ChangeHistoryDetail = {
  id: 'evt-3',
  timestamp: '2026-06-15T12:00:00.000Z',
  actor: { name: 'Alice' },
  action: 'Updated',
  metadata: { version: 3 },
  snapshot: TEST_SNAPSHOT_OLD,
};

const liveChange: ChangeHistoryDetail = {
  ...historicalChange,
  id: 'evt-7',
  isCurrent: true,
  metadata: { version: 7 },
};

const renderButton = ({
  change = historicalChange,
  currentChange,
  features = { restore: true },
  permissions = { canRestore: true },
  restoreChange = jest.fn().mockResolvedValue(undefined),
  reportEvent,
}: {
  change?: ChangeHistoryDetail;
  currentChange?: ChangeHistoryListItem;
  features?: { restore?: boolean };
  permissions?: { canRestore?: boolean };
  restoreChange?: ChangeHistoryAdapter['restoreChange'];
  reportEvent?: jest.Mock;
} = {}) => {
  const adapter: ChangeHistoryAdapter = {
    listChanges: jest.fn(),
    getChange: jest.fn(),
    restoreChange,
  };

  const { wrapper: QueryClientWrapper } = createQueryClientWrapper();

  return render(
    <I18nProvider>
      <QueryClientWrapper>
        <ChangeHistoryProvider
          objectId={TEST_OBJECT_ID}
          adapter={adapter}
          labels={{ previewTitle: TEST_OBJECT_TITLE }}
          features={features}
          permissions={permissions}
          renderPreview={() => null}
          scope={testScope}
          analytics={reportEvent ? { reportEvent } : undefined}
        >
          <ChangeHistoryRestoreButton change={change} currentChange={currentChange} />
        </ChangeHistoryProvider>
      </QueryClientWrapper>
    </I18nProvider>
  );
};

describe('ChangeHistoryRestoreButton', () => {
  it('renders nothing for the current version', () => {
    renderButton({ change: liveChange });

    expect(screen.queryByTestId('changeHistoryRestoreButton')).not.toBeInTheDocument();
  });

  it('renders nothing when restore feature is disabled', () => {
    renderButton({ features: { restore: false } });

    expect(screen.queryByTestId('changeHistoryRestoreButton')).not.toBeInTheDocument();
  });

  it('opens confirm modal and calls restoreChange on confirm', async () => {
    const restoreChange = jest.fn().mockResolvedValue(undefined);
    renderButton({ restoreChange });

    fireEvent.click(screen.getByTestId('changeHistoryRestoreButton'));
    expect(screen.getByTestId('changeHistoryRestoreConfirmModal')).toBeInTheDocument();
    expect(screen.getByText('Restore version 3?')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('confirmModalConfirmButton'));

    await waitFor(() => {
      expect(restoreChange).toHaveBeenCalledWith({
        objectId: TEST_OBJECT_ID,
        changeId: 'evt-3',
        signal: expect.any(AbortSignal),
      });
    });

    await waitFor(() => {
      expect(screen.queryByTestId('changeHistoryRestoreConfirmModal')).not.toBeInTheDocument();
    });
  });

  it('reports restore_confirmed and restore_completed telemetry on successful restore', async () => {
    const reportEvent = jest.fn();
    const restoreChange = jest.fn().mockResolvedValue(undefined);

    renderButton({ restoreChange, reportEvent, currentChange: liveChange });

    fireEvent.click(screen.getByTestId('changeHistoryRestoreButton'));
    fireEvent.click(screen.getByTestId('confirmModalConfirmButton'));

    await waitFor(() => {
      expect(reportEvent).toHaveBeenCalledWith(
        ChangeHistoryTelemetryEventTypes.RestoreConfirmed,
        expect.objectContaining({
          eventName: 'Change history restore confirmed',
          ...testScope,
          restoredFromSequence: 3,
          currentSequence: 7,
          rollbackDistance: 4,
        })
      );
    });

    await waitFor(() => {
      expect(reportEvent).toHaveBeenCalledWith(
        ChangeHistoryTelemetryEventTypes.RestoreCompleted,
        expect.objectContaining({
          eventName: 'Change history restore completed',
          ...testScope,
          restoredFromSequence: 3,
          currentSequence: 7,
          rollbackDistance: 4,
          durationMs: expect.any(Number),
        })
      );
    });
  });

  it('reports restore_failed telemetry when restore fails', async () => {
    const reportEvent = jest.fn();
    const restoreChange = jest.fn().mockRejectedValue({
      body: {
        code: 'RESTORE_VALIDATION',
        message: 'Validation failed.',
      },
    });

    renderButton({ restoreChange, reportEvent, currentChange: liveChange });

    fireEvent.click(screen.getByTestId('changeHistoryRestoreButton'));
    fireEvent.click(screen.getByTestId('confirmModalConfirmButton'));

    await waitFor(() => {
      expect(reportEvent).toHaveBeenCalledWith(ChangeHistoryTelemetryEventTypes.RestoreFailed, {
        eventName: 'Change history restore failed',
        ...testScope,
        restoredFromSequence: 3,
        currentSequence: 7,
        rollbackDistance: 4,
        errorCode: 'RESTORE_VALIDATION',
      });
    });
  });

  it('shows structured restore errors in the confirm modal', async () => {
    const restoreChange = jest.fn().mockRejectedValue({
      body: {
        code: 'RESTORE_VALIDATION',
        message: 'Validation failed.',
      },
    });

    renderButton({ restoreChange });

    fireEvent.click(screen.getByTestId('changeHistoryRestoreButton'));
    fireEvent.click(screen.getByTestId('confirmModalConfirmButton'));

    await waitFor(() => {
      expect(screen.getByText('Validation failed.')).toBeInTheDocument();
    });
    expect(screen.getByTestId('changeHistoryRestoreConfirmModal')).toBeInTheDocument();
  });
});
