/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import useSessionStorage from 'react-use/lib/useSessionStorage';

import { sendCreateAgentlessPolicy, sendGetPackageInfoByKey } from '@kbn/fleet-plugin/public';

import { AWS_SERVICES_MAP } from '../../aws_service_matrix';
import type { AwsServiceMatrixEntry } from '../../aws_service_matrix';
import { useOnboardingFlow } from '../../onboarding_flow_context';
import type { DeploySettingsStepState, ServiceChipState } from '../../onboarding_flow_context';
import { SERVICE_SETTINGS_SESSION_KEY } from '../service_settings_step/use_service_settings';
import type { ServiceVars } from '../service_settings_step/use_service_settings';

interface ServiceSettingsPersistedState {
  globalRegion: string;
  serviceVars: Record<string, ServiceVars>;
}

export interface UseDeployResult {
  namespace: string;
  setNamespace: (ns: string) => void;
  isDeploying: boolean;
  failedPackages: string[];
  handleDeploy: (packageNames?: string[]) => void;
}

interface PackageInputEntry {
  enabled: boolean;
  vars?: Record<string, string | boolean>;
  streams: Record<string, { enabled: boolean; vars: Record<string, string | boolean> }>;
}

const BOOLEAN_VAR_NAMES = new Set([
  'preserve_original_event',
  'collect_s3_logs',
  'preserve_duplicate_custom_fields',
  'collect_esm_metrics',
  'leaderelection',
]);

export function getRegionFieldName(
  service: AwsServiceMatrixEntry,
  activeTransport: string | null
): string {
  const rc = service.requiredConfig ?? [];
  if (activeTransport === 'aws-s3' && rc.includes('region')) return 'region';
  if (activeTransport === 'aws-cloudwatch' && rc.includes('region_name')) return 'region_name';
  if (rc.includes('aws_region')) return 'aws_region';
  return '';
}

export function buildStreamVars(
  service: AwsServiceMatrixEntry,
  serviceVars: ServiceVars,
  globalRegion: string
): Record<string, string | boolean> {
  const result: Record<string, string | boolean> = {};

  for (const [key, value] of Object.entries(serviceVars.vars)) {
    result[key] = BOOLEAN_VAR_NAMES.has(key) ? value === 'true' : value;
  }

  const regionField = getRegionFieldName(service, serviceVars.trigger);
  if (regionField && !result[regionField] && globalRegion) {
    result[regionField] = globalRegion;
  }

  return result;
}

export function buildPackageInputs(
  services: AwsServiceMatrixEntry[],
  storedServiceVars: Record<string, ServiceVars>,
  globalRegion: string
): Record<string, PackageInputEntry> {
  const inputs: Record<string, PackageInputEntry> = {};

  for (const service of services) {
    const serviceVars: ServiceVars = storedServiceVars[service.id] ?? { trigger: null, vars: {} };
    const defaultInput = service.inputs?.includes('aws-s3') ? 'aws-s3' : service.inputs?.[0] ?? '';
    const inputType = serviceVars.trigger ?? defaultInput;
    if (!inputType) continue;

    const inputKey = service.policyTemplate ? `${service.policyTemplate}-${inputType}` : inputType;
    const streamKey = `${service.packageName}.${service.dataStream ?? service.id}`;
    const streamVars = buildStreamVars(service, serviceVars, globalRegion);

    if (!inputs[inputKey]) {
      inputs[inputKey] = { enabled: true, streams: {} };
    }

    inputs[inputKey].streams[streamKey] = { enabled: true, vars: streamVars };
  }

  return inputs;
}

function buildPackageVars(
  globalRegion: string,
  staticKeys: DeploySettingsStepState['staticKeys'],
  pkgVarNames: Set<string>
): Record<string, string> | undefined {
  const vars: Record<string, string> = {};
  if (globalRegion && pkgVarNames.has('default_region')) vars.default_region = globalRegion;
  if (staticKeys?.access_key_id && staticKeys?.secret_access_key) {
    if (pkgVarNames.has('access_key_id')) vars.access_key_id = staticKeys.access_key_id;
    if (pkgVarNames.has('secret_access_key')) vars.secret_access_key = staticKeys.secret_access_key;
  }
  return Object.keys(vars).length > 0 ? vars : undefined;
}

function getPackageVarNames(pkgInfo: { vars?: Array<{ name: string }> }): Set<string> {
  return new Set((pkgInfo.vars ?? []).map((v) => v.name));
}

function buildAgentlessPolicyName(services: AwsServiceMatrixEntry[]): string {
  // truncating serviceIds in policy name to limit the length, the suffix of timestamp should ensure uniqueness
  const serviceIdsTruncated = services
    .map((s) => s.id)
    .join('_')
    .slice(0, 100);
  return `${serviceIdsTruncated}-${Date.now()}`;
}

interface PackageDeployOutcome {
  policyId?: string;
}

