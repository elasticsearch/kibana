/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoreStart } from '@kbn/core/public';
import { dynamic } from '@kbn/shared-ux-utility';
import { i18n } from '@kbn/i18n';
import type { ObservabilityOnboardingPluginStartDeps } from '../plugin';

export const registerIngestFlows = (
  core: CoreStart,
  plugins: ObservabilityOnboardingPluginStartDeps
) => {
  const isServerless = Boolean(plugins.cloud?.isServerlessEnabled);

  const deps = {
    core,
    plugins,
    isServerless,
  };

  const KubernetesFlow = dynamic(async () => {
    const [{ createIngestFlowComponent }, { KubernetesOtelPage }] = await Promise.all([
      import('./ingest_flow_wrapper'),
      import('../application/pages/kubernetes_otel'),
    ]);
    return { default: createIngestFlowComponent(deps, KubernetesOtelPage) };
  });

  plugins.ingestHub?.registerIngestFlow({
    id: 'kubernetes',
    title: i18n.translate('xpack.observability_onboarding.ingestHub.kubernetes.title', {
      defaultMessage: 'Kubernetes',
    }),
    description: i18n.translate('xpack.observability_onboarding.ingestHub.kubernetes.description', {
      defaultMessage: 'Monitor your Kubernetes cluster with OpenTelemetry',
    }),
    icon: 'logoKubernetes',
    category: i18n.translate('xpack.observability_onboarding.ingestHub.category.containers', {
      defaultMessage: 'Containers',
    }),
    component: KubernetesFlow,
  });
};
