/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { licensingMock } from '@kbn/licensing-plugin/public/mocks';
import type { ILicense } from '@kbn/licensing-types';
import { observabilityAIAssistantPluginMock } from '@kbn/observability-ai-assistant-plugin/public/mock';
import { useFetchDataViews } from '@kbn/observability-plugin/public';
import { useFetcher } from '@kbn/observability-shared-plugin/public';
import { sharePluginMock } from '@kbn/share-plugin/public/mocks';
import type { SLOWithSummaryResponse } from '@kbn/slo-schema';
import { paths } from '@kbn/slo-shared-plugin/common/locators/paths';
import { cleanup, fireEvent, waitFor } from '@testing-library/react';
import { createBrowserHistory } from 'history';
import React from 'react';
import Router from 'react-router-dom';
import { BehaviorSubject } from 'rxjs';
import { buildSlo } from '../../data/slo/slo';
import { useCreateRule } from '../../hooks/use_create_burn_rate_rule';
import { useCreateDataView } from '../../hooks/use_create_data_view';
import { useCreateSlo } from '../../hooks/use_create_slo';
import { useFetchApmSuggestions } from '../../hooks/use_fetch_apm_suggestions';
import { useFetchIndices } from '../../hooks/use_fetch_indices';
import { useFetchSloDetails } from '../../hooks/use_fetch_slo_details';
import { useFetchSloTemplate } from '../../hooks/use_fetch_slo_template';
import { useKibana } from '../../hooks/use_kibana';
import { usePermissions } from '../../hooks/use_permissions';
import { useUpdateSlo } from '../../hooks/use_update_slo';
import { kibanaStartMock } from '../../utils/kibana_react.mock';
import { render } from '../../utils/test_helper';
import { SloEditPage } from './slo_edit';
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: jest.fn(),
}));

jest.mock('@kbn/observability-shared-plugin/public');
jest.mock('@kbn/observability-plugin/public');
jest.mock('../../hooks/use_fetch_indices');
jest.mock('../../hooks/use_create_data_view');
jest.mock('../../hooks/use_fetch_slo_details');
jest.mock('../../hooks/use_fetch_slo_template');
jest.mock('../../hooks/use_create_slo');
jest.mock('../../hooks/use_update_slo');
jest.mock('../../hooks/use_fetch_apm_suggestions');
jest.mock('../../hooks/use_permissions');
jest.mock('../../hooks/use_create_burn_rate_rule');

const mockUseKibanaReturnValue = kibanaStartMock.startContract();

jest.mock('../../hooks/use_kibana', () => ({
  useKibana: jest.fn(() => mockUseKibanaReturnValue),
}));

const useKibanaMock = useKibana as jest.Mock;
const useFetchIndicesMock = useFetchIndices as jest.Mock;
const useFetchDataViewsMock = useFetchDataViews as jest.Mock;
const useCreateDataViewMock = useCreateDataView as jest.Mock;
const useFetchSloDetailsMock = useFetchSloDetails as jest.Mock;
const useFetchSloTemplateMock = useFetchSloTemplate as jest.Mock;
const useCreateSloMock = useCreateSlo as jest.Mock;
const useUpdateSloMock = useUpdateSlo as jest.Mock;
const useCreateRuleMock = useCreateRule as jest.Mock;
const useFetchApmSuggestionsMock = useFetchApmSuggestions as jest.Mock;
const usePermissionsMock = usePermissions as jest.Mock;
const useFetcherMock = useFetcher as jest.Mock;

const mockNavigate = jest.fn();
const mockBasePathPrepend = jest.fn();
const licenseMock = licensingMock.createLicenseMock();

