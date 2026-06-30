/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import type { ActionConnector } from '@kbn/triggers-actions-ui-plugin/public/types';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent, { type UserEvent } from '@testing-library/user-event';
import { showEuiComboBoxOptions } from '@elastic/eui/lib/test/rtl';
import { useAlertsDataView } from '@kbn/alerts-ui-shared/src/common/hooks/use_alerts_data_view';
import { useApplication } from '../../../common/lib/kibana/use_application';
import { CasesParamsFields } from './cases_params';
import { useKibana } from '../../../common/lib/kibana/kibana_react';
import { createStartServicesMock } from '../../../common/lib/kibana/kibana_react.mock';
import { useGetAllCaseConfigurations } from '../../../containers/configure/use_get_all_case_configurations';
import { useGetAllCaseConfigurationsResponse } from '../../configure_cases/__mock__';
import { templatesConfigurationMock } from '../../../containers/mock';
import * as utils from '../../../containers/configure/utils';
import { ATTACK_DISCOVERY_SCHEDULES_ALERT_TYPE_ID } from '@kbn/elastic-assistant-common';
import { createMockActionConnector } from '@kbn/alerts-ui-shared/src/common/test_utils/connector.mock';
import { MAX_OPEN_CASES_DEFAULT_MAXIMUM } from '../../../../common/constants';
import { KibanaServices } from '../../../common/lib/kibana/services';

jest.mock('@kbn/alerts-ui-shared/src/common/hooks/use_alerts_data_view');
jest.mock('../../../common/lib/kibana/use_application');
jest.mock('../../../common/lib/kibana/kibana_react');
jest.mock('../../../containers/configure/use_get_all_case_configurations');
jest.mock('../../templates_v2/hooks/use_get_templates', () => ({
  useGetTemplates: (...args: unknown[]) => mockUseGetTemplates(...args),
}));

// Mock the entire TemplateSelectorV2 to control its onChange callback in isolation tests
jest.mock('./template_selector_v2', () => ({
  TemplateSelectorV2: ({
    onChange,
    owner,
    isDisabled,
    templateId,
  }: {
    onChange: (p: { templateId: string | null; templateVersion: string | null }) => void;
    owner: string;
    isDisabled?: boolean;
    templateId: string | null;
  }) => (
    <button
      type="button"
      data-test-subj="cases-connector-template-v2-select"
      disabled={isDisabled}
      onClick={() => onChange({ templateId: 'tmpl-v2', templateVersion: '1' })}
    >
      {`V2 Selector owner=${owner} templateId=${templateId}`}
    </button>
  ),
}));

const mockUseGetTemplates = jest
  .fn()
  .mockReturnValue({ data: { templates: [] }, isLoading: false });

const useKibanaMock = jest.mocked(useKibana);
const useAlertsDataViewMock = jest.mocked(useAlertsDataView);
const useApplicationMock = useApplication as jest.Mock;
const useGetAllCaseConfigurationsMock = useGetAllCaseConfigurations as jest.Mock;

const actionParams = {
  subAction: 'run',
  subActionParams: {
    timeWindow: '6w',
    reopenClosedCases: false,
    groupingBy: [],
  },
};

const connector: ActionConnector = createMockActionConnector({
  id: 'test',
  actionTypeId: '.test',
  name: 'Test',
});

const editAction = jest.fn();
const defaultProps = {
  actionConnector: connector,
  actionParams,
  editAction,
  errors: { 'subActionParams.timeWindow.size': [] },
  index: 0,
  producerId: 'test',
};

