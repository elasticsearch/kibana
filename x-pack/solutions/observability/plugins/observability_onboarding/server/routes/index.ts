/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { EndpointOf, ServerRouteRepository } from '@kbn/server-route-repository';
import { flowRouteRepository } from './flow/route';
import { kubernetesOnboardingRouteRepository } from './kubernetes/route';
import { firehoseOnboardingRouteRepository } from './firehose/route';
import { otelHostOnboardingRouteRepository } from './otel_host/route';
import { otelApmOnboardingRouteRepository } from './otel_apm/route';
import { cloudforwarderOnboardingRouteRepository } from './cloudforwarder/route';
import { apiEndpointsRouteRepository } from './api_endpoints/route';

function getTypedObservabilityOnboardingServerRouteRepository() {
  const repository = {
    ...flowRouteRepository,
    ...kubernetesOnboardingRouteRepository,
    ...firehoseOnboardingRouteRepository,
    ...otelHostOnboardingRouteRepository,
    ...otelApmOnboardingRouteRepository,
    ...cloudforwarderOnboardingRouteRepository,
    ...apiEndpointsRouteRepository,
  };

  return repository;
}

export const getObservabilityOnboardingServerRouteRepository = (): ServerRouteRepository => {
  return getTypedObservabilityOnboardingServerRouteRepository();
};

export type ObservabilityOnboardingServerRouteRepository = ReturnType<
  typeof getTypedObservabilityOnboardingServerRouteRepository
>;

export type APIEndpoint = EndpointOf<ObservabilityOnboardingServerRouteRepository>;
