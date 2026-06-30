/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { createContext, useContext, useCallback, useRef, useState } from 'react';
import useSessionStorage from 'react-use/lib/useSessionStorage';
import type { AwsStaticKeyCredentials } from '@kbn/fleet-plugin/public';

import { AWS_SERVICES_MAP } from './aws_service_matrix';

export interface DeploySettingsStepState {
  connectorId?: string;
  staticKeys?: AwsStaticKeyCredentials;
}

export type ServiceChipState = 'instantiating' | 'detecting' | 'receiving' | 'error' | 'timeout';

export interface DeployAndDetectStepState {
  isDeploying: boolean;
  serviceStatuses: Record<string, ServiceChipState>;
  policyIdsByPackage: Record<string, string>;
  failedPackages: string[];
  deployErrors: Record<string, string>;
}

// Only non-sensitive fields are persisted — password values are never written to session storage
interface PersistedDeploySettingsStep {
  connectorId?: string;
  authType?: 'identity_federation' | 'static_keys';
  accessKeyId?: string;
}

export interface ServicesStepState {
  selectedServiceIds: string[];
}

interface PersistedServicesStep {
  selectedServiceIds: string[];
}

interface PersistedDeployAndDetectStep {
  serviceStatuses: Record<string, ServiceChipState>;
  policyIdsByPackage: Record<string, string>;
  failedPackages: string[];
  deployErrors: Record<string, string>;
}

const DEFAULT_SELECTED_IDS: string[] = [];

interface OnboardingFlowState {
  deploySettingsStep: DeploySettingsStepState;
  setConnectorId: (id: string | undefined) => void;
  setStaticKeys: (keys: AwsStaticKeyCredentials | undefined) => void;
  servicesStep: ServicesStepState;
  setSelectedServiceIds: (ids: string[]) => void;
  deployAndDetectStep: DeployAndDetectStepState;
  updateDeployAndDetectStep: (update: Partial<DeployAndDetectStepState>) => void;
  getLatestFailedPackages: () => string[];
  registerDeployHandler: (fn: (packageNames?: string[]) => void) => void;
  retryDeploy: (packageNames?: string[]) => void;
}

const OnboardingFlowContext = createContext<OnboardingFlowState | undefined>(undefined);

export function OnboardingFlowProvider({ children }: { children: React.ReactNode }) {
  const [persistedDeploySettingsStep, setPersistedDeploySettingsStep] =
    useSessionStorage<PersistedDeploySettingsStep>('onboarding.aws.deploySettingsStep', {});

  const [persistedServices, setPersistedServices] = useSessionStorage<PersistedServicesStep>(
    'onboarding.aws.servicesStep',
    { selectedServiceIds: DEFAULT_SELECTED_IDS }
  );

  // secret_access_key lives in memory only; access_key_id is restored from session storage.
  const [staticKeys, setStaticKeysState] = useState<AwsStaticKeyCredentials | undefined>(() =>
    persistedDeploySettingsStep?.authType === 'static_keys' &&
    persistedDeploySettingsStep.accessKeyId
      ? { access_key_id: persistedDeploySettingsStep.accessKeyId, secret_access_key: '' }
      : undefined
  );

  const setConnectorId = useCallback(
    (id: string | undefined) => {
      setStaticKeysState(undefined);
      setPersistedDeploySettingsStep({
        connectorId: id,
        authType: id ? 'identity_federation' : undefined,
      });
    },
    [setPersistedDeploySettingsStep]
  );

  const setStaticKeys = useCallback(
    (keys: AwsStaticKeyCredentials | undefined) => {
      setStaticKeysState(keys);
      setPersistedDeploySettingsStep({
        authType: keys ? 'static_keys' : undefined,
        accessKeyId: keys?.access_key_id,
      });
    },
    [setPersistedDeploySettingsStep]
  );

  const setSelectedServiceIds = useCallback(
    (ids: string[]) => {
      setPersistedServices({ ...persistedServices, selectedServiceIds: ids });
    },
    [persistedServices, setPersistedServices]
  );

  const [persistedDeployAndDetectStep, setPersistedDeployAndDetectStep] =
    useSessionStorage<PersistedDeployAndDetectStep>('onboarding.aws.deployAndDetectStep', {
      serviceStatuses: {},
      policyIdsByPackage: {},
      failedPackages: [],
      deployErrors: {},
    });

  // isDeploying is intentionally not persisted — it resets to false on page reload
  const [isDeploying, setIsDeploying] = useState(false);

  const deployHandlerRef = useRef<((packageNames?: string[]) => void) | null>(null);

  // Ref always holds the latest persisted value so updateDeployAndDetectStep
  // reads current state even when called after an await (stale closure prevention).
  const persistedDeployAndDetectStepRef = useRef(persistedDeployAndDetectStep);
  persistedDeployAndDetectStepRef.current = persistedDeployAndDetectStep;

  const updateDeployAndDetectStep = useCallback(
    (update: Partial<DeployAndDetectStepState>) => {
      if (update.isDeploying !== undefined) {
        setIsDeploying(update.isDeploying);
      }
      const { isDeploying: _, ...rest } = update;
      if (Object.keys(rest).length > 0) {
        const prev = persistedDeployAndDetectStepRef.current;
        setPersistedDeployAndDetectStep({
          serviceStatuses: { ...(prev?.serviceStatuses ?? {}), ...(rest.serviceStatuses ?? {}) },
          policyIdsByPackage: {
            ...(prev?.policyIdsByPackage ?? {}),
            ...(rest.policyIdsByPackage ?? {}),
          },
          failedPackages: rest.failedPackages ?? prev?.failedPackages ?? [],
          deployErrors:
            rest.deployErrors !== undefined ? rest.deployErrors : prev?.deployErrors ?? {},
        });
      }
    },
    [setPersistedDeployAndDetectStep]
  );

  const getLatestFailedPackages = useCallback(
    () => persistedDeployAndDetectStepRef.current?.failedPackages ?? [],
    []
  );

  const registerDeployHandler = useCallback((fn: (packageNames?: string[]) => void) => {
    deployHandlerRef.current = fn;
  }, []);

  const retryDeploy = useCallback((packageNames?: string[]) => {
    deployHandlerRef.current?.(packageNames);
  }, []);

  const servicesStep: ServicesStepState = {
    selectedServiceIds: (persistedServices?.selectedServiceIds ?? DEFAULT_SELECTED_IDS).filter(
      (id) => AWS_SERVICES_MAP.get(id)?.showInUI === true
    ),
  };

  const deploySettingsStep: DeploySettingsStepState = {
    connectorId: persistedDeploySettingsStep?.connectorId,
    staticKeys,
  };

  const deployAndDetectStep: DeployAndDetectStepState = {
    isDeploying,
    ...persistedDeployAndDetectStep,
  };

  return (
    <OnboardingFlowContext.Provider
      value={{
        deploySettingsStep,
        setConnectorId,
        setStaticKeys,
        servicesStep,
        setSelectedServiceIds,
        deployAndDetectStep,
        updateDeployAndDetectStep,
        getLatestFailedPackages,
        registerDeployHandler,
        retryDeploy,
      }}
    >
      {children}
    </OnboardingFlowContext.Provider>
  );
}

export function useOnboardingFlow(): OnboardingFlowState {
  const ctx = useContext(OnboardingFlowContext);
  if (!ctx) {
    throw new Error('useOnboardingFlow must be used within OnboardingFlowProvider');
  }
  return ctx;
}
