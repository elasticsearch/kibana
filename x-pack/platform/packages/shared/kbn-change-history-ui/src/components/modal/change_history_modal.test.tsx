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
import { ChangeHistoryModal } from './change_history_modal';
import { ChangeHistoryTrigger } from './change_history_trigger';
import {
  TEST_OBJECT_ID,
  TEST_OBJECT_TITLE,
  TEST_SNAPSHOT,
  TEST_SNAPSHOT_OLDER,
} from '../../test_utils/change_history_test_fixtures';
import { createQueryClientWrapper } from '../../test_utils/create_query_client_wrapper';

const listItem = {
  id: 'evt-1',
  timestamp: '2026-06-16T12:00:00.000Z',
  actor: { name: 'Alice', profileId: 'user-1' },
  action: 'Updated',
  isCurrent: true,
};

const detail: ChangeHistoryDetail = {
  ...listItem,
  snapshot: TEST_SNAPSHOT,
};

const createAdapter = (overrides?: Partial<ChangeHistoryAdapter>): ChangeHistoryAdapter => ({
  listChanges: jest.fn().mockResolvedValue({
    items: [listItem],
    total: 1,
  }),
  getChange: jest.fn().mockResolvedValue(detail),
  ...overrides,
});

const renderModal = ({
  adapter = createAdapter(),
  ...providerProps
}: {
  adapter?: ChangeHistoryAdapter;
} & Partial<React.ComponentProps<typeof ChangeHistoryProvider>> = {}) => {
  const { wrapper: QueryClientWrapper } = createQueryClientWrapper();

  return render(
    <I18nProvider>
      <QueryClientWrapper>
        <ChangeHistoryProvider
          objectId={TEST_OBJECT_ID}
          adapter={adapter}
          labels={{ previewTitle: TEST_OBJECT_TITLE }}
          renderPreview={({ change }) => (
            <pre data-test-subj="previewYaml">{JSON.stringify(change.snapshot)}</pre>
          )}
          {...providerProps}
        >
          <ChangeHistoryTrigger />
          <ChangeHistoryModal />
        </ChangeHistoryProvider>
      </QueryClientWrapper>
    </I18nProvider>
  );
};

const openModal = () => {
  fireEvent.click(screen.getByTestId('changeHistoryTrigger'));
};

