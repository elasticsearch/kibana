/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import userEvent from '@testing-library/user-event';
import { screen, waitFor, within } from '@testing-library/react';
import { licensingMock } from '@kbn/licensing-plugin/public/mocks';
import {
  alertComment,
  basicCase,
  connectorsMock,
  getCaseUsersMockResponse,
  getUserAction,
} from '../../../../containers/mock';
import { noUpdateCasesPermissions, renderWithTestingProviders } from '../../../../common/mock';
import { CaseViewActivity } from './case_view_activity';
import type { CaseUI } from '../../../../../common';
import type { CaseViewProps } from '../../../case_view/types';
import { useFindCaseUserActions } from '../../../../containers/use_find_case_user_actions';
import { usePostPushToService } from '../../../../containers/use_post_push_to_service';
import { useGetSupportedActionConnectors } from '../../../../containers/configure/use_get_supported_action_connectors';
import { useGetTags } from '../../../../containers/use_get_tags';
import { useGetCategories } from '../../../../containers/use_get_categories';
import { useGetCaseConnectors } from '../../../../containers/use_get_case_connectors';
import { useGetCaseUsers } from '../../../../containers/use_get_case_users';
import { waitForComponentToUpdate } from '../../../../common/test_utils';
import { getCaseConnectorsMockResponse } from '../../../../common/mock/connectors';
import {
  defaultInfiniteUseFindCaseUserActions,
  defaultUseFindCaseUserActions,
} from '../../../case_view/mocks';
import { useGetCaseUserActionsStats } from '../../../../containers/use_get_case_user_actions_stats';
import { useInfiniteFindCaseUserActions } from '../../../../containers/use_infinite_find_case_user_actions';
import { useOnUpdateField } from '../../../case_view/use_on_update_field';
import {
  AttachmentType,
  ConnectorTypes,
  UserActionTypes,
} from '../../../../../common/types/domain';
import { useGetCaseConfiguration } from '../../../../containers/configure/use_get_case_configuration';
import { useGetCurrentUserProfile } from '../../../../containers/user_profiles/use_get_current_user_profile';
import { isLegacyAttachmentRequest } from '../../../../../common/utils/attachments';

jest.mock('../../../../containers/use_infinite_find_case_user_actions');
jest.mock('../../../../containers/use_find_case_user_actions');
jest.mock('../../../../containers/use_get_case_user_actions_stats');
jest.mock('../../../../containers/configure/use_get_supported_action_connectors');
jest.mock('../../../../containers/use_post_push_to_service');
jest.mock('../../../user_actions/timestamp', () => ({
  UserActionTimestamp: () => <></>,
}));
jest.mock('./sidebar_toggle_button', () => ({
  SidebarToggleButton: () => <div data-test-subj="case-view-sidebar-toggle" />,
}));
jest.mock('../../../../common/navigation/hooks');
jest.mock('../../../../containers/use_get_action_license');
jest.mock('../../../../containers/use_get_tags');
jest.mock('../../../../containers/use_get_categories');
jest.mock('../../../../containers/user_profiles/use_bulk_get_user_profiles');
jest.mock('../../../../containers/use_get_case_connectors');
jest.mock('../../../../containers/use_get_case_users');
jest.mock('../../../case_view/use_on_update_field');
jest.mock('../../../../containers/configure/use_get_case_configuration');
jest.mock('../../../../containers/user_profiles/use_get_current_user_profile');

(useGetTags as jest.Mock).mockReturnValue({ data: ['coke', 'pepsi'], refetch: jest.fn() });
(useGetCategories as jest.Mock).mockReturnValue({ data: ['foo', 'bar'], refetch: jest.fn() });
(useGetCaseConfiguration as jest.Mock).mockReturnValue({ data: { observableTypes: [] } });
(useGetCurrentUserProfile as jest.Mock).mockReturnValue({ data: {}, isFetching: false });

const caseData: CaseUI = {
  ...basicCase,
  comments: [...basicCase.comments, alertComment],
  connector: {
    id: 'resilient-2',
    name: 'Resilient',
    type: ConnectorTypes.resilient,
    fields: null,
  },
};

const caseViewProps: CaseViewProps = {
  onComponentInitialized: jest.fn(),
};

const userActivityQueryParams = {
  type: 'all',
  sortOrder: 'asc',
  page: 1,
  perPage: 10,
};

const pushCaseToExternalService = jest.fn();

