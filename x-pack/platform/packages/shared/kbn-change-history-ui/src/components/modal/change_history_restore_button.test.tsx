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
import { ChangeHistoryRestoreButton } from './change_history_restore_button';
import {
  TEST_OBJECT_ID,
  TEST_OBJECT_TITLE,
  TEST_SNAPSHOT_OLD,
} from '../../test_utils/change_history_test_fixtures';
import { createQueryClientWrapper } from '../../test_utils/create_query_client_wrapper';

const historicalChange: ChangeHistoryDetail = {
  id: 'evt-3',
  timestamp: '2026-06-15T12:00:00.000Z',
  actor: { name: 'Alice' },
  action: 'Updated',
  metadata: { version: 3 },
  snapshot: TEST_SNAPSHOT_OLD,
};

const currentChange: ChangeHistoryDetail = {
  ...historicalChange,
  id: 'evt-7',
  isCurrent: true,
  metadata: { version: 7 },
};

const renderButton = ({
  change = historicalChange,
  features = { restore: true },
  permissions = { canRestore: true },
  restoreChange = jest.fn().mockResolvedValue(undefined),
}: {
  change?: ChangeHistoryDetail;
  features?: { restore?: boolean };
  permissions?: { canRestore?: boolean };
  restoreChange?: ChangeHistoryAdapter['restoreChange'];
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
        >
          <ChangeHistoryRestoreButton change={change} />
        </ChangeHistoryProvider>
      </QueryClientWrapper>
    </I18nProvider>
  );
};

describe('ChangeHistoryRestoreButton', () => {
  it('renders nothing for the current version', () => {
    renderButton({ change: currentChange });

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