async function deployPackage(
  packageName: string,
  services: AwsServiceMatrixEntry[],
  {
    namespace,
    globalRegion,
    storedServiceVars,
    deploySettingsStep,
  }: {
    namespace: string;
    globalRegion: string;
    storedServiceVars: Record<string, ServiceVars>;
    deploySettingsStep: DeploySettingsStepState;
  }
): Promise<PackageDeployOutcome> {
  const pkgInfoResponse = await sendGetPackageInfoByKey(packageName);
  const pkgInfo = pkgInfoResponse.data?.item;
  const pkgVersion = pkgInfo?.version;
  if (!pkgVersion) {
    throw new Error(`Package ${packageName} is not installed`);
  }

  const { connectorId, staticKeys } = deploySettingsStep;
  const inputs = buildPackageInputs(services, storedServiceVars, globalRegion);

  // Explicitly disable all package inputs not in our selection.
  // Fleet merges our partial inputs with package manifest defaults (including defaultEnabled: true
  // inputs like aws-s3), causing "not allowed for agentless" errors for inputs we never wanted.
  const pkgTemplates: Array<{ name?: string; type?: string; inputs?: Array<{ type: string }> }> =
    (pkgInfo as any).policy_templates ?? [];
  for (const template of pkgTemplates) {
    const templateInputs = template.inputs ?? (template.type ? [{ type: template.type }] : []);
    for (const input of templateInputs) {
      const key = template.name ? `${template.name}-${input.type}` : input.type;
      if (!inputs[key]) {
        inputs[key] = { enabled: false, streams: {} };
      }
    }
  }

  const pkgVarNames = getPackageVarNames(pkgInfo);
  const vars = buildPackageVars(globalRegion, staticKeys, pkgVarNames);

  const response = await sendCreateAgentlessPolicy({
    name: buildAgentlessPolicyName(services),
    namespace,
    package: { name: packageName, version: pkgVersion },
    ...(vars ? { vars } : {}),
    inputs,
    ...(connectorId ? { cloud_connector: { enabled: true, cloud_connector_id: connectorId } } : {}),
  });

  return { policyId: (response as any)?.data?.item?.policy_ids?.[0] };
}

function extractErrorMessage(reason: unknown): string {
  if (reason instanceof Error) return reason.message;
  if (reason !== null && typeof reason === 'object' && 'message' in reason) {
    return String((reason as { message: unknown }).message);
  }
  return String(reason);
}

export function collectDeployResults(
  results: PromiseSettledResult<PackageDeployOutcome>[],
  targets: string[]
): {
  policyIdsByPackage: Record<string, string>;
  failedPackages: string[];
  errorsByPackage: Record<string, string>;
} {
  const policyIdsByPackage: Record<string, string> = {};
  const failedPackages: string[] = [];
  const errorsByPackage: Record<string, string> = {};

  for (let i = 0; i < targets.length; i++) {
    const pkg = targets[i];
    const result = results[i];
    if (result.status === 'fulfilled') {
      if (result.value.policyId) policyIdsByPackage[pkg] = result.value.policyId;
    } else {
      failedPackages.push(pkg);
      errorsByPackage[pkg] = extractErrorMessage(result.reason);
    }
  }

  return { policyIdsByPackage, failedPackages, errorsByPackage };
}

export function buildServiceStatuses(
  targets: string[],
  failedPackages: string[],
  servicesByPackage: Map<string, AwsServiceMatrixEntry[]>,
  succeededState: ServiceChipState = 'instantiating'
): Record<string, ServiceChipState> {
  const statuses: Record<string, ServiceChipState> = {};
  const failedSet = new Set(failedPackages);

  for (const pkg of targets) {
    const chipState: ServiceChipState = failedSet.has(pkg) ? 'error' : succeededState;
    for (const service of servicesByPackage.get(pkg) ?? []) {
      statuses[service.id] = chipState;
    }
  }

  return statuses;
}

