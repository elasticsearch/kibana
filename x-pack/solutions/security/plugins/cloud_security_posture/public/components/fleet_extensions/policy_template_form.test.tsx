/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import React from 'react';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useParams } from 'react-router-dom';
import {
  AWS_CREDENTIALS_TYPE_OPTIONS_TEST_SUBJECTS,
  AWS_CREDENTIALS_TYPE_SELECTOR_TEST_SUBJ,
  AWS_LAUNCH_CLOUD_FORMATION_TEST_SUBJ,
  AZURE_INPUT_FIELDS_TEST_SUBJECTS,
  AZURE_PROVIDER_TEST_SUBJ,
  AZURE_SETUP_FORMAT_TEST_SUBJECTS,
  GCP_CREDENTIALS_TYPE_OPTIONS_TEST_SUBJECTS,
  GCP_INPUT_FIELDS_TEST_SUBJECTS,
  GCP_PROVIDER_TEST_SUBJ,
} from '@kbn/cloud-security-posture-common';
import { useCspSetupStatusApi } from '@kbn/cloud-security-posture/src/hooks/use_csp_setup_status_api';
import {
  ORGANIZATION_ACCOUNT,
  SINGLE_ACCOUNT,
  type NewPackagePolicy,
  type PackageInfo,
  type PackagePolicy,
} from '@kbn/fleet-plugin/common';
import { SETUP_TECHNOLOGY_SELECTOR_TEST_SUBJ, SetupTechnology } from '@kbn/fleet-plugin/public';
import { createFleetTestRendererMock } from '@kbn/fleet-plugin/public/mock';
import { SECURITY_SOLUTION_ENABLE_CLOUD_CONNECTOR_SETTING } from '@kbn/management-settings-ids';

import {
  CLOUDBEAT_AWS,
  CLOUDBEAT_AZURE,
  CLOUDBEAT_EKS,
  CLOUDBEAT_GCP,
} from '../../../common/constants';

import { useLicenseManagementLocatorApi } from '../../common/api/use_license_management_locator_api';
import { usePackagePolicyList } from '../../common/api/use_package_policy_list';
import { useIsSubscriptionStatusValid } from '../../common/hooks/use_is_subscription_status_valid';
import * as KibanaHook from '../../common/hooks/use_kibana';
import { createReactQueryResponse } from '../../test/fixtures/react_query';
import { TestProvider } from '../../test/test_provider';

import { SUBSCRIPTION_NOT_ALLOWED_TEST_SUBJECT } from '../test_subjects';

import {
  getAwsPackageInfoMock,
  getMockPackageInfo,
  getMockPackageInfoCspmAWS,
  getMockPackageInfoCspmAzure,
  getMockPackageInfoCspmGCP,
  getMockPackageInfoVulnMgmtAWS,
  getMockPolicyAWS,
  getMockPolicyAzure,
  getMockPolicyEKS,
  getMockPolicyGCP,
  getMockPolicyK8s,
  getMockPolicyVulnMgmtAWS,
  getPackageInfoMock,
} from './mocks';
import { CspPolicyTemplateForm } from './policy_template_form';
import { getPosturePolicy, POLICY_TEMPLATE_FORM_DTS } from './utils';

const AGENTLESS_OPTION_LABEL = /elastic managed integration/i;

// mock useParams
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useParams: jest.fn().mockReturnValue({
    integration: undefined,
  }),
}));
jest.mock('@kbn/cloud-security-posture/src/hooks/use_csp_setup_status_api');
jest.mock('../../common/api/use_package_policy_list');
jest.mock('../../common/hooks/use_is_subscription_status_valid');
jest.mock('../../common/api/use_license_management_locator_api');
jest.mock('@kbn/fleet-plugin/public/services/experimental_features');

const onChange = jest.fn();

const createReactQueryResponseWithRefetch = (
  data: Parameters<typeof createReactQueryResponse>[0]
) => {
  return {
    ...createReactQueryResponse(data),
    refetch: jest.fn(),
  };
};

