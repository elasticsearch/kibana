/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { renderWithTestingProviders } from '../../../../common/mock';
import { basicCase } from '../../../../containers/mock';
import {
  DASHBOARD_ATTACHMENT_TYPE,
  DASHBOARD_SO_TYPE,
  MAP_ATTACHMENT_TYPE,
  MAP_SO_TYPE,
} from '../../../../../common/constants/attachments';
import type { CaseUI, AttachmentUIV2 } from '../../../../../common/ui/types';
import { SavedObjectAttachmentsTable } from './saved_object_attachments_table';
import { useSavedObjectInAppUrls } from './use_saved_object_in_app_url';

jest.mock('./use_saved_object_in_app_url');

const useSavedObjectInAppUrlsMock = useSavedObjectInAppUrls as jest.Mock;

const soAttachment = (
  id: string,
  type: string,
  attachmentId: string,
  title: string,
  createdAt = '2025-01-01T00:00:00.000Z'
): AttachmentUIV2 =>
  ({
    id,
    type,
    attachmentId,
    metadata: {
      title,
      soType: type === DASHBOARD_ATTACHMENT_TYPE ? DASHBOARD_SO_TYPE : MAP_SO_TYPE,
    },
    createdAt,
    createdBy: { username: 'alice', fullName: 'Alice A' },
  } as unknown as AttachmentUIV2);

const caseWith = (comments: AttachmentUIV2[]): CaseUI => ({ ...basicCase, comments } as CaseUI);

