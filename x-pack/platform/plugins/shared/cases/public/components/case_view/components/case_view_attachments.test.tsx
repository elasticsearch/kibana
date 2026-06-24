/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  basicCase,
  alertComment,
  basicComment,
  eventComment,
  externalReferenceAttachment,
} from '../../../containers/mock';
import type { CaseUI } from '../../../../common';
import { renderWithTestingProviders } from '../../../common/mock';
import { CaseViewAttachments } from './case_view_attachments';
import { screen, waitFor } from '@testing-library/react';
import { licensingMock } from '@kbn/licensing-plugin/public/mocks';
import { useGetCaseFileStats } from '../../../containers/use_get_case_file_stats';
import { UnifiedAttachmentTypeRegistry } from '../../../client/attachment_framework/unified_attachment_registry';
import userEvent from '@testing-library/user-event';

jest.mock('../../../containers/use_get_case_file_stats');
jest.mock('../../../common/navigation/hooks');
jest.mock('../use_case_observables', () => ({
  useCaseObservables: jest.fn(() => ({ observables: [], isLoading: false })),
}));

const useGetCaseFileStatsMock = useGetCaseFileStats as jest.Mock;

const caseData: CaseUI = basicCase;

const buildRegistry = () => {
  const registry = new UnifiedAttachmentTypeRegistry();
  registry.register({
    id: 'security.alert',
    displayName: 'Alerts',
    icon: 'bell',
    getAttachmentViewObject: () => ({ event: 'added an alert' }),
    getAttachmentTabViewObject: () => ({
      children: () => <div data-test-subj="test-alerts-table">{'Alerts table'}</div>,
    }),
    schemaValidator: () => {},
  });
  registry.register({
    id: 'security.event',
    displayName: 'Events',
    icon: 'bell',
    getAttachmentViewObject: () => ({ event: 'added an event' }),
    getAttachmentTabViewObject: () => ({
      children: () => <div data-test-subj="test-events-table">{'Events table'}</div>,
    }),
    schemaValidator: () => {},
  });
  registry.register({
    id: 'file',
    displayName: 'Files',
    icon: 'document',
    getAttachmentViewObject: () => ({ event: 'added a file' }),
    getAttachmentTabViewObject: () => ({
      children: () => <div data-test-subj="test-files-table">{'Files table'}</div>,
    }),
    schemaValidator: () => {},
  });
  // Comment is intentionally registered without `getAttachmentTabViewObject`
  // to mirror production: comments live in the activity tab, not here.
  registry.register({
    id: 'comment',
    displayName: 'Comment',
    icon: 'editorComment',
    getAttachmentViewObject: () => ({ event: 'added a comment' }),
    schemaValidator: () => {},
  });
  return registry;
};

const basicLicense = licensingMock.createLicense({
  license: { type: 'basic' },
});

const platinumLicense = licensingMock.createLicense({
  license: { type: 'platinum' },
});

const fileStatsData = { total: 3 };
const onSearchMock = jest.fn();
const onUpdateFieldMock = jest.fn();