export function useDeploy({ onContinue }: { onContinue: () => void }): UseDeployResult {
  const {
    servicesStep,
    deploySettingsStep,
    deployAndDetectStep,
    updateDeployAndDetectStep,
    getLatestFailedPackages,
    registerDeployHandler,
  } = useOnboardingFlow();
  const { selectedServiceIds } = servicesStep;

  const [serviceSettings] = useSessionStorage<ServiceSettingsPersistedState>(
    SERVICE_SETTINGS_SESSION_KEY,
    { globalRegion: '', serviceVars: {} }
  );

  const [namespace, setNamespace] = useState('default');
  const [isDeploying, setIsDeploying] = useState(false);
  const [failedPackages, setFailedPackages] = useState<string[]>([]);

  const agentlessServices: AwsServiceMatrixEntry[] = useMemo(
    () =>
      selectedServiceIds
        .map((id) => AWS_SERVICES_MAP.get(id))
        .filter(
          (s): s is AwsServiceMatrixEntry =>
            s !== undefined &&
            s.deliveryMethods.some((dm) => dm.method === 'agentless' && dm.preferred)
        ),
    [selectedServiceIds]
  );

  const servicesByPackage = useMemo(() => {
    const map = new Map<string, AwsServiceMatrixEntry[]>();
    for (const service of agentlessServices) {
      const group = map.get(service.packageName) ?? [];
      group.push(service);
      map.set(service.packageName, group);
    }
    return map;
  }, [agentlessServices]);

  const nonAgentlessServices: AwsServiceMatrixEntry[] = useMemo(
    () =>
      selectedServiceIds
        .map((id) => AWS_SERVICES_MAP.get(id))
        .filter(
          (s): s is AwsServiceMatrixEntry =>
            s !== undefined &&
            !s.deliveryMethods.some((dm) => dm.method === 'agentless' && dm.preferred)
        ),
    [selectedServiceIds]
  );

  const handleDeploy = useCallback(
    async (packageNames?: string[]) => {
      const isInitialDeploy = packageNames === undefined;

      let targets: string[];
      // For initial deploy, only the untracked services are deployed per package so that
      // already-running services don't get a duplicate policy created for them.
      let servicesToDeployByPackage: Map<string, AwsServiceMatrixEntry[]>;
      if (isInitialDeploy) {
        servicesToDeployByPackage = new Map();
        for (const [pkg, services] of servicesByPackage) {
          const untracked = services.filter((s) => !(s.id in deployAndDetectStep.serviceStatuses));
          if (untracked.length > 0) {
            servicesToDeployByPackage.set(pkg, untracked);
          }
        }
        targets = [...servicesToDeployByPackage.keys()];

        // Non-agentless services (e.g. cloud_forwarder) are shown as gray chips but never deployed.
        const newNonAgentlessStatuses: Record<string, ServiceChipState> = {};
        for (const service of nonAgentlessServices) {
          if (!(service.id in deployAndDetectStep.serviceStatuses)) {
            newNonAgentlessStatuses[service.id] = 'instantiating';
          }
        }

        if (targets.length === 0 && Object.keys(newNonAgentlessStatuses).length === 0) {
          onContinue();
          return;
        }

        // Set target services to 'instantiating' before navigating so that a back-navigation
        // mid-deploy sees them in serviceStatuses and won't resubmit.
        const initialStatuses = buildServiceStatuses(targets, [], servicesByPackage);
        if (targets.length > 0) setIsDeploying(true);
        updateDeployAndDetectStep({
          isDeploying: targets.length > 0,
          serviceStatuses: { ...initialStatuses, ...newNonAgentlessStatuses },
        });
        onContinue();

        if (targets.length === 0) return;
      } else {
        targets = packageNames;
        servicesToDeployByPackage = servicesByPackage;
        const retryStatuses = buildServiceStatuses(targets, [], servicesByPackage);
        const remainingFailed = deployAndDetectStep.failedPackages.filter(
          (pkg) => !targets.includes(pkg)
        );
        setIsDeploying(true);
        updateDeployAndDetectStep({
          isDeploying: true,
          serviceStatuses: retryStatuses,
          failedPackages: remainingFailed,
          deployErrors: {},
        });
      }

      const globalRegion = serviceSettings?.globalRegion ?? '';
      const storedServiceVars = serviceSettings?.serviceVars ?? {};

      const results = await Promise.allSettled(
        targets.map((packageName) =>
          deployPackage(packageName, servicesToDeployByPackage.get(packageName) ?? [], {
            namespace,
            globalRegion,
            storedServiceVars,
            deploySettingsStep,
          })
        )
      );

      const {
        policyIdsByPackage,
        failedPackages: newFailed,
        errorsByPackage,
      } = collectDeployResults(results, targets);
      const newServiceStatuses = buildServiceStatuses(
        targets,
        newFailed,
        servicesByPackage,
        'receiving'
      );

      // Merge with packages that failed in a prior run but weren't retried in this one.
      // Use the ref-backed getter to get the freshest value, not the stale closure.
      const previouslyFailed = getLatestFailedPackages().filter((pkg) => !targets.includes(pkg));
      const mergedFailed = [...previouslyFailed, ...newFailed];

      setIsDeploying(false);
      setFailedPackages(mergedFailed);
      updateDeployAndDetectStep({
        isDeploying: false,
        serviceStatuses: newServiceStatuses,
        policyIdsByPackage,
        failedPackages: mergedFailed,
        deployErrors: errorsByPackage,
      });
    },

    [
      servicesByPackage,
      nonAgentlessServices,
      serviceSettings,
      deploySettingsStep,
      namespace,
      onContinue,
      updateDeployAndDetectStep,
      getLatestFailedPackages,
      deployAndDetectStep.serviceStatuses,
      deployAndDetectStep.failedPackages,
    ]
  );

  useEffect(() => {
    registerDeployHandler(handleDeploy);
  }, [handleDeploy, registerDeployHandler]);

  return { namespace, setNamespace, isDeploying, failedPackages, handleDeploy };
}
