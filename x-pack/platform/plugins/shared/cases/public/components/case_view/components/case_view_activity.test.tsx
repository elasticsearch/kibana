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
  customFieldsConfigurationMock,
  customFieldsMock,
  getCaseUsersMockResponse,
  getUserAction,
} from '../../../containers/mock';
import { noUpdateCasesPermissions, renderWithTestingProviders } from '../../../common/mock';
import { CaseViewActivity } from './case_view_activity';
import type { CaseUI } from '../../../../common';
import { CASE_VIEW_PAGE_TABS } from '../../../../common/types';
import type { CaseViewProps } from '../types';
import { useFindCaseUserActions } from '../../../containers/use_find_case_user_actions';
import { usePostPushToService } from '../../../containers/use_post_push_to_service';
import { useGetSupportedActionConnectors } from '../../../containers/configure/use_get_supported_action_connectors';
import { useGetTags } from '../../../containers/use_get_tags';
import { useGetCategories } from '../../../containers/use_get_categories';
import { useGetCaseConnectors } from '../../../containers/use_get_case_connectors';
import { useGetCaseUsers } from '../../../containers/use_get_case_users';
import { waitForComponentToUpdate } from '../../../common/test_utils';
import { getCaseConnectorsMockResponse } from '../../../common/mock/connectors';
import { defaultInfiniteUseFindCaseUserActions, defaultUseFindCaseUserActions } from '../mocks';
import { useGetCaseUserActionsStats } from '../../../containers/use_get_case_user_actions_stats';
import { useInfiniteFindCaseUserActions } from '../../../containers/use_infinite_find_case_user_actions';
import { useOnUpdateField } from '../use_on_update_field';
import { useCasesFeatures } from '../../../common/use_cases_features';
import { AttachmentType, ConnectorTypes, UserActionTypes } from '../../../../common/types/domain';
import { CaseMetricsFeature } from '../../../../common/types/api';
import { useGetCaseConfiguration } from '../../../containers/configure/use_get_case_configuration';
import { useGetCurrentUserProfile } from '../../../containers/user_profiles/use_get_current_user_profile';
import { useReplaceCustomField } from '../../../containers/use_replace_custom_field';
import { KibanaServices } from '../../../common/lib/kibana';
import { isLegacyAttachmentRequest } from '../../../../common/utils/attachments';

jest.mock('./template_fields', () => ({
  TemplateFields: () => <div data-test-subj="case-view-template-fields" />,
}));
jest.mock('./global_case_fields', () => ({
  GlobalCaseFields: () => null,
}));

jest.mock('../../../containers/use_infinite_find_case_user_actions');
jest.mock('../../../containers/use_find_case_user_actions');
jest.mock('../../../containers/use_get_case_user_actions_stats');
jest.mock('../../../containers/configure/use_get_supported_action_connectors');
jest.mock('../../../containers/use_post_push_to_service');
jest.mock('../../user_actions/timestamp', () => ({
  UserActionTimestamp: () => <></>,
}));
jest.mock('../../../common/navigation/hooks');
jest.mock('../../../containers/use_get_action_license');
jest.mock('../../../containers/use_get_tags');
jest.mock('../../../containers/use_get_categories');
jest.mock('../../../containers/user_profiles/use_bulk_get_user_profiles');
jest.mock('../../../containers/use_get_case_connectors');
jest.mock('../../../containers/use_get_case_users');
jest.mock('../../../containers/use_replace_custom_field');
jest.mock('../use_on_update_field');
jest.mock('../../../common/use_cases_features');
jest.mock('../../../containers/configure/use_get_case_configuration');
jest.mock('../../../containers/user_profiles/use_get_current_user_profile');

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

const activityTab = CASE_VIEW_PAGE_TABS.ACTIVITY;

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
  activeTab: activityTab,
};

const caseUsers = getCaseUsersMockResponse();
const useGetCasesFeaturesRes = {
  metricsFeatures: [CaseMetricsFeature.ALERTS_COUNT],
  pushToServiceAuthorized: true,
  caseAssignmentAuthorized: true,
  isAlertsEnabled: true,
  isSyncAlertsEnabled: true,
};

const replaceCustomField = jest.fn();

const useFindCaseUserActionsMock = useFindCaseUserActions as jest.Mock;
const useInfiniteFindCaseUserActionsMock = useInfiniteFindCaseUserActions as jest.Mock;
const useGetCaseUserActionsStatsMock = useGetCaseUserActionsStats as jest.Mock;
const useGetConnectorsMock = useGetSupportedActionConnectors as jest.Mock;
const usePostPushToServiceMock = usePostPushToService as jest.Mock;
const useGetCaseConnectorsMock = useGetCaseConnectors as jest.Mock;
const useGetCaseUsersMock = useGetCaseUsers as jest.Mock;
const useOnUpdateFieldMock = useOnUpdateField as jest.Mock;
const useCasesFeaturesMock = useCasesFeatures as jest.Mock;
const useReplaceCustomFieldMock = useReplaceCustomField as jest.Mock;

