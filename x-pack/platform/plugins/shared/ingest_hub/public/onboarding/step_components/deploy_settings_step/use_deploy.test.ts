/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { renderHook, act } from '@testing-library/react';

import {
  getRegionFieldName,
  buildStreamVars,
  buildPackageInputs,
  collectDeployResults,
  buildServiceStatuses,
  useDeploy,
} from './use_deploy';
import type { AwsServiceMatrixEntry } from '../../aws_service_matrix';

jest.mock('@kbn/fleet-plugin/public', () => ({
  sendCreateAgentlessPolicy: jest.fn(),
  sendGetPackageInfoByKey: jest.fn(),
}));

jest.mock('../../onboarding_flow_context', () => ({
  useOnboardingFlow: jest.fn(),
}));

jest.mock('react-use/lib/useSessionStorage', () => jest.fn());

import { sendCreateAgentlessPolicy, sendGetPackageInfoByKey } from '@kbn/fleet-plugin/public';
import { useOnboardingFlow } from '../../onboarding_flow_context';
import useSessionStorage from 'react-use/lib/useSessionStorage';

const mockSendCreateAgentlessPolicy = sendCreateAgentlessPolicy as jest.Mock;
const mockSendGetPackageInfoByKey = sendGetPackageInfoByKey as jest.Mock;
const mockUseOnboardingFlow = useOnboardingFlow as jest.Mock;
const mockUseSessionStorage = useSessionStorage as jest.Mock;

// ─── Fixtures ───────────────────────────────────────────────────────────────

function makeService(overrides: Partial<AwsServiceMatrixEntry> = {}): AwsServiceMatrixEntry {
  return {
    id: 'test_service',
    name: 'Test Service',
    category: 'Compute',
    signalType: 'logs',
    packageName: 'aws',
    deliveryMethods: [{ method: 'agentless', preferred: true }],
    inputs: ['aws-s3'],
    requiredConfig: ['region'],
    identityFederationSupported: true,
    defaultEnabled: false,
    showInUI: true,
    ...overrides,
  };
}

// ─── getRegionFieldName ──────────────────────────────────────────────────────

describe('getRegionFieldName', () => {
  it('returns "region" for aws-s3 transport with region in requiredConfig', () => {
    const service = makeService({ requiredConfig: ['region'] });
    expect(getRegionFieldName(service, 'aws-s3')).toBe('region');
  });

  it('returns "region_name" for aws-cloudwatch transport with region_name in requiredConfig', () => {
    const service = makeService({ requiredConfig: ['region_name'] });
    expect(getRegionFieldName(service, 'aws-cloudwatch')).toBe('region_name');
  });

  it('returns "aws_region" when requiredConfig contains aws_region', () => {
    const service = makeService({ requiredConfig: ['aws_region'] });
    expect(getRegionFieldName(service, null)).toBe('aws_region');
  });

  it('returns empty string when no region field matches', () => {
    const service = makeService({ requiredConfig: ['regions'] });
    expect(getRegionFieldName(service, null)).toBe('');
  });

  it('returns empty string when requiredConfig is absent', () => {
    const service = makeService({ requiredConfig: undefined });
    expect(getRegionFieldName(service, 'aws-s3')).toBe('');
  });
});

// ─── buildStreamVars ─────────────────────────────────────────────────────────

describe('buildStreamVars', () => {
  it('passes through non-boolean vars as strings', () => {
    const service = makeService({ requiredConfig: ['region'] });
    const vars = buildStreamVars(service, { trigger: 'aws-s3', vars: { foo: 'bar' } }, '');
    expect(vars.foo).toBe('bar');
  });

  it('coerces boolean var names to boolean type', () => {
    const service = makeService({ requiredConfig: ['region'] });
    const vars = buildStreamVars(
      service,
      { trigger: 'aws-s3', vars: { preserve_original_event: 'true', collect_s3_logs: 'false' } },
      ''
    );
    expect(vars.preserve_original_event).toBe(true);
    expect(vars.collect_s3_logs).toBe(false);
  });

  it('falls back to globalRegion for single-region field when var is absent', () => {
    const service = makeService({ requiredConfig: ['region'] });
    const vars = buildStreamVars(service, { trigger: 'aws-s3', vars: {} }, 'us-east-1');
    expect(vars.region).toBe('us-east-1');
  });

  it('does not override existing region var with globalRegion', () => {
    const service = makeService({ requiredConfig: ['region'] });
    const vars = buildStreamVars(
      service,
      { trigger: 'aws-s3', vars: { region: 'eu-west-1' } },
      'us-east-1'
    );
    expect(vars.region).toBe('eu-west-1');
  });
});

