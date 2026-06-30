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
} from '../../../../containers/mock';
import { noUpdateCasesPermissions, renderWithTestingProviders } from '../../../../common/mock';
import { CaseViewSidebar } from './case_view_sidebar';
import type { CaseUI } from '../../../../../common';
import { ConnectorTypes } from '../../../../../common/types/domain';
import { CaseMetricsFeature } from '../../../../../common/types/api';
import { useGetSupportedActionConnectors } from '../../../../containers/configure/use_get_supported_action_connectors';
import { useGetTags } from '../../../../containers/use_get_tags';
import { useGetCategories } from '../../../../containers/use_get_categories';
import { useGetCaseConnectors } from '../../../../containers/use_get_case_connectors';
import { useGetCaseUsers } from '../../../../containers/use_get_case_users';
import { waitForComponentToUpdate } from '../../../../common/test_utils';
import { getCaseConnectorsMockResponse } from '../../../../common/mock/connectors';
import { useOnUpdateField } from '../../../case_view/use_on_update_field';
import { useCasesFeatures } from '../../../../common/use_cases_features';
import { useGetCaseConfiguration } from '../../../../containers/configure/use_get_case_configuration';
import { useGetCurrentUserProfile } from '../../../../containers/user_profiles/use_get_current_user_profile';
import { useReplaceCustomField } from '../../../../containers/use_replace_custom_field';
import { KibanaServices } from '../../../../common/lib/kibana';

jest.mock('../../../case_view/components/template_fields', () => ({
  TemplateFields: () => <div data-test-subj="case-view-template-fields" />,
}));

jest.mock('../../../../containers/configure/use_get_supported_action_connectors');
jest.mock('../../../../common/navigation/hooks');
jest.mock('../../../../containers/use_get_tags');
jest.mock('../../../../containers/use_get_categories');
jest.mock('../../../../containers/user_profiles/use_bulk_get_user_profiles');
jest.mock('../../../../containers/use_get_case_connectors');
jest.mock('../../../../containers/use_get_case_users');
jest.mock('../../../../containers/use_replace_custom_field');
jest.mock('../../../case_view/use_on_update_field');
jest.mock('../../../../common/use_cases_features');
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

const caseUsers = getCaseUsersMockResponse();
const useGetCasesFeaturesRes = {
  metricsFeatures: [CaseMetricsFeature.ALERTS_COUNT],
  pushToServiceAuthorized: true,
  caseAssignmentAuthorized: true,
  isAlertsEnabled: true,
  isSyncAlertsEnabled: true,
};

const replaceCustomField = jest.fn();

const useGetConnectorsMock = useGetSupportedActionConnectors as jest.Mock;
const useGetCaseConnectorsMock = useGetCaseConnectors as jest.Mock;
const useGetCaseUsersMock = useGetCaseUsers as jest.Mock;
const useOnUpdateFieldMock = useOnUpdateField as jest.Mock;
const useCasesFeaturesMock = useCasesFeatures as jest.Mock;
const useReplaceCustomFieldMock = useReplaceCustomField as jest.Mock;

describe('CaseViewSidebar (redesign)', () => {
  const caseConnectors = getCaseConnectorsMockResponse();
  const platinumLicense = licensingMock.createLicense({
    license: { type: 'platinum' },
  });
  const basicLicense = licensingMock.createLicense({
    license: { type: 'basic' },
  });

  beforeAll(() => {
    useGetConnectorsMock.mockReturnValue({ data: connectorsMock, isLoading: false });
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
  });

  beforeEach(() => {
    jest.clearAllMocks();
    useGetCaseUsersMock.mockReturnValue({ isLoading: false, data: caseUsers });
    useCasesFeaturesMock.mockReturnValue(useGetCasesFeaturesRes);
  });

  it('should render the sidebar with tags, categories, and connector', async () => {
    renderWithTestingProviders(<CaseViewSidebar caseData={caseData} />, {
      wrapperProps: { license: platinumLicense },
    });

    const caseViewSidebar = await screen.findByTestId('case-view-page-sidebar');
    expect(await within(caseViewSidebar).findByTestId('case-tags')).toBeInTheDocument();
    expect(await within(caseViewSidebar).findByTestId('cases-categories')).toBeInTheDocument();
    expect(await within(caseViewSidebar).findByTestId('connector-edit-header')).toBeInTheDocument();

    await waitForComponentToUpdate();
  });

  it('should disable the severity selector when the user does not have update permissions', async () => {
    renderWithTestingProviders(<CaseViewSidebar caseData={caseData} />, {
      wrapperProps: { license: platinumLicense, permissions: noUpdateCasesPermissions() },
    });

    expect(await screen.findByTestId('case-severity-selection')).toBeDisabled();

    await waitForComponentToUpdate();
  });

  it('should show a loading when updating severity', async () => {
    useOnUpdateFieldMock.mockReturnValue({ isLoading: true, loadingKey: 'severity' });

    renderWithTestingProviders(<CaseViewSidebar caseData={caseData} />);

    expect(
      (await screen.findByTestId('case-severity-selection')).classList.contains(
        'euiSuperSelectControl-isLoading'
      )
    ).toBeTruthy();
  });

  it('should not show a loading for severity when updating tags', async () => {
    useOnUpdateFieldMock.mockReturnValue({ isLoading: true, loadingKey: 'tags' });

    renderWithTestingProviders(<CaseViewSidebar caseData={caseData} />);

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

    renderWithTestingProviders(<CaseViewSidebar caseData={caseData} />, {
      wrapperProps: { license: basicLicense },
    });

    expect(screen.queryByTestId('case-view-assignees')).not.toBeInTheDocument();
  });

  it('should render the assignees on platinum license', async () => {
    renderWithTestingProviders(<CaseViewSidebar caseData={caseData} />, {
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

    renderWithTestingProviders(<CaseViewSidebar caseData={caseData} />, {
      wrapperProps: { license: basicLicense },
    });

    expect(screen.queryByTestId('case-view-edit-connector')).not.toBeInTheDocument();
  });

  it('should render the connector on platinum license', async () => {
    renderWithTestingProviders(<CaseViewSidebar caseData={caseData} />, {
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
      ...caseData,
      customFields: [customFieldsMock[1]],
    };

    renderWithTestingProviders(<CaseViewSidebar caseData={caseDataWithCustomFields} />);

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
  });

  it('should show the category correctly', async () => {
    renderWithTestingProviders(
      <CaseViewSidebar caseData={{ ...caseData, category: 'My category' }} />
    );

    expect(await screen.findByText('My category'));
  });

  describe('Assignees', () => {
    it('should render assignees in the sidebar', async () => {
      renderWithTestingProviders(
        <CaseViewSidebar
          caseData={{
            ...caseData,
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

  describe('TemplateFields', () => {
    it('does not render TemplateFields when templates v2 is disabled', async () => {
      jest.spyOn(KibanaServices, 'getConfig').mockReturnValue(undefined);

      renderWithTestingProviders(<CaseViewSidebar caseData={caseData} />);

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

      renderWithTestingProviders(<CaseViewSidebar caseData={caseData} />);

      expect(await screen.findByTestId('case-view-template-fields')).toBeInTheDocument();
    });
  });
});
