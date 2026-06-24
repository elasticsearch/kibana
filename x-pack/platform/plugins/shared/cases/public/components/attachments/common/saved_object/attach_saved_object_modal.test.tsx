/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithTestingProviders } from '../../../../common/mock';
import { basicCase } from '../../../../containers/mock';
import {
  DASHBOARD_ATTACHMENT_TYPE,
  MAP_ATTACHMENT_TYPE,
} from '../../../../../common/constants/attachments';
import type { CaseUI, AttachmentUIV2 } from '../../../../../common/ui/types';
import { UnifiedAttachmentTypeRegistry } from '../../../../client/attachment_framework/unified_attachment_registry';
import { registerInternalAttachments } from '../..';
import { AttachSavedObjectModal } from './attach_saved_object_modal';
import { useFindSavedObjects } from './use_find_saved_objects';
import { useAttachSavedObject } from './use_attach_saved_object';
import type { FoundSavedObject } from './types';

jest.mock('./use_find_saved_objects');
jest.mock('./use_attach_saved_object');

const useFindSavedObjectsMock = useFindSavedObjects as jest.Mock;
const useAttachSavedObjectMock = useAttachSavedObject as jest.Mock;

const sampleItems: FoundSavedObject[] = [
  {
    id: 'dash-1',
    type: 'dashboard',
    meta: { title: 'Sales overview' },
  },
  {
    id: 'map-1',
    type: 'map',
    meta: { title: 'World map' },
  },
];

const caseWithDashboardAttachment = (attachmentId: string): CaseUI =>
  ({
    ...basicCase,
    comments: [
      {
        id: 'comment-1',
        type: DASHBOARD_ATTACHMENT_TYPE,
        attachmentId,
        metadata: { title: 'D', soType: 'dashboard' },
      } as unknown as AttachmentUIV2,
    ],
  } as CaseUI);

const caseWithSavedObjectAttachment = ({
  attachmentId,
  type,
  soType,
}: {
  attachmentId: string;
  type: string;
  soType: string;
}): CaseUI =>
  ({
    ...basicCase,
    comments: [
      {
        id: 'comment-1',
        type,
        attachmentId,
        metadata: { title: 'Saved object', soType },
      } as unknown as AttachmentUIV2,
    ],
  } as CaseUI);

describe('AttachSavedObjectModal', () => {
  const attach = jest.fn();
  const onClose = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    useFindSavedObjectsMock.mockReturnValue({ items: sampleItems, total: 2, isLoading: false });
    useAttachSavedObjectMock.mockReturnValue({ attach, attachmentId: null, isAttaching: false });
  });

  // Opt in to dashboard/map registrations so the type filter exposes them.
  const unifiedAttachmentTypeRegistry = new UnifiedAttachmentTypeRegistry();
  registerInternalAttachments(unifiedAttachmentTypeRegistry, {
    hasDashboardPluginEnabled: true,
    hasMapsPluginEnabled: true,
  });

  const renderModal = (caseData: CaseUI = basicCase) =>
    renderWithTestingProviders(<AttachSavedObjectModal caseData={caseData} onClose={onClose} />, {
      wrapperProps: { unifiedAttachmentTypeRegistry },
    });

  it('renders the modal header, search input, and type filter', () => {
    renderModal();
    expect(screen.getByTestId('cases-attach-so-modal')).toBeInTheDocument();
    expect(screen.getByTestId('cases-attach-so-search')).toBeInTheDocument();
    expect(screen.getByTestId('cases-attach-so-type-select')).toBeInTheDocument();
  });

  it('renders one SavedObjectRow per item returned by the find hook', () => {
    renderModal();
    expect(screen.getByTestId('cases-attach-so-card-dash-1')).toBeInTheDocument();
    expect(screen.getByTestId('cases-attach-so-card-map-1')).toBeInTheDocument();
  });

  it('shows a loading spinner when the find hook is loading', () => {
    useFindSavedObjectsMock.mockReturnValue({ items: [], total: 0, isLoading: true });
    renderModal();
    expect(screen.getByTestId('cases-attach-so-loading')).toBeInTheDocument();
    expect(screen.queryByTestId('cases-attach-so-list')).not.toBeInTheDocument();
  });

  it('shows the empty state when no items are returned', () => {
    useFindSavedObjectsMock.mockReturnValue({ items: [], total: 0, isLoading: false });
    renderModal();
    expect(screen.getByTestId('cases-attach-so-empty')).toBeInTheDocument();
  });

  it('updates the search query and resets to page 0 when typing', async () => {
    renderModal();
    await userEvent.type(screen.getByTestId('cases-attach-so-search'), 'foo');

    await waitFor(() => expect(useFindSavedObjectsMock.mock.calls.at(-1)?.[0].query).toBe('foo'));
    expect(useFindSavedObjectsMock.mock.calls.at(-1)?.[0].page).toBe(0);
  });

  it('narrows the search types when a specific type is selected', async () => {
    renderModal();
    await userEvent.selectOptions(screen.getByTestId('cases-attach-so-type-select'), 'dashboard');

    await waitFor(() =>
      expect(useFindSavedObjectsMock.mock.calls.at(-1)?.[0].types).toEqual(['dashboard'])
    );
  });

  it('marks rows that are already attached and disables their attach button', () => {
    renderModal(caseWithDashboardAttachment('dash-1'));
    const attachedBtn = screen.getByTestId('cases-attach-so-button-dash-1');
    const otherBtn = screen.getByTestId('cases-attach-so-button-map-1');
    expect(attachedBtn).toBeDisabled();
    expect(attachedBtn).toHaveTextContent('Attached');
    expect(otherBtn).not.toBeDisabled();
  });

  it('does not mark a different saved object type with the same id as attached', () => {
    useFindSavedObjectsMock.mockReturnValue({
      items: [
        { id: 'shared-id', type: 'dashboard', meta: { title: 'Dashboard' } },
        { id: 'shared-id', type: 'map', meta: { title: 'Map' } },
      ],
      total: 2,
      isLoading: false,
    });

    renderModal(
      caseWithSavedObjectAttachment({
        attachmentId: 'shared-id',
        type: DASHBOARD_ATTACHMENT_TYPE,
        soType: 'dashboard',
      })
    );

    const [dashboardBtn, mapBtn] = screen.getAllByTestId('cases-attach-so-button-shared-id');
    expect(dashboardBtn).toBeDisabled();
    expect(mapBtn).not.toBeDisabled();
  });

  it('ignores malformed saved object attachments when deriving attached state', () => {
    renderModal(
      caseWithSavedObjectAttachment({
        attachmentId: 'map-1',
        type: MAP_ATTACHMENT_TYPE,
        soType: 'unknown',
      })
    );

    expect(screen.getByTestId('cases-attach-so-button-map-1')).not.toBeDisabled();
  });

  it('forwards row clicks to the attach action with the matching saved object', async () => {
    renderModal();
    await userEvent.click(screen.getByTestId('cases-attach-so-button-dash-1'));
    expect(attach).toHaveBeenCalledWith(sampleItems[0]);
  });

  it('passes the case id and owner to useAttachSavedObject', () => {
    renderModal();
    const call = useAttachSavedObjectMock.mock.calls[0][0];
    expect(call.caseId).toBe(basicCase.id);
    expect(call.caseOwner).toBe(basicCase.owner);
  });
});
