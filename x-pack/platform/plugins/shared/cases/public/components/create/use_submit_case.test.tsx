/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { waitFor, renderHook } from '@testing-library/react';

import { useKibana } from '../../common/lib/kibana';

import { usePostCase } from '../../containers/use_post_case';
import { useCreateAttachments } from '../../containers/use_create_attachments';

import { useGetAllCaseConfigurations } from '../../containers/configure/use_get_all_case_configurations';

import { useGetIssueTypes } from '../connectors/jira/use_get_issue_types';
import { useGetChoices } from '../connectors/servicenow/use_get_choices';
import { useGetFieldsByIssueType } from '../connectors/jira/use_get_fields_by_issue_type';
import { useGetAllCaseConfigurationsResponse } from '../configure_cases/__mock__';
import { usePostPushToService } from '../../containers/use_post_push_to_service';
import { useGetSupportedActionConnectors } from '../../containers/configure/use_get_supported_action_connectors';
import { useLicense } from '../../common/use_license';
import { useAvailableCasesOwners } from '../app/use_available_owners';
import { useSubmitCase, type UseSubmitCaseProps } from './use_submit_case';
import { TestProviders } from '../../common/mock/test_providers';

import {
  sampleConnectorData,
  sampleData,
  useGetIssueTypesResponse,
  useGetFieldsByIssueTypeResponse,
  useGetChoicesResponse,
} from './mock';

jest.mock('../../containers/use_post_case');
jest.mock('../../containers/use_create_attachments');
jest.mock('../../containers/use_post_push_to_service');
jest.mock('../../containers/use_get_tags');
jest.mock('../../containers/configure/use_get_supported_action_connectors');
jest.mock('../../containers/configure/use_get_all_case_configurations');
jest.mock('../connectors/jira/use_get_issue_types');
jest.mock('../connectors/jira/use_get_fields_by_issue_type');
jest.mock('../connectors/jira/use_get_issues');
jest.mock('../connectors/servicenow/use_get_choices');
jest.mock('../../common/lib/kibana');
jest.mock('../../containers/user_profiles/api');
jest.mock('../../common/use_license');
jest.mock('../../containers/use_get_categories');
jest.mock('../app/use_available_owners');

const useGetConnectorsMock = useGetSupportedActionConnectors as jest.Mock;
const useGetAllCaseConfigurationsMock = useGetAllCaseConfigurations as jest.Mock;
const usePostCaseMock = usePostCase as jest.Mock;
const useCreateAttachmentsMock = useCreateAttachments as jest.Mock;
const usePostPushToServiceMock = usePostPushToService as jest.Mock;
const useGetIssueTypesMock = useGetIssueTypes as jest.Mock;
const useGetFieldsByIssueTypeMock = useGetFieldsByIssueType as jest.Mock;
const useGetChoicesMock = useGetChoices as jest.Mock;
const pushCaseToExternalService = jest.fn();
const useKibanaMock = useKibana as jest.Mocked<typeof useKibana>;
const useLicenseMock = useLicense as jest.Mock;
const useAvailableOwnersMock = useAvailableCasesOwners as jest.Mock;

const sampleId = 'case-id';

const postCase = jest.fn();

const defaultPostCase = {
  isLoading: false,
  isError: false,
  mutateAsync: postCase,
};

const defaultPostPushToService = {
  isLoading: false,
  isError: false,
  mutateAsync: pushCaseToExternalService,
};

const sampleDataWithoutTags = {
  ...sampleData,
  tags: [],
};

const renderUseSubmitCase = (props: UseSubmitCaseProps) =>
  renderHook(() => useSubmitCase(props), { wrapper: TestProviders });

describe('useSubmitCase', () => {
  beforeEach(() => {
    postCase.mockResolvedValue({
      id: sampleId,
      ...sampleDataWithoutTags,
    });
    usePostCaseMock.mockImplementation(() => defaultPostCase);

    const createAttachments = jest.fn();

    postCase.mockResolvedValue({
      id: sampleId,
      ...sampleDataWithoutTags,
    });
    usePostCaseMock.mockImplementation(() => defaultPostCase);
    useCreateAttachmentsMock.mockImplementation(() => ({ mutateAsync: createAttachments }));
    usePostPushToServiceMock.mockImplementation(() => defaultPostPushToService);
    useGetConnectorsMock.mockReturnValue(sampleConnectorData);
    useGetAllCaseConfigurationsMock.mockImplementation(() => useGetAllCaseConfigurationsResponse);
    useGetIssueTypesMock.mockReturnValue(useGetIssueTypesResponse);
    useGetFieldsByIssueTypeMock.mockReturnValue(useGetFieldsByIssueTypeResponse);
    useGetChoicesMock.mockReturnValue(useGetChoicesResponse);
    useAvailableOwnersMock.mockReturnValue(['securitySolution', 'observability', 'cases']);

    useKibanaMock().services.triggersActionsUi.actionTypeRegistry.get = jest.fn().mockReturnValue({
      actionTypeTitle: '.servicenow',
      iconClass: 'logoSecurity',
    });

    useLicenseMock.mockReturnValue({ isAtLeastGold: () => true, isAtLeastPlatinum: () => true });
  });

  beforeEach(() => jest.clearAllMocks());

  describe('if payload is valid', () => {
    const payloadIsValid = true;

    it('should post case', async () => {
      const onSuccess = jest.fn();
      const afterCaseCreated = jest.fn();

      usePostCaseMock.mockImplementationOnce(() => ({ ...defaultPostCase, isLoading: true }));

      const { result } = renderUseSubmitCase({
        attachments: [],
        onSuccess,
        afterCaseCreated,
      });

      await result.current.submitCase(sampleDataWithoutTags, payloadIsValid);

      await waitFor(() => {
        expect(postCase).toHaveBeenCalled();
      });

      expect(result.current.isSubmitting).toEqual(true);

      expect(postCase).toBeCalledWith({ request: sampleDataWithoutTags });
      expect(onSuccess).toHaveBeenCalled();
      expect(afterCaseCreated).toHaveBeenCalled();
    });
  });

  describe('if payload is not valid', () => {
    const payloadIsValid = false;

    it('should not post case', async () => {
      const onSuccess = jest.fn();
      const afterCaseCreated = jest.fn();

      const { result } = renderUseSubmitCase({
        attachments: [],
        onSuccess,
        afterCaseCreated,
      });

      await result.current.submitCase(sampleDataWithoutTags, payloadIsValid);

      await waitFor(
        () => {
          expect(postCase).not.toHaveBeenCalled();
        },
        { timeout: 100 }
      );

      expect(result.current.isSubmitting).toEqual(false);
    });
  });
});