describe('Case View Attachments tab', () => {
  beforeEach(() => {
    useGetCaseFileStatsMock.mockReturnValue({ data: fileStatsData });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders the tabs and the search field', async () => {
    renderWithTestingProviders(
      <CaseViewAttachments
        caseData={caseData}
        onSearch={onSearchMock}
        onUpdateField={onUpdateFieldMock}
      />
    );

    expect(screen.getByTestId('case-view-tabs')).toBeInTheDocument();
    expect(screen.getByTestId('cases-files-search')).toBeInTheDocument();
  });

  it('renders the attachment type filter', () => {
    renderWithTestingProviders(
      <CaseViewAttachments
        caseData={caseData}
        onSearch={onSearchMock}
        onUpdateField={onUpdateFieldMock}
      />
    );

    expect(screen.getByTestId('case-view-filters')).toBeInTheDocument();
    expect(screen.getByTestId('options-filter-popover-button-attachmentType')).toBeInTheDocument();
  });

  it('omits registry types that have no tab view from the filter dropdown', async () => {
    const unifiedAttachmentTypeRegistry = buildRegistry();
    // Case has both an alert (tab-viewable) and a user comment (not).
    const caseWithAlertAndComment: CaseUI = {
      ...basicCase,
      comments: [alertComment, basicComment],
    };

    renderWithTestingProviders(
      <CaseViewAttachments
        caseData={caseWithAlertAndComment}
        onSearch={onSearchMock}
        onUpdateField={onUpdateFieldMock}
      />,
      { wrapperProps: { unifiedAttachmentTypeRegistry } }
    );

    await userEvent.click(screen.getByTestId('options-filter-popover-button-attachmentType'));

    expect(
      await screen.findByTestId('options-filter-popover-item-security.alert')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('options-filter-popover-item-comment')).not.toBeInTheDocument();
  });

  it('renders the author filter', () => {
    renderWithTestingProviders(
      <CaseViewAttachments
        caseData={caseData}
        onSearch={onSearchMock}
        onUpdateField={onUpdateFieldMock}
      />
    );

    expect(screen.getByTestId('options-filter-popover-button-author')).toBeInTheDocument();
  });

  it('calls the onSearch callback when the search field is changed', async () => {
    renderWithTestingProviders(
      <CaseViewAttachments
        caseData={caseData}
        onSearch={onSearchMock}
        onUpdateField={onUpdateFieldMock}
      />
    );

    await userEvent.type(screen.getByTestId('cases-files-search'), 'search{Enter}');

    await waitFor(() => {
      expect(onSearchMock).toHaveBeenCalledWith('search');
    });
  });

  it('shows the update button as "needs update" when input differs from the applied search', async () => {
    renderWithTestingProviders(
      <CaseViewAttachments
        caseData={caseData}
        onSearch={onSearchMock}
        searchTerm=""
        onUpdateField={onUpdateFieldMock}
      />
    );

    // When the input matches the applied search term, the button renders the
    // "Refresh" label. Once the input diverges, EuiSuperUpdateButton switches
    // to a filled success "Update" label.
    expect(screen.getByTestId('cases-attachments-update-button')).toHaveTextContent('Refresh');

    await userEvent.type(screen.getByTestId('cases-files-search'), 'foo');

    expect(screen.getByTestId('cases-attachments-update-button')).toHaveTextContent('Update');
  });

  it('calls onSearch with the typed value when clicking the update button while dirty', async () => {
    renderWithTestingProviders(
      <CaseViewAttachments
        caseData={caseData}
        onSearch={onSearchMock}
        searchTerm=""
        onUpdateField={onUpdateFieldMock}
      />
    );

    await userEvent.type(screen.getByTestId('cases-files-search'), 'bar');
    await userEvent.click(screen.getByTestId('cases-attachments-update-button'));

    await waitFor(() => {
      expect(onSearchMock).toHaveBeenCalledWith('bar');
    });
  });

  it('does not render an observables accordion when license is basic', async () => {
    renderWithTestingProviders(
      <CaseViewAttachments
        caseData={caseData}
        onSearch={onSearchMock}
        onUpdateField={onUpdateFieldMock}
      />,
      { wrapperProps: { license: basicLicense } }
    );

    expect(
      screen.queryByTestId('case-view-attachment-accordion-observables')
    ).not.toBeInTheDocument();
  });

  it('renders an observables accordion when the license is platinum', async () => {
    renderWithTestingProviders(
      <CaseViewAttachments
        caseData={caseData}
        onSearch={onSearchMock}
        onUpdateField={onUpdateFieldMock}
      />,
      { wrapperProps: { license: platinumLicense } }
    );

    expect(
      await screen.findByTestId('case-view-attachment-accordion-observables')
    ).toBeInTheDocument();
  });

  it('renders an accordion only for registered types that have a tab view and at least one attachment of that type', () => {
    const unifiedAttachmentTypeRegistry = buildRegistry();
    const caseWithAlert: CaseUI = { ...basicCase, comments: [alertComment] };

    renderWithTestingProviders(
      <CaseViewAttachments
        caseData={caseWithAlert}
        onSearch={onSearchMock}
        onUpdateField={onUpdateFieldMock}
      />,
      { wrapperProps: { unifiedAttachmentTypeRegistry } }
    );

    expect(screen.getByTestId('case-view-attachment-accordion-security.alert')).toBeInTheDocument();
    expect(
      screen.queryByTestId('case-view-attachment-accordion-security.event')
    ).not.toBeInTheDocument();
  });

  it('hides the files accordion when fileStats reports 0 files', () => {
    useGetCaseFileStatsMock.mockReturnValue({ data: { total: 0 } });
    const unifiedAttachmentTypeRegistry = buildRegistry();

    renderWithTestingProviders(
      <CaseViewAttachments
        caseData={caseData}
        onSearch={onSearchMock}
        onUpdateField={onUpdateFieldMock}
      />,
      { wrapperProps: { unifiedAttachmentTypeRegistry } }
    );

    expect(screen.queryByTestId('case-view-attachment-accordion-file')).not.toBeInTheDocument();
  });

  it('shows the file count from fileStats on the files badge', () => {
    useGetCaseFileStatsMock.mockReturnValue({ data: { total: 2 } });
    const unifiedAttachmentTypeRegistry = buildRegistry();

    renderWithTestingProviders(
      <CaseViewAttachments
        caseData={caseData}
        onSearch={onSearchMock}
        onUpdateField={onUpdateFieldMock}
      />,
      { wrapperProps: { unifiedAttachmentTypeRegistry } }
    );

    expect(screen.getByTestId('case-view-attachment-badge-file')).toHaveTextContent('2');
  });

  it('badge counts bulk-added alerts by id length, not by comment/SO count', () => {
    const unifiedAttachmentTypeRegistry = buildRegistry();
    // One alert SO wrapping three alert ids. The badge should read "3", not "1".
    const bulkAlertComment = {
      ...alertComment,
      alertId: ['a-1', 'a-2', 'a-3'],
      index: ['i-1', 'i-2', 'i-3'],
    };
    const caseWithBulkAlerts: CaseUI = { ...basicCase, comments: [bulkAlertComment] };

    renderWithTestingProviders(
      <CaseViewAttachments
        caseData={caseWithBulkAlerts}
        onSearch={onSearchMock}
        onUpdateField={onUpdateFieldMock}
      />,
      { wrapperProps: { unifiedAttachmentTypeRegistry } }
    );

    expect(screen.getByTestId('case-view-attachment-badge-security.alert')).toHaveTextContent('3');
  });

  it('renders a "no results found" empty state when searching and nothing matches', () => {
    useGetCaseFileStatsMock.mockReturnValue({ data: { total: 0 } });
    const unifiedAttachmentTypeRegistry = buildRegistry();

    renderWithTestingProviders(
      <CaseViewAttachments
        caseData={caseData}
        onSearch={onSearchMock}
        searchTerm="foobar"
        onUpdateField={onUpdateFieldMock}
      />,
      { wrapperProps: { unifiedAttachmentTypeRegistry, license: basicLicense } }
    );

    const emptyPrompt = screen.getByTestId('case-view-attachments-no-search-results');
    expect(emptyPrompt).toBeInTheDocument();
    expect(emptyPrompt).toHaveTextContent('No results match your search criteria');
    expect(emptyPrompt).toHaveTextContent('Try modifying your search.');
    expect(screen.queryByTestId('case-view-attachment-accordion-file')).not.toBeInTheDocument();
  });

  it('renders the empty state when the case has no attachments and observables is unavailable', () => {
    // e.g. observability: no observables accordion, so an empty case would
    // otherwise render a blank tab.
    useGetCaseFileStatsMock.mockReturnValue({ data: { total: 0 } });
    const unifiedAttachmentTypeRegistry = buildRegistry();

    renderWithTestingProviders(
      <CaseViewAttachments
        caseData={caseData}
        onSearch={onSearchMock}
        onUpdateField={onUpdateFieldMock}
      />,
      { wrapperProps: { unifiedAttachmentTypeRegistry, license: basicLicense } }
    );

    expect(screen.getByTestId('case-view-attachments-no-search-results')).toBeInTheDocument();
  });

  it('does not render the empty state when observables is available and fills the empty case', () => {
    useGetCaseFileStatsMock.mockReturnValue({ data: { total: 0 } });
    const unifiedAttachmentTypeRegistry = buildRegistry();

    renderWithTestingProviders(
      <CaseViewAttachments
        caseData={caseData}
        onSearch={onSearchMock}
        onUpdateField={onUpdateFieldMock}
      />,
      { wrapperProps: { unifiedAttachmentTypeRegistry, license: platinumLicense } }
    );

    expect(screen.queryByTestId('case-view-attachments-no-search-results')).not.toBeInTheDocument();
  });

  it('does not render the empty state when search matches at least one section', () => {
    useGetCaseFileStatsMock.mockReturnValue({ data: { total: 1 } });
    const unifiedAttachmentTypeRegistry = buildRegistry();

    renderWithTestingProviders(
      <CaseViewAttachments
        caseData={caseData}
        onSearch={onSearchMock}
        searchTerm="elastic"
        onUpdateField={onUpdateFieldMock}
      />,
      { wrapperProps: { unifiedAttachmentTypeRegistry, license: basicLicense } }
    );

    expect(screen.queryByTestId('case-view-attachments-no-search-results')).not.toBeInTheDocument();
    expect(screen.getByTestId('case-view-attachment-accordion-file')).toBeInTheDocument();
  });

  it('narrows accordions to the selected attachment types when the filter is active', async () => {
    const unifiedAttachmentTypeRegistry = buildRegistry();
    const caseWithComments: CaseUI = {
      ...basicCase,
      comments: [alertComment, { ...eventComment, id: 'evt-1' }],
    };

    renderWithTestingProviders(
      <CaseViewAttachments
        caseData={caseWithComments}
        onSearch={onSearchMock}
        onUpdateField={onUpdateFieldMock}
      />,
      { wrapperProps: { unifiedAttachmentTypeRegistry, license: platinumLicense } }
    );

    expect(screen.getByTestId('case-view-attachment-accordion-security.alert')).toBeInTheDocument();
    expect(screen.getByTestId('case-view-attachment-accordion-security.event')).toBeInTheDocument();
    expect(
      await screen.findByTestId('case-view-attachment-accordion-observables')
    ).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('options-filter-popover-button-attachmentType'));
    await userEvent.click(await screen.findByTestId('options-filter-popover-item-security.alert'));

    await waitFor(() => {
      expect(
        screen.getByTestId('case-view-attachment-accordion-security.alert')
      ).toBeInTheDocument();
    });
    expect(
      screen.queryByTestId('case-view-attachment-accordion-security.event')
    ).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('case-view-attachment-accordion-observables')
    ).not.toBeInTheDocument();
  });

  it('shows the observables accordion when "observables" is the selected filter type', async () => {
    const unifiedAttachmentTypeRegistry = buildRegistry();
    // Observables option only appears when the case actually has at least one
    // observable, so we seed one alongside the alert.
    const caseWithAlertAndObservable: CaseUI = {
      ...basicCase,
      comments: [alertComment],
      observables: [
        {
          id: 'obs-1',
          value: '1.1.1.1',
          typeKey: 'ipv4',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          description: null,
        },
      ],
    };

    renderWithTestingProviders(
      <CaseViewAttachments
        caseData={caseWithAlertAndObservable}
        onSearch={onSearchMock}
        onUpdateField={onUpdateFieldMock}
      />,
      { wrapperProps: { unifiedAttachmentTypeRegistry, license: platinumLicense } }
    );

    await userEvent.click(screen.getByTestId('options-filter-popover-button-attachmentType'));
    await userEvent.click(await screen.findByTestId('options-filter-popover-item-observables'));

    await waitFor(() => {
      expect(screen.getByTestId('case-view-attachment-accordion-observables')).toBeInTheDocument();
    });
    expect(
      screen.queryByTestId('case-view-attachment-accordion-security.alert')
    ).not.toBeInTheDocument();
  });

  it('does not list observables in the filter when the feature is unavailable', async () => {
    const unifiedAttachmentTypeRegistry = buildRegistry();

    renderWithTestingProviders(
      <CaseViewAttachments
        caseData={caseData}
        onSearch={onSearchMock}
        onUpdateField={onUpdateFieldMock}
      />,
      { wrapperProps: { unifiedAttachmentTypeRegistry, license: basicLicense } }
    );

    await userEvent.click(screen.getByTestId('options-filter-popover-button-attachmentType'));

    expect(screen.queryByTestId('options-filter-popover-item-observables')).not.toBeInTheDocument();
  });

  it('shows the no-results empty state when the filter selects a type with no attachments', async () => {
    // A file SO is attached, but the file client (fileStats) reports 0 files —
    // so selecting "File" should drop the only registered accordion and yield
    // the empty state.
    useGetCaseFileStatsMock.mockReturnValue({ data: { total: 0 } });
    const unifiedAttachmentTypeRegistry = buildRegistry();
    const fileComment = {
      ...externalReferenceAttachment,
      id: 'file-comment-id',
      externalReferenceAttachmentTypeId: '.files',
    };
    const caseWithFile: CaseUI = { ...basicCase, comments: [fileComment] };

    renderWithTestingProviders(
      <CaseViewAttachments
        caseData={caseWithFile}
        onSearch={onSearchMock}
        onUpdateField={onUpdateFieldMock}
      />,
      { wrapperProps: { unifiedAttachmentTypeRegistry, license: basicLicense } }
    );

    await userEvent.click(screen.getByTestId('options-filter-popover-button-attachmentType'));
    await userEvent.click(await screen.findByTestId('options-filter-popover-item-file'));

    await waitFor(() => {
      expect(screen.getByTestId('case-view-attachments-no-search-results')).toBeInTheDocument();
    });
  });

  it('narrows accordions when the author filter is active and hides observables', async () => {
    const unifiedAttachmentTypeRegistry = buildRegistry();
    const otherUser = {
      fullName: 'April Ludgate',
      username: 'aludgate',
      email: 'april@elastic.co',
    };
    // Two alerts owned by different authors, plus an observable that should
    // disappear as soon as any author filter is selected.
    const caseWithTwoAuthors: CaseUI = {
      ...basicCase,
      comments: [alertComment, { ...alertComment, id: 'alert-other', createdBy: otherUser }],
      observables: [
        {
          id: 'obs-1',
          value: '1.1.1.1',
          typeKey: 'ipv4',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
          description: null,
        },
      ],
    };

    renderWithTestingProviders(
      <CaseViewAttachments
        caseData={caseWithTwoAuthors}
        onSearch={onSearchMock}
        onUpdateField={onUpdateFieldMock}
      />,
      { wrapperProps: { unifiedAttachmentTypeRegistry, license: platinumLicense } }
    );

    // Sanity: observables shown with no filter active.
    expect(
      await screen.findByTestId('case-view-attachment-accordion-observables')
    ).toBeInTheDocument();

    await userEvent.click(screen.getByTestId('options-filter-popover-button-author'));
    await userEvent.click(
      await screen.findByTestId(`options-filter-popover-item-${otherUser.username}`)
    );

    // Alert accordion stays (other-user authored an alert) but observables
    // disappear because they carry no createdBy.
    await waitFor(() => {
      expect(
        screen.queryByTestId('case-view-attachment-accordion-observables')
      ).not.toBeInTheDocument();
    });
    expect(screen.getByTestId('case-view-attachment-accordion-security.alert')).toBeInTheDocument();
  });

  describe('clear filters button', () => {
    it('does not render when no filter is active', () => {
      const unifiedAttachmentTypeRegistry = buildRegistry();
      renderWithTestingProviders(
        <CaseViewAttachments
          caseData={caseData}
          onSearch={onSearchMock}
          onUpdateField={onUpdateFieldMock}
        />,
        { wrapperProps: { unifiedAttachmentTypeRegistry, license: basicLicense } }
      );

      expect(screen.queryByTestId('case-view-filters-clear-filters')).not.toBeInTheDocument();
    });

    it('renders when a filter is active and resets every filter when clicked', async () => {
      const unifiedAttachmentTypeRegistry = buildRegistry();
      const caseWithAlerts: CaseUI = {
        ...basicCase,
        comments: [alertComment, { ...eventComment, id: 'evt-1' }],
      };

      renderWithTestingProviders(
        <CaseViewAttachments
          caseData={caseWithAlerts}
          onSearch={onSearchMock}
          onUpdateField={onUpdateFieldMock}
        />,
        { wrapperProps: { unifiedAttachmentTypeRegistry, license: basicLicense } }
      );

      // Activate the type filter.
      await userEvent.click(screen.getByTestId('options-filter-popover-button-attachmentType'));
      await userEvent.click(
        await screen.findByTestId('options-filter-popover-item-security.alert')
      );

      const clearButton = await screen.findByTestId('case-view-filters-clear-filters');
      expect(clearButton).toBeInTheDocument();
      // Other-type accordion is hidden while the filter is active.
      expect(
        screen.queryByTestId('case-view-attachment-accordion-security.event')
      ).not.toBeInTheDocument();

      await userEvent.click(clearButton);

      await waitFor(() => {
        expect(screen.queryByTestId('case-view-filters-clear-filters')).not.toBeInTheDocument();
      });
      // Both accordions are back.
      expect(
        screen.getByTestId('case-view-attachment-accordion-security.alert')
      ).toBeInTheDocument();
      expect(
        screen.getByTestId('case-view-attachment-accordion-security.event')
      ).toBeInTheDocument();
    });
  });

  it('renders accordions in alphabetical order by display name', () => {
    const unifiedAttachmentTypeRegistry = buildRegistry();
    // 2 alerts + 1 event so all three registry-driven accordions render
    // (Alert, Event, File via fileStats).
    const caseWithComments: CaseUI = {
      ...basicCase,
      comments: [
        alertComment,
        { ...alertComment, id: 'alert-2' },
        { ...eventComment, id: 'evt-1' },
      ],
    };

    renderWithTestingProviders(
      <CaseViewAttachments
        caseData={caseWithComments}
        onSearch={onSearchMock}
        onUpdateField={onUpdateFieldMock}
      />,
      { wrapperProps: { unifiedAttachmentTypeRegistry } }
    );

    const ids = screen
      .getAllByTestId(/^case-view-attachment-accordion-(security\.alert|security\.event|file)$/)
      .map((el) => el.getAttribute('data-test-subj'));

    expect(ids).toEqual([
      'case-view-attachment-accordion-security.alert', // Alert
      'case-view-attachment-accordion-security.event', // Event
      'case-view-attachment-accordion-file', // File
    ]);
  });
});