describe('ChangeHistoryModal', () => {
  it('auto-selects the first change and renders preview when opened', async () => {
    renderModal();
    openModal();

    await waitFor(() => {
      expect(screen.getByTestId('changeHistoryTimeline')).toBeInTheDocument();
    });

    expect(screen.getByTestId('changeHistoryItem-evt-1')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByTestId('previewYaml')).toHaveTextContent('name: test');
    });
  });

  it('shows list error prompt when listChanges fails', async () => {
    const adapter = createAdapter({
      listChanges: jest.fn().mockRejectedValue(new Error('Network error')),
    });

    renderModal({ adapter });
    openModal();

    await waitFor(() => {
      expect(screen.getByTestId('changeHistoryModalError')).toBeInTheDocument();
    });
  });

  it('shows empty prompt when history has no items', async () => {
    const adapter = createAdapter({
      listChanges: jest.fn().mockResolvedValue({ items: [], total: 0 }),
    });

    renderModal({ adapter });
    openModal();

    await waitFor(() => {
      expect(screen.getByTestId('changeHistoryModalEmpty')).toBeInTheDocument();
    });
  });

  it('selects a different row when clicked', async () => {
    const secondItem = {
      id: 'evt-2',
      timestamp: '2026-06-15T12:00:00.000Z',
      actor: { name: 'Bob' },
      action: 'Created',
    };
    const secondDetail: ChangeHistoryDetail = {
      ...secondItem,
      snapshot: TEST_SNAPSHOT_OLDER,
    };

    const adapter = createAdapter({
      listChanges: jest.fn().mockResolvedValue({
        items: [listItem, secondItem],
        total: 2,
      }),
      getChange: jest.fn().mockImplementation(({ changeId }) => {
        if (changeId === 'evt-2') {
          return Promise.resolve(secondDetail);
        }
        return Promise.resolve(detail);
      }),
    });

    renderModal({ adapter });
    openModal();

    await waitFor(() => {
      expect(screen.getByTestId('changeHistoryItem-evt-2')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('changeHistoryItem-evt-2'));

    await waitFor(() => {
      expect(screen.getByTestId('previewYaml')).toHaveTextContent('name: older');
    });
  });

  it('does not show history footer until all items are loaded', async () => {
    const adapter = createAdapter({
      listChanges: jest.fn().mockResolvedValue({
        items: [listItem],
        total: 3,
      }),
    });

    renderModal({ adapter });
    openModal();

    await waitFor(() => {
      expect(screen.getByTestId('changeHistoryTimeline')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('changeHistoryFooter')).not.toBeInTheDocument();
  });

  it('shows restore button for a non-current version when restore is enabled', async () => {
    const historicalItem = {
      id: 'evt-2',
      timestamp: '2026-06-15T12:00:00.000Z',
      actor: { name: 'Bob' },
      action: 'Updated',
      metadata: { version: 3 },
    };
    const historicalDetail: ChangeHistoryDetail = {
      ...historicalItem,
      snapshot: TEST_SNAPSHOT_OLDER,
    };

    const adapter = createAdapter({
      listChanges: jest.fn().mockResolvedValue({
        items: [listItem, historicalItem],
        total: 2,
      }),
      getChange: jest.fn().mockImplementation(({ changeId }) => {
        if (changeId === 'evt-2') {
          return Promise.resolve(historicalDetail);
        }
        return Promise.resolve(detail);
      }),
      restoreChange: jest.fn().mockResolvedValue(undefined),
    });

    renderModal({
      adapter,
      features: { restore: true },
      permissions: { canRestore: true },
    });

    openModal();

    await waitFor(() => {
      expect(screen.getByTestId('changeHistoryItem-evt-2')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('changeHistoryItem-evt-2'));

    await waitFor(() => {
      expect(screen.getByTestId('changeHistoryRestoreButton')).toBeInTheDocument();
    });
  });

  it('refetches and selects the new current version after a successful restore', async () => {
    const historicalItem = {
      id: 'evt-2',
      timestamp: '2026-06-15T12:00:00.000Z',
      actor: { name: 'Bob' },
      action: 'Updated',
      metadata: { version: 3 },
    };
    const historicalDetail: ChangeHistoryDetail = {
      ...historicalItem,
      snapshot: TEST_SNAPSHOT_OLDER,
    };
    const restoredItem = {
      id: 'evt-9',
      timestamp: '2026-06-17T12:00:00.000Z',
      actor: { name: 'Alice' },
      action: 'Restored',
      isCurrent: true,
      metadata: { version: 9 },
    };
    const restoredDetail: ChangeHistoryDetail = {
      ...restoredItem,
      snapshot: TEST_SNAPSHOT,
    };

    const listChanges = jest
      .fn()
      .mockResolvedValueOnce({ items: [listItem, historicalItem], total: 2 })
      .mockResolvedValue({ items: [restoredItem, listItem, historicalItem], total: 3 });

    const adapter = createAdapter({
      listChanges,
      getChange: jest.fn().mockImplementation(({ changeId }) => {
        if (changeId === 'evt-2') {
          return Promise.resolve(historicalDetail);
        }
        if (changeId === 'evt-9') {
          return Promise.resolve(restoredDetail);
        }
        return Promise.resolve(detail);
      }),
      restoreChange: jest.fn().mockResolvedValue(undefined),
    });

    renderModal({
      adapter,
      features: { restore: true },
      permissions: { canRestore: true },
    });

    openModal();

    await waitFor(() => {
      expect(screen.getByTestId('changeHistoryItem-evt-2')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('changeHistoryItem-evt-2'));

    await waitFor(() => {
      expect(screen.getByTestId('changeHistoryRestoreButton')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByTestId('changeHistoryRestoreButton'));
    fireEvent.click(screen.getByTestId('confirmModalConfirmButton'));

    await waitFor(() => {
      expect(adapter.restoreChange).toHaveBeenCalled();
    });

    // After restore, the list is refetched and the new current version is auto-selected.
    await waitFor(() => {
      expect(screen.getByTestId('changeHistoryItem-evt-9')).toBeInTheDocument();
    });
    await waitFor(() => {
      expect(screen.queryByTestId('changeHistoryRestoreButton')).not.toBeInTheDocument();
    });
  });

  it('hides restore button for the current version', async () => {
    const adapter = createAdapter({
      restoreChange: jest.fn().mockResolvedValue(undefined),
    });

    renderModal({
      adapter,
      features: { restore: true },
      permissions: { canRestore: true },
    });

    openModal();

    await waitFor(() => {
      expect(screen.getByTestId('changeHistoryItem-evt-1')).toBeInTheDocument();
    });

    expect(screen.queryByTestId('changeHistoryRestoreButton')).not.toBeInTheDocument();
  });
});