// ─── buildPackageInputs ──────────────────────────────────────────────────────

describe('buildPackageInputs', () => {
  it('builds inputs keyed by policyTemplate-inputType with a stream per service', () => {
    const service = makeService({
      id: 'ec2_logs',
      packageName: 'aws',
      policyTemplate: 'ec2',
      inputs: ['aws-s3'],
    });
    const inputs = buildPackageInputs(
      [service],
      { ec2_logs: { trigger: 'aws-s3', vars: {} } },
      'us-east-1'
    );

    expect(inputs['ec2-aws-s3']).toBeDefined();
    expect(inputs['ec2-aws-s3'].enabled).toBe(true);
    expect(inputs['ec2-aws-s3'].streams['aws.ec2_logs']).toBeDefined();
    expect(inputs['ec2-aws-s3'].streams['aws.ec2_logs'].enabled).toBe(true);
  });

  it('uses bare inputType as key when no policyTemplate is set', () => {
    const service = makeService({ id: 'ec2_logs', inputs: ['aws-s3'], policyTemplate: undefined });
    const inputs = buildPackageInputs([service], { ec2_logs: { trigger: 'aws-s3', vars: {} } }, '');
    expect(inputs['aws-s3']).toBeDefined();
  });

  it('creates input entries without input-level vars (credentials/region are package-level)', () => {
    const service = makeService({
      id: 'ec2_metrics',
      policyTemplate: 'ec2',
      inputs: ['aws/metrics'],
    });
    const inputs = buildPackageInputs(
      [service],
      { ec2_metrics: { trigger: null, vars: {} } },
      'us-west-2'
    );
    expect(inputs['ec2-aws/metrics']).toBeDefined();
    expect(inputs['ec2-aws/metrics'].vars).toBeUndefined();
  });

  it('creates separate input entries for services with different policyTemplates', () => {
    const service1 = makeService({ id: 'ec2_logs', policyTemplate: 'ec2', inputs: ['aws-s3'] });
    const service2 = makeService({ id: 'emr_logs', policyTemplate: 'emr', inputs: ['aws-s3'] });
    const inputs = buildPackageInputs(
      [service1, service2],
      {
        ec2_logs: { trigger: 'aws-s3', vars: {} },
        emr_logs: { trigger: 'aws-s3', vars: {} },
      },
      ''
    );
    expect(Object.keys(inputs)).toHaveLength(2);
    expect(inputs['ec2-aws-s3'].streams['aws.ec2_logs']).toBeDefined();
    expect(inputs['emr-aws-s3'].streams['aws.emr_logs']).toBeDefined();
  });

  it('falls back to first input type from service when serviceVars has no trigger', () => {
    const service = makeService({
      id: 'ec2_logs',
      policyTemplate: 'ec2',
      inputs: ['aws-cloudwatch'],
    });
    const inputs = buildPackageInputs([service], {}, '');
    expect(inputs['ec2-aws-cloudwatch']).toBeDefined();
  });

  it('defaults to aws-s3 when service has multiple inputs and no trigger is set', () => {
    const service = makeService({
      id: 'cloudtrail',
      policyTemplate: 'cloudtrail',
      inputs: ['aws-s3', 'aws-cloudwatch'],
    });
    const inputs = buildPackageInputs([service], {}, '');
    expect(inputs['cloudtrail-aws-s3']).toBeDefined();
    expect(inputs['cloudtrail-aws-cloudwatch']).toBeUndefined();
  });

  it('skips services with no resolvable input type', () => {
    const service = makeService({ id: 'no_input', inputs: [] });
    const inputs = buildPackageInputs([service], { no_input: { trigger: null, vars: {} } }, '');
    expect(Object.keys(inputs)).toHaveLength(0);
  });
});

// ─── collectDeployResults ────────────────────────────────────────────────────

