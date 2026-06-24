/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { act, waitFor, renderHook } from '@testing-library/react';
import { TestProviders } from '../../../../common/mock';
import { useKibana, useToasts } from '../../../../common/lib/kibana';
import { useCreateAttachments } from '../../../../containers/use_create_attachments';
import { useRefreshCaseViewPage as getRefreshCaseViewPageMock } from '../../../case_view/use_on_refresh_case_view_page';
import { useAttachSavedObject } from './use_attach_saved_object';
import type { FoundSavedObject } from './types';

jest.mock('../../../../common/lib/kibana');
jest.mock('../../../../containers/use_create_attachments');
jest.mock('../../../case_view/use_on_refresh_case_view_page');
jest.mock('@kbn/agent-builder-dashboards-common', () => ({
  dashboardStateToAttachmentData: jest.fn((attrs) => ({
    panels: attrs?.panels ?? [],
    fromConverter: true,
  })),
}));

const useKibanaMock = useKibana as jest.Mock;
const useToastsMock = useToasts as jest.Mock;
const useCreateAttachmentsMock = useCreateAttachments as jest.Mock;
const refreshCaseViewPage = getRefreshCaseViewPageMock() as jest.Mock;

const buildSO = (overrides: Partial<FoundSavedObject> = {}): FoundSavedObject => ({
  id: 'so-1',
  type: 'dashboard',
  meta: { title: 'My title' },
  ...overrides,
});

describe('useAttachSavedObject', () => {
  const mutateAsync = jest.fn().mockResolvedValue(undefined);
  const onAttached = jest.fn();
  const addSuccess = jest.fn();
  const findById = jest.fn();
  const cmGet = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    useCreateAttachmentsMock.mockReturnValue({ mutateAsync, isLoading: false });
    useToastsMock.mockReturnValue({ addSuccess, addError: jest.fn() });
    useKibanaMock.mockReturnValue({
      services: {
        dashboard: { findDashboardsService: jest.fn().mockResolvedValue({ findById }) },
        contentManagement: { client: { get: cmGet } },
      },
    });
  });

  const render = () =>
    renderHook(
      () =>
        useAttachSavedObject({
          caseId: 'case-1',
          caseOwner: 'cases',
          onAttached,
        }),
      { wrapper: TestProviders }
    );

  it('no-ops for unsupported types', async () => {
    const { result } = render();
    // FoundSavedObject.type is narrowed to SupportedSavedObjectType; the cast
    // models the "find returned an unexpected type" defensive branch.
    const unsupported = { ...buildSO(), type: 'user' } as unknown as FoundSavedObject;
    await act(async () => {
      await result.current.attach(unsupported);
    });
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it('builds a reference-only payload for discoverSession', async () => {
    const { result } = render();
    await act(async () => {
      await result.current.attach(buildSO({ id: 'search-1', type: 'search' }));
    });
    expect(mutateAsync).toHaveBeenCalledWith({
      caseId: 'case-1',
      caseOwner: 'cases',
      attachments: [
        expect.objectContaining({
          attachmentId: 'search-1',
          metadata: { title: 'My title', soType: 'search' },
        }),
      ],
    });
    expect(mutateAsync.mock.calls[0][0].attachments[0]).not.toHaveProperty('data');
  });

  it('snapshots dashboard config into the payload when fetch succeeds', async () => {
    findById.mockResolvedValue({ status: 'success', attributes: { panels: [{ id: 'a' }] } });
    const { result } = render();
    await act(async () => {
      await result.current.attach(buildSO({ id: 'dash-1', type: 'dashboard' }));
    });
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [
          expect.objectContaining({
            attachmentId: 'dash-1',
            data: { config: { panels: [{ id: 'a' }], fromConverter: true } },
          }),
        ],
      })
    );
  });

  it('omits dashboard data when the fetch fails', async () => {
    findById.mockResolvedValue({ status: 'error' });
    const { result } = render();
    await act(async () => {
      await result.current.attach(buildSO({ id: 'dash-1', type: 'dashboard' }));
    });
    expect(mutateAsync.mock.calls[0][0].attachments[0]).not.toHaveProperty('data');
  });

  it('degrades a dashboard to title-only when the snapshot is too large to embed', async () => {
    // Build a config large enough to exceed MAX_SNAPSHOT_BYTES (200_000) once
    // serialized — a string field that survives the converter passes through.
    const oversizePanel = { id: 'big', payload: 'x'.repeat(250_000) };
    findById.mockResolvedValue({
      status: 'success',
      attributes: { panels: [oversizePanel] },
    });
    const { result } = render();
    await act(async () => {
      await result.current.attach(buildSO({ id: 'dash-1', type: 'dashboard' }));
    });
    const sent = mutateAsync.mock.calls[0][0].attachments[0];
    expect(sent).not.toHaveProperty('data');
    expect(sent).toMatchObject({
      attachmentId: 'dash-1',
      metadata: { title: 'My title', soType: 'dashboard' },
    });
    // Success toast still fires — degradation is silent.
    await waitFor(() =>
      expect(addSuccess).toHaveBeenCalledWith(expect.objectContaining({ text: 'My title' }))
    );
  });

  it('degrades a map to title-only when the snapshot is too large to embed', async () => {
    const oversizeLayer = { id: 'big', payload: 'x'.repeat(250_000) };
    cmGet.mockResolvedValue({ item: { attributes: { layers: [oversizeLayer] } } });
    const { result } = render();
    await act(async () => {
      await result.current.attach(buildSO({ id: 'map-1', type: 'map' }));
    });
    const sent = mutateAsync.mock.calls[0][0].attachments[0];
    expect(sent).not.toHaveProperty('data');
    expect(sent).toMatchObject({
      attachmentId: 'map-1',
      metadata: { title: 'My title', soType: 'map' },
    });
    await waitFor(() =>
      expect(addSuccess).toHaveBeenCalledWith(expect.objectContaining({ text: 'My title' }))
    );
  });

  it('snapshots map attributes into the payload', async () => {
    cmGet.mockResolvedValue({ item: { attributes: { layers: [{ id: 'l1' }] } } });
    const { result } = render();
    await act(async () => {
      await result.current.attach(buildSO({ id: 'map-1', type: 'map' }));
    });
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [
          expect.objectContaining({
            attachmentId: 'map-1',
            data: { attributes: { layers: [{ id: 'l1' }] } },
          }),
        ],
      })
    );
  });

  it('falls back to the id when the SO has no title', async () => {
    const { result } = render();
    await act(async () => {
      await result.current.attach(buildSO({ id: 'search-x', type: 'search', meta: {} }));
    });
    expect(mutateAsync).toHaveBeenCalledWith(
      expect.objectContaining({
        attachments: [
          expect.objectContaining({
            metadata: { title: 'search-x', soType: 'search' },
          }),
        ],
      })
    );
  });

  it('shows a success toast, refreshes the case view, and calls onAttached', async () => {
    const { result } = render();
    await act(async () => {
      await result.current.attach(buildSO({ id: 'search-1', type: 'search' }));
    });
    await waitFor(() =>
      expect(addSuccess).toHaveBeenCalledWith(expect.objectContaining({ text: 'My title' }))
    );
    expect(refreshCaseViewPage).toHaveBeenCalled();
    expect(onAttached).toHaveBeenCalled();
  });

  it('clears attachmentId after the request settles', async () => {
    const { result } = render();
    await act(async () => {
      await result.current.attach(buildSO({ id: 'search-1', type: 'search' }));
    });
    expect(result.current.attachmentId).toBeNull();
  });
});