describe('CasesParamsFields renders', () => {
  let user: UserEvent;

  beforeAll(() => {
    jest.useFakeTimers();
  });

  afterAll(() => {
    jest.useRealTimers();
  });

  beforeEach(() => {
    // Workaround for timeout via https://github.com/testing-library/user-event/issues/833#issuecomment-1171452841
    user = userEvent.setup({
      advanceTimers: jest.advanceTimersByTime,
      pointerEventsCheck: 0,
    });
    useApplicationMock.mockReturnValueOnce({ appId: 'management' });
    useAlertsDataViewMock.mockReturnValue({
      isLoading: false,
      dataView: {
        title: '.alerts-test',
        fields: [
          {
            name: 'host.ip',
            type: 'ip',
            aggregatable: true,
            searchable: true,
          },
          {
            name: 'host.geo.location',
            type: 'geo_point',
            aggregatable: false,
            searchable: true,
          },
        ],
      },
    });
    useGetAllCaseConfigurationsMock.mockImplementation(() => useGetAllCaseConfigurationsResponse);
    useKibanaMock.mockReturnValue({
      services: {
        ...createStartServicesMock(),
        uiSettings: {
          get: jest.fn().mockReturnValue(MAX_OPEN_CASES_DEFAULT_MAXIMUM),
        },
        data: { dataViews: {} },
      },
    } as unknown as ReturnType<typeof useKibana>);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('all params fields are rendered', async () => {
    render(<CasesParamsFields {...defaultProps} />);

    expect(await screen.findByTestId('group-by-alert-field-combobox')).toBeInTheDocument();
    expect(await screen.findByTestId('time-window-size-input')).toBeInTheDocument();
    expect(await screen.findByTestId('time-window-unit-select')).toBeInTheDocument();
    expect(await screen.findByTestId('create-case-template-select')).toBeInTheDocument();
    expect(await screen.findByTestId('reopen-case')).toBeInTheDocument();
    expect(screen.queryByTestId('auto-push-case')).not.toBeInTheDocument();
    expect(await screen.findByTestId('maximum-case-to-open-input')).toBeInTheDocument();
  });

  it('renders loading state of grouping by fields correctly', async () => {
    useAlertsDataViewMock.mockReturnValue({ isLoading: true });
    render(<CasesParamsFields {...defaultProps} />);

    expect(await screen.findByRole('progressbar')).toBeInTheDocument();
  });

  it('disables dropdown when loading grouping by fields', async () => {
    useAlertsDataViewMock.mockReturnValue({ isLoading: true });
    render(<CasesParamsFields {...defaultProps} />);

    expect(await screen.findByRole('progressbar')).toBeInTheDocument();
    expect(await screen.findByTestId('comboBoxSearchInput')).toBeDisabled();
  });

  it('when subAction undefined, sets to default', () => {
    const newProps = {
      ...defaultProps,
      actionParams: {},
    };
    render(<CasesParamsFields {...newProps} />);

    expect(editAction.mock.calls[0][1]).toEqual('run');
  });

  it('when subActionParams undefined, sets to default', () => {
    const newProps = {
      ...defaultProps,
      actionParams: {
        subAction: 'run',
      },
    };
    render(<CasesParamsFields {...newProps} />);
    expect(editAction.mock.calls[0][1]).toEqual({
      timeWindow: '7d',
      reopenClosedCases: false,
      groupingBy: [],
      templateId: null,
      templateVersion: null,
    });
  });

  it('If timeWindow has errors, form row is invalid', async () => {
    const newProps = {
      ...defaultProps,
      errors: { timeWindow: ['error'] },
    };

    render(<CasesParamsFields {...newProps} />);

    expect(await screen.findByText('error')).toBeInTheDocument();
  });

  it('renders the default maximum amount of cases correctly', async () => {
    render(<CasesParamsFields {...defaultProps} />);

    const maximumCasesInput = await screen.findByTestId('maximum-case-to-open-input');
    expect(maximumCasesInput).toHaveValue(5);

    // set to the maximum
    fireEvent.change(maximumCasesInput, { target: { value: '20' } });
    expect(editAction.mock.calls[0][1].maximumCasesToOpen).toEqual(20);
    expect(maximumCasesInput).toBeValid();

    // set to an invalid value
    fireEvent.change(maximumCasesInput, { target: { value: '22' } });
    expect(maximumCasesInput).toBeInvalid();
  });

  it('uses the configured advanced setting ceiling for the maximum amount of cases', async () => {
    useKibanaMock.mockReturnValue({
      services: {
        ...createStartServicesMock(),
        uiSettings: {
          get: jest.fn().mockReturnValue(30),
        },
        data: { dataViews: {} },
      },
    } as unknown as ReturnType<typeof useKibana>);

    render(<CasesParamsFields {...defaultProps} />);

    expect(
      await screen.findByText('Set the maximum amount of cases to be opened. (Max 30)')
    ).toBeInTheDocument();

    const maximumCasesInput = await screen.findByTestId('maximum-case-to-open-input');
    fireEvent.change(maximumCasesInput, { target: { value: '30' } });
    expect(maximumCasesInput).toBeValid();

    fireEvent.change(maximumCasesInput, { target: { value: '31' } });
    expect(maximumCasesInput).toBeInvalid();
  });

  describe('UI updates', () => {
    it('renders grouping by field options', async () => {
      render(<CasesParamsFields {...defaultProps} />);

      await user.click(await screen.findByTestId('group-by-alert-field-combobox'));

      await showEuiComboBoxOptions();

      expect(await screen.findByText('host.ip')).toBeInTheDocument();

      expect(screen.queryByText('host.geo.location')).not.toBeInTheDocument();
    });

    it('renders the auto push case option correctly', async () => {
      useGetAllCaseConfigurationsMock.mockImplementation(() => ({
        ...useGetAllCaseConfigurationsResponse,
        data: [
          {
            ...useGetAllCaseConfigurationsResponse.data[0],
            templates: templatesConfigurationMock,
          },
        ],
      }));

      const props = {
        ...defaultProps,
        producerId: 'siem',
        actionParams: {
          subAction: 'run',
          subActionParams: {
            ...actionParams.subActionParams,
            templateId: templatesConfigurationMock[3].key,
          },
        },
      };

      render(<CasesParamsFields {...props} />);

      const autoPushCase = await screen.findByTestId('auto-push-case');
      expect(autoPushCase).not.toBeChecked();

      // click and observe update
      await user.click(autoPushCase);
      expect(editAction.mock.calls[0][1].autoPushCase).toEqual(true);
    });

    it('updates grouping by field', async () => {
      render(<CasesParamsFields {...defaultProps} />);

      await user.click(await screen.findByTestId('group-by-alert-field-combobox'));

      await showEuiComboBoxOptions();

      expect(await screen.findByText('host.ip')).toBeInTheDocument();

      await user.click(await screen.findByText('host.ip'));

      expect(editAction.mock.calls[0][1].groupingBy).toEqual(['host.ip']);
    });

    it('updates grouping by field by search', async () => {
      useAlertsDataViewMock.mockReturnValue({
        isLoading: false,
        dataView: {
          title: '.alerts-test',
          fields: [
            {
              name: 'host.ip',
              type: 'ip',
              aggregatable: true,
              searchable: true,
            },
            {
              name: 'host.geo.location',
              type: 'geo_point',
              aggregatable: false,
              searchable: true,
            },
            {
              name: 'alert.name',
              type: 'string',
              aggregatable: true,
              searchable: true,
            },
          ],
        },
      });

      render(<CasesParamsFields {...defaultProps} />);

      await user.click(await screen.findByTestId('group-by-alert-field-combobox'));

      await showEuiComboBoxOptions();

      await user.type(await screen.findByTestId('comboBoxSearchInput'), 'alert.name{enter}');

      expect(editAction.mock.calls[0][1].groupingBy).toEqual(['alert.name']);
    });

    it('renders default template correctly', async () => {
      render(<CasesParamsFields {...defaultProps} />);

      expect(await screen.findByTestId('create-case-template-select')).toBeInTheDocument();
      expect(await screen.findByText('No template selected')).toBeInTheDocument();
    });

    it('renders selected templates correctly', async () => {
      useGetAllCaseConfigurationsMock.mockImplementation(() => ({
        ...useGetAllCaseConfigurationsResponse,
        data: [
          {
            ...useGetAllCaseConfigurationsResponse.data[0],
            templates: templatesConfigurationMock,
          },
        ],
      }));

      const newProps = {
        ...defaultProps,
        producerId: 'siem',
        actionParams: {
          subAction: 'run',
          subActionParams: {
            ...actionParams.subActionParams,
            templateId: templatesConfigurationMock[1].key,
          },
        },
      };

      render(<CasesParamsFields {...newProps} />);

      expect(await screen.findByTestId('create-case-template-select')).toBeInTheDocument();
      expect(await screen.findByText(templatesConfigurationMock[1].name)).toBeInTheDocument();
    });

    it('renders security templates if the project is serverless security', async () => {
      useKibanaMock.mockReturnValue({
        services: {
          ...createStartServicesMock(),
          // simulate a serverless security project
          cloud: { isServerlessEnabled: true, serverless: { projectType: 'security' } },
          data: { dataViews: {} },
        },
      } as unknown as ReturnType<typeof useKibana>);

      const configuration = {
        ...useGetAllCaseConfigurationsResponse.data[0],
        templates: templatesConfigurationMock,
      };
      useGetAllCaseConfigurationsMock.mockImplementation(() => ({
        ...useGetAllCaseConfigurationsResponse,
        data: [configuration],
      }));
      const getConfigurationByOwnerSpy = jest
        .spyOn(utils, 'getConfigurationByOwner')
        .mockImplementation(() => configuration);

      const observabilityOwnedRule = {
        ...defaultProps,
        // these two would normally produce an observability owner
        producerId: 'observability',
        featureId: 'observability',
        actionParams: {
          subAction: 'run',
          subActionParams: {
            ...actionParams.subActionParams,
            templateId: templatesConfigurationMock[1].key,
          },
        },
      };

      render(<CasesParamsFields {...observabilityOwnedRule} />);

      expect(getConfigurationByOwnerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          // the security owner was forced
          owner: 'securitySolution',
        })
      );

      getConfigurationByOwnerSpy.mockRestore();
    });

    it('renders observability templates if the project is serverless observability', async () => {
      useKibanaMock.mockReturnValue({
        services: {
          ...createStartServicesMock(),
          // simulate a observability security project
          cloud: { isServerlessEnabled: true, serverless: { projectType: 'observability' } },
          data: { dataViews: {} },
        },
      } as unknown as ReturnType<typeof useKibana>);

      const configuration = {
        ...useGetAllCaseConfigurationsResponse.data[0],
        templates: templatesConfigurationMock,
      };
      useGetAllCaseConfigurationsMock.mockImplementation(() => ({
        ...useGetAllCaseConfigurationsResponse,
        data: [configuration],
      }));
      const getConfigurationByOwnerSpy = jest
        .spyOn(utils, 'getConfigurationByOwner')
        .mockImplementation(() => configuration);

      const securityOwnedRule = {
        ...defaultProps,
        // these two would normally produce a security owner
        producerId: 'securitySolution',
        featureId: 'securitySolution',
        actionParams: {
          subAction: 'run',
          subActionParams: {
            ...actionParams.subActionParams,
            templateId: templatesConfigurationMock[1].key,
          },
        },
      };

      render(<CasesParamsFields {...securityOwnedRule} />);

      expect(getConfigurationByOwnerSpy).toHaveBeenCalledWith(
        expect.objectContaining({
          // the observability owner was forced
          owner: 'observability',
        })
      );

      getConfigurationByOwnerSpy.mockRestore();
    });

    it('updates template correctly', async () => {
      useGetAllCaseConfigurationsMock.mockReturnValueOnce({
        ...useGetAllCaseConfigurationsResponse,
        data: [
          {
            ...useGetAllCaseConfigurationsResponse.data[0],
            templates: templatesConfigurationMock,
          },
        ],
      });

      const selectedTemplate = templatesConfigurationMock[4];
      const newProps = { ...defaultProps, producerId: 'siem' };

      render(<CasesParamsFields {...newProps} />);

      await user.selectOptions(
        screen.getByTestId('create-case-template-select'),
        selectedTemplate.name
      );

      expect(editAction.mock.calls[0][1].templateId).toEqual(selectedTemplate.key);
      expect(await screen.findByText(selectedTemplate.name)).toBeInTheDocument();
    });

    it('updates time window size', async () => {
      render(<CasesParamsFields {...defaultProps} />);

      // There seems to be a bug with userEvent v14 and input[type=number]
      // where it's not able to clear the input value, so falling back to fireEvent.

      const timeWindowSizeInput = await screen.findByTestId('time-window-size-input');

      expect(timeWindowSizeInput).toBeInTheDocument();
      expect(timeWindowSizeInput).toHaveValue(6);

      fireEvent.change(timeWindowSizeInput, { target: { value: '5' } });

      expect(editAction.mock.calls[0][1].timeWindow).toEqual('5w');
    });

    it('updates time window unit', async () => {
      render(<CasesParamsFields {...defaultProps} />);

      expect(await screen.findByTestId('time-window-unit-select')).toBeInTheDocument();

      fireEvent.change(await screen.findByTestId('time-window-unit-select'), {
        target: { value: 'd' },
      });

      expect(editAction.mock.calls[0][1].timeWindow).toEqual('6d');
    });

    it('renders time window warning', async () => {
      const { rerender } = render(<CasesParamsFields {...defaultProps} />);

      expect(screen.queryByTestId('show-time-window-warning')).not.toBeInTheDocument();

      const updatedProps = {
        ...defaultProps,
        actionParams: {
          ...defaultProps.actionParams,
          subActionParams: { ...defaultProps.actionParams.subActionParams, timeWindow: '10m' },
        },
      };

      rerender(<CasesParamsFields {...updatedProps} />);

      expect(await screen.findByTestId('show-time-window-warning')).toBeInTheDocument();
    });

    it('updates reopenClosedCases', async () => {
      render(<CasesParamsFields {...defaultProps} />);

      expect(await screen.findByTestId('reopen-case')).toBeInTheDocument();

      await user.click(await screen.findByTestId('reopen-case'));

      expect(editAction.mock.calls[0][1].reopenClosedCases).toEqual(true);
    });
  });

  describe('Attack Discovery', () => {
    it('does not render `group by` component', async () => {
      const newProps = {
        ...defaultProps,
        ruleTypeId: ATTACK_DISCOVERY_SCHEDULES_ALERT_TYPE_ID,
      };
      render(<CasesParamsFields {...newProps} />);

      expect(screen.queryByTestId('group-by-alert-field-combobox')).not.toBeInTheDocument();
    });

    it('does not render `time window` component', async () => {
      const newProps = {
        ...defaultProps,
        ruleTypeId: ATTACK_DISCOVERY_SCHEDULES_ALERT_TYPE_ID,
      };
      render(<CasesParamsFields {...newProps} />);

      expect(screen.queryByTestId('time-window-size-input')).not.toBeInTheDocument();
      expect(screen.queryByTestId('time-window-unit-select')).not.toBeInTheDocument();
    });

    it('does not render `reopen case` component', async () => {
      const newProps = {
        ...defaultProps,
        ruleTypeId: ATTACK_DISCOVERY_SCHEDULES_ALERT_TYPE_ID,
      };
      render(<CasesParamsFields {...newProps} />);

      expect(screen.queryByTestId('reopen-case')).not.toBeInTheDocument();
    });

    it('renders disabled `template selector` component', async () => {
      const newProps = {
        ...defaultProps,
        ruleTypeId: ATTACK_DISCOVERY_SCHEDULES_ALERT_TYPE_ID,
      };
      render(<CasesParamsFields {...newProps} />);

      const templateSelectorComponent = await screen.findByTestId('create-case-template-select');

      expect(templateSelectorComponent).toBeInTheDocument();
      expect(templateSelectorComponent).toBeDisabled();
    });

    it('shows attack discovery explanation tooltip', async () => {
      const newProps = {
        ...defaultProps,
        ruleTypeId: ATTACK_DISCOVERY_SCHEDULES_ALERT_TYPE_ID,
      };
      render(<CasesParamsFields {...newProps} />);

      await user.hover(await screen.findByTestId('create-case-template-select'));

      expect(await screen.findByTestId('case-action-attack-discovery-tooltip')).toBeTruthy();
      expect(
        await screen.findByText(
          'Attack Discovery Schedules fully manage Case actions, automatically filling in all fields for new Cases.'
        )
      ).toBeInTheDocument();
    });
  });

  describe('Templates v2 (templates.enabled=true)', () => {
    const enableTemplatesV2 = () =>
      jest
        .spyOn(KibanaServices, 'getConfig')
        .mockReturnValue({ templates: { enabled: true } } as ReturnType<
          typeof KibanaServices.getConfig
        >);

    afterEach(() => {
      jest.restoreAllMocks();
    });

    it('renders the v2 template selector when templates.enabled is true', async () => {
      enableTemplatesV2();
      render(<CasesParamsFields {...defaultProps} />);

      expect(await screen.findByTestId('cases-connector-template-v2-select')).toBeInTheDocument();
      expect(screen.queryByTestId('create-case-template-select')).not.toBeInTheDocument();
    });

    it('does not render auto-push checkbox on v2 path', async () => {
      enableTemplatesV2();
      render(<CasesParamsFields {...defaultProps} />);

      expect(screen.queryByTestId('auto-push-case')).not.toBeInTheDocument();
    });

    it('writes templateId and templateVersion when onChange fires on v2 selector', async () => {
      enableTemplatesV2();
      render(<CasesParamsFields {...defaultProps} />);

      await user.click(await screen.findByTestId('cases-connector-template-v2-select'));

      const lastCall = editAction.mock.calls[editAction.mock.calls.length - 1];
      expect(lastCall[1].templateId).toBe('tmpl-v2');
      expect(lastCall[1].templateVersion).toBe('1');
    });

    it('shows v2 selector (disabled) for attack discovery rules when templates.enabled is true', async () => {
      enableTemplatesV2();
      const newProps = {
        ...defaultProps,
        ruleTypeId: ATTACK_DISCOVERY_SCHEDULES_ALERT_TYPE_ID,
      };
      render(<CasesParamsFields {...newProps} />);

      const templateSelect = await screen.findByTestId('cases-connector-template-v2-select');
      expect(templateSelect).toBeInTheDocument();
      expect(templateSelect).toBeDisabled();
    });
  });
});