describe('collectDeployResults', () => {
  it('extracts policyId from fulfilled result', () => {
    const results = [{ status: 'fulfilled' as const, value: { policyId: 'policy-abc' } }];
    const { policyIdsByPackage, failedPackages, errorsByPackage } = collectDeployResults(results, [
      'aws',
    ]);
    expect(policyIdsByPackage.aws).toBe('policy-abc');
    expect(failedPackages).toHaveLength(0);
    expect(errorsByPackage).not.toHaveProperty('aws');
  });

  it('omits policyId when response does not include one', () => {
    const results = [{ status: 'fulfilled' as const, value: {} }];
    const { policyIdsByPackage, failedPackages, errorsByPackage } = collectDeployResults(results, [
      'aws',
    ]);
    expect(policyIdsByPackage).not.toHaveProperty('aws');
    expect(failedPackages).toHaveLength(0);
    expect(errorsByPackage).not.toHaveProperty('aws');
  });

  it('adds package to failedPackages on rejection and captures error message', () => {
    const results = [{ status: 'rejected' as const, reason: new Error('Network failure') }];
    const { policyIdsByPackage, failedPackages, errorsByPackage } = collectDeployResults(results, [
      'aws',
    ]);
    expect(failedPackages).toContain('aws');
    expect(policyIdsByPackage).not.toHaveProperty('aws');
    expect(errorsByPackage.aws).toBe('Network failure');
  });

  it('captures error message from plain object rejection', () => {
    const results = [{ status: 'rejected' as const, reason: { message: 'Server error' } }];
    const { errorsByPackage } = collectDeployResults(results, ['aws']);
    expect(errorsByPackage.aws).toBe('Server error');
  });

  it('handles mixed fulfilled and rejected results', () => {
    const results = [
      { status: 'fulfilled' as const, value: { policyId: 'p1' } },
      { status: 'rejected' as const, reason: new Error('fail') },
    ];
    const { policyIdsByPackage, failedPackages, errorsByPackage } = collectDeployResults(results, [
      'pkg-a',
      'pkg-b',
    ]);
    expect(policyIdsByPackage['pkg-a']).toBe('p1');
    expect(failedPackages).toContain('pkg-b');
    expect(errorsByPackage['pkg-b']).toBe('fail');
    expect(errorsByPackage).not.toHaveProperty('pkg-a');
  });
});

// ─── buildServiceStatuses ────────────────────────────────────────────────────

describe('buildServiceStatuses', () => {
  it('sets succeeded package services to "instantiating" by default', () => {
    const servicesByPackage = new Map([
      ['aws', [makeService({ id: 'ec2_metrics' }), makeService({ id: 's3_logs' })]],
    ]);
    const statuses = buildServiceStatuses(['aws'], [], servicesByPackage);
    expect(statuses.ec2_metrics).toBe('instantiating');
    expect(statuses.s3_logs).toBe('instantiating');
  });

  it('sets succeeded package services to the provided succeededState', () => {
    const servicesByPackage = new Map([['aws', [makeService({ id: 'ec2_metrics' })]]]);
    const statuses = buildServiceStatuses(['aws'], [], servicesByPackage, 'receiving');
    expect(statuses.ec2_metrics).toBe('receiving');
  });

  it('sets failed package services to "error"', () => {
    const servicesByPackage = new Map([
      ['aws', [makeService({ id: 'ec2_metrics' }), makeService({ id: 's3_logs' })]],
    ]);
    const statuses = buildServiceStatuses(['aws'], ['aws'], servicesByPackage);
    expect(statuses.ec2_metrics).toBe('error');
    expect(statuses.s3_logs).toBe('error');
  });

  it('handles mixed succeeded and failed packages', () => {
    const servicesByPackage = new Map([
      ['aws', [makeService({ id: 'ec2_metrics' })]],
      ['aws_bedrock', [makeService({ id: 'bedrock_logs', packageName: 'aws_bedrock' })]],
    ]);
    const statuses = buildServiceStatuses(
      ['aws', 'aws_bedrock'],
      ['aws_bedrock'],
      servicesByPackage
    );
    expect(statuses.ec2_metrics).toBe('instantiating');
    expect(statuses.bedrock_logs).toBe('error');
  });

  it('returns empty object when targets is empty', () => {
    const statuses = buildServiceStatuses([], [], new Map());
    expect(statuses).toEqual({});
  });
});

// ─── useDeploy hook ──────────────────────────────────────────────────────────

