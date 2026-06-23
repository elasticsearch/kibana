/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useCallback, useMemo } from 'react';
import useSessionStorage from 'react-use/lib/useSessionStorage';

import { AWS_SERVICES_MAP } from '../../aws_service_matrix';
import type { AwsServiceMatrixEntry } from '../../aws_service_matrix';
import { useOnboardingFlow } from '../../onboarding_flow_context';
import { getDefaultTransport, getInlineFields, FIELD_CONFIG } from './field_config';
import type { TransportType } from './field_config';

export interface ServiceVars {
  trigger: TransportType | null;
  vars: Record<string, string>;
}

interface PersistedState {
  globalRegion: string;
  serviceVars: Record<string, ServiceVars>;
}

const SESSION_KEY = 'onboarding.aws.serviceSettingsStep';

export function useServiceSettings({ onNext }: { onNext: () => void }) {
  const { servicesStep } = useOnboardingFlow();
  const { selectedServiceIds } = servicesStep;

  const [persisted, setPersisted] = useSessionStorage<PersistedState>(SESSION_KEY, {
    globalRegion: '',
    serviceVars: {},
  });

  const globalRegion = persisted?.globalRegion ?? '';

  const setGlobalRegion = useCallback(
    (region: string) => {
      setPersisted({
        ...(persisted ?? { globalRegion: '', serviceVars: {} }),
        globalRegion: region,
      });
    },
    [persisted, setPersisted]
  );

  const selectedServices: AwsServiceMatrixEntry[] = useMemo(
    () =>
      selectedServiceIds
        .map((id) => AWS_SERVICES_MAP.get(id))
        .filter((s): s is AwsServiceMatrixEntry => s !== undefined),
    [selectedServiceIds]
  );

  const getServiceVars = useCallback(
    (serviceId: string): ServiceVars => {
      const existing = persisted?.serviceVars?.[serviceId];
      if (existing) return existing;
      const service = AWS_SERVICES_MAP.get(serviceId);
      return {
        trigger: service ? getDefaultTransport(service) : null,
        vars: {},
      };
    },
    [persisted]
  );

  const setServiceTransport = useCallback(
    (serviceId: string, transport: TransportType) => {
      const current = getServiceVars(serviceId);
      setPersisted({
        ...(persisted ?? { globalRegion: '', serviceVars: {} }),
        serviceVars: {
          ...(persisted?.serviceVars ?? {}),
          [serviceId]: { ...current, trigger: transport },
        },
      });
    },
    [persisted, setPersisted, getServiceVars]
  );

  const setServiceField = useCallback(
    (serviceId: string, fieldName: string, value: string) => {
      const current = getServiceVars(serviceId);
      setPersisted({
        ...(persisted ?? { globalRegion: '', serviceVars: {} }),
        serviceVars: {
          ...(persisted?.serviceVars ?? {}),
          [serviceId]: { ...current, vars: { ...current.vars, [fieldName]: value } },
        },
      });
    },
    [persisted, setPersisted, getServiceVars]
  );

  // Applies multiple field changes in a single write — avoids stale-closure overwrites
  // when several vars are committed at once (e.g. from the flyout Apply button).
  const setServiceFields = useCallback(
    (serviceId: string, newFields: Record<string, string>) => {
      const current = getServiceVars(serviceId);
      setPersisted({
        ...(persisted ?? { globalRegion: '', serviceVars: {} }),
        serviceVars: {
          ...(persisted?.serviceVars ?? {}),
          [serviceId]: { ...current, vars: { ...current.vars, ...newFields } },
        },
      });
    },
    [persisted, setPersisted, getServiceVars]
  );

  const isReady = useMemo(() => {
    if (!globalRegion.trim()) return false;
    return selectedServices.every((service) => {
      const config = getServiceVars(service.id);
      const inlineFields = getInlineFields(service, config.trigger);
      return inlineFields.every((f) => {
        const meta = FIELD_CONFIG[f];
        if (!meta) return true;
        return (config.vars[f] ?? '').trim() !== '';
      });
    });
  }, [globalRegion, selectedServices, getServiceVars]);

  const handleNext = useCallback(() => {
    if (isReady) onNext();
  }, [isReady, onNext]);

  return {
    globalRegion,
    setGlobalRegion,
    selectedServices,
    getServiceVars,
    setServiceTransport,
    setServiceField,
    setServiceFields,
    isReady,
    handleNext,
  };
}