describe('SavedObjectAttachmentsTable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useSavedObjectInAppUrlsMock.mockReturnValue({});
  });

  it('renders the empty state when no attachments match the type', () => {
    renderWithTestingProviders(
      <SavedObjectAttachmentsTable
        caseData={caseWith([])}
        attachmentTypeId={DASHBOARD_ATTACHMENT_TYPE}
        soType="dashboard"
      />
    );
    expect(
      screen.getByTestId(`cases-so-attachments-table-empty-${DASHBOARD_ATTACHMENT_TYPE}`)
    ).toBeInTheDocument();
  });

  it('renders only rows matching the requested attachment type', () => {
    const data = caseWith([
      soAttachment('c1', DASHBOARD_ATTACHMENT_TYPE, 'dash-1', 'D1'),
      soAttachment('c2', MAP_ATTACHMENT_TYPE, 'map-1', 'M1'),
      soAttachment('c3', DASHBOARD_ATTACHMENT_TYPE, 'dash-2', 'D2'),
    ]);
    renderWithTestingProviders(
      <SavedObjectAttachmentsTable
        caseData={data}
        attachmentTypeId={DASHBOARD_ATTACHMENT_TYPE}
        soType="dashboard"
      />
    );
    expect(screen.getByTestId('cases-so-attachments-table-row-c1')).toBeInTheDocument();
    expect(screen.getByTestId('cases-so-attachments-table-row-c3')).toBeInTheDocument();
    expect(screen.queryByTestId('cases-so-attachments-table-row-c2')).not.toBeInTheDocument();
  });

  it('uses the resolved in-app URL to build clickable title links', () => {
    useSavedObjectInAppUrlsMock.mockReturnValue({
      'dash-1': '/base/app/dashboards#/view/dash-1',
    });
    const data = caseWith([soAttachment('c1', DASHBOARD_ATTACHMENT_TYPE, 'dash-1', 'D1')]);
    renderWithTestingProviders(
      <SavedObjectAttachmentsTable
        caseData={data}
        attachmentTypeId={DASHBOARD_ATTACHMENT_TYPE}
        soType="dashboard"
      />
    );
    const link = screen.getByTestId('cases-so-attachments-table-link-c1');
    expect(link).toHaveAttribute('href', '/base/app/dashboards#/view/dash-1');
  });

  it('renders the title as a disabled link when no URL is resolved', () => {
    const data = caseWith([soAttachment('c1', DASHBOARD_ATTACHMENT_TYPE, 'dash-1', 'D1')]);
    renderWithTestingProviders(
      <SavedObjectAttachmentsTable
        caseData={data}
        attachmentTypeId={DASHBOARD_ATTACHMENT_TYPE}
        soType="dashboard"
      />
    );
    expect(screen.getByTestId('cases-so-attachments-table-link-c1')).toBeDisabled();
  });

  it('filters rows by searchTerm against title and attachmentId', () => {
    const data = caseWith([
      soAttachment('c1', DASHBOARD_ATTACHMENT_TYPE, 'dash-1', 'Sales overview'),
      soAttachment('c2', DASHBOARD_ATTACHMENT_TYPE, 'dash-2', 'Inventory'),
    ]);

    const { rerender } = renderWithTestingProviders(
      <SavedObjectAttachmentsTable
        caseData={data}
        attachmentTypeId={DASHBOARD_ATTACHMENT_TYPE}
        soType="dashboard"
        searchTerm="sales"
      />
    );
    expect(screen.getByTestId('cases-so-attachments-table-row-c1')).toBeInTheDocument();
    expect(screen.queryByTestId('cases-so-attachments-table-row-c2')).not.toBeInTheDocument();

    rerender(
      <SavedObjectAttachmentsTable
        caseData={data}
        attachmentTypeId={DASHBOARD_ATTACHMENT_TYPE}
        soType="dashboard"
        searchTerm="dash-2"
      />
    );
    expect(screen.queryByTestId('cases-so-attachments-table-row-c1')).not.toBeInTheDocument();
    expect(screen.getByTestId('cases-so-attachments-table-row-c2')).toBeInTheDocument();
  });

  it('paginates and lets the user advance pages', async () => {
    const comments = Array.from({ length: 12 }, (_, i) =>
      soAttachment(`c${i}`, DASHBOARD_ATTACHMENT_TYPE, `dash-${i}`, `D${i}`)
    );
    renderWithTestingProviders(
      <SavedObjectAttachmentsTable
        caseData={caseWith(comments)}
        attachmentTypeId={DASHBOARD_ATTACHMENT_TYPE}
        soType="dashboard"
      />
    );

    expect(screen.getByTestId('cases-so-attachments-table-row-c0')).toBeInTheDocument();
    expect(screen.queryByTestId('cases-so-attachments-table-row-c11')).not.toBeInTheDocument();

    const pagination = screen.getByTestId('tablePaginationPopoverButton');
    expect(pagination).toBeInTheDocument();
    const nextButton = screen.getByTestId('pagination-button-next');
    await userEvent.click(nextButton);

    expect(screen.queryByTestId('cases-so-attachments-table-row-c0')).not.toBeInTheDocument();
    expect(screen.getByTestId('cases-so-attachments-table-row-c11')).toBeInTheDocument();
  });

  it('clamps the page when filteredRows shrinks past the current page', async () => {
    const comments = Array.from({ length: 12 }, (_, i) =>
      soAttachment(`c${i}`, DASHBOARD_ATTACHMENT_TYPE, `dash-${i}`, `D${i}`)
    );
    const data = caseWith(comments);
    const { rerender } = renderWithTestingProviders(
      <SavedObjectAttachmentsTable
        caseData={data}
        attachmentTypeId={DASHBOARD_ATTACHMENT_TYPE}
        soType="dashboard"
      />
    );
    await userEvent.click(screen.getByTestId('pagination-button-next'));
    expect(screen.getByTestId('cases-so-attachments-table-row-c11')).toBeInTheDocument();

    rerender(
      <SavedObjectAttachmentsTable
        caseData={data}
        attachmentTypeId={DASHBOARD_ATTACHMENT_TYPE}
        soType="dashboard"
        searchTerm="D0"
      />
    );
    const row = screen.getByTestId('cases-so-attachments-table-row-c0');
    expect(within(row).getByText('D0')).toBeInTheDocument();
  });
});