function setupMocks({
  selectedServiceIds = ['ec2_metrics'],
  connectorId = undefined as string | undefined,
  staticKeys = undefined as { access_key_id: string; secret_access_key: string } | undefined,
  globalRegion = 'us-east-1',
  pkgVersion = '2.0.0',
  deployAndDetectStep = {} as Record<string, unknown>,
}: {
  selectedServiceIds?: string[];
  connectorId?: string;
  staticKeys?: { access_key_id: string; secret_access_key: string };
  globalRegion?: string;
  pkgVersion?: string;
  deployAndDetectStep?: Record<string, unknown>;
} = {}) {
  mockUseOnboardingFlow.mockReturnValue({
    servicesStep: { selectedServiceIds },
    deploySettingsStep: { connectorId, staticKeys },
    deployAndDetectStep: {
      isDeploying: false,
      serviceStatuses: {},
      policyIdsByPackage: {},
      failedPackages: [],
      ...deployAndDetectStep,
    },
    updateDeployAndDetectStep: jest.fn(),
    getLatestFailedPackages: jest.fn().mockReturnValue([]),
    registerDeployHandler: jest.fn(),
    retryDeploy: jest.fn(),
  });

  mockUseSessionStorage.mockReturnValue([{ globalRegion, serviceVars: {} }, jest.fn()]);

  mockSendGetPackageInfoByKey.mockResolvedValue({
    data: {
      item: {
        version: pkgVersion,
        vars: [
          { name: 'default_region' },
          { name: 'access_key_id' },
          { name: 'secret_access_key' },
        ],
      },
    },
  });

  mockSendCreateAgentlessPolicy.mockResolvedValue({ data: {} });
}

