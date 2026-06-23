/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';
import type { SupportedLogo } from '../shared/logo_icon';

export type IntegrationCategoryId = 'cloud' | 'containers' | 'host' | 'applications';

export interface IntegrationTileData {
  id: string;
  title: string;
  description: string;
  logo: SupportedLogo;
  darkLogo?: SupportedLogo;
  route?: string;
}

export interface IntegrationCategory {
  id: IntegrationCategoryId;
  label: string;
  tiles: readonly IntegrationTileData[];
}

export const INTEGRATION_TILES: readonly IntegrationCategory[] = [
  {
    id: 'cloud',
    label: i18n.translate('xpack.observability_onboarding.integrationsGrid.category.cloudLabel', {
      defaultMessage: 'Cloud',
    }),
    tiles: [
      {
        id: 'aws',
        title: i18n.translate('xpack.observability_onboarding.integrationsGrid.tile.aws.title', {
          defaultMessage: 'Amazon Web Services',
        }),
        description: i18n.translate(
          'xpack.observability_onboarding.integrationsGrid.tile.aws.description',
          { defaultMessage: 'Collect logs and metrics from AWS services.' }
        ),
        logo: 'aws',
      },
      {
        id: 'gcp',
        title: i18n.translate('xpack.observability_onboarding.integrationsGrid.tile.gcp.title', {
          defaultMessage: 'Google Cloud Platform',
        }),
        description: i18n.translate(
          'xpack.observability_onboarding.integrationsGrid.tile.gcp.description',
          { defaultMessage: 'Monitor Google Cloud operations and resources.' }
        ),
        logo: 'gcp',
      },
      {
        id: 'azure',
        title: i18n.translate('xpack.observability_onboarding.integrationsGrid.tile.azure.title', {
          defaultMessage: 'Azure',
        }),
        description: i18n.translate(
          'xpack.observability_onboarding.integrationsGrid.tile.azure.description',
          { defaultMessage: 'Centralize Azure monitoring and alerting.' }
        ),
        logo: 'azure',
      },
    ],
  },
  {
    id: 'containers',
    label: i18n.translate(
      'xpack.observability_onboarding.integrationsGrid.category.containersLabel',
      { defaultMessage: 'Containers' }
    ),
    tiles: [
      {
        id: 'kubernetes',
        title: i18n.translate(
          'xpack.observability_onboarding.integrationsGrid.tile.kubernetes.title',
          { defaultMessage: 'Kubernetes' }
        ),
        description: i18n.translate(
          'xpack.observability_onboarding.integrationsGrid.tile.kubernetes.description',
          { defaultMessage: 'Monitor pod health, resources, and deployments.' }
        ),
        logo: 'kubernetes',
        route: '/kubernetes',
      },
      {
        id: 'docker',
        title: i18n.translate('xpack.observability_onboarding.integrationsGrid.tile.docker.title', {
          defaultMessage: 'Docker',
        }),
        description: i18n.translate(
          'xpack.observability_onboarding.integrationsGrid.tile.docker.description',
          { defaultMessage: 'Collect container logs and metrics.' }
        ),
        logo: 'docker',
      },
      {
        id: 'aws_ecs',
        title: i18n.translate('xpack.observability_onboarding.integrationsGrid.tile.awsEcs.title', {
          defaultMessage: 'Amazon ECS',
        }),
        description: i18n.translate(
          'xpack.observability_onboarding.integrationsGrid.tile.awsEcs.description',
          { defaultMessage: 'Track ECS and Fargate task metrics.' }
        ),
        logo: 'aws_ecs',
      },
    ],
  },
  {
    id: 'host',
    label: i18n.translate('xpack.observability_onboarding.integrationsGrid.category.hostLabel', {
      defaultMessage: 'Host',
    }),
    tiles: [
      {
        id: 'linux',
        title: i18n.translate('xpack.observability_onboarding.integrationsGrid.tile.linux.title', {
          defaultMessage: 'Linux',
        }),
        description: i18n.translate(
          'xpack.observability_onboarding.integrationsGrid.tile.linux.description',
          { defaultMessage: 'Collect system metrics and logs from Linux servers.' }
        ),
        logo: 'linux',
        route: '/host/linux',
      },
      {
        id: 'windows',
        title: i18n.translate(
          'xpack.observability_onboarding.integrationsGrid.tile.windows.title',
          { defaultMessage: 'Windows' }
        ),
        description: i18n.translate(
          'xpack.observability_onboarding.integrationsGrid.tile.windows.description',
          { defaultMessage: 'Monitor event logs and performance counters.' }
        ),
        logo: 'windows',
        route: '/host/windows',
      },
      {
        id: 'macos',
        title: i18n.translate('xpack.observability_onboarding.integrationsGrid.tile.macos.title', {
          defaultMessage: 'macOS',
        }),
        description: i18n.translate(
          'xpack.observability_onboarding.integrationsGrid.tile.macos.description',
          { defaultMessage: 'Collect logs and metrics from macOS endpoints.' }
        ),
        logo: 'apple_black',
        darkLogo: 'apple_white',
        route: '/host/macos',
      },
    ],
  },
  {
    id: 'applications',
    label: i18n.translate(
      'xpack.observability_onboarding.integrationsGrid.category.applicationsLabel',
      { defaultMessage: 'Applications' }
    ),
    tiles: [
      {
        id: 'opentelemetry',
        title: i18n.translate(
          'xpack.observability_onboarding.integrationsGrid.tile.opentelemetry.title',
          { defaultMessage: 'OpenTelemetry' }
        ),
        description: i18n.translate(
          'xpack.observability_onboarding.integrationsGrid.tile.opentelemetry.description',
          { defaultMessage: 'Send traces, metrics, and logs via OTel SDK.' }
        ),
        logo: 'opentelemetry',
      },
      {
        id: 'prometheus',
        title: i18n.translate(
          'xpack.observability_onboarding.integrationsGrid.tile.prometheus.title',
          { defaultMessage: 'Prometheus' }
        ),
        description: i18n.translate(
          'xpack.observability_onboarding.integrationsGrid.tile.prometheus.description',
          { defaultMessage: 'Scrape and visualize Prometheus metrics.' }
        ),
        logo: 'prometheus',
      },
      {
        id: 'fluentbit',
        title: i18n.translate(
          'xpack.observability_onboarding.integrationsGrid.tile.fluentbit.title',
          { defaultMessage: 'Fluent Bit' }
        ),
        description: i18n.translate(
          'xpack.observability_onboarding.integrationsGrid.tile.fluentbit.description',
          { defaultMessage: 'Forward logs from any source via Fluent Bit.' }
        ),
        logo: 'fluentbit',
      },
    ],
  },
] as const;
