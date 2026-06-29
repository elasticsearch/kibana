/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, waitFor, within, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { stubIndexPattern } from '@kbn/data-plugin/common/stubs';
import { StepAboutRule, StepAboutRuleReadOnly } from '.';
import { useFetchIndex } from '../../../../common/containers/source';
import { useGetInstalledJob } from '../../../../common/components/ml/hooks/use_get_jobs';
import { useSecurityJobs } from '../../../../common/components/ml_popover/hooks/use_security_jobs';
import { mockAboutStepRule } from '../../../rule_management_ui/components/rules_table/__mocks__/mock';
import { stepAboutDefaultValue } from './default_value';
import type { AboutStepRule, DefineStepRule } from '../../../common/types';
import { DataSourceType, AlertSuppressionDurationType } from '../../../common/types';
import { TestProviders } from '../../../../common/mock';
import { useRuleForms } from '../../pages/form';
import { stepActionsDefaultValue } from '../../../rule_creation/components/step_rule_actions';
import { defaultSchedule, stepDefineDefaultValue } from '../../../common/utils';
import { useKibana as mockUseKibana } from '../../../../common/lib/kibana/__mocks__';
import { useKibana } from '../../../../common/lib/kibana';
import {
  ALERT_SUPPRESSION_DURATION_FIELD_NAME,
  ALERT_SUPPRESSION_DURATION_TYPE_FIELD_NAME,
  ALERT_SUPPRESSION_DURATION_UNIT_FIELD_NAME,
  ALERT_SUPPRESSION_DURATION_VALUE_FIELD_NAME,
  ALERT_SUPPRESSION_FIELDS_FIELD_NAME,
  ALERT_SUPPRESSION_MISSING_FIELDS_FIELD_NAME,
} from '../../../rule_creation/components/alert_suppression_edit';
import { THRESHOLD_ALERT_SUPPRESSION_ENABLED } from '../../../rule_creation/components/threshold_alert_suppression_edit';
import { AlertSuppressionMissingFieldsStrategyEnum } from '../../../../../common/api/detection_engine';
import { useUserPrivileges } from '../../../../common/components/user_privileges';
import { initialUserPrivilegesState } from '../../../../common/components/user_privileges/user_privileges_context';
import { useGetEndpointExceptionsPerPolicyOptIn } from '../../../../management/hooks/artifacts/use_endpoint_per_policy_opt_in';

jest.mock('../../../../common/lib/kibana');
jest.mock('../../../../common/containers/source');
jest.mock('../../../../common/components/ml/hooks/use_get_jobs');
jest.mock('../../../../common/components/ml_popover/hooks/use_security_jobs');
jest.mock('../../../../common/hooks/use_experimental_features');
jest.mock('../../../../common/components/user_privileges');
jest.mock('../../../../management/hooks/artifacts/use_endpoint_per_policy_opt_in');
jest.mock('@elastic/eui', () => {
  const original = jest.requireActual('@elastic/eui');
  return {
    ...original,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    EuiFieldText: (props: any) => {
      const { isInvalid, isLoading, fullWidth, inputRef, isDisabled, ...validInputProps } = props;
      return <input {...validInputProps} />;
    },
  };
});
const mockedUseKibana = mockUseKibana();
const mockedUseGetEndpointExceptionsPerPolicyOptIn =
  useGetEndpointExceptionsPerPolicyOptIn as jest.Mock;

export const stepDefineStepMLRule: DefineStepRule = {
  ruleType: 'machine_learning',
  index: ['default-index-*'],
  queryBar: { query: { query: '', language: '' }, filters: [], saved_id: null },
  machineLearningJobId: ['auth_high_count_logon_events_for_a_source_ip_ea'],
  anomalyThreshold: 50,
  threshold: { cardinality: { value: '', field: [] }, value: '100', field: [] },
  threatIndex: [],
  threatQueryBar: { query: { query: '', language: '' }, filters: [], saved_id: null },
  requiredFields: [],
  relatedIntegrations: [],
  threatMapping: [],
  timeline: { id: null, title: null },
  eqlOptions: {},
  dataSourceType: DataSourceType.IndexPatterns,
  [ALERT_SUPPRESSION_FIELDS_FIELD_NAME]: ['host.name'],
  [ALERT_SUPPRESSION_DURATION_TYPE_FIELD_NAME]: AlertSuppressionDurationType.PerRuleExecution,
  [ALERT_SUPPRESSION_DURATION_FIELD_NAME]: {
    [ALERT_SUPPRESSION_DURATION_VALUE_FIELD_NAME]: 5,
    [ALERT_SUPPRESSION_DURATION_UNIT_FIELD_NAME]: 'm',
  },
  [ALERT_SUPPRESSION_MISSING_FIELDS_FIELD_NAME]: AlertSuppressionMissingFieldsStrategyEnum.suppress,
  [THRESHOLD_ALERT_SUPPRESSION_ENABLED]: false,
  newTermsFields: ['host.ip'],
  historyWindowSize: '7d',
  shouldLoadQueryDynamically: false,
};

