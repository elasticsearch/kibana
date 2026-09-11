/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import './helpers/mocks';

import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { SnapshotDeleteProvider } from '../../public/application/components/snapshot_delete_provider';
import { deleteSnapshots } from '../../public/application/services/http';
import { WithAppDependencies } from './helpers/setup_environment';

jest.mock('../../public/application/services/http', () => ({
  ...jest.requireActual('../../public/application/services/http'),
  deleteSnapshots: jest.fn(),
}));

describe('WHEN deleting snapshots', () => {
  const addSuccess = jest.fn();
  const addDanger = jest.fn();
  const onSuccess = jest.fn();
  const Provider = WithAppDependencies(SnapshotDeleteProvider, undefined, {
    core: { notifications: { toasts: { addSuccess, addDanger } } },
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it.each([1, 2])('SHOULD keep loading until deletion of %i snapshots completes', async (count) => {
    const ids = Array.from({ length: count }, (_, index) => ({
      repository: 'test-repository',
      snapshot: `snapshot-${index}`,
    }));
    let resolveDeletion: (result: Awaited<ReturnType<typeof deleteSnapshots>>) => void = () => {};
    jest.mocked(deleteSnapshots).mockReturnValue(
      new Promise((resolve) => {
        resolveDeletion = resolve;
      })
    );

    render(
      <Provider>
        {(prompt) => <button onClick={() => prompt(ids, onSuccess)}>Open delete dialog</button>}
      </Provider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open delete dialog' }));
    expect(screen.queryByText(/^Deleting snapshot/)).not.toBeInTheDocument();

    const confirm = screen.getByRole('button', {
      name: count === 1 ? 'Delete snapshot' : 'Delete snapshots',
    });
    fireEvent.click(confirm);

    expect(
      screen.getByText(count === 1 ? 'Deleting snapshot' : 'Deleting snapshots')
    ).toBeVisible();
    expect(confirm).toBeDisabled();
    expect(addSuccess).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();

    await act(async () => {
      resolveDeletion({ data: { itemsDeleted: ids, errors: [] }, error: null });
    });

    expect(screen.queryByTestId('srdeleteSnapshotConfirmationModal')).not.toBeInTheDocument();
    expect(onSuccess).toHaveBeenCalledWith(ids);
    expect(addSuccess).toHaveBeenCalledTimes(1);
    expect(addDanger).not.toHaveBeenCalled();
  });

  it('SHOULD report a failed deletion without a success notification', async () => {
    const ids = [{ repository: 'test-repository', snapshot: 'snapshot-1' }];
    jest.mocked(deleteSnapshots).mockResolvedValue({
      data: { itemsDeleted: [], errors: [{ id: ids[0], error: { cause: 'Deletion failed' } }] },
      error: null,
    });

    render(
      <Provider>
        {(prompt) => <button onClick={() => prompt(ids, onSuccess)}>Open delete dialog</button>}
      </Provider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open delete dialog' }));
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Delete snapshot' }));
    });

    expect(screen.queryByTestId('srdeleteSnapshotConfirmationModal')).not.toBeInTheDocument();
    expect(addDanger).toHaveBeenCalledTimes(1);
    expect(addSuccess).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });
});