const localStorageKey = `${basicCase.owner}.cases.userActivity.sortOrder`;

describe('Case View Page activity tab', () => {
  const caseConnectors = getCaseConnectorsMockResponse();
  const platinumLicense = licensingMock.createLicense({
    license: { type: 'platinum' },
  });
  const basicLicense = licensingMock.createLicense({
    license: { type: 'basic' },
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
    useReplaceCustomFieldMock.mockImplementation(() => ({
      isUpdatingCustomField: false,
      isError: false,
      mutate: replaceCustomField,
    }));

    Object.defineProperty(window, 'getComputedStyle', {
      value: (el: HTMLElement) => {
        /**
         * This is based on the jsdom implementation of getComputedStyle
         * https://github.com/jsdom/jsdom/blob/9dae17bf0ad09042cfccd82e6a9d06d3a615d9f4/lib/jsdom/browser/Window.js#L779-L820
         *
         * It is missing global style parsing and will only return styles applied directly to an element.
         * Will not return styles that are global or from emotion
         */
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
    useCasesFeaturesMock.mockReturnValue(useGetCasesFeaturesRes);
  });

  it('should render the activity content and main components', async () => {
    renderWithTestingProviders(<CaseViewActivity {...caseProps} />, {
      wrapperProps: { license: platinumLicense },
    });

    const caseViewActivity = await screen.findByTestId('case-view-activity');
    expect(await within(caseViewActivity).findAllByTestId('user-actions-list')).toHaveLength(2);
    expect(
      await within(caseViewActivity).findByTestId('case-view-status-action-button')
    ).toBeInTheDocument();

    expect(await screen.findByTestId('description')).toBeInTheDocument();

    const caseViewSidebar = await screen.findByTestId('case-view-page-sidebar');
    expect(await within(caseViewSidebar).findByTestId('case-tags')).toBeInTheDocument();
    expect(await within(caseViewSidebar).findByTestId('cases-categories')).toBeInTheDocument();
    expect(await within(caseViewSidebar).findByTestId('connector-edit-header')).toBeInTheDocument();

    await waitForComponentToUpdate();
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

  it('should disable the severity selector when the user does not have update permissions', async () => {
    renderWithTestingProviders(<CaseViewActivity {...caseProps} />, {
      wrapperProps: { license: platinumLicense, permissions: noUpdateCasesPermissions() },
    });

    expect(await screen.findByTestId('case-severity-selection')).toBeDisabled();

    await waitForComponentToUpdate();
  });

  it('should show a loading when loading user actions stats', async () => {
    useGetCaseUserActionsStatsMock.mockReturnValue({ isLoading: true });

    renderWithTestingProviders(<CaseViewActivity {...caseProps} />);

    expect(await screen.findByTestId('case-view-loading-content')).toBeInTheDocument();
    expect(screen.queryByTestId('case-view-activity')).not.toBeInTheDocument();
    expect(screen.queryByTestId('user-actions-list')).not.toBeInTheDocument();
  });

  it('should show a loading when updating severity ', async () => {
    useOnUpdateFieldMock.mockReturnValue({ isLoading: true, loadingKey: 'severity' });

    renderWithTestingProviders(<CaseViewActivity {...caseProps} />);

    expect(
      (await screen.findByTestId('case-severity-selection')).classList.contains(
        'euiSuperSelectControl-isLoading'
      )
    ).toBeTruthy();
  });

  it('should not show a loading for severity when updating tags', async () => {
    useOnUpdateFieldMock.mockReturnValue({ isLoading: true, loadingKey: 'tags' });

    renderWithTestingProviders(<CaseViewActivity {...caseProps} />);

    expect(
      (await screen.findByTestId('case-severity-selection')).classList.contains(
        'euiSuperSelectControl-isLoading'
      )
    ).not.toBeTruthy();
  });

  it('should not render the assignees on basic license', () => {
    useCasesFeaturesMock.mockReturnValue({
      ...useGetCasesFeaturesRes,
      caseAssignmentAuthorized: false,
    });

    renderWithTestingProviders(<CaseViewActivity {...caseProps} />, {
      wrapperProps: { license: basicLicense },
    });

    expect(screen.queryByTestId('case-view-assignees')).not.toBeInTheDocument();
  });

  it('should render the assignees on platinum license', async () => {
    renderWithTestingProviders(<CaseViewActivity {...caseProps} />, {
      wrapperProps: { license: platinumLicense },
    });

    expect(await screen.findByTestId('case-view-assignees')).toBeInTheDocument();

    await waitForComponentToUpdate();
  });

  it('should not render the connector on basic license', () => {
    useCasesFeaturesMock.mockReturnValue({
      ...useGetCasesFeaturesRes,
      pushToServiceAuthorized: false,
    });

    renderWithTestingProviders(<CaseViewActivity {...caseProps} />, {
      wrapperProps: { license: basicLicense },
    });

    expect(screen.queryByTestId('case-view-edit-connector')).not.toBeInTheDocument();
  });

  it('should render the connector on platinum license', async () => {
    renderWithTestingProviders(<CaseViewActivity {...caseProps} />, {
      wrapperProps: { license: platinumLicense },
    });

    expect(await screen.findByTestId('case-view-edit-connector')).toBeInTheDocument();
  });

  it('should call useReplaceCustomField correctly', async () => {
    (useGetCaseConfiguration as jest.Mock).mockReturnValue({
      data: {
        customFields: [customFieldsConfigurationMock[1]],
        observableTypes: [],
      },
    });

    const caseDataWithCustomFields: CaseUI = {
      ...caseProps.caseData,
      customFields: [customFieldsMock[1]],
    };

    renderWithTestingProviders(
      <CaseViewActivity {...caseProps} caseData={caseDataWithCustomFields} />
    );

    await userEvent.click(await screen.findByRole('switch'));

    await waitFor(() => {
      expect(replaceCustomField).toHaveBeenCalledWith({
        caseId: caseData.id,
        caseVersion: caseData.version,
        caseData: caseDataWithCustomFields,
        customFieldId: customFieldsMock[1].key,
        customFieldValue: false,
      });
    });

    expect(await screen.findByTestId('case-view-edit-connector')).toBeInTheDocument();
  });

  it('should save sortOrder in localstorage', async () => {
    (useGetCaseConfiguration as jest.Mock).mockReturnValue({
      data: {
        customFields: [customFieldsConfigurationMock[1]],
        observableTypes: [],
      },
    });

    renderWithTestingProviders(
      <CaseViewActivity
        {...caseProps}
        caseData={{
          ...caseProps.caseData,
          customFields: [customFieldsMock[1]],
        }}
      />
    );

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

  describe('Case users', () => {
    describe('Assignees', () => {
      it('should render assignees in the participants section', async () => {
        renderWithTestingProviders(
          <CaseViewActivity
            {...caseProps}
            caseData={{
              ...caseProps.caseData,
              assignees: caseUsers.assignees.map((assignee) => ({
                uid: assignee.uid ?? 'not-valid',
              })),
            }}
          />,
          {
            wrapperProps: { license: platinumLicense },
          }
        );

        const assigneesSection = within(await screen.findByTestId('case-view-assignees'));

        expect(await assigneesSection.findByText('Unknown')).toBeInTheDocument();
        expect(await assigneesSection.findByText('Fuzzy Marten')).toBeInTheDocument();
        expect(await assigneesSection.findByText('elastic')).toBeInTheDocument();
        expect(await assigneesSection.findByText('Misty Mackerel')).toBeInTheDocument();
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

        const userActions = within((await screen.findAllByTestId('user-actions-list'))[1]);

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

        const userActions = within((await screen.findAllByTestId('user-actions-list'))[1]);

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

        const userActions = within((await screen.findAllByTestId('user-actions-list'))[1]);

        expect(await userActions.findByText('Participant 1')).toBeInTheDocument();
        expect(await userActions.findByText('participant_2@elastic.co')).toBeInTheDocument();
        expect(await userActions.findByText('participant_3')).toBeInTheDocument();
        expect(await userActions.findByText('P4')).toBeInTheDocument();
        expect(await userActions.findByText('Participant 5')).toBeInTheDocument();
      });
    });

    describe('Category', () => {
      it('should show the category correctly', async () => {
        renderWithTestingProviders(
          <CaseViewActivity
            {...caseProps}
            caseData={{
              ...caseProps.caseData,
              category: 'My category',
            }}
          />
        );

        expect(await screen.findByText('My category'));
      });
    });
  });

  describe('TemplateFields', () => {
    it('does not render TemplateFields when templates v2 is disabled', async () => {
      jest.spyOn(KibanaServices, 'getConfig').mockReturnValue(undefined);

      renderWithTestingProviders(<CaseViewActivity {...caseProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('case-view-page-sidebar')).toBeInTheDocument();
      });

      expect(screen.queryByTestId('case-view-template-fields')).not.toBeInTheDocument();
    });

    it('renders TemplateFields when templates v2 is enabled', async () => {
      jest
        .spyOn(KibanaServices, 'getConfig')
        .mockReturnValue({ templates: { enabled: true } } as ReturnType<
          typeof KibanaServices.getConfig
        >);

      renderWithTestingProviders(<CaseViewActivity {...caseProps} />);

      expect(await screen.findByTestId('case-view-template-fields')).toBeInTheDocument();
    });
  });
});