describe('StepAboutRuleComponent', () => {
  let useGetInstalledJobMock: jest.Mock;
  let useSecurityJobsMock: jest.Mock;
  const TestComp = ({
    defineStepDefaultOverride,
    onSubmit,
  }: {
    defineStepDefaultOverride?: DefineStepRule;
    onSubmit?: (data: AboutStepRule, isValid: boolean) => void;
  }) => {
    const defineStepDefault = defineStepDefaultOverride ?? stepDefineDefaultValue;
    const aboutStepDefault = stepAboutDefaultValue;
    const { aboutStepForm } = useRuleForms({
      defineStepDefault,
      aboutStepDefault,
      scheduleStepDefault: defaultSchedule,
      actionsStepDefault: stepActionsDefaultValue,
    });

    return (
      <>
        <StepAboutRule
          ruleType={defineStepDefault.ruleType}
          machineLearningJobId={defineStepDefault.machineLearningJobId}
          index={defineStepDefault.index}
          dataViewId={defineStepDefault.dataViewId}
          timestampOverride={aboutStepDefault.timestampOverride}
          isLoading={false}
          form={aboutStepForm}
        />
        <button
          type="button"
          onClick={async () => {
            const result = await aboutStepForm.submit();
            if (onSubmit && result) {
              onSubmit(result.data, result.isValid);
            }
          }}
        >
          {'Submit'}
        </button>
      </>
    );
  };

  beforeEach(() => {
    (useFetchIndex as jest.Mock).mockImplementation(() => [
      false,
      {
        indexPatterns: stubIndexPattern,
      },
    ]);
    (useKibana as jest.Mock).mockReturnValue(mockedUseKibana);
    (useUserPrivileges as jest.Mock).mockReturnValue({
      ...initialUserPrivilegesState(),
      rulesPrivileges: {
        rules: { edit: true },
        investigationGuide: { edit: true },
        customHighlightedFields: { edit: true },
      },
    });
    useGetInstalledJobMock = (useGetInstalledJob as jest.Mock).mockImplementation(() => ({
      jobs: [],
    }));
    useSecurityJobsMock = (useSecurityJobs as jest.Mock).mockImplementation(() => ({ jobs: [] }));

    mockedUseGetEndpointExceptionsPerPolicyOptIn.mockImplementation(() => ({
      data: { status: false },
    }));
  });

  it('renders StepRuleDescription if isReadOnlyView is true and "name" property exists', () => {
    render(
      <StepAboutRuleReadOnly
        addPadding={false}
        defaultValues={mockAboutStepRule()}
        descriptionColumns="multi"
      />,
      { wrapper: TestProviders }
    );

    expect(screen.getAllByTestId('listItemColumnStepRuleDescription').length).toBeGreaterThan(0);
  });

  it('shows endpoint exceptions for rule definition if they are not per-policy', async () => {
    mockedUseGetEndpointExceptionsPerPolicyOptIn.mockImplementation(() => ({
      data: { status: false },
    }));

    render(<TestComp />, { wrapper: TestProviders });

    expect(
      screen.getByTestId('detectionEngineStepAboutRuleAssociatedToEndpointList')
    ).toBeInTheDocument();
  });

  it('does not show endpoint exceptions for rule definition if they are per-policy', async () => {
    mockedUseGetEndpointExceptionsPerPolicyOptIn.mockImplementation(() => ({
      data: { status: true },
    }));

    render(<TestComp />, { wrapper: TestProviders });

    expect(
      screen.queryByTestId('detectionEngineStepAboutRuleAssociatedToEndpointList')
    ).not.toBeInTheDocument();
  });

  it('is invalid if description is not present', async () => {
    const { user } = setup(<TestComp />);

    await user.type(
      within(screen.getByTestId('detectionEngineStepAboutRuleName')).getByRole('textbox'),
      'Test name text'
    );

    await submitForm();

    await waitFor(() => {
      expect(screen.getByText('A description is required.')).toBeInTheDocument();
    });
  });

  it('is invalid if threat match rule and threat_indicator_path is not present', async () => {
    const { user } = setup(
      <TestComp defineStepDefaultOverride={{ ruleType: 'threat_match' } as DefineStepRule} />
    );

    await user.clear(
      within(screen.getByTestId('ruleThreatMatchIndicatorPath')).getByRole('textbox')
    );

    await submitForm();

    await waitFor(() => {
      expect(screen.getByText('Indicator prefix override must not be empty')).toBeInTheDocument();
    });
  });

  it('is valid if is not a threat match rule and threat_indicator_path is not present', async () => {
    const { user } = setup(<TestComp />);

    await user.type(
      within(screen.getByTestId('detectionEngineStepAboutRuleDescription')).getByRole('textbox'),
      'Test description text'
    );
    await user.type(
      within(screen.getByTestId('detectionEngineStepAboutRuleName')).getByRole('textbox'),
      'Test name text'
    );

    await submitForm();

    await waitFor(() => {
      expect(
        screen.queryByText('Indicator prefix override must not be empty')
      ).not.toBeInTheDocument();
    });
  });

  it('is invalid if no "name" is present', async () => {
    const { user } = setup(<TestComp />);

    await user.type(
      within(screen.getByTestId('detectionEngineStepAboutRuleDescription')).getByRole('textbox'),
      'Test description text'
    );

    await submitForm();

    await waitFor(() => {
      expect(screen.getByText('A name is required.')).toBeInTheDocument();
    });
  });

  it('is valid if both "name" and "description" are present', async () => {
    const handleSubmit = jest.fn();

    const { user } = setup(<TestComp onSubmit={handleSubmit} />);

    await user.type(
      within(screen.getByTestId('detectionEngineStepAboutRuleDescription')).getByRole('textbox'),
      'Test description text'
    );
    await user.type(
      within(screen.getByTestId('detectionEngineStepAboutRuleName')).getByRole('textbox'),
      'Test name text'
    );

    await submitForm();

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test name text',
          description: 'Test description text',
          riskScore: expect.objectContaining({ value: 21 }),
          severity: expect.objectContaining({ value: 'low' }),
        }),
        true
      );
    });
  });

  it('it allows user to set the risk score as a number (and not a string)', async () => {
    const handleSubmit = jest.fn();

    const { user } = setup(<TestComp onSubmit={handleSubmit} />);

    await user.type(
      within(screen.getByTestId('detectionEngineStepAboutRuleName')).getByRole('textbox'),
      'Test name text'
    );
    await user.type(
      within(screen.getByTestId('detectionEngineStepAboutRuleDescription')).getByRole('textbox'),
      'Test description text'
    );
    await user.clear(
      within(screen.getByTestId('detectionEngineStepAboutRuleRiskScore-defaultRisk')).getByRole(
        'spinbutton'
      )
    );
    await user.type(
      within(screen.getByTestId('detectionEngineStepAboutRuleRiskScore-defaultRisk')).getByRole(
        'spinbutton'
      ),
      '80'
    );

    await submitForm();

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith(
        expect.objectContaining({
          name: 'Test name text',
          description: 'Test description text',
          riskScore: expect.objectContaining({ value: 80 }),
        }),
        true
      );
    });
  });

  it('does not modify the provided risk score until the user changes the severity', async () => {
    const handleSubmit = jest.fn();

    const { user } = setup(<TestComp onSubmit={handleSubmit} />);

    await user.type(
      within(screen.getByTestId('detectionEngineStepAboutRuleName')).getByRole('textbox'),
      'Test name text'
    );
    await user.type(
      within(screen.getByTestId('detectionEngineStepAboutRuleDescription')).getByRole('textbox'),
      'Test description text'
    );

    await submitForm();

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ riskScore: expect.objectContaining({ value: 21 }) }),
        true
      );
    });

    handleSubmit.mockClear();

    await user.click(
      within(screen.getByTestId('detectionEngineStepAboutRuleSeverity')).getByTestId('select')
    );
    await user.click(screen.getByRole('option', { name: /medium/i }));

    await submitForm();

    await waitFor(() => {
      expect(handleSubmit).toHaveBeenCalledWith(
        expect.objectContaining({ riskScore: expect.objectContaining({ value: 47 }) }),
        true
      );
    });
  });

  it('should use index based on ML jobs when creating/editing ML rule', async () => {
    (useFetchIndex as jest.Mock).mockClear();
    useSecurityJobsMock.mockImplementation(() => ({
      jobs: [{ id: 'auth_high_count_logon_events_for_a_source_ip_ea', isInstalled: true }],
      loading: false,
    }));
    useGetInstalledJobMock.mockImplementation((jobIds: string[]) => {
      expect(jobIds).toEqual(['auth_high_count_logon_events_for_a_source_ip_ea']);
      return { jobs: [{ results_index_name: 'shared' }] };
    });

    render(<TestComp defineStepDefaultOverride={stepDefineStepMLRule} />, {
      wrapper: TestProviders,
    });

    expect(useFetchIndex).toHaveBeenLastCalledWith(['.ml-anomalies-shared']);
  });

  it('should use default rule index if selected ML jobs are not installed when creating/editing ML rule', async () => {
    (useFetchIndex as jest.Mock).mockClear();
    useSecurityJobsMock.mockImplementation(() => ({
      jobs: [{ id: 'auth_high_count_logon_events_for_a_source_ip_ea', isInstalled: false }],
      loading: false,
    }));
    useGetInstalledJobMock.mockImplementation((jobIds: string[]) => {
      expect(jobIds).toEqual([]);
      return { jobs: [] };
    });

    render(<TestComp defineStepDefaultOverride={stepDefineStepMLRule} />, {
      wrapper: TestProviders,
    });

    expect(useFetchIndex).toHaveBeenLastCalledWith(stepDefineStepMLRule.index);
  });
});

function setup(ui: React.ReactElement) {
  return {
    user: userEvent.setup({ delay: null, pointerEventsCheck: 0 }),
    ...render(ui, { wrapper: TestProviders }),
  };
}

function submitForm(): Promise<void> {
  return act(async () => {
    fireEvent.click(screen.getByText('Submit'));
  });
}