const userActionsStats = {
  total: 21,
  totalDeletions: 0,
  totalComments: 9,
  totalCommentDeletions: 0,
  totalCommentCreations: 9,
  totalHiddenCommentUpdates: 0,
  totalOtherActions: 11,
  totalOtherActionDeletions: 0,
};

const caseProps = {
  ...caseViewProps,
  caseData,
  fetchCaseMetrics: jest.fn(),
};

const caseUsers = getCaseUsersMockResponse();

const useFindCaseUserActionsMock = useFindCaseUserActions as jest.Mock;
const useInfiniteFindCaseUserActionsMock = useInfiniteFindCaseUserActions as jest.Mock;
const useGetCaseUserActionsStatsMock = useGetCaseUserActionsStats as jest.Mock;
const useGetConnectorsMock = useGetSupportedActionConnectors as jest.Mock;
const usePostPushToServiceMock = usePostPushToService as jest.Mock;
const useGetCaseConnectorsMock = useGetCaseConnectors as jest.Mock;
const useGetCaseUsersMock = useGetCaseUsers as jest.Mock;
const useOnUpdateFieldMock = useOnUpdateField as jest.Mock;

const localStorageKey = `${basicCase.owner}.cases.userActivity.sortOrder`;

describe('Case View Page activity tab (redesign)', () => {
  const caseConnectors = getCaseConnectorsMockResponse();
  const platinumLicense = licensingMock.createLicense({
    license: { type: 'platinum' },
  });
  // eslint-disable-next-line prefer-object-spread
  const originalGetComputedStyle = Object.assign({}, window.getComputedStyle);

  beforeAll(() => {
    useFindCaseUserActionsMock.mockReturnValue(defaultUseFindCaseUserActions);
    useInfiniteFindCaseUserActionsMock.mockReturnValue(defaultInfiniteUseFindCaseUserActions);
    useGetCaseUserActionsStatsMock.mockReturnValue({ data: userActionsStats, isLoading: false });
    useGetConnectorsMock.mockReturnValue({ data: connectorsMock, isLoading: false });
    usePostPushToServiceMock.mockReturnValue({
      isLoading: false,
      mutateAsync: pushCaseToExternalService,
    });
    useGetCaseConnectorsMock.mockReturnValue({
      isLoading: false,
      data: caseConnectors,
    });
    useOnUpdateFieldMock.mockReturnValue({
      isLoading: false,
      useOnUpdateField: jest.fn,
    });

    Object.defineProperty(window, 'getComputedStyle', {
      value: (el: HTMLElement) => {
        const declaration = new CSSStyleDeclaration();
        const { style } = el;

        Array.prototype.forEach.call(style, (property: string) => {
          declaration.setProperty(
            property,
            style.getPropertyValue(property),
            style.getPropertyPriority(property)
          );
        });

        return declaration;
      },
      configurable: true,
      writable: true,
    });
  });

  afterAll(() => {
    Object.defineProperty(window, 'getComputedStyle', originalGetComputedStyle);
  });

  beforeEach(() => {
    jest.clearAllMocks();

    localStorage.clear();

    useGetCaseUsersMock.mockReturnValue({ isLoading: false, data: caseUsers });
  });

  it('should render the activity content and main components', async () => {
    renderWithTestingProviders(<CaseViewActivity {...caseProps} />, {
      wrapperProps: { license: platinumLicense },
    });

    const caseViewActivity = await screen.findByTestId('case-view-activity');
    expect(await within(caseViewActivity).findAllByTestId('user-actions-list')).toHaveLength(1);
    expect(
      await within(caseViewActivity).findByTestId('case-view-status-action-button')
    ).toBeInTheDocument();

    expect(await screen.findByTestId('description')).toBeInTheDocument();

    await waitForComponentToUpdate();
  });

  it('should not render the sidebar (sidebar is now a separate component)', async () => {
    renderWithTestingProviders(<CaseViewActivity {...caseProps} />, {
      wrapperProps: { license: platinumLicense },
    });

    await screen.findByTestId('case-view-activity');
    expect(screen.queryByTestId('case-view-page-sidebar')).not.toBeInTheDocument();
  });

  it('should call use get user actions as per top and bottom actions list', async () => {
    renderWithTestingProviders(<CaseViewActivity {...caseProps} />, {
      wrapperProps: { license: platinumLicense },
    });

    const lastPageForAll = Math.ceil(userActionsStats.total / userActivityQueryParams.perPage);

    await waitFor(() => {
      expect(useInfiniteFindCaseUserActionsMock).toHaveBeenCalledWith(
        caseData.id,
        userActivityQueryParams,
        true
      );
    });

    expect(useFindCaseUserActionsMock).toHaveBeenCalledWith(
      caseData.id,
      { ...userActivityQueryParams, page: lastPageForAll },
      true
    );
  });

  it('should not render the case view status button when the user does not have update permissions', async () => {
    renderWithTestingProviders(<CaseViewActivity {...caseProps} />, {
      wrapperProps: { license: platinumLicense, permissions: noUpdateCasesPermissions() },
    });

    expect(screen.queryByTestId('case-view-status-action-button')).not.toBeInTheDocument();

    await waitForComponentToUpdate();
  });

  it('should show a loading when loading user actions stats', async () => {
    useGetCaseUserActionsStatsMock.mockReturnValue({ isLoading: true });

    renderWithTestingProviders(<CaseViewActivity {...caseProps} />);

    expect(await screen.findByTestId('case-view-loading-content')).toBeInTheDocument();
    expect(screen.queryByTestId('case-view-activity')).not.toBeInTheDocument();
    expect(screen.queryByTestId('user-actions-list')).not.toBeInTheDocument();
  });

  it('should save sortOrder in localstorage', async () => {
    renderWithTestingProviders(<CaseViewActivity {...caseProps} />);

    await userEvent.selectOptions(await screen.findByTestId('user-actions-sort-select'), 'desc');

    expect(localStorage.getItem(localStorageKey)).toBe('"desc"');
  });

  describe('filter activity', () => {
    beforeEach(() => {
      jest.clearAllMocks();
      useFindCaseUserActionsMock.mockReturnValue(defaultUseFindCaseUserActions);
      useInfiniteFindCaseUserActionsMock.mockReturnValue(defaultInfiniteUseFindCaseUserActions);
      useGetCaseUserActionsStatsMock.mockReturnValue({
        data: userActionsStats,
        isLoading: false,
      });
    });

    it('should call user action hooks correctly when filtering for all', async () => {
      renderWithTestingProviders(<CaseViewActivity {...caseProps} />);

      const lastPageForAll = Math.ceil(userActionsStats.total / userActivityQueryParams.perPage);

      await userEvent.click(await screen.findByTestId('user-actions-filter-activity-button-all'));

      expect(useInfiniteFindCaseUserActionsMock).toHaveBeenCalledWith(
        caseData.id,
        userActivityQueryParams,
        true
      );

      expect(useFindCaseUserActionsMock).toHaveBeenCalledWith(
        caseData.id,
        { ...userActivityQueryParams, page: lastPageForAll },
        true
      );

      expect(useGetCaseUserActionsStatsMock).toHaveBeenCalledWith(caseData.id);
    });

    it('should call user action hooks correctly when filtering for comments', async () => {
      renderWithTestingProviders(<CaseViewActivity {...caseProps} />);

      const lastPageForComment = Math.ceil(
        userActionsStats.totalComments / userActivityQueryParams.perPage
      );

      await userEvent.click(
        await screen.findByTestId('user-actions-filter-activity-button-comments')
      );

      expect(useGetCaseUserActionsStatsMock).toHaveBeenCalledWith(caseData.id);
      expect(useInfiniteFindCaseUserActionsMock).toHaveBeenCalledWith(
        caseData.id,
        { ...userActivityQueryParams, type: 'user' },
        true
      );
      expect(useFindCaseUserActionsMock).toHaveBeenCalledWith(
        caseData.id,
        { ...userActivityQueryParams, type: 'user', page: lastPageForComment },
        false
      );
    });

    it('should call user action hooks correctly when filtering for history', async () => {
      renderWithTestingProviders(<CaseViewActivity {...caseProps} />);

      const lastPageForHistory = Math.ceil(
        userActionsStats.totalOtherActions / userActivityQueryParams.perPage
      );

      await userEvent.click(
        await screen.findByTestId('user-actions-filter-activity-button-history')
      );

      expect(useGetCaseUserActionsStatsMock).toHaveBeenCalledWith(caseData.id);
      expect(useInfiniteFindCaseUserActionsMock).toHaveBeenCalledWith(
        caseData.id,
        { ...userActivityQueryParams, type: 'action' },
        true
      );
      expect(useFindCaseUserActionsMock).toHaveBeenCalledWith(
        caseData.id,
        { ...userActivityQueryParams, type: 'action', page: lastPageForHistory },
        true
      );
    });
  });

  describe('User actions', () => {
    it('renders the unassigned users correctly', async () => {
      useFindCaseUserActionsMock.mockReturnValue({
        ...defaultUseFindCaseUserActions,
        data: {
          userActions: [getUserAction(UserActionTypes.assignees, 'delete')],
        },
      });

      renderWithTestingProviders(<CaseViewActivity {...caseProps} />);

      const userActions = within((await screen.findAllByTestId('user-actions-list'))[0]);

      expect(await userActions.findByText('cases_no_connectors')).toBeInTheDocument();
      expect(await userActions.findByText('Valid Chimpanzee')).toBeInTheDocument();
    });

    it('renders the assigned users correctly', async () => {
      useFindCaseUserActionsMock.mockReturnValue({
        ...defaultUseFindCaseUserActions,
        data: {
          userActions: [
            getUserAction(UserActionTypes.assignees, 'add', {
              payload: {
                assignees: [
                  { uid: 'not-valid' },
                  { uid: 'u_3OgKOf-ogtr8kJ5B0fnRcqzXs2aQQkZLtzKEEFnKaYg_0' },
                ],
              },
            }),
          ],
        },
      });

      renderWithTestingProviders(<CaseViewActivity {...caseProps} />);

      const userActions = within((await screen.findAllByTestId('user-actions-list'))[0]);

      expect(await userActions.findByText('Fuzzy Marten')).toBeInTheDocument();
      expect(await userActions.findByText('Unknown')).toBeInTheDocument();
    });

    it('renders the user action users correctly', async () => {
      const commentUpdate = getUserAction('comment', 'update', {
        createdBy: {
          ...caseUsers.participants[1].user,
          fullName: caseUsers.participants[1].user.full_name,
          profileUid: caseUsers.participants[1].uid,
        },
      });

      useFindCaseUserActionsMock.mockReturnValue({
        ...defaultUseFindCaseUserActions,
        data: {
          userActions: [
            getUserAction('description', 'create'),
            getUserAction('description', 'update', {
              createdBy: {
                ...caseUsers.participants[0].user,
                fullName: caseUsers.participants[0].user.full_name,
                profileUid: caseUsers.participants[0].uid,
              },
            }),
            commentUpdate,
            getUserAction('description', 'update', {
              createdBy: {
                ...caseUsers.participants[2].user,
                fullName: caseUsers.participants[2].user.full_name,
                profileUid: caseUsers.participants[2].uid,
              },
            }),
            getUserAction('title', 'update', {
              createdBy: {
                ...caseUsers.participants[3].user,
                fullName: caseUsers.participants[3].user.full_name,
                profileUid: caseUsers.participants[3].uid,
              },
            }),
            getUserAction('tags', 'add', {
              createdBy: {
                ...caseUsers.participants[4].user,
                fullName: caseUsers.participants[4].user.full_name,
                profileUid: caseUsers.participants[4].uid,
              },
            }),
          ],
          latestAttachments:
            commentUpdate.type === 'comment' &&
            commentUpdate.payload.comment?.type === AttachmentType.user &&
            isLegacyAttachmentRequest(commentUpdate.payload.comment)
              ? [
                  {
                    comment: commentUpdate.payload.comment.comment,
                    createdAt: commentUpdate.createdAt,
                    createdBy: commentUpdate.createdBy,
                    id: commentUpdate.commentId,
                    owner: commentUpdate.owner,
                    pushed_at: null,
                    pushed_by: null,
                    type: 'user',
                    updated_at: null,
                    updated_by: null,
                    version: commentUpdate.version,
                  },
                ]
              : [],
        },
      });

      renderWithTestingProviders(<CaseViewActivity {...caseProps} />);

      const userActions = within((await screen.findAllByTestId('user-actions-list'))[0]);

      expect(await userActions.findByText('Participant 1')).toBeInTheDocument();
      expect(await userActions.findByText('participant_2@elastic.co')).toBeInTheDocument();
      expect(await userActions.findByText('participant_3')).toBeInTheDocument();
      expect(await userActions.findByText('P4')).toBeInTheDocument();
      expect(await userActions.findByText('Participant 5')).toBeInTheDocument();
    });
  });
});
