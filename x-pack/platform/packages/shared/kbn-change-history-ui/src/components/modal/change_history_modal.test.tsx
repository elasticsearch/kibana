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

const listItem = {
  id: 'evt-1',
  timestamp: '2026-06-16T12:00:00.000Z',
  actor: { name: 'Alice', profileId: 'user-1' },
  action: 'Updated',
  isCurrent: true,
};

const detail: ChangeHistoryDetail = {
  ...listItem,
  snapshot: { workflow: { yaml: 'name: test\n' } },
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
}: {
  adapter?: ChangeHistoryAdapter;
} = {}) =>
  render(
    <I18nProvider>
      <ChangeHistoryProvider
        objectId="workflow-1"
        adapter={adapter}
        renderPreview={({ change }) => (
          <pre data-test-subj="previewYaml">{JSON.stringify(change.snapshot)}</pre>
        )}
      >
        <ChangeHistoryTrigger />
        <ChangeHistoryModal />
      </ChangeHistoryProvider>
    </I18nProvider>
  );

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
      snapshot: { workflow: { yaml: 'name: older\n' } },
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
});