const mockKibana = (license: ILicense | null = licenseMock) => {
  useKibanaMock.mockReturnValue({
    services: {
      theme: {},
      application: {
        navigateToUrl: mockNavigate,
        capabilities: {},
      },
      charts: {
        theme: {
          useChartsBaseTheme: () => {},
        },
      },
      dataViewEditor: {},
      data: {
        dataViews: {
          find: jest.fn().mockReturnValue([]),
          get: jest.fn().mockReturnValue([]),
          getDefault: jest.fn(),
        },
      },
      dataViews: {
        create: jest.fn().mockResolvedValue({
          getIndexPattern: jest.fn().mockReturnValue('some-index'),
          getRuntimeMappings: jest.fn().mockReturnValue({}),
          id: 'some-data-view-id',
        }),
      },
      docLinks: {
        links: {
          query: {},
          observability: {
            slo: 'dummy_link',
          },
        },
      },
      http: {
        basePath: {
          prepend: mockBasePathPrepend,
        },
      },
      notifications: {
        toasts: {
          addError: jest.fn(),
          addSuccess: jest.fn(),
        },
      },
      observabilityAIAssistant: observabilityAIAssistantPluginMock.createStartContract(),
      storage: {
        get: () => {},
      },
      triggersActionsUi: {},
      uiSettings: {
        get: () => {},
      },
      unifiedSearch: {
        ui: {
          QueryStringInput: () => <div>Query String Input</div>,
          SearchBar: () => <div>Search Bar</div>,
        },
        autocomplete: {
          hasQuerySuggestions: () => {},
        },
      },
      licensing: {
        license$: new BehaviorSubject(license),
      },
      share: sharePluginMock.createStartContract(),
      inspector: { open: jest.fn() },
    },
  });
};

const SLO_ID = 'slo-1234';

