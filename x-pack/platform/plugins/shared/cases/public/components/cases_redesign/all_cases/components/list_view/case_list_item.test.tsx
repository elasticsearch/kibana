/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { renderWithTestingProviders } from '../../../../../common/mock';
import { CaseListItem } from './case_list_item';
import { basicCase, basicPush } from '../../../../../containers/mock';
import { suggestionUserProfiles } from '../../../../../containers/user_profiles/api.mock';
import { CaseSeverity } from '../../../../../../common/types/domain';
import { CaseStatuses } from '@kbn/cases-components';
import * as i18n from '../../translations';

const mockNavigateToCaseView = jest.fn();
jest.mock('../../../../../common/navigation/hooks', () => ({
  ...jest.requireActual('../../../../../common/navigation/hooks'),
  useCaseViewNavigation: () => ({
    navigateToCaseView: mockNavigateToCaseView,
    getCaseViewUrl: jest.fn().mockReturnValue('/cases/test-id'),
  }),
}));

jest.mock('../../../../all_cases/use_actions', () => ({
  ...jest.requireActual('../../../../all_cases/use_actions'),
  ActionColumnComponent: () => (
    <button type="button" data-test-subj="mock-action-column">
      {'...'}
    </button>
  ),
}));

const mockCase = {
  ...basicCase,
  incrementalId: 42,
  totalAlerts: 3,
  totalComment: 5,
  severity: CaseSeverity.HIGH,
  status: CaseStatuses.open,
  updatedAt: '2025-01-18T14:12:31.000Z',
  createdAt: '2025-01-18T14:12:31.000Z',
  createdBy: { fullName: 'Leslie Knope', username: 'lknope', email: 'leslie@elastic.co' },
};

const defaultProps = {
  theCase: mockCase,
  userProfiles: new Map(),
  disableActions: false,
  selectedFields: [],
};

