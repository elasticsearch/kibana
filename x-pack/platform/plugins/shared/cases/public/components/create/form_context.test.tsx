/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { waitFor, within, screen, act } from '@testing-library/react';
import { waitForEuiPopoverOpen } from '@elastic/eui/lib/test/rtl';

import { useKibana } from '../../common/lib/kibana';

import { usePostCase } from '../../containers/use_post_case';
import { useCreateAttachments } from '../../containers/use_create_attachments';

import { useGetAllCaseConfigurations } from '../../containers/configure/use_get_all_case_configurations';

import { useGetFields } from '../connectors/resilient/use_get_fields';
import { useGetChoices } from '../connectors/servicenow/use_get_choices';
import { useGetFieldsByIssueType } from '../connectors/jira/use_get_fields_by_issue_type';
import {
  useCaseConfigureResponse,
  useGetAllCaseConfigurationsResponse,
} from '../configure_cases/__mock__';
import {
  sampleConnectorData,
  sampleData,
  sampleTags,
  useGetIssueTypesResponse,
  useGetFieldsByIssueTypeResponse,
  useGetChoicesResponse,
} from './mock';
import { FormContext, type FormContextProps } from './form_context';
import { SubmitCaseButton } from './submit_button';
import { usePostPushToService } from '../../containers/use_post_push_to_service';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { connectorsMock } from '../../common/mock/connectors';
import type { CaseAttachments, CaseAttachmentsWithoutOwner } from '../../types';
import { useGetSupportedActionConnectors } from '../../containers/configure/use_get_supported_action_connectors';
import { useGetTags } from '../../containers/use_get_tags';
import { waitForComponentToUpdate } from '../../common/test_utils';
import { userProfiles } from '../../containers/user_profiles/api.mock';
import { useLicense } from '../../common/use_license';
import { useGetCategories } from '../../containers/use_get_categories';
import { categories, customFieldsConfigurationMock, customFieldsMock } from '../../containers/mock';
import {
  CaseSeverity,
  AttachmentType,
  ConnectorTypes,
  CustomFieldTypes,
} from '../../../common/types/domain';
import { useAvailableCasesOwners } from '../app/use_available_owners';
import type { CreateCaseFormFieldsProps } from './form_fields';
import { CreateCaseFormFields } from './form_fields';
import { SECURITY_SOLUTION_OWNER } from '../../../common';
import { renderWithTestingProviders } from '../../common/mock';
import { coreMock } from '@kbn/core/public/mocks';
import { licensingMock } from '@kbn/licensing-plugin/public/mocks';
import { DEFAULT_FEATURES } from '../../../common/constants';
import { useGetIssueTypes } from '../connectors/jira/use_get_issue_types';
import { useGetFieldsResponse } from '../connectors/resilient/mocks';
import { useSubmitCase } from './use_submit_case';

jest.mock('../../containers/use_post_case');
jest.mock('../../containers/use_create_attachments');
jest.mock('../../containers/use_post_push_to_service');
jest.mock('../../containers/use_get_tags');
jest.mock('../../containers/configure/use_get_supported_action_connectors');
jest.mock('../../containers/configure/use_get_all_case_configurations');
jest.mock('../connectors/resilient/use_get_fields');
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
const useGetFieldsMock = useGetFields as jest.Mock;
const useGetIssueTypesMock = useGetIssueTypes as jest.Mock;
const useGetFieldsByIssueTypeMock = useGetFieldsByIssueType as jest.Mock;
const useGetChoicesMock = useGetChoices as jest.Mock;
const postCase = jest.fn();
const pushCaseToExternalService = jest.fn();
const useKibanaMock = useKibana as jest.Mocked<typeof useKibana>;
const useLicenseMock = useLicense as jest.Mock;
const useGetCategoriesMock = useGetCategories as jest.Mock;
const useAvailableOwnersMock = useAvailableCasesOwners as jest.Mock;

const sampleId = 'case-id';

const defaultPostCase = {
  isLoading: false,
  isError: false,
  mutateAsync: postCase,
};

const currentConfiguration = useGetAllCaseConfigurationsResponse.data[0];