describe('<CspPolicyTemplateForm />', () => {
  beforeEach(() => {
    (useParams as jest.Mock).mockReturnValue({
      integration: undefined,
    });

    (usePackagePolicyList as jest.Mock).mockImplementation((packageName) =>
      createReactQueryResponseWithRefetch({
        status: 'success',
        data: {
          items: [],
        },
      })
    );

    onChange.mockClear();

    (useCspSetupStatusApi as jest.Mock).mockImplementation(() =>
      createReactQueryResponseWithRefetch({
        status: 'success',
        data: { status: 'indexed', installedPackageVersion: '1.2.13' },
      })
    );

    (useIsSubscriptionStatusValid as jest.Mock).mockImplementation(() =>
      createReactQueryResponse({
        status: 'success',
        data: true,
      })
    );
  });

  const WrappedComponent = ({
    newPolicy,
    edit = false,
    packageInfo = {
      version: '3.0.0',
    } as PackageInfo,
    isAgentlessEnabled,
    integrationToEnable,
    defaultSetupTechnology = SetupTechnology.AGENT_BASED,
  }: {
    edit?: boolean;
    newPolicy: NewPackagePolicy;
    packageInfo?: PackageInfo;
    onChange?: jest.Mock<void, [NewPackagePolicy]>;
    isAgentlessEnabled?: boolean;
    integrationToEnable?: string;
    defaultSetupTechnology?: SetupTechnology;
  }) => {
    const { AppWrapper: FleetAppWrapper } = createFleetTestRendererMock();
    const [integrationToEnableState, setIntegrationToEnable] = React.useState<string | undefined>(
      integrationToEnable
    );
    return (
      <FleetAppWrapper>
        <TestProvider>
          {edit && (
            <CspPolicyTemplateForm
              policy={newPolicy as PackagePolicy}
              newPolicy={newPolicy}
              onChange={onChange}
              packageInfo={packageInfo}
              isEditPage={true}
              isAgentlessEnabled={isAgentlessEnabled}
              integrationToEnable={integrationToEnable}
            />
          )}
          {!edit && (
            <CspPolicyTemplateForm
              newPolicy={newPolicy}
              onChange={onChange}
              packageInfo={packageInfo}
              isEditPage={false}
              isAgentlessEnabled={isAgentlessEnabled}
              integrationToEnable={integrationToEnable || integrationToEnableState}
              defaultSetupTechnology={defaultSetupTechnology}
              setIntegrationToEnable={setIntegrationToEnable}
            />
          )}
        </TestProvider>
      </FleetAppWrapper>
    );
  };

  it('shows loader when useIsSubscriptionStatusValid is loading', () => {
    (useIsSubscriptionStatusValid as jest.Mock).mockImplementation(() =>
      createReactQueryResponse({
        status: 'loading',
        data: undefined,
      })
    );

    const policy = getMockPolicyAWS();
    render(<WrappedComponent newPolicy={policy} />);

    expect(screen.getByTestId(POLICY_TEMPLATE_FORM_DTS.LOADER)).toBeInTheDocument();
  });

  it('shows license block if subscription is not allowed', () => {
    (useIsSubscriptionStatusValid as jest.Mock).mockImplementation(() =>
      createReactQueryResponse({
        status: 'success',
        data: false,
      })
    );

    const policy = getMockPolicyK8s();
    const { rerender } = render(<WrappedComponent newPolicy={policy} />);

    rerender(<WrappedComponent newPolicy={{ ...policy, namespace: 'some-namespace' }} />);
    expect(screen.getByTestId(SUBSCRIPTION_NOT_ALLOWED_TEST_SUBJECT)).toBeInTheDocument();
  });

  it('license block renders with license url locator', () => {
    (useIsSubscriptionStatusValid as jest.Mock).mockImplementation(() =>
      createReactQueryResponse({
        status: 'success',
        data: false,
      })
    );
    (useLicenseManagementLocatorApi as jest.Mock).mockImplementation(() => 'http://license-url');

    const policy = getMockPolicyK8s();
    const { rerender } = render(<WrappedComponent newPolicy={policy} />);

    rerender(<WrappedComponent newPolicy={{ ...policy, namespace: 'some-namespace' }} />);
    expect(screen.getByTestId('has_locator')).toBeInTheDocument();
  });

  it('license block renders without license url locator', () => {
    (useIsSubscriptionStatusValid as jest.Mock).mockImplementation(() =>
      createReactQueryResponse({
        status: 'success',
        data: false,
      })
    );
    (useLicenseManagementLocatorApi as jest.Mock).mockImplementation(undefined);

    const policy = getMockPolicyK8s();
    const { rerender } = render(<WrappedComponent newPolicy={policy} />);

    rerender(<WrappedComponent newPolicy={{ ...policy, namespace: 'some-namespace' }} />);
    expect(screen.getByTestId('no_locator')).toBeInTheDocument();
  });

  it('updates package policy namespace to default when it changes', async () => {
    const policy = getMockPolicyK8s();
    const { rerender } = render(<WrappedComponent newPolicy={policy} />);

    rerender(
      <WrappedComponent
        newPolicy={{ ...policy, namespace: 'some-namespace' }}
        integrationToEnable="kspm"
      />
    );

    // Listen to the onChange triggered by the test (re-render with new policy namespace)
    // It should ensure the initial state is valid.
    expect(onChange).toHaveBeenNthCalledWith(1, {
      isExtensionLoaded: true,

      updatedPolicy: {
        ...policy,
        namespace: 'default',
        name: 'cspm-1',
      },
    });
  });

  it('renders and updates name field', async () => {
    const policy = getMockPolicyK8s();
    const { getByLabelText } = render(<WrappedComponent newPolicy={policy} />);
    const name = getByLabelText('Name');
    expect(name).toBeInTheDocument();

    await userEvent.type(name, '1');

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        isExtensionLoaded: true,

        updatedPolicy: { ...policy, name: `${policy.name}1` },
      });
    });
  });

  it('renders and updates description field', async () => {
    const policy = getMockPolicyK8s();
    const { getByLabelText } = render(<WrappedComponent newPolicy={policy} />);
    const description = getByLabelText('Description');
    expect(description).toBeInTheDocument();

    await userEvent.type(description, '1');

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        isExtensionLoaded: true,

        updatedPolicy: { ...policy, description: `${policy.description}1` },
      });
    });
  });

  it('renders KSPM input selector', () => {
    const { getByLabelText } = render(<WrappedComponent newPolicy={getMockPolicyK8s()} />);

    const option1 = getByLabelText('Self-Managed');
    const option2 = getByLabelText('EKS');

    expect(option1).toBeInTheDocument();
    expect(option2).toBeInTheDocument();
    expect(option1).toBeEnabled();
    expect(option2).toBeEnabled();
    expect(option1).toBeChecked();
  });

  it('updates selected KSPM input', async () => {
    const k8sPolicy = getMockPolicyK8s();
    const eksPolicy = getMockPolicyEKS();

    const { getByLabelText } = render(<WrappedComponent newPolicy={k8sPolicy} />);
    const option = getByLabelText('EKS');
    await userEvent.click(option);

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith({
        isExtensionLoaded: true,

        updatedPolicy: eksPolicy,
      });
    });
  });

  it('renders CSPM input selector', () => {
    const { getByLabelText } = render(<WrappedComponent newPolicy={getMockPolicyAWS()} />);

    const option1 = getByLabelText('AWS');
    const option2 = getByLabelText('GCP');
    const option3 = getByLabelText('Azure');

    expect(option1).toBeInTheDocument();
    expect(option2).toBeInTheDocument();
    expect(option3).toBeInTheDocument();
    expect(option1).toBeEnabled();
    expect(option2).toBeEnabled();
    expect(option3).toBeEnabled();
    expect(option1).toBeChecked();
  });

  it('renders disabled KSPM input when editing', () => {
    const { getByLabelText } = render(
      <WrappedComponent newPolicy={getMockPolicyK8s()} edit={true} />
    );

    const option1 = getByLabelText('Self-Managed');
    const option2 = getByLabelText('EKS');

    expect(option1).toBeInTheDocument();
    expect(option2).toBeInTheDocument();
    expect(option1).toBeDisabled();
    expect(option2).toBeDisabled();
    expect(option1).toBeChecked();
  });

  it('renders disabled CSPM input when editing', () => {
    const { getByLabelText } = render(
      <WrappedComponent newPolicy={getMockPolicyAWS()} edit={true} />
    );

    const option1 = getByLabelText('AWS');
    const option2 = getByLabelText('GCP');
    const option3 = getByLabelText('Azure');

    expect(option1).toBeInTheDocument();
    expect(option2).toBeInTheDocument();
    expect(option3).toBeInTheDocument();
    expect(option1).toBeDisabled();
    expect(option2).toBeDisabled();
    expect(option3).toBeDisabled();
    expect(option1).toBeChecked();
  });

  it('selects default KSPM input selector', () => {
    const policy = getMockPolicyK8s();
    // enable all inputs of a policy template, same as fleet does
    policy.inputs = policy.inputs.map((input) => ({
      ...input,
      enabled: input.policy_template === 'kspm',
    }));
    policy.name = 'cloud_security_posture-1';

    (useParams as jest.Mock).mockReturnValue({
      integration: 'kspm',
    });

    (useCspSetupStatusApi as jest.Mock).mockImplementation(() =>
      createReactQueryResponseWithRefetch({
        status: 'success',
        data: {
          kspm: { status: 'not-deployed', healthyAgents: 0, installedPackagePolicies: 1 },
        },
      })
    );

    (usePackagePolicyList as jest.Mock).mockImplementation(() =>
      createReactQueryResponseWithRefetch({
        status: 'success',
        data: {
          items: [
            getPosturePolicy(getMockPolicyAWS(), CLOUDBEAT_AWS),
            getPosturePolicy(getMockPolicyEKS(), CLOUDBEAT_EKS),
            getPosturePolicy(getMockPolicyVulnMgmtAWS(), CLOUDBEAT_AWS),
          ],
        },
      })
    );

    render(
      <WrappedComponent
        newPolicy={policy}
        packageInfo={{ name: 'kspm', version: '3.0.0' } as PackageInfo}
        onChange={onChange}
      />
    );

    onChange({
      isExtensionLoaded: true,

      updatedPolicy: {
        ...getMockPolicyK8s(),
        inputs: policy.inputs.map((input) => ({
          ...input,
          enabled: input.policy_template === 'kspm',
        })),
        name: 'kspm-2',
      },
    });

    // 1st call happens on mount and selects the default policy template enabled input
    expect(onChange).toHaveBeenCalledWith({
      isExtensionLoaded: true,

      updatedPolicy: {
        ...getMockPolicyK8s(),
        name: 'cloud_security_posture-1',
      },
    });

    // 2nd call happens on mount and increments kspm template enabled input
    expect(onChange).toHaveBeenCalledWith({
      isExtensionLoaded: true,

      updatedPolicy: {
        ...getMockPolicyK8s(),
        inputs: policy.inputs.map((input) => ({
          ...input,
          enabled: input.policy_template === 'kspm',
        })),
        name: 'kspm-2',
      },
    });
  });

  it('selects default VULN_MGMT input selector', () => {
    const policy = getMockPolicyVulnMgmtAWS();
    // enable all inputs of a policy template, same as fleet does
    policy.inputs = policy.inputs.map((input) => ({
      ...input,
      enabled: input.policy_template === 'vuln_mgmt',
    }));
    policy.name = 'cloud_security_posture-1';

    (useParams as jest.Mock).mockReturnValue({
      integration: 'vuln_mgmt',
    });
    (useCspSetupStatusApi as jest.Mock).mockImplementation(() =>
      createReactQueryResponseWithRefetch({
        status: 'success',
        data: {
          vuln_mgmt: { status: 'not-deployed', healthyAgents: 0, installedPackagePolicies: 1 },
        },
      })
    );
    (usePackagePolicyList as jest.Mock).mockImplementation(() =>
      createReactQueryResponseWithRefetch({
        status: 'success',
        data: {
          items: [
            getPosturePolicy(getMockPolicyAWS(), CLOUDBEAT_AWS),
            getPosturePolicy(getMockPolicyEKS(), CLOUDBEAT_EKS),
            getPosturePolicy(getMockPolicyVulnMgmtAWS(), CLOUDBEAT_AWS),
          ],
        },
      })
    );

    render(
      <WrappedComponent
        newPolicy={policy}
        packageInfo={{ name: 'vuln_mgmt' } as PackageInfo}
        onChange={onChange}
      />
    );

    onChange({
      isExtensionLoaded: true,

      updatedPolicy: {
        ...getMockPolicyVulnMgmtAWS(),
        inputs: policy.inputs.map((input) => ({
          ...input,
          enabled: input.policy_template === 'vuln_mgmt',
        })),
        name: 'vuln_mgmt-2',
      },
    });

    // 1st call happens on mount and selects the default policy template enabled input
    expect(onChange).toHaveBeenCalledWith({
      isExtensionLoaded: true,

      updatedPolicy: {
        ...getMockPolicyVulnMgmtAWS(),
        name: 'vuln_mgmt-2',
      },
    });

    // 2nd call happens on mount and increments vuln_mgmt template enabled input
    expect(onChange).toHaveBeenCalledWith({
      isExtensionLoaded: true,

      updatedPolicy: {
        ...getMockPolicyVulnMgmtAWS(),
        inputs: policy.inputs.map((input) => ({
          ...input,
          enabled: input.policy_template === 'vuln_mgmt',
        })),
        name: 'vuln_mgmt-2',
      },
    });
  });

  it('selects default CSPM input selector', () => {
    const policy = getMockPolicyAWS();
    // enable all inputs of a policy template, same as fleet does
    policy.inputs = policy.inputs.map((input) => ({
      ...input,
      enabled: input.policy_template === 'cspm',
    }));
    policy.name = 'cloud_security_posture-1';

    (useParams as jest.Mock).mockReturnValue({
      integration: 'cspm',
    });

    (useCspSetupStatusApi as jest.Mock).mockImplementation(() =>
      createReactQueryResponseWithRefetch({
        status: 'success',
        data: {
          cspm: { status: 'not-deployed', healthyAgents: 0, installedPackagePolicies: 1 },
        },
      })
    );
    (usePackagePolicyList as jest.Mock).mockImplementation(() =>
      createReactQueryResponseWithRefetch({
        status: 'success',
        data: {
          items: [
            getPosturePolicy(getMockPolicyAWS(), CLOUDBEAT_AWS),
            getPosturePolicy(getMockPolicyEKS(), CLOUDBEAT_EKS),
            getPosturePolicy(getMockPolicyVulnMgmtAWS(), CLOUDBEAT_AWS),
          ],
        },
      })
    );

    render(
      <WrappedComponent
        newPolicy={policy}
        packageInfo={getMockPackageInfoCspmAWS()}
        onChange={onChange}
      />
    );

    // 1st call happens on mount and selects the CloudFormation template
    expect(onChange).toHaveBeenCalledWith({
      isExtensionLoaded: true,
      isValid: undefined,

      updatedPolicy: {
        ...getMockPolicyAWS(),
        name: 'cloud_security_posture-1',
        inputs: policy.inputs.map((input) => {
          if (input.type === CLOUDBEAT_AWS) {
            return {
              ...input,
              enabled: true,
            };
          }
          if (input.policy_template === 'cspm') {
            return { ...input, enabled: false };
          }
          return input;
        }),
      },
    });

    // 2nd call happens on mount and selects the default enabled input
    expect(onChange).toHaveBeenCalledWith({
      isExtensionLoaded: true,
      isValid: undefined,

      updatedPolicy: {
        ...getMockPolicyAWS(),
        inputs: policy.inputs.map((input) => {
          if (input.type === CLOUDBEAT_AWS) {
            return {
              ...input,
              enabled: true,
            };
          }
          if (input.policy_template === 'cspm') {
            return { ...input, enabled: false };
          }
          return input;
        }),
        name: 'cloud_security_posture-1',
      },
    });

    onChange({
      isExtensionLoaded: true,

      updatedPolicy: {
        ...getMockPolicyAWS(),
        inputs: policy.inputs.map((input) => ({
          ...input,
          enabled: input.policy_template === 'cspm',
        })),
        name: 'cspm-2',
      },
    });

    expect(onChange).toHaveBeenCalledWith({
      isExtensionLoaded: true,

      updatedPolicy: {
        ...getMockPolicyAWS(),
        inputs: policy.inputs.map((input) => ({
          ...input,
          enabled: input.policy_template === 'cspm',
        })),
        name: 'cspm-2',
      },
    });
  });

  describe('K8S', () => {
    it('K8S or KSPM Vanilla should not render any Setup Access option', () => {
      const policy = getMockPolicyK8s();

      const { queryByTestId } = render(<WrappedComponent newPolicy={policy} />);

      expect(queryByTestId('assumeRoleTestId')).not.toBeInTheDocument();
      expect(queryByTestId('directAccessKeyTestId')).not.toBeInTheDocument();
      expect(queryByTestId('temporaryKeyTestId')).not.toBeInTheDocument();
      expect(queryByTestId('sharedCredentialsTestId')).not.toBeInTheDocument();
    });
  });

  describe('EKS Credentials input fields', () => {
    it(`documentation Hyperlink should have correct URL to redirect users to AWS page`, () => {
      let policy = getMockPolicyEKS();
      policy = getPosturePolicy(policy, CLOUDBEAT_EKS, {
        'aws.credentials.type': { value: 'assume_role' },
        'aws.setup.format': { value: 'manual' },
      });

      const { getByText } = render(<WrappedComponent newPolicy={policy} />);

      expect(getByText('documentation')).toHaveAttribute(
        'href',
        'https://docs.aws.amazon.com/general/latest/gr/aws-sec-cred-types.html'
      );
    });
    it(`renders ${CLOUDBEAT_EKS} Assume Role fields`, () => {
      let policy = getMockPolicyEKS();
      policy = getPosturePolicy(policy, CLOUDBEAT_EKS, {
        'aws.credentials.type': { value: 'assume_role' },
        'aws.setup.format': { value: 'manual' },
      });

      const { getByLabelText } = render(<WrappedComponent newPolicy={policy} />);

      const option = getByLabelText('Assume role');
      expect(option).toBeChecked();

      expect(getByLabelText('Role ARN')).toBeInTheDocument();
    });

    it(`updates ${CLOUDBEAT_EKS} Assume Role fields`, async () => {
      let policy = getMockPolicyEKS();
      policy = getPosturePolicy(policy, CLOUDBEAT_EKS, {
        'aws.credentials.type': { value: 'assume_role' },
        'aws.setup.format': { value: 'manual' },
      });
      const { getByLabelText } = render(<WrappedComponent newPolicy={policy} />);

      await userEvent.type(getByLabelText('Role ARN'), 'a');
      policy = getPosturePolicy(policy, CLOUDBEAT_EKS, { role_arn: { value: 'a' } });

      // Ignore 1st call triggered on mount to ensure initial state is valid
      expect(onChange).toHaveBeenCalledWith({
        isExtensionLoaded: true,

        updatedPolicy: policy,
      });
    });

    it(`renders ${CLOUDBEAT_EKS} Direct Access Keys fields`, async () => {
      let policy = getMockPolicyEKS();
      policy = getPosturePolicy(policy, CLOUDBEAT_EKS, {
        'aws.credentials.type': { value: 'direct_access_keys' },
        'aws.setup.format': { value: 'manual' },
      });
      const { getByLabelText } = render(
        <WrappedComponent newPolicy={policy} packageInfo={getMockPackageInfo() as PackageInfo} />
      );

      const option = getByLabelText('Direct access keys');
      expect(option).toBeChecked();

      expect(getByLabelText('Access Key ID')).toBeInTheDocument();
      await waitFor(() => expect(getByLabelText('Secret Access Key')).toBeInTheDocument());
    });

    it(`updates ${CLOUDBEAT_EKS} Direct Access Keys fields`, async () => {
      let policy = getMockPolicyEKS();
      policy = getPosturePolicy(policy, CLOUDBEAT_EKS, {
        'aws.credentials.type': { value: 'direct_access_keys' },
        'aws.setup.format': { value: 'manual' },
      });
      const { getByLabelText, rerender, getByTestId } = render(
        <WrappedComponent newPolicy={policy} packageInfo={getMockPackageInfo() as PackageInfo} />
      );

      await userEvent.type(getByLabelText('Access Key ID'), 'a');
      policy = getPosturePolicy(policy, CLOUDBEAT_EKS, { access_key_id: { value: 'a' } });

      // Ignore 1st call triggered on mount to ensure initial state is valid
      expect(onChange).toHaveBeenCalledWith({
        isExtensionLoaded: true,

        updatedPolicy: policy,
      });

      rerender(
        <WrappedComponent newPolicy={policy} packageInfo={getMockPackageInfo() as PackageInfo} />
      );

      await userEvent.type(getByTestId('passwordInput-secret-access-key'), 'b');
      policy = getPosturePolicy(policy, CLOUDBEAT_EKS, { secret_access_key: { value: 'b' } });

      expect(onChange).toHaveBeenCalledWith({
        isExtensionLoaded: true,

        updatedPolicy: policy,
      });
    });

    it(`renders ${CLOUDBEAT_EKS} Temporary Keys fields`, async () => {
      let policy: NewPackagePolicy = getMockPolicyEKS();
      policy = getPosturePolicy(policy, CLOUDBEAT_EKS, {
        'aws.credentials.type': { value: 'temporary_keys' },
        'aws.setup.format': { value: 'manual' },
      });

      const { getByLabelText } = render(
        <WrappedComponent newPolicy={policy} packageInfo={getMockPackageInfo() as PackageInfo} />
      );

      const option = getByLabelText('Temporary keys');
      expect(option).toBeChecked();

      expect(getByLabelText('Access Key ID')).toBeInTheDocument();
      await waitFor(() => expect(getByLabelText('Secret Access Key')).toBeInTheDocument());
      expect(getByLabelText('Session Token')).toBeInTheDocument();
    });

    it(`updates ${CLOUDBEAT_EKS} Temporary Keys fields`, async () => {
      let policy = getMockPolicyEKS();
      policy = getPosturePolicy(policy, CLOUDBEAT_EKS, {
        'aws.credentials.type': { value: 'temporary_keys' },
        'aws.setup.format': { value: 'manual' },
      });
      const { getByLabelText, rerender, getByTestId } = render(
        <WrappedComponent newPolicy={policy} packageInfo={getMockPackageInfo() as PackageInfo} />
      );

      await userEvent.type(getByLabelText('Access Key ID'), 'a');
      policy = getPosturePolicy(policy, CLOUDBEAT_EKS, { access_key_id: { value: 'a' } });

      expect(onChange).toHaveBeenCalledWith({
        isExtensionLoaded: true,

        updatedPolicy: policy,
      });

      rerender(
        <WrappedComponent newPolicy={policy} packageInfo={getMockPackageInfo() as PackageInfo} />
      );

      await userEvent.type(getByTestId('passwordInput-secret-access-key'), 'b');
      policy = getPosturePolicy(policy, CLOUDBEAT_EKS, { secret_access_key: { value: 'b' } });

      expect(onChange).toHaveBeenCalledWith({
        isExtensionLoaded: true,

        updatedPolicy: policy,
      });

      rerender(
        <WrappedComponent newPolicy={policy} packageInfo={getMockPackageInfo() as PackageInfo} />
      );

      await userEvent.type(getByLabelText('Session Token'), 'a');
      policy = getPosturePolicy(policy, CLOUDBEAT_EKS, { session_token: { value: 'a' } });

      expect(onChange).toHaveBeenCalledWith({
        isExtensionLoaded: true,

        updatedPolicy: policy,
      });
    });

    it(`renders ${CLOUDBEAT_EKS} Shared Credentials fields`, () => {
      let policy: NewPackagePolicy = getMockPolicyEKS();
      policy = getPosturePolicy(policy, CLOUDBEAT_EKS, {
        'aws.credentials.type': { value: 'shared_credentials' },
      });

      const { getByLabelText } = render(<WrappedComponent newPolicy={policy} />);

      const option = getByLabelText('Shared credentials');
      expect(option).toBeChecked();

      expect(getByLabelText('Shared Credential File')).toBeInTheDocument();
      expect(getByLabelText('Credential Profile Name')).toBeInTheDocument();
    });

    it(`updates ${CLOUDBEAT_EKS} Shared Credentials fields`, async () => {
      let policy = getMockPolicyEKS();
      policy = getPosturePolicy(policy, CLOUDBEAT_EKS, {
        'aws.credentials.type': { value: 'shared_credentials' },
        'aws.setup.format': { value: 'manual' },
      });
      const { getByLabelText, rerender } = render(<WrappedComponent newPolicy={policy} />);

      await userEvent.type(getByLabelText('Shared Credential File'), 'a');

      policy = getPosturePolicy(policy, CLOUDBEAT_EKS, {
        shared_credential_file: { value: 'a' },
      });

      expect(onChange).toHaveBeenCalledWith({
        isExtensionLoaded: true,

        updatedPolicy: policy,
      });

      rerender(<WrappedComponent newPolicy={policy} />);

      await userEvent.type(getByLabelText('Credential Profile Name'), 'b');
      policy = getPosturePolicy(policy, CLOUDBEAT_EKS, {
        credential_profile_name: { value: 'b' },
      });

      expect(onChange).toHaveBeenCalledWith({
        isExtensionLoaded: true,

        updatedPolicy: policy,
      });
    });
  });

  describe('AWS Credentials input fields', () => {
    it(`renders ${CLOUDBEAT_AWS} Account Type field, AWS Organization is enabled for supported versions`, () => {
      let policy = getMockPolicyAWS();
      policy = getPosturePolicy(policy, CLOUDBEAT_AWS, {
        'aws.account_type': { value: ORGANIZATION_ACCOUNT },
      });

      const { getByLabelText } = render(
        <WrappedComponent newPolicy={policy} packageInfo={{ version: '1.5.0' } as PackageInfo} />
      );

      expect(getByLabelText('Single Account')).toBeInTheDocument();
      expect(getByLabelText('AWS Organization')).toBeInTheDocument();
      expect(getByLabelText('AWS Organization')).toBeEnabled();
    });

    it(`${CLOUDBEAT_AWS} form displays upgrade message for unsupported versions and aws organization option is disabled`, () => {
      let policy = getMockPolicyAWS();
      policy = getPosturePolicy(policy, CLOUDBEAT_AWS, {
        'aws.credentials.type': { value: 'cloud_formation' },
        'aws.account_type': { value: SINGLE_ACCOUNT },
      });

      const { getByText, getByLabelText } = render(
        <WrappedComponent newPolicy={policy} packageInfo={{ version: '1.4.0' } as PackageInfo} />
      );

      expect(
        getByText(
          'AWS Organization not supported in current integration version. Please upgrade to the latest version to enable AWS Organizations integration.'
        )
      ).toBeInTheDocument();
      expect(getByLabelText('AWS Organization')).toBeDisabled();
      expect(getByLabelText('Single Account')).toBeEnabled();
    });

    it(`${CLOUDBEAT_AWS} form do not displays upgrade message for supported versions and aws organization option is enabled`, () => {
      let policy = getMockPolicyAWS();
      policy = getPosturePolicy(policy, CLOUDBEAT_AWS, {
        'aws.credentials.type': { value: 'cloud_formation' },
        'aws.account_type': { value: ORGANIZATION_ACCOUNT },
      });

      const { queryByText, getByLabelText } = render(
        <WrappedComponent newPolicy={policy} packageInfo={{ version: '1.5.0' } as PackageInfo} />
      );

      expect(
        queryByText(
          'AWS Organization not supported in current integration version. Please upgrade to the latest version to enable AWS Organizations integration.'
        )
      ).not.toBeInTheDocument();
      expect(getByLabelText('AWS Organization')).toBeEnabled();
    });

    it(`Getting started Hyperlink should have correct URL to redirect users to elastic page`, () => {
      let policy = getMockPolicyAWS();
      policy = getPosturePolicy(policy, CLOUDBEAT_AWS, {
        'aws.credentials.type': { value: 'assume_role' },
        'aws.setup.format': { value: 'manual' },
      });

      const { getByText } = render(<WrappedComponent newPolicy={policy} />);

      expect(getByText('Getting Started')).toHaveAttribute(
        'href',
        'https://www.elastic.co/guide/en/security/current/cspm-get-started.html'
      );
    });

    it(`documentation Hyperlink should have correct URL to redirect users to elastic page if user chose Manual`, () => {
      let policy = getMockPolicyAWS();
      policy = getPosturePolicy(policy, CLOUDBEAT_AWS, {
        'aws.credentials.type': { value: 'assume_role' },
        'aws.setup.format': { value: 'manual' },
      });

      const { getByTestId } = render(
        <WrappedComponent newPolicy={policy} packageInfo={getMockPackageInfoCspmAWS()} />
      );

      expect(getByTestId('externalLink')).toHaveAttribute(
        'href',
        'https://www.elastic.co/guide/en/security/current/cspm-get-started.html'
      );
    });

    it(`documentation Hyperlink should have correct URL to redirect users to AWS page if user chose Cloudformation`, () => {
      let policy = getMockPolicyAWS();
      policy = getPosturePolicy(policy, CLOUDBEAT_AWS, {
        'aws.credentials.type': { value: 'cloud_formation' },
        'aws.account_type': { value: 'single-account' },
      });

      const { getByTestId } = render(
        <WrappedComponent newPolicy={policy} packageInfo={getMockPackageInfoCspmAWS()} />
      );

      expect(getByTestId('externalLink')).toHaveAttribute(
        'href',
        'https://docs.aws.amazon.com/AWSCloudFormation/latest/UserGuide/cfn-whatis-howdoesitwork.html'
      );
    });

    it(`renders ${CLOUDBEAT_AWS} Assume Role fields`, () => {
      let policy = getMockPolicyAWS();
      policy = getPosturePolicy(policy, CLOUDBEAT_AWS, {
        'aws.credentials.type': { value: 'assume_role' },
        'aws.setup.format': { value: 'manual' },
      });

      const { getByLabelText, getByRole } = render(<WrappedComponent newPolicy={policy} />);

      expect(getByRole('option', { name: 'Assume role', selected: true })).toBeInTheDocument();

      expect(getByLabelText('Role ARN')).toBeInTheDocument();
    });

    it(`updates ${CLOUDBEAT_AWS} Assume Role fields`, async () => {
      let policy = getMockPolicyAWS();
      policy = getPosturePolicy(policy, CLOUDBEAT_AWS, {
        'aws.credentials.type': { value: 'assume_role' },
        'aws.setup.format': { value: 'manual' },
      });
      const { getByLabelText } = render(<WrappedComponent newPolicy={policy} />);

      await userEvent.type(getByLabelText('Role ARN'), 'a');
      policy = getPosturePolicy(policy, CLOUDBEAT_AWS, { role_arn: { value: 'a' } });

      // Ignore 1st call triggered on mount to ensure initial state is valid
      expect(onChange).toHaveBeenCalledWith({
        isExtensionLoaded: true,

        updatedPolicy: policy,
      });
    });

    it(`renders ${CLOUDBEAT_AWS} Direct Access Keys fields`, async () => {
      let policy: NewPackagePolicy = getMockPolicyAWS();
      policy = getPosturePolicy(policy, CLOUDBEAT_AWS, {
        'aws.credentials.type': { value: 'direct_access_keys' },
        'aws.setup.format': { value: 'manual' },
      });

      const { getByLabelText, getByRole } = render(
        <WrappedComponent newPolicy={policy} packageInfo={getMockPackageInfo() as PackageInfo} />
      );

      expect(
        getByRole('option', { name: 'Direct access keys', selected: true })
      ).toBeInTheDocument();

      expect(getByLabelText('Access Key ID')).toBeInTheDocument();
      await waitFor(() => expect(getByLabelText('Secret Access Key')).toBeInTheDocument());
    });

    it(`updates ${CLOUDBEAT_AWS} Direct Access Keys fields`, async () => {
      let policy = getMockPolicyAWS();
      policy = getPosturePolicy(policy, CLOUDBEAT_AWS, {
        'aws.credentials.type': { value: 'direct_access_keys' },
        'aws.setup.format': { value: 'manual' },
      });
      const { getByLabelText, rerender, getByTestId } = render(
        <WrappedComponent newPolicy={policy} packageInfo={getMockPackageInfo() as PackageInfo} />
      );

      await userEvent.type(getByLabelText('Access Key ID'), 'a');
      policy = getPosturePolicy(policy, CLOUDBEAT_AWS, { access_key_id: { value: 'a' } });

      // Ignore 1st call triggered on mount to ensure initial state is valid
      expect(onChange).toHaveBeenCalledWith({
        isExtensionLoaded: true,

        updatedPolicy: policy,
      });

      rerender(
        <WrappedComponent newPolicy={policy} packageInfo={getMockPackageInfo() as PackageInfo} />
      );

      await userEvent.type(getByTestId('passwordInput-secret-access-key'), 'b');
      policy = getPosturePolicy(policy, CLOUDBEAT_AWS, { secret_access_key: { value: 'b' } });

      expect(onChange).toHaveBeenCalledWith({
        isExtensionLoaded: true,

        updatedPolicy: policy,
      });
    });

    it(`renders ${CLOUDBEAT_AWS} Temporary Keys fields`, async () => {
      let policy: NewPackagePolicy = getMockPolicyAWS();
      policy = getPosturePolicy(policy, CLOUDBEAT_AWS, {
        'aws.credentials.type': { value: 'temporary_keys' },
        'aws.setup.format': { value: 'manual' },
      });

      const { getByLabelText, getByRole } = render(
        <WrappedComponent newPolicy={policy} packageInfo={getMockPackageInfo() as PackageInfo} />
      );
      expect(getByRole('option', { name: 'Temporary keys', selected: true })).toBeInTheDocument();

      expect(getByLabelText('Access Key ID')).toBeInTheDocument();
      await waitFor(() => expect(getByLabelText('Secret Access Key')).toBeInTheDocument());
      expect(getByLabelText('Session Token')).toBeInTheDocument();
    });

    it(`updates ${CLOUDBEAT_AWS} Temporary Keys fields`, async () => {
      let policy = getMockPolicyAWS();
      policy = getPosturePolicy(policy, CLOUDBEAT_AWS, {
        'aws.credentials.type': { value: 'temporary_keys' },
        'aws.setup.format': { value: 'manual' },
      });
      const { getByLabelText, rerender, getByTestId } = render(
        <WrappedComponent newPolicy={policy} packageInfo={getMockPackageInfo() as PackageInfo} />
      );

      await userEvent.type(getByLabelText('Access Key ID'), 'a');
      policy = getPosturePolicy(policy, CLOUDBEAT_AWS, { access_key_id: { value: 'a' } });

      expect(onChange).toHaveBeenCalledWith({
        isExtensionLoaded: true,

        updatedPolicy: policy,
      });

      rerender(
        <WrappedComponent newPolicy={policy} packageInfo={getMockPackageInfo() as PackageInfo} />
      );

      await userEvent.type(getByTestId('passwordInput-secret-access-key'), 'b');
      policy = getPosturePolicy(policy, CLOUDBEAT_AWS, { secret_access_key: { value: 'b' } });

      expect(onChange).toHaveBeenCalledWith({
        isExtensionLoaded: true,

        updatedPolicy: policy,
      });

      rerender(
        <WrappedComponent newPolicy={policy} packageInfo={getMockPackageInfo() as PackageInfo} />
      );

      await userEvent.type(getByLabelText('Session Token'), 'a');
      policy = getPosturePolicy(policy, CLOUDBEAT_AWS, { session_token: { value: 'a' } });

      expect(onChange).toHaveBeenCalledWith({
        isExtensionLoaded: true,

        updatedPolicy: policy,
      });
    });

    it(`renders ${CLOUDBEAT_AWS} Shared Credentials fields`, () => {
      let policy: NewPackagePolicy = getMockPolicyAWS();
      policy = getPosturePolicy(policy, CLOUDBEAT_AWS, {
        'aws.credentials.type': { value: 'shared_credentials' },
      });

      const { getByLabelText, getByRole } = render(<WrappedComponent newPolicy={policy} />);

      expect(
        getByRole('option', { name: 'Shared credentials', selected: true })
      ).toBeInTheDocument();

      expect(getByLabelText('Shared Credential File')).toBeInTheDocument();
      expect(getByLabelText('Credential Profile Name')).toBeInTheDocument();
    });

    it(`updates ${CLOUDBEAT_AWS} Shared Credentials fields`, async () => {
      let policy = getMockPolicyAWS();
      policy = getPosturePolicy(policy, CLOUDBEAT_AWS, {
        'aws.credentials.type': { value: 'shared_credentials' },
        'aws.setup.format': { value: 'manual' },
      });
      const { getByLabelText, rerender } = render(<WrappedComponent newPolicy={policy} />);

      await userEvent.type(getByLabelText('Shared Credential File'), 'a');

      policy = getPosturePolicy(policy, CLOUDBEAT_AWS, {
        shared_credential_file: { value: 'a' },
      });

      expect(onChange).toHaveBeenCalledWith({
        isExtensionLoaded: true,

        updatedPolicy: policy,
      });

      rerender(<WrappedComponent newPolicy={policy} />);

      await userEvent.type(getByLabelText('Credential Profile Name'), 'b');
      policy = getPosturePolicy(policy, CLOUDBEAT_AWS, {
        credential_profile_name: { value: 'b' },
      });

      expect(onChange).toHaveBeenCalledWith({
        isExtensionLoaded: true,

        updatedPolicy: policy,
      });
    });
  });

  describe('Vuln Mgmt', () => {
    it('Update Agent Policy CloudFormation template from vars', () => {
      const policy = getMockPolicyVulnMgmtAWS();

      const packageInfo = getMockPackageInfoVulnMgmtAWS();
      const { getByTestId } = render(
        <WrappedComponent newPolicy={policy} packageInfo={packageInfo} />
      );

      expect(getByTestId('additionalChargeCalloutTestSubj')).toBeInTheDocument();
    });

    it('Additional Charge Callout message should be rendered', () => {
      const policy = getMockPolicyVulnMgmtAWS();

      const packageInfo = getMockPackageInfoVulnMgmtAWS();
      render(<WrappedComponent newPolicy={policy} packageInfo={packageInfo} />);

      const expectedUpdatedPolicy = {
        ...policy,
        inputs: policy.inputs.map((input) => {
          if (input.type === 'cloudbeat/vuln_mgmt_aws') {
            return {
              ...input,
              config: { cloud_formation_template_url: { value: 's3_url' } },
            };
          }
          return input;
        }),
      };

      expect(onChange).toHaveBeenCalledWith({
        isExtensionLoaded: true,

        updatedPolicy: expectedUpdatedPolicy,
      });
    });
  });

  describe('GCP Credentials input fields', () => {
    it(`renders ${CLOUDBEAT_GCP} Not supported when version is not at least version 1.5.2`, () => {
      let policy = getMockPolicyGCP();
      policy = getPosturePolicy(policy, CLOUDBEAT_GCP, {
        credentials_type: { value: 'credentials-file' },
      });

      const { getByText } = render(
        <WrappedComponent newPolicy={policy} packageInfo={getMockPackageInfoCspmGCP('1.3.1')} />
      );

      expect(
        getByText(
          'CIS GCP is not supported on the current Integration version, please upgrade your integration to the latest version to use CIS GCP'
        )
      ).toBeInTheDocument();
    });

    it(`documentation Hyperlink should have correct URL to redirect users to elastic page`, () => {
      let policy = getMockPolicyGCP();
      policy = getPosturePolicy(policy, CLOUDBEAT_GCP, {
        credentials_type: { value: 'credentials-file' },
      });

      const { getByText } = render(
        <WrappedComponent newPolicy={policy} packageInfo={getMockPackageInfoCspmGCP()} />
      );

      expect(getByText('documentation')).toHaveAttribute(
        'href',
        'https://www.elastic.co/guide/en/security/current/cspm-get-started-gcp.html'
      );
    });

    it(`renders Google Cloud Shell forms when Setup Access is set to Google Cloud Shell`, async () => {
      let policy = getMockPolicyGCP();
      policy = getPosturePolicy(policy, CLOUDBEAT_GCP, {
        'gcp.account_type': { value: ORGANIZATION_ACCOUNT },
      });

      const { getByTestId } = render(
        <WrappedComponent newPolicy={policy} packageInfo={getMockPackageInfoCspmGCP()} />
      );

      expect(
        getByTestId(GCP_INPUT_FIELDS_TEST_SUBJECTS.GOOGLE_CLOUD_SHELL_SETUP)
      ).toBeInTheDocument();
    });

    it(`renders ${CLOUDBEAT_GCP} Credentials File fields`, () => {
      let policy = getMockPolicyGCP();
      policy = getPosturePolicy(policy, CLOUDBEAT_GCP, {
        'gcp.credentials.type': { value: 'credentials-file' },
      });

      const { getByLabelText, getByRole } = render(
        <WrappedComponent newPolicy={policy} packageInfo={getMockPackageInfoCspmGCP()} />
      );

      expect(getByRole('option', { name: 'Credentials File', selected: true })).toBeInTheDocument();

      expect(
        getByLabelText('Path to JSON file containing the credentials and key used to subscribe')
      ).toBeInTheDocument();
    });

    it(`updates ${CLOUDBEAT_GCP} Credentials File fields`, async () => {
      let policy = getMockPolicyGCP();
      policy = getPosturePolicy(policy, CLOUDBEAT_GCP, {
        'gcp.project_id': { value: 'a' },
        'gcp.credentials.type': { value: 'credentials-file' },
      });

      const { getByTestId } = render(
        <WrappedComponent newPolicy={policy} packageInfo={getMockPackageInfoCspmGCP()} />
      );

      await userEvent.type(getByTestId(GCP_INPUT_FIELDS_TEST_SUBJECTS.CREDENTIALS_FILE), 'b');

      policy = getPosturePolicy(policy, CLOUDBEAT_GCP, {
        'gcp.credentials.file': { value: 'b' },
      });

      expect(onChange).toHaveBeenCalledWith({
        isExtensionLoaded: true,

        updatedPolicy: policy,
      });
    });

    it(`${CLOUDBEAT_GCP} form do not displays upgrade message for supported versions and gcp organization option is enabled`, () => {
      let policy = getMockPolicyGCP();
      policy = getPosturePolicy(policy, CLOUDBEAT_GCP, {
        'gcp.credentials.type': { value: 'manual' },
        'gcp.account_type': { value: ORGANIZATION_ACCOUNT },
      });

      const { queryByText, getByLabelText } = render(
        <WrappedComponent newPolicy={policy} packageInfo={{ version: '1.6.0' } as PackageInfo} />
      );

      expect(
        queryByText(
          'GCP Organization not supported in current integration version. Please upgrade to the latest version to enable GCP Organizations integration.'
        )
      ).not.toBeInTheDocument();
      expect(getByLabelText('GCP Organization')).toBeEnabled();
    });

    it(`renders ${CLOUDBEAT_GCP} Organization fields when account type is Organization and Setup Access is Google Cloud Shell`, () => {
      let policy = getMockPolicyGCP();
      policy = getPosturePolicy(policy, CLOUDBEAT_GCP, {
        'gcp.account_type': { value: ORGANIZATION_ACCOUNT },
      });

      const { getByLabelText, getByTestId } = render(
        <WrappedComponent newPolicy={policy} packageInfo={getMockPackageInfoCspmGCP()} />
      );

      expect(getByTestId(GCP_INPUT_FIELDS_TEST_SUBJECTS.ORGANIZATION_ID)).toBeInTheDocument();

      expect(getByLabelText('Organization ID')).toBeInTheDocument();
    });

    it(`renders ${CLOUDBEAT_GCP} Organization fields when account type is Organization and Setup Access is manual`, () => {
      let policy = getMockPolicyGCP();
      policy = getPosturePolicy(policy, CLOUDBEAT_GCP, {
        'gcp.account_type': { value: ORGANIZATION_ACCOUNT },
      });

      const { getByLabelText, getByTestId } = render(
        <WrappedComponent newPolicy={policy} packageInfo={getMockPackageInfoCspmGCP()} />
      );

      expect(getByTestId(GCP_INPUT_FIELDS_TEST_SUBJECTS.ORGANIZATION_ID)).toBeInTheDocument();

      expect(getByLabelText('Organization ID')).toBeInTheDocument();
    });

    it(`Should not render ${CLOUDBEAT_GCP} Organization fields when account type is Single`, () => {
      let policy = getMockPolicyGCP();
      policy = getPosturePolicy(policy, CLOUDBEAT_GCP, {
        'gcp.account_type': { value: SINGLE_ACCOUNT },
      });

      const { queryByLabelText, queryByTestId } = render(
        <WrappedComponent newPolicy={policy} packageInfo={getMockPackageInfoCspmGCP()} />
      );

      expect(queryByTestId(GCP_INPUT_FIELDS_TEST_SUBJECTS.ORGANIZATION_ID)).toBeNull();

      expect(queryByLabelText('Organization ID')).toBeNull();
    });

    it(`updates ${CLOUDBEAT_GCP} organization id`, async () => {
      let policy = getMockPolicyGCP();
      policy = getPosturePolicy(policy, CLOUDBEAT_GCP, {
        'gcp.account_type': { value: ORGANIZATION_ACCOUNT },
      });

      const { getByTestId } = render(
        <WrappedComponent newPolicy={policy} packageInfo={getMockPackageInfoCspmGCP()} />
      );

      await userEvent.type(getByTestId(GCP_INPUT_FIELDS_TEST_SUBJECTS.ORGANIZATION_ID), 'c');

      policy = getPosturePolicy(policy, CLOUDBEAT_GCP, {
        'gcp.organization_id': { value: 'c' },
      });

      expect(onChange).toHaveBeenCalledWith({
        isExtensionLoaded: true,

        updatedPolicy: policy,
      });
    });
  });

  describe('Azure Credentials input fields', () => {
    it(`renders ${CLOUDBEAT_AZURE} Not supported when version is not at least version 1.6.0`, () => {
      let policy = getMockPolicyAzure();
      policy = getPosturePolicy(policy, CLOUDBEAT_AZURE, {
        'azure.credentials.type': { value: 'arm_template' },
        'azure.account_type': { value: 'single-account' },
      });

      const { getByText } = render(
        <WrappedComponent newPolicy={policy} packageInfo={getMockPackageInfoCspmAzure('1.5.0')} />
      );

      expect(onChange).toHaveBeenCalledWith({
        isExtensionLoaded: true,
        isValid: false,
        updatedPolicy: policy,
      });

      expect(
        getByText(
          'CIS Azure is not supported on the current Integration version, please upgrade your integration to the latest version to use CIS Azure'
        )
      ).toBeInTheDocument();
    });

    // TODO: remove for stack version 8.13
    it(`doesnt render ${CLOUDBEAT_AZURE} Manual fields when version is not at least version 1.7.0`, () => {
      let policy = getMockPolicyAzure();
      policy = getPosturePolicy(policy, CLOUDBEAT_AZURE, {
        'azure.credentials.type': { value: 'manual' },
        'azure.account_type': { value: 'single-account' },
      });

      const { queryByRole } = render(
        <WrappedComponent newPolicy={policy} packageInfo={getMockPackageInfoCspmAzure('1.6.0')} />
      );

      expect(onChange).toHaveBeenCalledWith({
        isExtensionLoaded: true,

        updatedPolicy: { ...policy, name: 'cspm-1' },
      });

      expect(
        queryByRole('option', { name: 'Service principal with Client Secret', selected: true })
      ).not.toBeInTheDocument();
    });

    it(`selects default ${CLOUDBEAT_AZURE} fields`, () => {
      let policy = getMockPolicyAzure();
      policy = getPosturePolicy(policy, CLOUDBEAT_AZURE, {
        'azure.credentials.type': { value: 'arm_template' },
        'azure.account_type': { value: 'single-account' },
      });

      render(<WrappedComponent newPolicy={policy} packageInfo={getMockPackageInfoCspmAzure()} />);

      expect(onChange).toHaveBeenCalledWith({
        isExtensionLoaded: true,

        updatedPolicy: { ...policy, name: 'cspm-1' },
      });
    });

    it(`renders ${CLOUDBEAT_AZURE} Service Principal with Client Secret fields`, async () => {
      let policy = getMockPolicyAzure();
      policy = getPosturePolicy(policy, CLOUDBEAT_AZURE, {
        'azure.credentials.type': { value: 'service_principal_with_client_secret' },
      });

      const { getByRole, getByTestId } = render(
        <WrappedComponent newPolicy={policy} packageInfo={getPackageInfoMock() as PackageInfo} />
      );

      expect(
        getByRole('option', { name: 'Service principal with Client Secret', selected: true })
      ).toBeInTheDocument();
      expect(getByTestId(AZURE_INPUT_FIELDS_TEST_SUBJECTS.TENANT_ID)).toBeInTheDocument();
      expect(getByTestId(AZURE_INPUT_FIELDS_TEST_SUBJECTS.CLIENT_ID)).toBeInTheDocument();
      await waitFor(() =>
        expect(getByTestId(AZURE_INPUT_FIELDS_TEST_SUBJECTS.CLIENT_SECRET)).toBeInTheDocument()
      );
    });

    it(`updates ${CLOUDBEAT_AZURE} Service Principal with Client Secret fields`, async () => {
      let policy = getMockPolicyAzure();
      policy = getPosturePolicy(policy, CLOUDBEAT_AZURE, {
        'azure.credentials.type': { value: 'service_principal_with_client_secret' },
      });

      const { rerender, getByTestId } = render(
        <WrappedComponent newPolicy={policy} packageInfo={getPackageInfoMock() as PackageInfo} />
      );

      await userEvent.type(getByTestId(AZURE_INPUT_FIELDS_TEST_SUBJECTS.TENANT_ID), 'a');

      policy = getPosturePolicy(policy, CLOUDBEAT_AZURE, {
        'azure.credentials.tenant_id': { value: 'a' },
      });

      expect(onChange).toHaveBeenCalledWith({
        isExtensionLoaded: true,

        updatedPolicy: policy,
      });

      rerender(
        <WrappedComponent newPolicy={policy} packageInfo={getPackageInfoMock() as PackageInfo} />
      );

      await userEvent.type(getByTestId(AZURE_INPUT_FIELDS_TEST_SUBJECTS.CLIENT_ID), 'b');
      policy = getPosturePolicy(policy, CLOUDBEAT_AZURE, {
        'azure.credentials.client_id': { value: 'b' },
      });

      expect(onChange).toHaveBeenCalledWith({
        isExtensionLoaded: true,

        updatedPolicy: policy,
      });

      rerender(
        <WrappedComponent newPolicy={policy} packageInfo={getPackageInfoMock() as PackageInfo} />
      );

      await userEvent.type(getByTestId(AZURE_INPUT_FIELDS_TEST_SUBJECTS.CLIENT_SECRET), 'c');
      policy = getPosturePolicy(policy, CLOUDBEAT_AZURE, {
        'azure.credentials.client_secret': { value: 'c' },
      });

      expect(onChange).toHaveBeenCalledWith({
        isExtensionLoaded: true,

        updatedPolicy: policy,
      });
    });
  });

  describe('Agentless', () => {
    beforeEach(() => {
      jest.clearAllMocks();
    });

    it('should not render setup technology selector if agentless is not available and CSPM integration supports agentless', async () => {
      const policy = getMockPolicyAWS();
      const newPackagePolicy = getPosturePolicy(policy, CLOUDBEAT_AWS, {
        'aws.credentials.type': { value: 'direct_access_keys' },
      });

      const { queryByTestId } = render(
        <WrappedComponent newPolicy={newPackagePolicy} isAgentlessEnabled={false} />
      );

      const setupTechnologySelector = queryByTestId(SETUP_TECHNOLOGY_SELECTOR_TEST_SUBJ);
      // default state
      expect(setupTechnologySelector).not.toBeInTheDocument();
    });

    it('should render setup technology selector for AWS and allow to select agentless', async () => {
      const policy = getMockPolicyAWS();
      const newPackagePolicy = getPosturePolicy(policy, CLOUDBEAT_AWS, {
        'aws.credentials.type': { value: 'direct_access_keys' },
      });

      const { getByTestId, queryByLabelText } = render(
        <WrappedComponent
          newPolicy={newPackagePolicy}
          isAgentlessEnabled={true}
          packageInfo={getPackageInfoMock() as PackageInfo}
        />
      );
      const setupTechnologySelector = getByTestId(SETUP_TECHNOLOGY_SELECTOR_TEST_SUBJ);

      // default state
      expect(setupTechnologySelector).toBeInTheDocument();
      expect(setupTechnologySelector).toHaveTextContent(/agent-based/i);

      expect(
        getByTestId(AWS_CREDENTIALS_TYPE_OPTIONS_TEST_SUBJECTS.CLOUDFORMATION)
      ).toBeInTheDocument();
      expect(getByTestId(AWS_CREDENTIALS_TYPE_OPTIONS_TEST_SUBJECTS.MANUAL)).toBeInTheDocument();

      // select agent-based and check for cloudformation option
      await userEvent.click(setupTechnologySelector);
      const agentlessOption = await queryByLabelText(AGENTLESS_OPTION_LABEL);
      if (agentlessOption) {
        await userEvent.click(agentlessOption);

        const awsCredentialsTypeSelector = getByTestId(AWS_CREDENTIALS_TYPE_SELECTOR_TEST_SUBJ);
        const options: HTMLOptionElement[] = within(awsCredentialsTypeSelector).getAllByRole(
          'option'
        );
        const optionValues = options.map((option) => option.value);
        await waitFor(() => {
          expect(options).toHaveLength(2);
          expect(optionValues).toEqual(
            expect.arrayContaining(['direct_access_keys', 'temporary_keys'])
          );
        });
      }
    });

    it('should render setup technology selector for AWS and allow to select cloud connectors in ess aws environment', async () => {
      const newPackagePolicy = getMockPolicyAWS();

      jest.spyOn(KibanaHook, 'useKibana').mockReturnValue({
        services: {
          cloud: {
            cloudId:
              'cloud_connector_cspm:dXMtZWFzdC0xLmF3cy5zdGFnaW5nLmZvdW5kaXQubm86NDQzJDYyMjExNzI5MDhjZTQ0YmE5YWNkOGFmN2NlYmUyYmVjJGZmYmUyNDc2NGFkNTQwODJhZTkyYjU1NDQ0ZDI3NzA5',
            deploymentUrl: 'https://cloud.elastic.co/deployments/bfdad4ef99a24212a06d387593686d63',
            isCloudEnabled: true,
            isServerlessEnabled: false,
            cloudHost: 'eu-west-1.aws.qa.elastic.cloud',
            serverless: {},
          },
          uiSettings: {
            get: (key: string) => key === SECURITY_SOLUTION_ENABLE_CLOUD_CONNECTOR_SETTING,
          },
        },
      } as any);

      const { getByTestId } = render(
        <WrappedComponent
          newPolicy={{ ...newPackagePolicy, supports_agentless: true }}
          isAgentlessEnabled={true}
          packageInfo={{ ...getAwsPackageInfoMock(), version: '3.0.0' } as PackageInfo}
          defaultSetupTechnology={SetupTechnology.AGENTLESS}
        />
      );
      const setupTechnologySelector = getByTestId(SETUP_TECHNOLOGY_SELECTOR_TEST_SUBJ);

      // default state
      expect(setupTechnologySelector).toBeInTheDocument();
      expect(setupTechnologySelector).toHaveTextContent(/agent-based/i);
      expect(setupTechnologySelector).toHaveTextContent(AGENTLESS_OPTION_LABEL);

      await waitFor(() =>
        expect(getByTestId(AWS_LAUNCH_CLOUD_FORMATION_TEST_SUBJ)).toBeInTheDocument()
      );

      const awsCredentialsTypeSelector = getByTestId(AWS_CREDENTIALS_TYPE_SELECTOR_TEST_SUBJ);
      const options: HTMLOptionElement[] = within(awsCredentialsTypeSelector).getAllByRole(
        'option'
      );
      const optionValues = options.map((option) => option.value);

      await waitFor(() => {
        expect(options).toHaveLength(3);
        expect(optionValues).toEqual(
          expect.arrayContaining(['cloud_connectors', 'direct_access_keys', 'temporary_keys'])
        );
      });
    });

    it('should render setup technology selector for AWS and showcloud connectors in ess gcp environment', async () => {
      const newPackagePolicy = getMockPolicyAWS();

      jest.spyOn(KibanaHook, 'useKibana').mockReturnValue({
        services: {
          cloud: {
            cloudId:
              'cloud_connector_cspm:dXMtZWFzdC0xLmF3cy5zdGFnaW5nLmZvdW5kaXQubm86NDQzJDYyMjExNzI5MDhjZTQ0YmE5YWNkOGFmN2NlYmUyYmVjJGZmYmUyNDc2NGFkNTQwODJhZTkyYjU1NDQ0ZDI3NzA5',
            deploymentUrl: 'https://cloud.elastic.co/deployments/bfdad4ef99a24212a06d387593686d63',
            isCloudEnabled: true,
            isServerlessEnabled: false,
            cloudHost: 'eu-west-1.gcp.qa.elastic.cloud',
            serverless: {},
          },
          uiSettings: {
            get: (key: string) => key === SECURITY_SOLUTION_ENABLE_CLOUD_CONNECTOR_SETTING,
          },
        },
      } as any);

      const { getByTestId } = render(
        <WrappedComponent
          newPolicy={{ ...newPackagePolicy, supports_agentless: true }}
          isAgentlessEnabled={true}
          packageInfo={{ ...getAwsPackageInfoMock(), version: '2.0.0-preview01' } as PackageInfo}
          defaultSetupTechnology={SetupTechnology.AGENTLESS}
        />
      );
      const setupTechnologySelector = getByTestId(SETUP_TECHNOLOGY_SELECTOR_TEST_SUBJ);

      // default state
      expect(setupTechnologySelector).toBeInTheDocument();
      expect(setupTechnologySelector).toHaveTextContent(/agent-based/i);
      expect(setupTechnologySelector).toHaveTextContent(AGENTLESS_OPTION_LABEL);

      const awsCredentialsTypeSelector = getByTestId(AWS_CREDENTIALS_TYPE_SELECTOR_TEST_SUBJ);
      const options: HTMLOptionElement[] = within(awsCredentialsTypeSelector).getAllByRole(
        'option'
      );
      const optionValues = options.map((option) => option.value);

      await waitFor(() => {
        expect(options).toHaveLength(3);
        expect(optionValues).toEqual(
          expect.arrayContaining(['cloud_connectors', 'direct_access_keys', 'temporary_keys'])
        );
      });
    });

    it('should render setup technology selector for AWS and show cloud connectors in ess azure environment', async () => {
      const newPackagePolicy = getMockPolicyAWS();

      jest.spyOn(KibanaHook, 'useKibana').mockReturnValue({
        services: {
          cloud: {
            cloudId:
              'cloud_connector_cspm:dXMtZWFzdC0xLmF3cy5zdGFnaW5nLmZvdW5kaXQubm86NDQzJDYyMjExNzI5MDhjZTQ0YmE5YWNkOGFmN2NlYmUyYmVjJGZmYmUyNDc2NGFkNTQwODJhZTkyYjU1NDQ0ZDI3NzA5',
            deploymentUrl: 'https://cloud.elastic.co/deployments/bfdad4ef99a24212a06d387593686d63',
            isCloudEnabled: true,
            isServerlessEnabled: false,
            cloudHost: 'eu-west-1.azure.qa.elastic.cloud',
            serverless: {},
          },
          uiSettings: {
            get: (key: string) => key === SECURITY_SOLUTION_ENABLE_CLOUD_CONNECTOR_SETTING,
          },
        },
      } as any);

      const { getByTestId } = render(
        <WrappedComponent
          newPolicy={{ ...newPackagePolicy, supports_agentless: true }}
          isAgentlessEnabled={true}
          packageInfo={{ ...getAwsPackageInfoMock(), version: '2.0.0-preview01' } as PackageInfo}
          defaultSetupTechnology={SetupTechnology.AGENTLESS}
        />
      );
      const setupTechnologySelector = getByTestId(SETUP_TECHNOLOGY_SELECTOR_TEST_SUBJ);

      // default state
      expect(setupTechnologySelector).toBeInTheDocument();
      expect(setupTechnologySelector).toHaveTextContent(/agent-based/i);
      expect(setupTechnologySelector).toHaveTextContent(AGENTLESS_OPTION_LABEL);

      const awsCredentialsTypeSelector = getByTestId(AWS_CREDENTIALS_TYPE_SELECTOR_TEST_SUBJ);
      const options: HTMLOptionElement[] = within(awsCredentialsTypeSelector).getAllByRole(
        'option'
      );
      const optionValues = options.map((option) => option.value);

      await waitFor(() => {
        expect(options).toHaveLength(3);
        expect(optionValues).toEqual(
          expect.arrayContaining(['cloud_connectors', 'direct_access_keys', 'temporary_keys'])
        );
      });
    });

    it('should render setup technology selector for AWS and allow to select cloud connectors in serverless aws environment', async () => {
      const newPackagePolicy = getMockPolicyAWS();

      jest.spyOn(KibanaHook, 'useKibana').mockReturnValue({
        services: {
          cloud: {
            cloudId: undefined,
            deploymentUrl: undefined,
            isCloudEnabled: true,
            isServerlessEnabled: true,
            cloudHost: 'us-east-1.aws.elastic.cloud',
            serverless: {
              projectId: 'project-xyz123',
              projectName: 'cloudconnectoraws',
              projectType: 'security',
            },
          },
          uiSettings: {
            get: (key: string) => key === SECURITY_SOLUTION_ENABLE_CLOUD_CONNECTOR_SETTING,
          },
        },
      } as any);

      const { getByTestId } = render(
        <WrappedComponent
          newPolicy={{ ...newPackagePolicy, supports_agentless: true }}
          isAgentlessEnabled={true}
          packageInfo={{ ...getAwsPackageInfoMock(), version: '2.0.0-preview01' } as PackageInfo}
          defaultSetupTechnology={SetupTechnology.AGENTLESS}
        />
      );
      const setupTechnologySelector = getByTestId(SETUP_TECHNOLOGY_SELECTOR_TEST_SUBJ);

      // default state
      expect(setupTechnologySelector).toBeInTheDocument();
      expect(setupTechnologySelector).toHaveTextContent(/agent-based/i);
      expect(setupTechnologySelector).toHaveTextContent(AGENTLESS_OPTION_LABEL);

      const awsCredentialsTypeSelector = getByTestId(AWS_CREDENTIALS_TYPE_SELECTOR_TEST_SUBJ);
      const options: HTMLOptionElement[] = within(awsCredentialsTypeSelector).getAllByRole(
        'option'
      );
      const optionValues = options.map((option) => option.value);

      await waitFor(() => {
        expect(options).toHaveLength(3);
        expect(optionValues).toEqual(
          expect.arrayContaining(['cloud_connectors', 'direct_access_keys', 'temporary_keys'])
        );
      });
    });

    it('should render setup technology selector for AWS and should show cloud connectors in serverless gcp environment', async () => {
      const newPackagePolicy = getMockPolicyAWS();

      jest.spyOn(KibanaHook, 'useKibana').mockReturnValue({
        services: {
          cloud: {
            cloudId: undefined,
            deploymentUrl: undefined,
            isCloudEnabled: true,
            isServerlessEnabled: true,
            cloudHost: 'us-east-1.gcp.elastic.cloud',
            serverless: {
              projectId: 'project-xyz123',
              projectName: 'cloudconnectoraws',
              projectType: 'security',
            },
          },
          uiSettings: {
            get: (key: string) => key === SECURITY_SOLUTION_ENABLE_CLOUD_CONNECTOR_SETTING,
          },
        },
      } as any);

      const { getByTestId } = render(
        <WrappedComponent
          newPolicy={{ ...newPackagePolicy, supports_agentless: true }}
          isAgentlessEnabled={true}
          packageInfo={{ ...getAwsPackageInfoMock(), version: '2.0.0-preview01' } as PackageInfo}
          defaultSetupTechnology={SetupTechnology.AGENTLESS}
        />
      );
      const setupTechnologySelector = getByTestId(SETUP_TECHNOLOGY_SELECTOR_TEST_SUBJ);

      // default state
      expect(setupTechnologySelector).toBeInTheDocument();
      expect(setupTechnologySelector).toHaveTextContent(/agent-based/i);
      expect(setupTechnologySelector).toHaveTextContent(AGENTLESS_OPTION_LABEL);

      const awsCredentialsTypeSelector = getByTestId(AWS_CREDENTIALS_TYPE_SELECTOR_TEST_SUBJ);
      const options: HTMLOptionElement[] = within(awsCredentialsTypeSelector).getAllByRole(
        'option'
      );
      const optionValues = options.map((option) => option.value);

      await waitFor(() => {
        expect(options).toHaveLength(3);
        expect(optionValues).toEqual(
          expect.arrayContaining(['cloud_connectors', 'direct_access_keys', 'temporary_keys'])
        );
      });
    });

    it('should render setup technology selector for AWS and should show cloud connectors in serverless azure environment', async () => {
      const newPackagePolicy = getMockPolicyAWS();

      jest.spyOn(KibanaHook, 'useKibana').mockReturnValue({
        services: {
          cloud: {
            cloudId: undefined,
            deploymentUrl: undefined,
            isCloudEnabled: true,
            isServerlessEnabled: true,
            cloudHost: 'us-east-1.azure.elastic.cloud',
            serverless: {
              projectId: 'project-xyz123',
              projectName: 'cloudconnectoraws',
              projectType: 'security',
            },
          },
          uiSettings: {
            get: (key: string) => key === SECURITY_SOLUTION_ENABLE_CLOUD_CONNECTOR_SETTING,
          },
        },
      } as any);

      const { getByTestId } = render(
        <WrappedComponent
          newPolicy={{ ...newPackagePolicy, supports_agentless: true }}
          isAgentlessEnabled={true}
          packageInfo={{ ...getAwsPackageInfoMock(), version: '2.0.0-preview01' } as PackageInfo}
          defaultSetupTechnology={SetupTechnology.AGENTLESS}
        />
      );
      const setupTechnologySelector = getByTestId(SETUP_TECHNOLOGY_SELECTOR_TEST_SUBJ);

      // default state
      expect(setupTechnologySelector).toBeInTheDocument();
      expect(setupTechnologySelector).toHaveTextContent(/agent-based/i);
      expect(setupTechnologySelector).toHaveTextContent(AGENTLESS_OPTION_LABEL);

      const awsCredentialsTypeSelector = getByTestId(AWS_CREDENTIALS_TYPE_SELECTOR_TEST_SUBJ);
      const options: HTMLOptionElement[] = within(awsCredentialsTypeSelector).getAllByRole(
        'option'
      );
      const optionValues = options.map((option) => option.value);

      await waitFor(() => {
        expect(options).toHaveLength(3);
        expect(optionValues).toEqual(
          expect.arrayContaining(['cloud_connectors', 'direct_access_keys', 'temporary_keys'])
        );
      });
    });

    it.skip('should render setup technology selector for GCP for organisation account type', async () => {
      const newPackagePolicy = getMockPolicyGCP();

      const { getByTestId, queryByTestId, getByLabelText } = render(
        <WrappedComponent
          newPolicy={newPackagePolicy}
          isAgentlessEnabled={true}
          packageInfo={{ version: '1.6.0' } as PackageInfo}
        />
      );

      // navigate to GCP
      const gcpSelectorButton = getByTestId(GCP_PROVIDER_TEST_SUBJ);
      await userEvent.click(gcpSelectorButton);

      const setupTechnologySelector = getByTestId(SETUP_TECHNOLOGY_SELECTOR_TEST_SUBJ);
      const orgIdField = queryByTestId(GCP_INPUT_FIELDS_TEST_SUBJECTS.ORGANIZATION_ID);
      const projectIdField = queryByTestId(GCP_INPUT_FIELDS_TEST_SUBJECTS.PROJECT_ID);
      const credentialsJsonField = queryByTestId(GCP_INPUT_FIELDS_TEST_SUBJECTS.CREDENTIALS_JSON);
      const credentialsTypSelector = queryByTestId(GCP_INPUT_FIELDS_TEST_SUBJECTS.CREDENTIALS_TYPE);
      const credentialsFileField = queryByTestId(GCP_INPUT_FIELDS_TEST_SUBJECTS.CREDENTIALS_FILE);

      // default state for GCP with the Org selected
      expect(setupTechnologySelector).toBeInTheDocument();
      expect(setupTechnologySelector).toHaveTextContent(AGENTLESS_OPTION_LABEL);
      expect(orgIdField).toBeInTheDocument();
      expect(credentialsJsonField).toBeInTheDocument();
      expect(projectIdField).not.toBeInTheDocument();
      expect(credentialsTypSelector).not.toBeInTheDocument();
      expect(credentialsFileField).not.toBeInTheDocument();

      // select agent-based and check for Cloud Shell option
      await userEvent.click(setupTechnologySelector);
      const agentBasedOption = getByLabelText(/agent-based/i);
      await userEvent.click(agentBasedOption);
      await waitFor(() => {
        expect(
          getByTestId(GCP_CREDENTIALS_TYPE_OPTIONS_TEST_SUBJECTS.CLOUD_SHELL)
        ).toBeInTheDocument();
        expect(getByTestId(GCP_CREDENTIALS_TYPE_OPTIONS_TEST_SUBJECTS.MANUAL)).toBeInTheDocument();
      });
    });

    it.skip('should render setup technology selector for GCP for single-account', async () => {
      const newPackagePolicy = getMockPolicyGCP({
        'gcp.account_type': { value: SINGLE_ACCOUNT, type: 'text' },
      });

      const { getByTestId, queryByTestId } = render(
        <WrappedComponent
          newPolicy={newPackagePolicy}
          isAgentlessEnabled={true}
          packageInfo={{ version: '1.6.0' } as PackageInfo}
        />
      );

      // navigate to GCP
      const gcpSelectorButton = getByTestId(GCP_PROVIDER_TEST_SUBJ);
      await userEvent.click(gcpSelectorButton);

      const setupTechnologySelector = queryByTestId(SETUP_TECHNOLOGY_SELECTOR_TEST_SUBJ);
      const orgIdField = queryByTestId(GCP_INPUT_FIELDS_TEST_SUBJECTS.ORGANIZATION_ID);
      const projectIdField = queryByTestId(GCP_INPUT_FIELDS_TEST_SUBJECTS.PROJECT_ID);
      const credentialsJsonField = queryByTestId(GCP_INPUT_FIELDS_TEST_SUBJECTS.CREDENTIALS_JSON);
      const credentialsTypSelector = queryByTestId(GCP_INPUT_FIELDS_TEST_SUBJECTS.CREDENTIALS_TYPE);
      const credentialsFileField = queryByTestId(GCP_INPUT_FIELDS_TEST_SUBJECTS.CREDENTIALS_FILE);

      // default state for GCP with the Org selected
      expect(setupTechnologySelector).toBeInTheDocument();
      expect(setupTechnologySelector).toHaveTextContent(AGENTLESS_OPTION_LABEL);
      expect(orgIdField).not.toBeInTheDocument();
      expect(credentialsJsonField).toBeInTheDocument();
      expect(projectIdField).toBeInTheDocument();
      expect(credentialsTypSelector).not.toBeInTheDocument();
      expect(credentialsFileField).not.toBeInTheDocument();
    });

    it('should render setup technology selector for Azure for Organisation type', async () => {
      const newPackagePolicy = getMockPolicyAzure();

      const { getByTestId, queryByTestId, getByLabelText } = render(
        <WrappedComponent
          newPolicy={newPackagePolicy}
          isAgentlessEnabled={true}
          packageInfo={getPackageInfoMock() as PackageInfo}
        />
      );

      // navigate to Azure
      const azureSelectorButton = getByTestId(AZURE_PROVIDER_TEST_SUBJ);
      await userEvent.click(azureSelectorButton);

      const setupTechnologySelector = getByTestId(SETUP_TECHNOLOGY_SELECTOR_TEST_SUBJ);

      // default state for Azure with the Org selected
      expect(setupTechnologySelector).toBeInTheDocument();
      expect(setupTechnologySelector).toHaveTextContent(/agent-based/i);
      await waitFor(() => {
        expect(getByTestId(AZURE_SETUP_FORMAT_TEST_SUBJECTS.ARM_TEMPLATE)).toBeInTheDocument();
        expect(getByTestId(AZURE_SETUP_FORMAT_TEST_SUBJECTS.MANUAL)).toBeInTheDocument();
      });

      // select agent-based and check for ARM template option
      await userEvent.click(setupTechnologySelector);
      const agentlessOption = getByLabelText(AGENTLESS_OPTION_LABEL);
      await userEvent.click(agentlessOption);

      const tenantIdField = queryByTestId(AZURE_INPUT_FIELDS_TEST_SUBJECTS.TENANT_ID);
      const clientIdField = queryByTestId(AZURE_INPUT_FIELDS_TEST_SUBJECTS.CLIENT_ID);
      const clientSecretField = queryByTestId(AZURE_INPUT_FIELDS_TEST_SUBJECTS.CLIENT_SECRET);
      const armTemplateSelector = queryByTestId(AZURE_SETUP_FORMAT_TEST_SUBJECTS.ARM_TEMPLATE);
      const manualSelector = queryByTestId(AZURE_SETUP_FORMAT_TEST_SUBJECTS.MANUAL);

      expect(setupTechnologySelector).toBeInTheDocument();
      expect(setupTechnologySelector).toHaveTextContent(AGENTLESS_OPTION_LABEL);
      expect(tenantIdField).toBeInTheDocument();
      expect(clientIdField).toBeInTheDocument();
      expect(clientSecretField).toBeInTheDocument();
      expect(armTemplateSelector).not.toBeInTheDocument();
      expect(manualSelector).not.toBeInTheDocument();
    });

    it('should render setup technology selector for Azure for Single Subscription type', async () => {
      const newPackagePolicy = getMockPolicyAzure({
        'azure.account_type': { value: 'single-account', type: 'text' },
      });

      const { getByTestId, queryByTestId, getByLabelText } = render(
        <WrappedComponent
          newPolicy={newPackagePolicy}
          isAgentlessEnabled={true}
          packageInfo={getPackageInfoMock() as PackageInfo}
          integrationToEnable="cspm"
        />
      );

      // navigate to Azure
      const azureSelectorButton = getByTestId(AZURE_PROVIDER_TEST_SUBJ);
      await userEvent.click(azureSelectorButton);

      const setupTechnologySelector = getByTestId(SETUP_TECHNOLOGY_SELECTOR_TEST_SUBJ);

      // select agentless and check for ARM template option
      await userEvent.click(setupTechnologySelector);
      const agentlessOption = getByLabelText(AGENTLESS_OPTION_LABEL);
      await userEvent.click(agentlessOption);

      const tenantIdField = queryByTestId(AZURE_INPUT_FIELDS_TEST_SUBJECTS.TENANT_ID);
      const clientIdField = queryByTestId(AZURE_INPUT_FIELDS_TEST_SUBJECTS.CLIENT_ID);
      const clientSecretField = queryByTestId(AZURE_INPUT_FIELDS_TEST_SUBJECTS.CLIENT_SECRET);
      const armTemplateSelector = queryByTestId(AZURE_SETUP_FORMAT_TEST_SUBJECTS.ARM_TEMPLATE);
      const manualSelector = queryByTestId(AZURE_SETUP_FORMAT_TEST_SUBJECTS.MANUAL);

      // default state for Azure with the Org selected
      expect(setupTechnologySelector).toBeInTheDocument();
      expect(setupTechnologySelector).toHaveTextContent(AGENTLESS_OPTION_LABEL);

      expect(tenantIdField).toBeInTheDocument();
      expect(clientIdField).toBeInTheDocument();
      expect(clientSecretField).toBeInTheDocument();
      expect(armTemplateSelector).not.toBeInTheDocument();
      expect(manualSelector).not.toBeInTheDocument();
    });

    it('should not render setup technology selector for KSPM', () => {
      const newPackagePolicy = getMockPolicyEKS();

      const { queryByTestId } = render(
        <WrappedComponent newPolicy={newPackagePolicy} isAgentlessEnabled={true} />
      );

      const setupTechnologySelector = queryByTestId(SETUP_TECHNOLOGY_SELECTOR_TEST_SUBJ);

      expect(setupTechnologySelector).not.toBeInTheDocument();
    });

    it('should not render setup technology selector for CNVM', () => {
      const newPackagePolicy = getMockPolicyVulnMgmtAWS();

      const { queryByTestId } = render(
        <WrappedComponent newPolicy={newPackagePolicy} isAgentlessEnabled={true} />
      );

      const setupTechnologySelector = queryByTestId(SETUP_TECHNOLOGY_SELECTOR_TEST_SUBJ);

      expect(setupTechnologySelector).not.toBeInTheDocument();
    });
  });

  it(`renders Service principal with Client Certificate fields`, async () => {
    let policy = getMockPolicyAzure();
    policy = getPosturePolicy(policy, CLOUDBEAT_AZURE, {
      'azure.credentials.type': { value: 'service_principal_with_client_certificate' },
    });

    const { getByLabelText, getByRole } = render(
      <WrappedComponent newPolicy={policy} packageInfo={getPackageInfoMock() as PackageInfo} />
    );

    expect(
      getByRole('option', { name: 'Service principal with Client Certificate', selected: true })
    ).toBeInTheDocument();

    expect(getByLabelText('Tenant ID')).toBeInTheDocument();
    expect(getByLabelText('Client ID')).toBeInTheDocument();
    expect(getByLabelText('Client Certificate Path')).toBeInTheDocument();
  });

  it(`updates Service principal with Client Certificate fields`, async () => {
    let policy = getMockPolicyAzure();
    policy = getPosturePolicy(policy, CLOUDBEAT_AZURE, {
      'azure.credentials.type': { value: 'service_principal_with_client_certificate' },
    });

    const { rerender, getByTestId } = render(
      <WrappedComponent newPolicy={policy} packageInfo={getPackageInfoMock() as PackageInfo} />
    );

    await userEvent.type(getByTestId(AZURE_INPUT_FIELDS_TEST_SUBJECTS.TENANT_ID), 'a');

    policy = getPosturePolicy(policy, CLOUDBEAT_AZURE, {
      'azure.credentials.tenant_id': { value: 'a' },
    });

    expect(onChange).toHaveBeenCalledWith({
      isExtensionLoaded: true,
      updatedPolicy: policy,
    });

    rerender(
      <WrappedComponent newPolicy={policy} packageInfo={getPackageInfoMock() as PackageInfo} />
    );

    await userEvent.type(getByTestId(AZURE_INPUT_FIELDS_TEST_SUBJECTS.CLIENT_ID), 'b');
    policy = getPosturePolicy(policy, CLOUDBEAT_AZURE, {
      'azure.credentials.client_id': { value: 'b' },
    });

    expect(onChange).toHaveBeenCalledWith({
      isExtensionLoaded: true,
      updatedPolicy: policy,
    });

    rerender(
      <WrappedComponent newPolicy={policy} packageInfo={getPackageInfoMock() as PackageInfo} />
    );

    await userEvent.type(
      getByTestId(AZURE_INPUT_FIELDS_TEST_SUBJECTS.CLIENT_CERTIFICATE_PATH),
      'c'
    );
    policy = getPosturePolicy(policy, CLOUDBEAT_AZURE, {
      'azure.credentials.client_certificate_path': { value: 'c' },
    });

    expect(onChange).toHaveBeenCalledWith({
      isExtensionLoaded: true,
      updatedPolicy: policy,
    });

    rerender(
      <WrappedComponent newPolicy={policy} packageInfo={getPackageInfoMock() as PackageInfo} />
    );

    await userEvent.type(getByTestId('passwordInput-client-certificate-password'), 'd');
    policy = getPosturePolicy(policy, CLOUDBEAT_AZURE, {
      'azure.credentials.client_certificate_password': { value: 'd' },
    });

    expect(onChange).toHaveBeenCalledWith({
      isExtensionLoaded: true,
      updatedPolicy: policy,
    });
  });

  it(`should not render Service principal with Client Username and Password option`, () => {
    let policy = getMockPolicyAzure();
    policy = getPosturePolicy(policy, CLOUDBEAT_AZURE, {
      'azure.credentials.type': { value: 'managed_identity' },
    });

    const { queryByRole } = render(
      <WrappedComponent newPolicy={policy} packageInfo={getMockPackageInfoCspmAzure('1.7.0')} />
    );

    expect(
      queryByRole('option', {
        name: 'Service principal with Client Username and Password',
        selected: false,
      })
    ).not.toBeInTheDocument();
  });
});
