/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@kbn/react-query';
import { useRemoveAttackAttachment } from './use_remove_attack_attachment';
import { bulkDeleteCaseAttachments } from '../api';
import { useAppToasts } from '../../../../common/hooks/use_app_toasts';
import { useAppToastsMock } from '../../../../common/hooks/use_app_toasts.mock';

jest.mock('../../../../common/lib/kibana');
jest.mock('../../../../common/hooks/use_app_toasts');
jest.mock('../api');

const mockRefreshCaseViewPage = jest.fn();
jest.mock('@kbn/cases-plugin/public', () => ({
  useRefreshCaseViewPage: () => mockRefreshCaseViewPage,
}));

const bulkDeleteCaseAttachmentsMock = bulkDeleteCaseAttachments as jest.Mock;
const useAppToastsMocked = useAppToasts as jest.Mock;

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider
    client={new QueryClient({ defaultOptions: { mutations: { retry: false } } })}
  >
    {children}
  </QueryClientProvider>
);

describe('useRemoveAttackAttachment', () => {
  let appToasts: ReturnType<typeof useAppToastsMock.create>;

  beforeEach(() => {
    jest.clearAllMocks();
    appToasts = useAppToastsMock.create();
    useAppToastsMocked.mockReturnValue(appToasts);
    bulkDeleteCaseAttachmentsMock.mockResolvedValue(undefined);
  });

  it('removes only the attack attachment when no alert attachments were opted in', async () => {
    const { result } = renderHook(() => useRemoveAttackAttachment(), { wrapper });

    result.current.mutate({
      caseId: 'case-1',
      attackAttachmentIds: ['so-attack-1'],
      alertAttachmentIds: [],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(bulkDeleteCaseAttachmentsMock).toHaveBeenCalledTimes(1);
    expect(bulkDeleteCaseAttachmentsMock).toHaveBeenCalledWith(
      expect.objectContaining({ caseId: 'case-1', attachmentIds: ['so-attack-1'] })
    );
    expect(appToasts.addSuccess).toHaveBeenCalledWith('Removed the attack from the case');
  });

  it('removes the attack and its resolved alert attachments in one call, attack first', async () => {
    const { result } = renderHook(() => useRemoveAttackAttachment(), { wrapper });

    result.current.mutate({
      caseId: 'case-1',
      attackAttachmentIds: ['so-attack-1'],
      alertAttachmentIds: ['so-alert-1', 'so-alert-2'],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(bulkDeleteCaseAttachmentsMock).toHaveBeenCalledTimes(1);
    expect(bulkDeleteCaseAttachmentsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        caseId: 'case-1',
        attachmentIds: ['so-attack-1', 'so-alert-1', 'so-alert-2'],
      })
    );
    expect(appToasts.addSuccess).toHaveBeenCalledWith(
      'Removed the attack and its related alerts from the case'
    );
  });

  it('removes every attack of a bulk selection in one call, attacks first', async () => {
    const { result } = renderHook(() => useRemoveAttackAttachment(), { wrapper });

    result.current.mutate({
      caseId: 'case-1',
      attackAttachmentIds: ['so-attack-1', 'so-attack-2', 'so-attack-3'],
      alertAttachmentIds: ['so-alert-1'],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(bulkDeleteCaseAttachmentsMock).toHaveBeenCalledTimes(1);
    expect(bulkDeleteCaseAttachmentsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        caseId: 'case-1',
        attachmentIds: ['so-attack-1', 'so-attack-2', 'so-attack-3', 'so-alert-1'],
      })
    );
    expect(appToasts.addSuccess).toHaveBeenCalledWith(
      'Removed 3 attacks and their related alerts from the case'
    );
  });

  it('counts the attacks it removed when no alerts were opted in', async () => {
    const { result } = renderHook(() => useRemoveAttackAttachment(), { wrapper });

    result.current.mutate({
      caseId: 'case-1',
      attackAttachmentIds: ['so-attack-1', 'so-attack-2'],
      alertAttachmentIds: [],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(appToasts.addSuccess).toHaveBeenCalledWith('Removed 2 attacks from the case');
  });

  it('refreshes the case view page so the removals show without a manual refresh', async () => {
    const { result } = renderHook(() => useRemoveAttackAttachment(), { wrapper });

    result.current.mutate({
      caseId: 'case-1',
      attackAttachmentIds: ['so-attack-1'],
      alertAttachmentIds: ['so-alert-1'],
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(mockRefreshCaseViewPage).toHaveBeenCalledTimes(1);
  });

  it('surfaces an error and leaves the case untouched when the bulk delete fails', async () => {
    const error = new Error('bulk delete failed');
    bulkDeleteCaseAttachmentsMock.mockRejectedValue(error);

    const { result } = renderHook(() => useRemoveAttackAttachment(), { wrapper });

    result.current.mutate({
      caseId: 'case-1',
      attackAttachmentIds: ['so-attack-1'],
      alertAttachmentIds: ['so-alert-1'],
    });

    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(appToasts.addError).toHaveBeenCalledWith(error, {
      title: 'Failed to remove the attack from the case',
    });
    expect(appToasts.addSuccess).not.toHaveBeenCalled();
    // Nothing is invalidated on failure: the case view keeps showing what is still attached.
    expect(mockRefreshCaseViewPage).not.toHaveBeenCalled();
  });
});