const defaultCreateCaseForm: CreateCaseFormFieldsProps = {
  configuration: currentConfiguration,
  isLoading: false,
  connectors: [],
  withSteps: true,
  draftStorageKey: 'cases.kibana.createCase.description.markdownEditor',
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

const fillFormReactTestingLib = async ({
  user,
  withTags = false,
}: {
  user: UserEvent;
  withTags?: boolean;
}) => {
  const titleInput = within(screen.getByTestId('caseTitle')).getByTestId('input');

  await user.click(titleInput);
  await user.paste(sampleDataWithoutTags.title);

  const descriptionInput = within(screen.getByTestId('caseDescription')).getByTestId(
    'euiMarkdownEditorTextArea'
  );

  await user.click(descriptionInput);
  await user.paste(sampleDataWithoutTags.description);

  if (withTags) {
    const caseTags = screen.getByTestId('caseTags');

    for (const tag of sampleTags) {
      const tagsInput = await within(caseTags).findByTestId('comboBoxInput');
      await user.type(tagsInput, `${tag}{enter}`);
    }
  }
};

const waitForFormToRender = async () => {
  await waitFor(() => {
    expect(screen.getByTestId('caseTitle')).toBeInTheDocument();
  });
};

const TestComponent = ({
  attachments,
  onSuccess,
  afterCaseCreated,
  children,
  ...props
}: Omit<FormContextProps, 'onSubmitCase'> & {
  onSuccess: VoidFunction;
  afterCaseCreated?: () => Promise<void>;
  attachments?: CaseAttachmentsWithoutOwner;
}) => {
  const { submitCase, isSubmitting } = useSubmitCase({
    attachments,
    onSuccess,
    afterCaseCreated: afterCaseCreated ?? (async () => {}),
  });

  return (
    <FormContext {...props} onSubmitCase={submitCase}>
      <>
        {children} <SubmitCaseButton isSubmitting={isSubmitting} />
      </>
    </FormContext>
  );
};

describe('Create case', () => {
  const refetch = jest.fn();
  const onFormSubmitSuccess = jest.fn();
  const afterCaseCreated = jest.fn();
  const createAttachments = jest.fn();
  let user: UserEvent;

  // eslint-disable-next-line prefer-object-spread
  const originalGetComputedStyle = Object.assign({}, window.getComputedStyle);

  beforeAll(() => {
    jest.useFakeTimers();
    // The JSDOM implementation is too slow
    // Especially for dropdowns that try to position themselves
    // perf issue - https://github.com/jsdom/jsdom/issues/3234
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

    postCase.mockResolvedValue({
      id: sampleId,
      ...sampleDataWithoutTags,
    });
    usePostCaseMock.mockImplementation(() => defaultPostCase);
    useCreateAttachmentsMock.mockImplementation(() => ({ mutateAsync: createAttachments }));
    usePostPushToServiceMock.mockImplementation(() => defaultPostPushToService);
    useGetConnectorsMock.mockReturnValue(sampleConnectorData);
    useGetAllCaseConfigurationsMock.mockImplementation(() => useGetAllCaseConfigurationsResponse);
    useGetFieldsMock.mockReturnValue(useGetFieldsResponse);
    useGetIssueTypesMock.mockReturnValue(useGetIssueTypesResponse);
    useGetFieldsByIssueTypeMock.mockReturnValue(useGetFieldsByIssueTypeResponse);
    useGetChoicesMock.mockReturnValue(useGetChoicesResponse);
    useGetCategoriesMock.mockReturnValue({ isLoading: false, data: categories });
    useAvailableOwnersMock.mockReturnValue(['securitySolution', 'observability', 'cases']);

    (useGetTags as jest.Mock).mockImplementation(() => ({
      data: sampleTags,
      refetch,
    }));

    useKibanaMock().services.triggersActionsUi.actionTypeRegistry.get = jest.fn().mockReturnValue({
      actionTypeTitle: '.servicenow',
      iconClass: 'logoSecurity',
    });

    useLicenseMock.mockReturnValue({ isAtLeastGold: () => true, isAtLeastPlatinum: () => true });
  });

  afterAll(() => {
    Object.defineProperty(window, 'getComputedStyle', originalGetComputedStyle);
    jest.useRealTimers();
  });

  beforeEach(() => {
    // Workaround for timeout via https://github.com/testing-library/user-event/issues/833#issuecomment-1171452841
    user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime, pointerEventsCheck: 0 });

    jest.clearAllMocks();
  });

  afterEach(() => {
    sessionStorage.removeItem(defaultCreateCaseForm.draftStorageKey);
    jest.clearAllTimers();
  });

  describe('Step 1 - Case Fields', () => {
    it('renders correctly', async () => {
      renderWithTestingProviders(
        <TestComponent
          selectedOwner={SECURITY_SOLUTION_OWNER}
          onSuccess={onFormSubmitSuccess}
          currentConfiguration={currentConfiguration}
        >
          <CreateCaseFormFields {...defaultCreateCaseForm} />
        </TestComponent>
      );

      await waitForFormToRender();

      expect(screen.getByTestId('caseTitle')).toBeInTheDocument();
      expect(screen.getByTestId('caseSeverity')).toBeInTheDocument();
      expect(screen.getByTestId('caseDescription')).toBeInTheDocument();
      expect(screen.getByTestId('createCaseAssigneesComboBox')).toBeInTheDocument();
      expect(screen.getByTestId('caseTags')).toBeInTheDocument();
      expect(screen.getByTestId('caseConnectors')).toBeInTheDocument();
      expect(screen.getByTestId('case-creation-form-steps')).toBeInTheDocument();
      expect(screen.getByTestId('categories-list')).toBeInTheDocument();
    });

    it('should post case on submit click', async () => {
      useGetConnectorsMock.mockReturnValue({
        ...sampleConnectorData,
        data: connectorsMock,
      });

      renderWithTestingProviders(
        <TestComponent
          selectedOwner={SECURITY_SOLUTION_OWNER}
          onSuccess={onFormSubmitSuccess}
          currentConfiguration={currentConfiguration}
        >
          <CreateCaseFormFields {...defaultCreateCaseForm} />
        </TestComponent>
      );

      await waitForFormToRender();
      await fillFormReactTestingLib({ user, withTags: true });

      await user.click(screen.getByTestId('create-case-submit'));

      await waitFor(() => {
        expect(postCase).toHaveBeenCalled();
      });

      expect(postCase).toBeCalledWith({ request: { ...sampleDataWithoutTags, tags: sampleTags } });
    });

    it('should post a case on submit click with the selected severity', async () => {
      useGetConnectorsMock.mockReturnValue({
        ...sampleConnectorData,
        data: connectorsMock,
      });

      renderWithTestingProviders(
        <TestComponent
          selectedOwner={SECURITY_SOLUTION_OWNER}
          onSuccess={onFormSubmitSuccess}
          currentConfiguration={currentConfiguration}
        >
          <CreateCaseFormFields {...defaultCreateCaseForm} />
        </TestComponent>
      );

      await waitForFormToRender();
      await fillFormReactTestingLib({ user });

      await user.click(screen.getByTestId('case-severity-selection'));
      await waitForEuiPopoverOpen();

      expect(screen.getByTestId('case-severity-selection-high')).toBeVisible();

      await user.click(screen.getByTestId('case-severity-selection-high'));
      await user.click(screen.getByTestId('create-case-submit'));

      await waitFor(() => {
        expect(postCase).toHaveBeenCalled();
      });

      expect(postCase).toBeCalledWith({
        request: {
          ...sampleDataWithoutTags,
          severity: CaseSeverity.HIGH,
        },
      });
    });

    it('should trim fields correctly while submit', async () => {
      const newTags = ['coke     ', '     pepsi'];
      const newCategory = 'First           ';

      renderWithTestingProviders(
        <TestComponent
          selectedOwner={SECURITY_SOLUTION_OWNER}
          onSuccess={onFormSubmitSuccess}
          currentConfiguration={currentConfiguration}
        >
          <CreateCaseFormFields {...defaultCreateCaseForm} />
        </TestComponent>
      );

      await waitForFormToRender();

      const titleInput = within(screen.getByTestId('caseTitle')).getByTestId('input');

      await user.click(titleInput);
      await user.paste(`${sampleDataWithoutTags.title}       `);

      const descriptionInput = within(screen.getByTestId('caseDescription')).getByTestId(
        'euiMarkdownEditorTextArea'
      );

      await user.click(descriptionInput);
      await user.paste(`${sampleDataWithoutTags.description}           `);

      const caseTags = screen.getByTestId('caseTags');

      for (const tag of newTags) {
        const tagsInput = await within(caseTags).findByTestId('comboBoxInput');
        await user.type(tagsInput, `${tag}{enter}`);
      }

      const categoryComboBox = within(screen.getByTestId('categories-list')).getByRole('combobox');

      await user.type(categoryComboBox, `${newCategory}{enter}`);

      await user.click(screen.getByTestId('create-case-submit'));

      await waitFor(() => {
        expect(postCase).toHaveBeenCalled();
      });

      expect(postCase).toBeCalledWith({ request: { ...sampleData, category: 'First' } });
    });

    it('should toggle sync settings', async () => {
      useGetConnectorsMock.mockReturnValue({
        ...sampleConnectorData,
        data: connectorsMock,
      });

      renderWithTestingProviders(
        <TestComponent
          selectedOwner={SECURITY_SOLUTION_OWNER}
          onSuccess={onFormSubmitSuccess}
          currentConfiguration={currentConfiguration}
        >
          <CreateCaseFormFields {...defaultCreateCaseForm} />
        </TestComponent>
      );

      await waitForFormToRender();
      await fillFormReactTestingLib({ user });

      const syncAlertsButton = within(screen.getByTestId('caseSyncAlerts')).getByTestId('input');

      await user.click(syncAlertsButton);
      await user.click(screen.getByTestId('create-case-submit'));

      await waitFor(() => expect(postCase).toHaveBeenCalled());

      expect(postCase).toBeCalledWith({
        request: {
          ...sampleDataWithoutTags,
          settings: { syncAlerts: false, extractObservables: false },
        },
      });
    });

    it('should set sync alerts to false when the sync feature setting is false', async () => {
      useGetConnectorsMock.mockReturnValue({
        ...sampleConnectorData,
        data: connectorsMock,
      });

      renderWithTestingProviders(
        <TestComponent
          selectedOwner={SECURITY_SOLUTION_OWNER}
          onSuccess={onFormSubmitSuccess}
          currentConfiguration={currentConfiguration}
        >
          <CreateCaseFormFields {...defaultCreateCaseForm} />
        </TestComponent>,
        {
          wrapperProps: {
            features: { alerts: { sync: false, enabled: true } },
          },
        }
      );

      await waitForFormToRender();
      await fillFormReactTestingLib({ user });

      await user.click(screen.getByTestId('create-case-submit'));

      await waitFor(() => expect(postCase).toHaveBeenCalled());

      expect(postCase).toBeCalledWith({
        request: {
          ...sampleDataWithoutTags,
          settings: { syncAlerts: false, extractObservables: false },
        },
      });
    });

    it('should select LOW as the default severity', async () => {
      renderWithTestingProviders(
        <TestComponent
          selectedOwner={SECURITY_SOLUTION_OWNER}
          onSuccess={onFormSubmitSuccess}
          currentConfiguration={currentConfiguration}
        >
          <CreateCaseFormFields {...defaultCreateCaseForm} />
        </TestComponent>
      );

      await waitForFormToRender();

      expect(screen.getByTestId('caseSeverity')).toBeTruthy();
      expect(screen.getAllByTestId('case-severity-selection-low').length).toBe(1);

      await waitForComponentToUpdate();
    });

    it('should submit form with custom fields', async () => {
      const configurations = [
        {
          ...useGetAllCaseConfigurationsResponse.data[0],
          customFields: [
            ...customFieldsConfigurationMock,
            {
              key: 'my_custom_field_key',
              type: CustomFieldTypes.TEXT,
              label: 'my custom field label',
              required: false,
            },
          ],
        },
      ];

      renderWithTestingProviders(
        <TestComponent
          selectedOwner={SECURITY_SOLUTION_OWNER}
          onSuccess={onFormSubmitSuccess}
          currentConfiguration={configurations[0]}
        >
          <CreateCaseFormFields {...defaultCreateCaseForm} configuration={configurations[0]} />
        </TestComponent>
      );

      await waitForFormToRender();
      await fillFormReactTestingLib({ user });

      const textField = customFieldsConfigurationMock[0];
      const toggleField = customFieldsConfigurationMock[1];
      const numberField = customFieldsConfigurationMock[4];

      expect(await screen.findByTestId('caseCustomFields')).toBeInTheDocument();

      const textCustomField = await screen.findByTestId(
        `${textField.key}-${textField.type}-create-custom-field`
      );

      await user.clear(textCustomField);
      await user.click(textCustomField);
      await user.paste('My text test value 1');

      await user.click(
        await screen.findByTestId(`${toggleField.key}-${toggleField.type}-create-custom-field`)
      );

      const numberCustomField = await screen.findByTestId(
        `${numberField.key}-${numberField.type}-create-custom-field`
      );

      await user.clear(numberCustomField);
      await user.click(numberCustomField);
      await user.paste('678');

      await user.click(await screen.findByTestId('create-case-submit'));

      await waitFor(() => expect(postCase).toHaveBeenCalled());

      expect(postCase).toBeCalledWith({
        request: {
          ...sampleDataWithoutTags,
          customFields: [
            customFieldsMock[0],
            { ...customFieldsMock[1], value: false }, // toggled the default
            customFieldsMock[2],
            { ...customFieldsMock[3], value: false },
            { ...customFieldsMock[4], value: 678 },
            customFieldsMock[5],
            {
              key: 'my_custom_field_key',
              type: CustomFieldTypes.TEXT,
              value: null,
            },
          ],
        },
      });
    });

    it('should select the default connector set in the configuration', async () => {
      const configuration = {
        ...useCaseConfigureResponse.data,
        connector: {
          id: 'servicenow-1',
          name: 'SN',
          type: ConnectorTypes.serviceNowITSM,
          fields: null,
        },
      };

      useGetAllCaseConfigurationsMock.mockImplementation(() => ({
        ...useGetAllCaseConfigurationsResponse,
        data: [configuration],
      }));

      useGetConnectorsMock.mockReturnValue({
        ...sampleConnectorData,
        data: connectorsMock,
      });

      renderWithTestingProviders(
        <TestComponent
          selectedOwner={SECURITY_SOLUTION_OWNER}
          onSuccess={onFormSubmitSuccess}
          currentConfiguration={currentConfiguration}
        >
          <CreateCaseFormFields
            {...defaultCreateCaseForm}
            configuration={configuration}
            connectors={connectorsMock}
          />
        </TestComponent>
      );

      await waitForFormToRender();
      await fillFormReactTestingLib({ user });

      await user.click(screen.getByTestId('create-case-submit'));

      await waitFor(() => expect(postCase).toHaveBeenCalled());

      expect(postCase).toBeCalledWith({
        request: {
          ...sampleDataWithoutTags,
          connector: {
            fields: {
              impact: null,
              severity: null,
              urgency: null,
              category: null,
              subcategory: null,
              additionalFields: null,
            },
            id: 'servicenow-1',
            name: 'My SN connector',
            type: '.servicenow',
          },
        },
      });
    });

    it('should default to none if the default connector does not exist in connectors', async () => {
      const configuration = {
        ...useCaseConfigureResponse.data,
        connector: {
          id: 'not-exist',
          name: 'SN',
          type: ConnectorTypes.serviceNowITSM,
          fields: null,
        },
      };

      useGetAllCaseConfigurationsMock.mockImplementation(() => ({
        ...useGetAllCaseConfigurationsResponse,
        data: [configuration],
      }));

      useGetConnectorsMock.mockReturnValue({
        ...sampleConnectorData,
        data: connectorsMock,
      });

      renderWithTestingProviders(
        <TestComponent
          selectedOwner={SECURITY_SOLUTION_OWNER}
          onSuccess={onFormSubmitSuccess}
          currentConfiguration={currentConfiguration}
        >
          <CreateCaseFormFields
            {...defaultCreateCaseForm}
            configuration={configuration}
            connectors={connectorsMock}
          />
        </TestComponent>
      );

      await waitForFormToRender();
      await fillFormReactTestingLib({ user });

      await user.click(screen.getByTestId('create-case-submit'));

      await waitFor(() => {
        expect(postCase).toBeCalled();
      });

      expect(pushCaseToExternalService).not.toHaveBeenCalled();
      expect(postCase).toBeCalledWith({ request: sampleDataWithoutTags });
    });

    it('should set the category correctly', async () => {
      const category = categories[0];

      useGetConnectorsMock.mockReturnValue({
        ...sampleConnectorData,
        data: connectorsMock,
      });

      renderWithTestingProviders(
        <TestComponent
          selectedOwner={SECURITY_SOLUTION_OWNER}
          onSuccess={onFormSubmitSuccess}
          currentConfiguration={currentConfiguration}
        >
          <CreateCaseFormFields {...defaultCreateCaseForm} />
        </TestComponent>
      );

      await waitForFormToRender();
      await fillFormReactTestingLib({ user });

      const categoryComboBox = within(screen.getByTestId('categories-list')).getByRole('combobox');

      await user.type(categoryComboBox, `${category}{enter}`);

      await user.click(screen.getByTestId('create-case-submit'));

      await waitFor(() => {
        expect(postCase).toHaveBeenCalled();
      });

      expect(postCase).toBeCalledWith({ request: { ...sampleDataWithoutTags, category } });
    });
  });

  describe('Step 2 - Connector Fields', () => {
    it('should submit and push to resilient connector', async () => {
      useGetConnectorsMock.mockReturnValue({
        ...sampleConnectorData,
        data: connectorsMock,
      });

      renderWithTestingProviders(
        <TestComponent
          selectedOwner={SECURITY_SOLUTION_OWNER}
          onSuccess={onFormSubmitSuccess}
          currentConfiguration={currentConfiguration}
        >
          <CreateCaseFormFields {...defaultCreateCaseForm} connectors={connectorsMock} />
        </TestComponent>
      );

      await waitForFormToRender();
      await fillFormReactTestingLib({ user });

      await user.click(screen.getByTestId('dropdown-connectors'));
      await user.click(screen.getByTestId('dropdown-connector-resilient-2'));

      await waitFor(() => {
        expect(screen.getByTestId('incidentTypeComboBox')).toBeInTheDocument();
      });

      const checkbox = within(screen.getByTestId('incidentTypeComboBox')).getByTestId(
        'comboBoxSearchInput'
      );

      await user.click(checkbox);
      await user.paste('Denial of Service');
      await user.keyboard('{enter}');
      await user.selectOptions(screen.getByTestId('severitySelect'), ['4']);
      await user.click(screen.getByTestId('create-case-submit'));

      await waitFor(() => {
        expect(postCase).toHaveBeenCalled();
      });

      expect(pushCaseToExternalService).toHaveBeenCalled();
      expect(onFormSubmitSuccess).toHaveBeenCalled();

      expect(postCase).toBeCalledWith({
        request: {
          ...sampleDataWithoutTags,
          connector: {
            id: 'resilient-2',
            name: 'My Resilient connector',
            type: '.resilient',
            fields: { incidentTypes: ['21'], severityCode: '4', additionalFields: null },
          },
        },
      });

      expect(pushCaseToExternalService).toHaveBeenCalledWith({
        caseId: sampleId,
        connector: {
          id: 'resilient-2',
          name: 'My Resilient connector',
          type: '.resilient',
          fields: { incidentTypes: ['21'], severityCode: '4', additionalFields: null },
        },
      });

      expect(onFormSubmitSuccess).toHaveBeenCalledWith({
        id: sampleId,
        ...sampleDataWithoutTags,
      });
    });

    it('resets fields when changing between connectors of the same type', async () => {
      const connectors = [
        ...connectorsMock,
        { ...connectorsMock[0], id: 'servicenow-2', name: 'My SN connector 2' },
      ];

      useGetConnectorsMock.mockReturnValue({
        ...sampleConnectorData,
        data: connectors,
      });

      renderWithTestingProviders(
        <TestComponent
          selectedOwner={SECURITY_SOLUTION_OWNER}
          onSuccess={onFormSubmitSuccess}
          currentConfiguration={currentConfiguration}
        >
          <CreateCaseFormFields {...defaultCreateCaseForm} connectors={connectors} />
        </TestComponent>
      );

      await waitForFormToRender();
      await fillFormReactTestingLib({ user });

      await user.click(screen.getByTestId('dropdown-connectors'));
      await user.click(screen.getByTestId('dropdown-connector-servicenow-1'));

      await waitFor(() => {
        expect(screen.getByTestId('severitySelect')).toBeInTheDocument();
      });

      await user.selectOptions(screen.getByTestId('severitySelect'), '4 - Low');
      expect(await screen.findByTestId('severitySelect')).toHaveValue('4');

      await user.click(screen.getByTestId('dropdown-connectors'));
      await user.click(screen.getByTestId('dropdown-connector-servicenow-2'));

      await user.click(screen.getByTestId('create-case-submit'));

      await waitFor(() => {
        expect(postCase).toHaveBeenCalledWith({
          request: {
            ...sampleDataWithoutTags,
            connector: {
              fields: {
                category: null,
                subcategory: null,
                impact: null,
                severity: null,
                urgency: null,
                additionalFields: null,
              },
              id: 'servicenow-2',
              name: 'My SN connector 2',
              type: '.servicenow',
            },
          },
        });
      });
    });
  });

  it('should call afterCaseCreated', async () => {
    useGetConnectorsMock.mockReturnValue({
      ...sampleConnectorData,
      data: connectorsMock,
    });

    renderWithTestingProviders(
      <TestComponent
        selectedOwner={SECURITY_SOLUTION_OWNER}
        onSuccess={onFormSubmitSuccess}
        afterCaseCreated={afterCaseCreated}
        currentConfiguration={currentConfiguration}
      >
        <CreateCaseFormFields {...defaultCreateCaseForm} connectors={connectorsMock} />
      </TestComponent>
    );

    await waitForFormToRender();
    await fillFormReactTestingLib({ user });

    await user.click(screen.getByTestId('dropdown-connectors'));

    await waitFor(() => {
      expect(screen.getByTestId('dropdown-connector-resilient-2')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('dropdown-connector-resilient-2'));
    await user.click(screen.getByTestId('create-case-submit'));

    await waitFor(() => {
      expect(afterCaseCreated).toHaveBeenCalled();
    });

    expect(afterCaseCreated).toHaveBeenCalledWith(
      {
        id: sampleId,
        ...sampleDataWithoutTags,
      },
      createAttachments
    );
  });

  it('should call createAttachments with the attachments after the case is created', async () => {
    useGetConnectorsMock.mockReturnValue({
      ...sampleConnectorData,
      data: connectorsMock,
    });

    const attachments = [
      {
        alertId: '1234',
        index: '',
        rule: {
          id: '45321',
          name: 'my rule',
        },
        owner: 'owner',
        type: AttachmentType.alert as const,
      },
      {
        alertId: '7896',
        index: '',
        rule: {
          id: '445324',
          name: 'my rule',
        },
        owner: 'second-owner',
        type: AttachmentType.alert as const,
      },
    ];

    renderWithTestingProviders(
      <TestComponent
        selectedOwner={SECURITY_SOLUTION_OWNER}
        onSuccess={onFormSubmitSuccess}
        attachments={attachments}
        currentConfiguration={currentConfiguration}
      >
        <CreateCaseFormFields {...defaultCreateCaseForm} />
      </TestComponent>
    );

    await waitForFormToRender();
    await fillFormReactTestingLib({ user });

    await user.click(screen.getByTestId('create-case-submit'));

    await waitFor(() => {
      expect(createAttachments).toHaveBeenCalledTimes(1);
    });

    expect(createAttachments).toHaveBeenCalledWith({
      caseId: 'case-id',
      attachments,
      caseOwner: 'securitySolution',
    });
  });

  it('should NOT call createAttachments if the attachments are an empty array', async () => {
    useGetConnectorsMock.mockReturnValue({
      ...sampleConnectorData,
      data: connectorsMock,
    });

    const attachments: CaseAttachments = [];

    renderWithTestingProviders(
      <TestComponent
        selectedOwner={SECURITY_SOLUTION_OWNER}
        onSuccess={onFormSubmitSuccess}
        attachments={attachments}
        currentConfiguration={currentConfiguration}
      >
        <CreateCaseFormFields {...defaultCreateCaseForm} />
      </TestComponent>
    );

    await waitForFormToRender();
    await fillFormReactTestingLib({ user });

    await user.click(screen.getByTestId('create-case-submit'));

    await waitForComponentToUpdate();

    expect(createAttachments).not.toHaveBeenCalled();
  });

  it(`should call callbacks in correct order`, async () => {
    const license = licensingMock.createLicense({
      license: { type: 'platinum' },
    });
    useGetConnectorsMock.mockReturnValue({
      ...sampleConnectorData,
      data: connectorsMock,
    });
    const attachments = [
      {
        alertId: '1234',
        index: '',
        rule: {
          id: '45321',
          name: 'my rule',
        },
        owner: 'owner',
        type: AttachmentType.alert as const,
      },
    ];

    renderWithTestingProviders(
      <TestComponent
        selectedOwner={SECURITY_SOLUTION_OWNER}
        currentConfiguration={currentConfiguration}
        onSuccess={onFormSubmitSuccess}
        afterCaseCreated={afterCaseCreated}
        attachments={attachments}
      >
        <CreateCaseFormFields {...defaultCreateCaseForm} connectors={connectorsMock} />
      </TestComponent>,
      {
        wrapperProps: {
          license,
          features: {
            ...DEFAULT_FEATURES,
            observables: { enabled: true, autoExtract: true },
          },
        },
      }
    );

    await waitForFormToRender();
    await fillFormReactTestingLib({ user });

    await user.click(screen.getByTestId('dropdown-connectors'));

    await waitFor(() => {
      expect(screen.getByTestId('dropdown-connector-resilient-2')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('dropdown-connector-resilient-2'));

    await user.click(screen.getByTestId('create-case-submit'));

    await waitFor(() => {
      expect(postCase).toHaveBeenCalled();
    });

    expect(createAttachments).toHaveBeenCalled();
    expect(afterCaseCreated).toHaveBeenCalled();

    await waitFor(() => {
      expect(pushCaseToExternalService).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(onFormSubmitSuccess).toHaveBeenCalled();
    });

    const postCaseOrder = postCase.mock.invocationCallOrder[0];
    const createAttachmentsOrder = createAttachments.mock.invocationCallOrder[0];
    const afterCaseOrder = afterCaseCreated.mock.invocationCallOrder[0];
    const pushCaseToExternalServiceOrder = pushCaseToExternalService.mock.invocationCallOrder[0];
    const onFormSubmitSuccessOrder = onFormSubmitSuccess.mock.invocationCallOrder[0];

    expect(
      postCaseOrder < createAttachmentsOrder &&
        createAttachmentsOrder < afterCaseOrder &&
        afterCaseOrder < pushCaseToExternalServiceOrder &&
        pushCaseToExternalServiceOrder < onFormSubmitSuccessOrder
    ).toBe(true);
  });

  it('should succeed even when pushing to an external service fails', async () => {
    const failPushCaseToExternalService = jest.fn().mockRejectedValue(new Error('Push failed'));
    usePostPushToServiceMock.mockImplementation(() => ({
      isLoading: false,
      isError: false,
      mutateAsync: failPushCaseToExternalService,
    }));

    renderWithTestingProviders(
      <TestComponent
        selectedOwner={SECURITY_SOLUTION_OWNER}
        onSuccess={onFormSubmitSuccess}
        afterCaseCreated={afterCaseCreated}
        currentConfiguration={currentConfiguration}
      >
        <CreateCaseFormFields {...defaultCreateCaseForm} connectors={connectorsMock} />
      </TestComponent>
    );

    await waitForFormToRender();
    await fillFormReactTestingLib({ user });

    await user.click(screen.getByTestId('dropdown-connectors'));

    await waitFor(() => {
      expect(screen.getByTestId('dropdown-connector-resilient-2')).toBeInTheDocument();
    });

    await user.click(screen.getByTestId('dropdown-connector-resilient-2'));
    await user.click(screen.getByTestId('create-case-submit'));

    await waitFor(() => {
      expect(onFormSubmitSuccess).toHaveBeenCalled();
    });
  });

  describe('Permissions', () => {
    it('should not push to service if the user does not have access to actions', async () => {
      const coreStart = coreMock.createStart();
      coreStart.application.capabilities = {
        ...coreStart.application.capabilities,
        actions: { save: false, show: false },
      };

      renderWithTestingProviders(
        <TestComponent
          selectedOwner={SECURITY_SOLUTION_OWNER}
          onSuccess={onFormSubmitSuccess}
          currentConfiguration={currentConfiguration}
        >
          <CreateCaseFormFields {...defaultCreateCaseForm} />
        </TestComponent>,
        { wrapperProps: { coreStart } }
      );

      await waitForFormToRender();
      await fillFormReactTestingLib({ user });

      await user.click(screen.getByTestId('create-case-submit'));

      await waitForComponentToUpdate();
      expect(pushCaseToExternalService).not.toHaveBeenCalled();
    });
  });

  describe('Assignees', () => {
    it('should submit assignees', async () => {
      renderWithTestingProviders(
        <TestComponent
          selectedOwner={SECURITY_SOLUTION_OWNER}
          onSuccess={onFormSubmitSuccess}
          currentConfiguration={currentConfiguration}
        >
          <CreateCaseFormFields {...defaultCreateCaseForm} />
        </TestComponent>
      );

      await waitForFormToRender();
      await fillFormReactTestingLib({ user });

      const assigneesComboBox = within(screen.getByTestId('createCaseAssigneesComboBox'));

      await waitFor(() => {
        expect(assigneesComboBox.getByTestId('comboBoxSearchInput')).not.toBeDisabled();
      });

      await user.click(assigneesComboBox.getByTestId('comboBoxSearchInput'));
      await user.paste('dr');
      act(() => {
        jest.advanceTimersByTime(500);
      });

      await user.click(await screen.findByText(`${userProfiles[0].user.full_name}`));
      await user.click(screen.getByTestId('create-case-submit'));

      await waitFor(() => {
        expect(postCase).toHaveBeenCalled();
      });

      expect(postCase).toBeCalledWith({
        request: {
          ...sampleDataWithoutTags,
          assignees: [{ uid: userProfiles[0].uid }],
        },
      });
    });

    it('should not render the assignees on basic license', async () => {
      useLicenseMock.mockReturnValue({
        isAtLeastGold: () => false,
        isAtLeastPlatinum: () => false,
      });

      renderWithTestingProviders(
        <TestComponent
          selectedOwner={SECURITY_SOLUTION_OWNER}
          onSuccess={onFormSubmitSuccess}
          currentConfiguration={currentConfiguration}
        >
          <CreateCaseFormFields {...defaultCreateCaseForm} />
        </TestComponent>
      );

      await waitForFormToRender();
      await waitForComponentToUpdate();

      expect(screen.queryByTestId('createCaseAssigneesComboBox')).toBeNull();
    });
  });

  describe('draft comment', () => {
    describe('existing storage key', () => {
      beforeEach(() => {
        sessionStorage.setItem(defaultCreateCaseForm.draftStorageKey, 'value set in storage');
      });

      afterEach(() => {
        sessionStorage.removeItem(defaultCreateCaseForm.draftStorageKey);
      });

      it('should have session storage value same as draft comment', async () => {
        renderWithTestingProviders(
          <TestComponent
            selectedOwner={SECURITY_SOLUTION_OWNER}
            onSuccess={onFormSubmitSuccess}
            currentConfiguration={currentConfiguration}
          >
            <CreateCaseFormFields {...defaultCreateCaseForm} />
          </TestComponent>
        );

        await waitForFormToRender();
        const descriptionInput = within(screen.getByTestId('caseDescription')).getByTestId(
          'euiMarkdownEditorTextArea'
        );

        act(() => jest.advanceTimersByTime(1000));

        await waitFor(() => expect(descriptionInput).toHaveValue('value set in storage'));
      });
    });

    describe('set storage key', () => {
      afterEach(() => {
        sessionStorage.removeItem(defaultCreateCaseForm.draftStorageKey);
      });

      it('should have session storage value same as draft comment', async () => {
        renderWithTestingProviders(
          <TestComponent
            selectedOwner={SECURITY_SOLUTION_OWNER}
            onSuccess={onFormSubmitSuccess}
            currentConfiguration={currentConfiguration}
          >
            <CreateCaseFormFields {...defaultCreateCaseForm} />
          </TestComponent>
        );

        await waitForFormToRender();
        const descriptionInput = within(await screen.findByTestId('caseDescription')).getByTestId(
          'euiMarkdownEditorTextArea'
        );

        await waitFor(() => {
          expect(descriptionInput).toHaveValue(
            sessionStorage.getItem(defaultCreateCaseForm.draftStorageKey)
          );
        });
      });
    });
  });
});