describe('CaseListItem', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders case title, id, severity badge, status, and alerts badge', () => {
    renderWithTestingProviders(<CaseListItem {...defaultProps} />);

    expect(screen.getByTestId('cases-list-item-title')).toHaveTextContent(mockCase.title);
    expect(screen.getByTestId('cases-list-item-id')).toHaveTextContent('#42');
    expect(screen.getByTestId(`case-severity-badge-${mockCase.severity}`)).toHaveTextContent(
      'High'
    );
    expect(screen.getByTestId(`case-status-badge-${mockCase.status}`)).toBeInTheDocument();
    expect(screen.getByTestId('cases-list-item-alerts-badge')).toHaveTextContent('3');
  });

  it('does not render alerts badge when totalAlerts is 0', () => {
    renderWithTestingProviders(
      <CaseListItem {...defaultProps} theCase={{ ...mockCase, totalAlerts: 0 }} />
    );

    expect(screen.queryByTestId('cases-list-item-alerts-badge')).not.toBeInTheDocument();
  });

  it('shows reporter name', () => {
    renderWithTestingProviders(<CaseListItem {...defaultProps} />);

    const reporter = screen.getByTestId('cases-list-item-reporter');
    expect(reporter).toHaveTextContent(i18n.LIST_REPORTED_BY);
    expect(reporter).toHaveTextContent('Leslie Knope');
    expect(screen.queryByTestId('cases-list-item-created-at')).not.toBeInTheDocument();
  });

  it('renders optional fields in a third row when enabled', () => {
    renderWithTestingProviders(
      <CaseListItem
        {...defaultProps}
        selectedFields={[
          { field: 'tags', name: i18n.TAGS, isChecked: true },
          { field: 'createdAt', name: i18n.CREATED_ON, isChecked: true },
        ]}
      />
    );

    expect(screen.getByTestId('cases-list-item-optional-fields')).toBeInTheDocument();
    expect(screen.getByTestId('cases-list-item-field-tags')).toHaveTextContent('coke');
    expect(screen.getByTestId('cases-list-item-field-created-at')).toHaveTextContent(
      i18n.LIST_FIELD_CREATED
    );
  });

  it('does not render optional fields row when no fields are enabled', () => {
    renderWithTestingProviders(<CaseListItem {...defaultProps} />);

    expect(screen.queryByTestId('cases-list-item-optional-fields')).not.toBeInTheDocument();
  });

  it('shows updated date when present', () => {
    renderWithTestingProviders(<CaseListItem {...defaultProps} />);

    expect(screen.getByTestId('cases-list-item-updated-at')).toHaveTextContent(
      i18n.LIST_LAST_UPDATE
    );
  });

  it('does not render updated date when it is null', () => {
    renderWithTestingProviders(
      <CaseListItem {...defaultProps} theCase={{ ...mockCase, updatedAt: null }} />
    );

    expect(screen.queryByTestId('cases-list-item-updated-at')).not.toBeInTheDocument();
  });

  it('shows assignee avatars up to 3', () => {
    const threeAssignees = suggestionUserProfiles.slice(0, 3);
    const userProfiles = new Map(threeAssignees.map((profile) => [profile.uid, profile]));

    renderWithTestingProviders(
      <CaseListItem
        {...defaultProps}
        theCase={{
          ...mockCase,
          assignees: threeAssignees.map((profile) => ({ uid: profile.uid })),
        }}
        userProfiles={userProfiles}
      />
    );

    expect(screen.getByTestId('cases-list-item-assignees')).toBeInTheDocument();
    expect(screen.getByTestId('case-user-profile-avatar-damaged_raccoon')).toBeInTheDocument();
    expect(screen.getByTestId('case-user-profile-avatar-physical_dinosaur')).toBeInTheDocument();
    expect(screen.getByTestId('case-user-profile-avatar-wet_dingo')).toBeInTheDocument();
    expect(screen.queryByTestId('cases-list-item-assignees-overflow')).not.toBeInTheDocument();
  });

  it('shows overflow badge when more than 3 assignees', () => {
    const fourAssignees = suggestionUserProfiles.slice(0, 4);
    const userProfiles = new Map(fourAssignees.map((profile) => [profile.uid, profile]));

    renderWithTestingProviders(
      <CaseListItem
        {...defaultProps}
        theCase={{
          ...mockCase,
          assignees: fourAssignees.map((profile) => ({ uid: profile.uid })),
        }}
        userProfiles={userProfiles}
      />
    );

    expect(screen.getByTestId('cases-list-item-assignees-overflow')).toHaveTextContent('+1');
  });

  it('shows comments count badge', () => {
    renderWithTestingProviders(<CaseListItem {...defaultProps} />);

    expect(screen.getByTestId('cases-list-item-comments-badge')).toHaveTextContent('5');
  });

  it('shows action column when not in selector view', () => {
    renderWithTestingProviders(<CaseListItem {...defaultProps} />);

    expect(screen.getByTestId('mock-action-column')).toBeInTheDocument();
  });

  it('renders the link with href and aria-label inside the card', () => {
    renderWithTestingProviders(<CaseListItem {...defaultProps} />);

    const link = screen.getByTestId(`cases-list-item-clickable-${mockCase.id}`);
    expect(link.tagName).toBe('A');
    expect(link).toHaveAttribute('href', '/cases/test-id');
    expect(link).toHaveAttribute('aria-label', `click to visit case with title ${mockCase.title}`);
  });

  it('renders the action button as a sibling outside the link', () => {
    renderWithTestingProviders(<CaseListItem {...defaultProps} />);

    const link = screen.getByTestId(`cases-list-item-clickable-${mockCase.id}`);
    const actionButton = screen.getByTestId('mock-action-column');

    expect(link.contains(actionButton)).toBe(false);
  });

  it('renders optional fields outside the stretched link', () => {
    renderWithTestingProviders(
      <CaseListItem
        {...defaultProps}
        selectedFields={[{ field: 'tags', name: i18n.TAGS, isChecked: true }]}
      />
    );

    const link = screen.getByTestId(`cases-list-item-clickable-${mockCase.id}`);
    const optionalFields = screen.getByTestId('cases-list-item-optional-fields');

    expect(link.contains(optionalFields)).toBe(false);
  });

  it('renders external incident link outside the stretched link when pushed', () => {
    renderWithTestingProviders(
      <CaseListItem
        {...defaultProps}
        theCase={{ ...mockCase, externalService: basicPush }}
        selectedFields={[
          { field: 'externalIncident', name: i18n.EXTERNAL_INCIDENT, isChecked: true },
        ]}
      />
    );

    const link = screen.getByTestId(`cases-list-item-clickable-${mockCase.id}`);
    const externalLink = screen.getByTestId('cases-list-item-field-external-link');

    expect(link.contains(externalLink)).toBe(false);
    expect(externalLink).toHaveAttribute('href', basicPush.externalUrl);
  });

  it('navigates to case view when the link content is clicked', async () => {
    renderWithTestingProviders(<CaseListItem {...defaultProps} />);

    await userEvent.click(screen.getByTestId('cases-list-item-reporter'));

    expect(mockNavigateToCaseView).toHaveBeenCalledWith({ detailName: mockCase.id });
  });

  it('does not navigate when the action button is clicked', async () => {
    renderWithTestingProviders(<CaseListItem {...defaultProps} />);

    await userEvent.click(screen.getByTestId('mock-action-column'));

    expect(mockNavigateToCaseView).not.toHaveBeenCalled();
  });
});