describe('SLO Edit Page', () => {
  const mockCreate = jest.fn(() => Promise.resolve({ id: SLO_ID }));
  const mockUpdate = jest.fn();
  const mockCreateRule = jest.fn();

  const history = createBrowserHistory();

  beforeEach(() => {
    jest.clearAllMocks();
    mockKibana();

    // Silence all the ref errors in Eui components.
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    history.replace('');
    jest.spyOn(Router, 'useHistory').mockReturnValue(history);

    useFetchDataViewsMock.mockReturnValue({
      isLoading: false,
      data: [
        {
          getName: () => 'dataview',
          getIndexPattern: () => 'some-index',
          getRuntimeMappings: jest.fn().mockReturnValue({}),
        },
      ],
    });

    useCreateDataViewMock.mockReturnValue({
      dataView: {
        getName: () => 'dataview',
        getIndexPattern: () => 'some-index',
        getRuntimeMappings: jest.fn().mockReturnValue({}),
        fields: [{ name: 'custom_timestamp', type: 'date' }],
      },
      loading: false,
    });

    useFetchIndicesMock.mockReturnValue({
      isLoading: false,
      data: ['some-index', 'index-2'],
    });

    useCreateSloMock.mockReturnValue({
      isLoading: false,
      isSuccess: false,
      isError: false,
      mutateAsync: mockCreate,
    });

    useCreateRuleMock.mockReturnValue({
      isLoading: false,
      isSuccess: false,
      isError: false,
      mutate: mockCreateRule,
    });

    useUpdateSloMock.mockReturnValue({
      isLoading: false,
      isSuccess: false,
      isError: false,
      mutateAsync: mockUpdate,
    });

    usePermissionsMock.mockReturnValue({
      isLoading: false,
      data: {
        hasAllWriteRequested: true,
        hasAllReadRequested: true,
      },
    });
    licenseMock.hasAtLeast.mockReturnValue(true);
    useFetcherMock.mockReturnValue({ data: undefined, isLoading: false });
  });

  afterEach(cleanup);

  describe('create SLO flow', () => {
    beforeEach(() => {
      jest.spyOn(Router, 'useParams').mockReturnValue({ sloId: undefined });
      jest
        .spyOn(Router, 'useLocation')
        .mockReturnValue({ pathname: '/slos/create', search: '', state: '', hash: '' });
      useFetchSloDetailsMock.mockReturnValue({ isInitialLoading: false, data: undefined });
      useFetchSloTemplateMock.mockReturnValue({ isInitialLoading: false, data: undefined });
    });

    it('with invalid license triggers a redirect to the SLO Welcome page', async () => {
      licenseMock.hasAtLeast.mockReturnValue(false);

      render(<SloEditPage />);

      expect(mockNavigate).toHaveBeenCalledWith(mockBasePathPrepend(paths.slosWelcome));
    });

    it('with no read permission triggers a redirect to the SLO welcome page', async () => {
      usePermissionsMock.mockReturnValue({
        isLoading: false,
        data: {
          hasAllWriteRequested: false,
          hasAllReadRequested: false,
        },
      });

      render(<SloEditPage />);

      expect(mockNavigate).toHaveBeenCalledWith(mockBasePathPrepend(paths.slosWelcome));
    });

    it('with no write permission triggers a redirect to the SLO List page', async () => {
      usePermissionsMock.mockReturnValue({
        isLoading: false,
        data: {
          hasAllWriteRequested: false,
          hasAllReadRequested: true,
        },
      });

      render(<SloEditPage />);

      expect(mockNavigate).toHaveBeenCalledWith(mockBasePathPrepend(paths.slos));
    });

    it('renders an empty SLO Edit Form', async () => {
      const { queryByTestId } = render(<SloEditPage />);

      expect(queryByTestId('sloEditPage')).toBeTruthy();
      expect(queryByTestId('sloForm')).toBeTruthy();

      expect(queryByTestId('sloEditFormIndicatorSection')).toBeTruthy();
      // Show default values from the kql indicator
      expect(queryByTestId('sloFormIndicatorTypeSelect')).toHaveValue('sli.kql.custom');
      expect(queryByTestId('indexSelectionSelectedValue')).toBeNull();

      // other sections are hidden
      expect(queryByTestId('sloEditFormObjectiveSection')).toBeNull();
      expect(queryByTestId('sloEditFormDescriptionSection')).toBeNull();
    });

    it('renders the SLO Edit Form with prefilled values from the URL', async () => {
      history.replace(
        '/slos/create?_a=(name:CartServiceLatency,indicator:(params:(environment:prod,service:cartService),type:sli.apm.transactionDuration))'
      );

      useFetchApmSuggestionsMock.mockReturnValue({
        suggestions: ['cartService'],
        isLoading: false,
      });

      const { queryByTestId, getByTestId } = render(<SloEditPage />);

      expect(queryByTestId('sloEditPage')).toBeTruthy();
      expect(queryByTestId('sloForm')).toBeTruthy();

      expect(queryByTestId('sloEditFormIndicatorSection')).toBeTruthy();
      expect(queryByTestId('sloFormIndicatorTypeSelect')).toHaveValue(
        'sli.apm.transactionDuration'
      );
      expect(queryByTestId('apmLatencyServiceSelector')).toHaveTextContent('cartService');
      expect(queryByTestId('apmLatencyEnvironmentSelector')).toHaveTextContent('prod');

      expect(queryByTestId('sloEditFormObjectiveSection')).toBeTruthy();
      expect(queryByTestId('sloEditFormDescriptionSection')).toBeTruthy();

      expect(getByTestId('sloFormSubmitButton')).toBeEnabled();

      await waitFor(() => {
        fireEvent.click(getByTestId('sloFormSubmitButton'));
      });

      expect(mockCreate).toHaveBeenCalled();
    });

    it('renders the SLO Edit Form with prefilled values from a template', async () => {
      history.replace('/slos/create?fromTemplateId=template-1234');

      const sloTemplate = {
        templateId: 'template-1234',
        name: 'My template',
        description: 'This is my template',
        indicator: {
          type: 'sli.kql.custom',
          params: {
            index: 'some-index',
            filter: 'template: foo',
            good: 'http_status: 2xx',
            total: 'http_status: *',
            timestampField: '@timestamp',
          },
        },
        budgetingMethod: 'occurrences',
        objective: {
          target: 0.95,
        },
      };
      useFetchSloTemplateMock.mockReturnValue({ isInitialLoading: false, data: sloTemplate });

      const { queryByTestId, getByTestId } = render(<SloEditPage />);

      expect(queryByTestId('sloEditPage')).toBeTruthy();
      expect(queryByTestId('sloForm')).toBeTruthy();

      expect(queryByTestId('sloEditFormIndicatorSection')).toBeTruthy();
      expect(queryByTestId('sloFormIndicatorTypeSelect')).toHaveValue('sli.kql.custom');
      expect(queryByTestId('sloEditFormObjectiveSection')).toBeTruthy();
      expect(queryByTestId('sloEditFormDescriptionSection')).toBeTruthy();

      expect(queryByTestId('sloFormNameInput')).toHaveValue('My template');
      expect(queryByTestId('sloFormDescriptionTextArea')).toHaveValue('This is my template');

      expect(getByTestId('sloFormSubmitButton')).toBeEnabled();

      await waitFor(() => {
        fireEvent.click(getByTestId('sloFormSubmitButton'));
        expect(mockCreate).toHaveBeenCalled();
      });
    });
  });

  describe('edit SLO flow', () => {
    let slo: SLOWithSummaryResponse;
    beforeEach(() => {
      jest.spyOn(Router, 'useParams').mockReturnValue({ sloId: SLO_ID });
      jest
        .spyOn(Router, 'useLocation')
        .mockReturnValue({ pathname: `/slos/edit/${SLO_ID}`, search: '', state: '', hash: '' });
      slo = buildSlo({ id: SLO_ID });
      useFetchSloDetailsMock.mockReturnValue({ isInitialLoading: false, data: slo });
      useFetchSloTemplateMock.mockReturnValue({ isInitialLoading: false, data: undefined });
    });

    it('with invalid license triggers a redirect to the SLO welcome page', async () => {
      licenseMock.hasAtLeast.mockReturnValue(false);

      render(<SloEditPage />);

      expect(mockNavigate).toHaveBeenCalledWith(mockBasePathPrepend(paths.slosWelcome));
    });

    it('with no read permission triggers a redirect to the SLO welcome page', async () => {
      usePermissionsMock.mockReturnValue({
        isLoading: false,
        data: {
          hasAllWriteRequested: false,
          hasAllReadRequested: false,
        },
      });

      render(<SloEditPage />);

      expect(mockNavigate).toHaveBeenCalledWith(mockBasePathPrepend(paths.slosWelcome));
    });

    it('with no write permission triggers a redirect to the SLO List page', async () => {
      usePermissionsMock.mockReturnValue({
        isLoading: false,
        data: {
          hasAllWriteRequested: false,
          hasAllReadRequested: true,
        },
      });
      render(<SloEditPage />);

      expect(mockNavigate).toHaveBeenCalledWith(mockBasePathPrepend(paths.slos));
    });

    it('prefills the form with the SLO values', async () => {
      const { queryByTestId } = render(<SloEditPage />);

      expect(queryByTestId('sloEditPage')).toBeTruthy();
      expect(queryByTestId('sloForm')).toBeTruthy();

      // all sections are visible
      expect(queryByTestId('sloEditFormIndicatorSection')).toBeTruthy();
      expect(queryByTestId('sloEditFormObjectiveSection')).toBeTruthy();
      expect(queryByTestId('sloEditFormDescriptionSection')).toBeTruthy();

      expect(queryByTestId('sloFormBudgetingMethodSelect')).toHaveValue(slo.budgetingMethod);
      expect(queryByTestId('sloFormTimeWindowDurationSelect')).toHaveValue(slo.timeWindow.duration);
      expect(queryByTestId('sloFormObjectiveTargetInput')).toHaveValue(slo.objective.target * 100);

      expect(queryByTestId('sloFormNameInput')).toHaveValue(slo.name);
      expect(queryByTestId('sloFormDescriptionTextArea')).toHaveValue(slo.description);
    });

    it('calls the updateSlo hook if all required values are filled in', async () => {
      const { getByTestId } = render(<SloEditPage />);

      expect(getByTestId('sloFormSubmitButton')).toBeEnabled();

      await waitFor(() => {
        fireEvent.click(getByTestId('sloFormSubmitButton'));
      });

      expect(mockUpdate).toHaveBeenCalled();
      expect(mockNavigate).toHaveBeenCalledWith(mockBasePathPrepend(paths.slos));
    });
  });
});
