/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { screen } from '@testing-library/react';

import { CaseViewTabContent } from './case_view_tab_content';
import { renderWithTestingProviders } from '../../../../common/mock';
import { basicCase } from '../../../../containers/mock';
import { CASE_VIEW_PAGE_TABS } from '../../../../../common/types';
import { useUrlParams } from '../../../../common/navigation';

jest.mock('../../../../common/navigation/hooks');
jest.mock('../../../../common/lib/kibana');

jest.mock('./case_view_activity', () => ({
  CaseViewActivity: () => <div data-test-subj="case-view-activity" />,
}));
jest.mock('../../../case_view/components/case_view_attachments', () => ({
  CaseViewAttachments: () => <div data-test-subj="case-view-attachments" />,
}));
jest.mock('../../../case_view/components/case_view_similar_cases', () => ({
  CaseViewSimilarCases: () => <div data-test-subj="case-view-similar-cases" />,
}));
jest.mock('./case_view_sidebar', () => ({
  CaseViewSidebar: () => <div data-test-subj="case-view-page-sidebar" />,
}));
jest.mock('./sidebar_toggle_button', () => ({
  SidebarToggleButton: () => <div data-test-subj="case-view-sidebar-toggle" />,
}));
jest.mock('../../../case_view/case_view_tabs', () => ({
  CaseViewTabs: () => <div data-test-subj="case-view-tabs" />,
}));

const useUrlParamsMock = useUrlParams as jest.Mock;

describe('CaseViewTabContent', () => {
  const defaultProps = {
    caseData: basicCase,
    searchTerm: '',
    onSearch: jest.fn(),
    onUpdateField: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useUrlParamsMock.mockReturnValue({ urlParams: {} });
  });

  it('renders the activity tab by default', async () => {
    renderWithTestingProviders(<CaseViewTabContent {...defaultProps} />);

    expect(
      await screen.findByTestId(`case-view-tab-content-${CASE_VIEW_PAGE_TABS.ACTIVITY}`)
    ).toBeInTheDocument();
    expect(screen.getByTestId('case-view-activity')).toBeInTheDocument();
  });

  it('renders the similar cases tab', async () => {
    useUrlParamsMock.mockReturnValue({
      urlParams: { tabId: CASE_VIEW_PAGE_TABS.SIMILAR_CASES },
    });

    renderWithTestingProviders(<CaseViewTabContent {...defaultProps} />);

    expect(
      await screen.findByTestId(`case-view-tab-content-${CASE_VIEW_PAGE_TABS.SIMILAR_CASES}`)
    ).toBeInTheDocument();
    expect(screen.getByTestId('case-view-similar-cases')).toBeInTheDocument();
  });

  it('renders the attachments tab', async () => {
    useUrlParamsMock.mockReturnValue({
      urlParams: { tabId: CASE_VIEW_PAGE_TABS.ATTACHMENTS },
    });

    renderWithTestingProviders(<CaseViewTabContent {...defaultProps} />);

    expect(
      await screen.findByTestId(`case-view-tab-content-${CASE_VIEW_PAGE_TABS.ATTACHMENTS}`)
    ).toBeInTheDocument();
    expect(screen.getByTestId('case-view-attachments')).toBeInTheDocument();
  });

  it('does not render activity or similar cases when on attachments tab', async () => {
    useUrlParamsMock.mockReturnValue({
      urlParams: { tabId: CASE_VIEW_PAGE_TABS.ATTACHMENTS },
    });

    renderWithTestingProviders(<CaseViewTabContent {...defaultProps} />);

    await screen.findByTestId(`case-view-tab-content-${CASE_VIEW_PAGE_TABS.ATTACHMENTS}`);
    expect(screen.queryByTestId('case-view-activity')).not.toBeInTheDocument();
    expect(screen.queryByTestId('case-view-similar-cases')).not.toBeInTheDocument();
  });

  it('falls back to activity tab for unknown tabId values', async () => {
    useUrlParamsMock.mockReturnValue({
      urlParams: { tabId: 'non-existent-tab' },
    });

    renderWithTestingProviders(<CaseViewTabContent {...defaultProps} />);

    expect(
      await screen.findByTestId(`case-view-tab-content-${CASE_VIEW_PAGE_TABS.ACTIVITY}`)
    ).toBeInTheDocument();
    expect(screen.getByTestId('case-view-activity')).toBeInTheDocument();
  });

  it('renders the sidebar on every tab', async () => {
    renderWithTestingProviders(<CaseViewTabContent {...defaultProps} />);

    expect(await screen.findByTestId('case-view-page-sidebar')).toBeInTheDocument();
  });

  it('renders the CaseViewTabs component', async () => {
    renderWithTestingProviders(<CaseViewTabContent {...defaultProps} />);

    expect(await screen.findByTestId('case-view-tabs')).toBeInTheDocument();
  });

  it('renders the sidebar alongside the attachments tab', async () => {
    useUrlParamsMock.mockReturnValue({
      urlParams: { tabId: CASE_VIEW_PAGE_TABS.ATTACHMENTS },
    });

    renderWithTestingProviders(<CaseViewTabContent {...defaultProps} />);

    expect(await screen.findByTestId('case-view-attachments')).toBeInTheDocument();
    expect(screen.getByTestId('case-view-page-sidebar')).toBeInTheDocument();
  });

  it('hides the sidebar when localStorage has sidebarOpen set to false', async () => {
    localStorage.setItem(`${basicCase.owner}.cases.caseView.sidebarOpen`, JSON.stringify(false));

    renderWithTestingProviders(<CaseViewTabContent {...defaultProps} />);

    await screen.findByTestId(`case-view-tab-content-${CASE_VIEW_PAGE_TABS.ACTIVITY}`);
    expect(screen.queryByTestId('case-view-page-sidebar')).not.toBeInTheDocument();
  });
});