describe('useDeploy', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('initializes with default namespace and idle state', () => {
    setupMocks();
    const { result } = renderHook(() => useDeploy({ onContinue: jest.fn() }));

    expect(result.current.namespace).toBe('default');
    expect(result.current.isDeploying).toBe(false);
    expect(result.current.failedPackages).toEqual([]);
  });

  it('navigates immediately and completes API call on success', async () => {
    setupMocks({ selectedServiceIds: ['ec2_metrics'] });
    const onContinue = jest.fn();
    const { result } = renderHook(() => useDeploy({ onContinue }));

    await act(async () => {
      await result.current.handleDeploy();
    });

    expect(mockSendCreateAgentlessPolicy).toHaveBeenCalledTimes(1);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('navigates immediately even when deployment fails', async () => {
    setupMocks({ selectedServiceIds: ['ec2_metrics'] });
    mockSendCreateAgentlessPolicy.mockRejectedValue(new Error('API error'));
    const onContinue = jest.fn();
    const { result } = renderHook(() => useDeploy({ onContinue }));

    await act(async () => {
      await result.current.handleDeploy();
    });

    expect(result.current.failedPackages).toContain('aws');
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('is not loading after deployment finishes', async () => {
    setupMocks();
    const { result } = renderHook(() => useDeploy({ onContinue: jest.fn() }));

    await act(async () => {
      await result.current.handleDeploy();
    });

    expect(result.current.isDeploying).toBe(false);
  });

  it('retries only the specified failed packages without navigating again', async () => {
    setupMocks({ selectedServiceIds: ['ec2_metrics'] });
    mockSendCreateAgentlessPolicy
      .mockRejectedValueOnce(new Error('first fail'))
      .mockResolvedValueOnce({ data: {} });
    const onContinue = jest.fn();
    const { result } = renderHook(() => useDeploy({ onContinue }));

    await act(async () => {
      await result.current.handleDeploy();
    });
    expect(result.current.failedPackages).toContain('aws');
    expect(onContinue).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.handleDeploy(['aws']);
    });
    expect(result.current.failedPackages).toHaveLength(0);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('passes cloud_connector when connectorId is set (identity federation path)', async () => {
    setupMocks({ selectedServiceIds: ['ec2_metrics'], connectorId: 'connector-123' });
    const { result } = renderHook(() => useDeploy({ onContinue: jest.fn() }));

    await act(async () => {
      await result.current.handleDeploy();
    });

    expect(mockSendCreateAgentlessPolicy).toHaveBeenCalledWith(
      expect.objectContaining({
        cloud_connector: { enabled: true, cloud_connector_id: 'connector-123' },
      })
    );
  });

  it('passes static keys as package-level vars when no connectorId', async () => {
    setupMocks({
      selectedServiceIds: ['ec2_metrics'],
      connectorId: undefined,
      staticKeys: { access_key_id: 'AKID', secret_access_key: 'SECRET' },
    });
    const { result } = renderHook(() => useDeploy({ onContinue: jest.fn() }));

    await act(async () => {
      await result.current.handleDeploy();
    });

    expect(mockSendCreateAgentlessPolicy).toHaveBeenCalledWith(
      expect.objectContaining({
        vars: expect.objectContaining({ access_key_id: 'AKID', secret_access_key: 'SECRET' }),
      })
    );
    expect(mockSendCreateAgentlessPolicy).toHaveBeenCalledWith(
      expect.not.objectContaining({ cloud_connector: expect.anything() })
    );
  });

  it('calls onContinue immediately when no agentless services are selected', async () => {
    setupMocks({ selectedServiceIds: [] });
    const onContinue = jest.fn();
    const { result } = renderHook(() => useDeploy({ onContinue }));

    await act(async () => {
      await result.current.handleDeploy();
    });

    expect(mockSendCreateAgentlessPolicy).not.toHaveBeenCalled();
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('adds to failedPackages when package version cannot be resolved', async () => {
    setupMocks({ selectedServiceIds: ['ec2_metrics'] });
    mockSendGetPackageInfoByKey.mockResolvedValue({ data: { item: { version: undefined } } });
    const { result } = renderHook(() => useDeploy({ onContinue: jest.fn() }));

    await act(async () => {
      await result.current.handleDeploy();
    });

    expect(result.current.failedPackages).toContain('aws');
  });

  it('navigates without resubmitting when all selected services are already deployed', async () => {
    setupMocks({
      selectedServiceIds: ['ec2_metrics'],
      deployAndDetectStep: { serviceStatuses: { ec2_metrics: 'instantiating' } },
    });
    const onContinue = jest.fn();
    const { result } = renderHook(() => useDeploy({ onContinue }));

    await act(async () => {
      await result.current.handleDeploy();
    });

    expect(mockSendCreateAgentlessPolicy).not.toHaveBeenCalled();
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('navigates without resubmitting when deploy is in progress for all selected services', async () => {
    setupMocks({
      selectedServiceIds: ['ec2_metrics'],
      deployAndDetectStep: { isDeploying: true, serviceStatuses: { ec2_metrics: 'instantiating' } },
    });
    const onContinue = jest.fn();
    const { result } = renderHook(() => useDeploy({ onContinue }));

    await act(async () => {
      await result.current.handleDeploy();
    });

    expect(mockSendCreateAgentlessPolicy).not.toHaveBeenCalled();
    expect(onContinue).toHaveBeenCalledTimes(1);
  });

  it('deploys newly selected services even when some are already deployed', async () => {
    // ec2_metrics already deployed; lambda is a new selection in the same package
    setupMocks({
      selectedServiceIds: ['ec2_metrics', 'lambda'],
      deployAndDetectStep: { serviceStatuses: { ec2_metrics: 'instantiating' } },
    });
    const onContinue = jest.fn();
    const { result } = renderHook(() => useDeploy({ onContinue }));

    await act(async () => {
      await result.current.handleDeploy();
    });

    expect(mockSendCreateAgentlessPolicy).toHaveBeenCalledTimes(1);
    expect(onContinue).toHaveBeenCalledTimes(1);

    // Only lambda's input should be enabled — ec2_metrics was already deployed and must not
    // appear as an enabled input (would create a duplicate policy for an already-running service).
    const submittedInputs = mockSendCreateAgentlessPolicy.mock.calls[0][0].inputs as Record<
      string,
      { enabled: boolean }
    >;
    expect(submittedInputs['lambda-aws/metrics']?.enabled).toBe(true);
    expect(submittedInputs['ec2-aws/metrics']?.enabled).not.toBe(true);
  });

  it('includes non-agentless services as gray instantiating chips without deploying them', async () => {
    // ec2_metrics is agentless; ec2_logs is cloud_forwarder (per updated service matrix)
    setupMocks({ selectedServiceIds: ['ec2_metrics', 'ec2_logs'] });
    const onContinue = jest.fn();
    const { result } = renderHook(() => useDeploy({ onContinue }));

    await act(async () => {
      await result.current.handleDeploy();
    });

    const updateDeployAndDetectStep = mockUseOnboardingFlow.mock.results[0].value
      .updateDeployAndDetectStep as jest.Mock;
    const initialUpdate = updateDeployAndDetectStep.mock.calls[0][0];

    // Both services appear in the initial status update
    expect(initialUpdate.serviceStatuses.ec2_metrics).toBe('instantiating');
    expect(initialUpdate.serviceStatuses.ec2_logs).toBe('instantiating');
    // Agentless API only called once (for the aws package containing ec2_metrics)
    expect(mockSendCreateAgentlessPolicy).toHaveBeenCalledTimes(1);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
