/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { createContext, useContext, useCallback, useState } from 'react';
import useSessionStorage from 'react-use/lib/useSessionStorage';
import type { AwsStaticKeyCredentials } from '@kbn/fleet-plugin/public';

import { AWS_SERVICES_MAP } from './aws_service_matrix';

export interface ConnectStepState {
  connectorId?: string;
  staticKeys?: AwsStaticKeyCredentials;
}

// Only non-sensitive fields are persisted — password values are never written to session storage
interface PersistedConnectStep {
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

const DEFAULT_SELECTED_IDS: string[] = [];

interface OnboardingFlowState {
  connectStep: ConnectStepState;
  setConnectorId: (id: string | undefined) => void;
  setStaticKeys: (keys: AwsStaticKeyCredentials | undefined) => void;
  servicesStep: ServicesStepState;
  setSelectedServiceIds: (ids: string[]) => void;
}

const OnboardingFlowContext = createContext<OnboardingFlowState | undefined>(undefined);

export function OnboardingFlowProvider({ children }: { children: React.ReactNode }) {
  const [persistedConnectStep, setPersistedConnectStep] = useSessionStorage<PersistedConnectStep>(
    'onboarding.aws.connectStep',
    {}
  );

  const [persistedServices, setPersistedServices] = useSessionStorage<PersistedServicesStep>(
    'onboarding.aws.servicesStep',
    { selectedServiceIds: DEFAULT_SELECTED_IDS }
  );

  // secret_access_key lives in memory only; access_key_id is restored from session storage.
  const [staticKeys, setStaticKeysState] = useState<AwsStaticKeyCredentials | undefined>(() =>
    persistedConnectStep?.authType === 'static_keys' && persistedConnectStep.accessKeyId
      ? { access_key_id: persistedConnectStep.accessKeyId, secret_access_key: '' }
      : undefined
  );

  const setConnectorId = useCallback(
    (id: string | undefined) => {
      setStaticKeysState(undefined);
      setPersistedConnectStep({
        connectorId: id,
        authType: id ? 'identity_federation' : undefined,
      });
    },
    [setPersistedConnectStep]
  );

  const setStaticKeys = useCallback(
    (keys: AwsStaticKeyCredentials | undefined) => {
      setStaticKeysState(keys);
      setPersistedConnectStep({
        authType: keys ? 'static_keys' : undefined,
        accessKeyId: keys?.access_key_id,
      });
    },
    [setPersistedConnectStep]
  );

  const setSelectedServiceIds = useCallback(
    (ids: string[]) => {
      setPersistedServices({ ...persistedServices, selectedServiceIds: ids });
    },
    [persistedServices, setPersistedServices]
  );

  const connectStep: ConnectStepState = {
    connectorId: persistedConnectStep?.connectorId,
    staticKeys,
  };

  const servicesStep: ServicesStepState = {
    selectedServiceIds: (persistedServices?.selectedServiceIds ?? DEFAULT_SELECTED_IDS).filter(
      (id) => AWS_SERVICES_MAP.get(id)?.showInUI === true
    ),
  };

  return (
    <OnboardingFlowContext.Provider
      value={{
        connectStep,
        setConnectorId,
        setStaticKeys,
        servicesStep,
        setSelectedServiceIds,
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
