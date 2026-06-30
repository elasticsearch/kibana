/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import { i18n } from '@kbn/i18n';
import React from 'react';
import { EuiFlexItem, useEuiTheme } from '@elastic/eui';
import { reactRouterNavigate, useKibana } from '@kbn/kibana-react-plugin/public';
import type { IntegrationCardItem } from '@kbn/fleet-plugin/public';
import { useHistory } from 'react-router-dom';
import { useLocation } from 'react-router-dom-v5-compat';
import { syntheticsAddMonitorLocatorID } from '@kbn/observability-plugin/common';
import {
  INGEST_HUB_ONBOARDING_ENABLED_FLAG,
  AWS_ONBOARDING_TITLE,
  AWS_ONBOARDING_DESCRIPTION,
} from '@kbn/ingest-hub-plugin/common';
import { ObservabilityOnboardingPricingFeature } from '../../../common/pricing_features';
import type { ObservabilityOnboardingAppServices } from '../..';
import { LogoIcon } from '../shared/logo_icon';
import { usePricingFeature } from '../quickstart_flows/shared/use_pricing_feature';
import { useManagedOtlpServiceAvailability } from '../shared/use_managed_otlp_service_availability';
import { buildKubernetesRoutePath } from '../shared/build_kubernetes_route';

export const AWS_CLOUDWATCH_OTEL_CARD_ID = 'aws-cloudwatch-otel-virtual';

export function useCustomCards(
  createCollectionCardHandler: (query: string) => () => void
): IntegrationCardItem[] {
  const history = useHistory();
  const location = useLocation();
  const {
    services: {
      application,
      http,
      featureFlags,
      context: { isServerless, isCloud, isDev },
      share,
    },
  } = useKibana<ObservabilityOnboardingAppServices>();
  const { colorMode } = useEuiTheme();

  const getUrlForApp = application?.getUrlForApp;
  const metricsOnboardingEnabled = usePricingFeature(
    ObservabilityOnboardingPricingFeature.METRICS_ONBOARDING
  );
  const isManagedOtlpServiceAvailable = useManagedOtlpServiceAvailability();
  const isIngestHubOnboardingEnabled = featureFlags.getBooleanValue(
    INGEST_HUB_ONBOARDING_ENABLED_FLAG,
    false
  );

  const { href: autoDetectUrl } = reactRouterNavigate(history, `/auto-detect/${location.search}`);
  const { href: otelLogsUrl } = reactRouterNavigate(history, `/otel-logs/${location.search}`);
  const { href: otelKubernetesUrl } = reactRouterNavigate(
    history,
    buildKubernetesRoutePath(location.search)
  );
  const { href: firehoseUrl } = reactRouterNavigate(history, `/firehose/${location.search}`);
  const { href: otelApmQuickstartUrl } = reactRouterNavigate(
    history,
    `/otel-apm/${location.search}`
  );
  const { href: cloudforwarderUrl } = reactRouterNavigate(
    history,
    `/cloudforwarder/${location.search}`
  );
  const { href: awsCloudwatchOtelUrl } = reactRouterNavigate(history, `/aws${location.search}`);

  const apmUrl = `${getUrlForApp?.('apm')}/${isServerless ? 'onboarding' : 'tutorial'}`;
  const otelApmUrl = isManagedOtlpServiceAvailable ? otelApmQuickstartUrl : apmUrl;
  const syntheticsLocator = share?.url.locators.get(syntheticsAddMonitorLocatorID);

  const firehoseQuickstartCard: IntegrationCardItem = {
    id: 'firehose-quick-start',
    name: 'firehose-quick-start',
    type: 'virtual',
    title: i18n.translate('xpack.observability_onboarding.packageList.uploadFileTitle', {
      defaultMessage: 'AWS Firehose',
    }),
    description: metricsOnboardingEnabled
      ? i18n.translate('xpack.observability_onboarding.packageList.uploadFileDescription', {
          defaultMessage: 'Collect logs and metrics from Amazon Web Services (AWS).',
        })
      : i18n.translate(
          'xpack.observability_onboarding.logsEssential.packageList.uploadFileDescription',
          {
            defaultMessage: 'Collect logs from Amazon Web Services (AWS).',
          }
        ),
    categories: ['observability'],
    icons: [
      {
        type: 'svg',
        src: 'https://epr.elastic.co/package/awsfirehose/1.1.0/img/logo_firehose.svg',
      },
    ],
    url: firehoseUrl,
    version: '',
    integration: '',
    isQuickstart: true,
  };

  const cloudforwarderQuickstartCard: IntegrationCardItem = {
    id: 'cloudforwarder-quick-start',
    name: 'cloudforwarder-quick-start',
    type: 'virtual',
    title: i18n.translate('xpack.observability_onboarding.packageList.cloudforwarderTitle', {
      defaultMessage: 'EDOT Cloud Forwarder',
    }),
    description: i18n.translate(
      'xpack.observability_onboarding.packageList.cloudforwarderDescription',
      {
        defaultMessage:
          'Forward logs from AWS S3 to Elastic using the EDOT Cloud Forwarder, running as a Lambda function.',
      }
    ),
    categories: ['observability'],
    icons: [
      {
        type: 'svg',
        src: http?.staticAssets.getPluginAssetHref('opentelemetry.svg') ?? '',
      },
    ],
    url: cloudforwarderUrl,
    version: '',
    integration: '',
    isQuickstart: true,
  };

  return [
    {
      id: 'auto-detect-logs',
      name: 'auto-detect-logs-virtual',
      type: 'virtual',
      title: metricsOnboardingEnabled
        ? i18n.translate(
            'xpack.observability_onboarding.useCustomCardsForCategory.autoDetectTitle',
            {
              defaultMessage: 'Elastic Agent: Logs & Metrics',
            }
          )
        : i18n.translate(
            'xpack.observability_onboarding.logsEssential.useCustomCardsForCategory.autoDetectTitle',
            {
              defaultMessage: 'Elastic Agent: Logs',
            }
          ),
      description: metricsOnboardingEnabled
        ? i18n.translate(
            'xpack.observability_onboarding.useCustomCardsForCategory.autoDetectDescription',
            {
              defaultMessage: 'Scan your host for log files, metrics, auto-install integrations',
            }
          )
        : i18n.translate(
            'xpack.observability_onboarding.logsEssential.useCustomCardsForCategory.autoDetectDescription',
            {
              defaultMessage: 'Scan your host for log files and auto-install integrations',
            }
          ),
      extraLabelsBadges: [
        <ExtraLabelBadgeWrapper>
          {colorMode === 'DARK' ? (
            <LogoIcon logo="apple_white" size="m" />
          ) : (
            <LogoIcon logo="apple_black" size="m" />
          )}
        </ExtraLabelBadgeWrapper>,
        <ExtraLabelBadgeWrapper>
          <LogoIcon logo="linux" size="m" />
        </ExtraLabelBadgeWrapper>,
      ],
      categories: ['observability'],
      icons: [
        {
          type: 'eui',
          src: 'agentApp',
        },
      ],
      url: autoDetectUrl,
      version: '',
      integration: '',
      isQuickstart: true,
    },
    {
      id: 'otel-logs',
      name: 'custom-logs-virtual',
      type: 'virtual',
      title: metricsOnboardingEnabled
        ? i18n.translate('xpack.observability_onboarding.useCustomCardsForCategory.logsOtelTitle', {
            defaultMessage: 'OpenTelemetry: Logs & Metrics',
          })
        : i18n.translate(
            'xpack.observability_onboarding.logsEssential.useCustomCardsForCategory.logsOtelTitle',
            {
              defaultMessage: 'OpenTelemetry: Logs',
            }
          ),
      description: metricsOnboardingEnabled
        ? i18n.translate(
            'xpack.observability_onboarding.useCustomCardsForCategory.logsOtelDescription',
            {
              defaultMessage:
                'Collect logs and host metrics with the Elastic Distro for OTel Collector',
            }
          )
        : i18n.translate(
            'xpack.observability_onboarding.logsEssential.useCustomCardsForCategory.logsOtelDescription',
            {
              defaultMessage: 'Collect logs with the Elastic Distro for OTel Collector',
            }
          ),
      extraLabelsBadges: [
        <ExtraLabelBadgeWrapper>
          {colorMode === 'DARK' ? (
            <LogoIcon logo="apple_white" size="m" />
          ) : (
            <LogoIcon logo="apple_black" size="m" />
          )}
        </ExtraLabelBadgeWrapper>,
        <ExtraLabelBadgeWrapper>
          <LogoIcon logo="linux" size="m" />
        </ExtraLabelBadgeWrapper>,
      ],
      categories: ['observability'],
      icons: [
        {
          type: 'svg',
          src: http?.staticAssets.getPluginAssetHref('opentelemetry.svg') ?? '',
        },
      ],
      url: otelLogsUrl,
      version: '',
      integration: '',
      isQuickstart: true,
    },
    {
      id: 'otel-kubernetes',
      name: 'otel-kubernetes-virtual',
      type: 'virtual',
      title: metricsOnboardingEnabled
        ? i18n.translate(
            'xpack.observability_onboarding.useCustomCardsForCategory.kubernetesOtelTitle',
            {
              defaultMessage: 'OpenTelemetry: Full Observability',
            }
          )
        : i18n.translate(
            'xpack.observability_onboarding.logsEssential.useCustomCardsForCategory.kubernetesOtelTitle',
            {
              defaultMessage: 'OpenTelemetry: Logs',
            }
          ),
      description: metricsOnboardingEnabled
        ? i18n.translate(
            'xpack.observability_onboarding.useCustomCardsForCategory.kubernetesOtelDescription',
            {
              defaultMessage:
                'Collect logs, traces and metrics with the Elastic Distro for OTel Collector',
            }
          )
        : i18n.translate(
            'xpack.observability_onboarding.logsEssential.useCustomCardsForCategory.kubernetesOtelDescription',
            {
              defaultMessage: 'Collect logs with the Elastic Distro for OTel Collector',
            }
          ),
      extraLabelsBadges: [
        <ExtraLabelBadgeWrapper>
          <LogoIcon logo="kubernetes" size="m" />
        </ExtraLabelBadgeWrapper>,
      ],
      categories: ['observability'],
      icons: [
        {
          type: 'svg',
          src: http?.staticAssets.getPluginAssetHref('opentelemetry.svg') ?? '',
        },
      ],
      url: otelKubernetesUrl,
      version: '',
      integration: '',
      isQuickstart: true,
    },
    {
      id: 'otel-virtual',
      type: 'virtual',
      title: i18n.translate(
        'xpack.observability_onboarding.useCustomCardsForCategory.apmOtelTitle',
        {
          defaultMessage: 'OpenTelemetry',
        }
      ),
      description: i18n.translate(
        'xpack.observability_onboarding.useCustomCardsForCategory.apmOtelDescription',
        {
          defaultMessage: 'Monitor your applications with OpenTelemetry SDK',
        }
      ),
      name: 'otel',
      categories: ['observability'],
      icons: [
        {
          type: 'svg',
          src: http?.staticAssets.getPluginAssetHref('opentelemetry.svg') ?? '',
        },
      ],
      url: otelApmUrl,
      version: '',
      integration: '',
    },
    {
      id: 'apm-virtual',
      type: 'virtual',
      title: i18n.translate('xpack.observability_onboarding.useCustomCardsForCategory.apmTitle', {
        defaultMessage: 'Elastic APM',
      }),
      description: i18n.translate(
        'xpack.observability_onboarding.useCustomCardsForCategory.apmDescription',
        {
          defaultMessage: 'Collect distributed traces from your applications with Elastic APM',
        }
      ),
      name: 'apm',
      categories: ['observability'],
      icons: [
        {
          type: 'eui',
          src: 'apmApp',
        },
      ],
      url: apmUrl,
      version: '',
      integration: '',
    },
    {
      id: 'synthetics-virtual',
      type: 'virtual',
      title: i18n.translate(
        'xpack.observability_onboarding.useCustomCardsForCategory.syntheticsTitle',
        {
          defaultMessage: 'Synthetic monitor',
        }
      ),
      description: i18n.translate(
        'xpack.observability_onboarding.useCustomCardsForCategory.syntheticsDescription',
        {
          defaultMessage: 'Monitor endpoints, pages, and user journeys',
        }
      ),
      name: 'synthetics',
      categories: ['observability'],
      icons: [
        {
          type: 'eui',
          src: 'logoUptime',
        },
      ],
      url:
        syntheticsLocator?.getRedirectUrl({
          scope: 'create',
        }) ?? '',
      version: '',
      integration: '',
    },
    {
      id: 'azure-logs-virtual',
      type: 'virtual',
      title: i18n.translate('xpack.observability_onboarding.useCustomCardsForCategory.azureTitle', {
        defaultMessage: 'Azure',
      }),
      description: i18n.translate(
        'xpack.observability_onboarding.useCustomCardsForCategory.azureDescription',
        {
          defaultMessage: 'Collect logs from Microsoft Azure',
        }
      ),
      name: 'azure',
      categories: ['observability'],
      icons: [],
      url: 'https://azure.com',
      version: '',
      integration: '',
      isCollectionCard: true,
      onCardClick: createCollectionCardHandler('azure'),
    },
    {
      id: AWS_CLOUDWATCH_OTEL_CARD_ID,
      name: 'aws-cloudwatch-otel',
      type: 'virtual',
      title: i18n.translate(
        'xpack.observability_onboarding.useCustomCardsForCategory.awsCloudwatchOtelTitle',
        { defaultMessage: 'AWS' }
      ),
      description: i18n.translate(
        'xpack.observability_onboarding.useCustomCardsForCategory.awsCloudwatchOtelDescription',
        {
          defaultMessage: 'Collect signals from AWS with OpenTelemetry',
        }
      ),
      categories: ['observability'],
      icons: [
        {
          type: 'eui',
          src: 'logoAWS',
        },
      ],
      url: awsCloudwatchOtelUrl,
      version: '',
      integration: '',
      isQuickstart: true,
    },
    ...(isIngestHubOnboardingEnabled
      ? [
          {
            id: 'aws-logs-virtual',
            type: 'virtual',
            title: AWS_ONBOARDING_TITLE,
            description: AWS_ONBOARDING_DESCRIPTION,
            name: 'aws',
            categories: ['observability'],
            icons: [{ type: 'eui' as const, src: 'logoAWS' }],
            url: getUrlForApp?.('onboarding', { path: '/aws' }) ?? '',
            version: '',
            integration: 'aws',
            isCollectionCard: false,
            onCardClick: () => {
              application?.navigateToApp('onboarding', { path: '/aws' });
            },
          } satisfies IntegrationCardItem,
        ]
      : [
          {
            id: 'aws-logs-virtual',
            type: 'virtual',
            title: i18n.translate(
              'xpack.observability_onboarding.useCustomCardsForCategory.awsTitle',
              { defaultMessage: 'AWS collection' }
            ),
            description: i18n.translate(
              'xpack.observability_onboarding.useCustomCardsForCategory.awsDescription',
              { defaultMessage: 'Collect logs from Amazon Web Services (AWS)' }
            ),
            name: 'aws',
            categories: ['observability'],
            icons: [],
            url: 'https://aws.com',
            version: '',
            integration: '',
            isCollectionCard: true,
            onCardClick: createCollectionCardHandler('aws'),
          } as IntegrationCardItem,
        ]),
    {
      id: 'gcp-logs-virtual',
      type: 'virtual',
      title: i18n.translate('xpack.observability_onboarding.useCustomCardsForCategory.gcpTitle', {
        defaultMessage: 'Google Cloud Platform',
      }),
      description: i18n.translate(
        'xpack.observability_onboarding.useCustomCardsForCategory.gcpDescription',
        {
          defaultMessage: 'Collect logs from Google Cloud Platform',
        }
      ),
      name: 'gcp',
      categories: ['observability'],
      icons: [],
      url: '',
      version: '',
      integration: '',
      isCollectionCard: true,
      onCardClick: createCollectionCardHandler('gcp'),
    },
    {
      id: 'upload-file-virtual',
      type: 'virtual',
      title: i18n.translate('xpack.observability_onboarding.packageList.uploadFileTitle', {
        defaultMessage: 'Upload a file',
      }),
      description: i18n.translate(
        'xpack.observability_onboarding.packageList.uploadFileDescription',
        {
          defaultMessage:
            'Upload data from a CSV, TSV, JSON or other log file to Elasticsearch for analysis.',
        }
      ),
      name: 'upload-file',
      categories: ['observability'],
      icons: [
        {
          type: 'eui',
          src: 'addDataApp',
        },
      ],
      url: `${getUrlForApp?.('home')}#/tutorial_directory/fileDataViz`,
      version: '',
      integration: '',
      isCollectionCard: false,
    },
    /**
     * The new Firehose card should only be visible on Cloud
     * as Firehose integration requires additional proxy,
     * which is not available for on-prem customers.
     * Also visible in dev mode for local development.
     * Hidden when the new AWS onboarding flow is enabled.
     */
    ...((isCloud || isDev) && !isIngestHubOnboardingEnabled ? [firehoseQuickstartCard] : []),
    /**
     * The EDOT Cloud Forwarder card should only be visible on Serverless
     * as it requires Elastic Cloud infrastructure.
     * Also visible in dev mode for local development.
     * Hidden when the new AWS onboarding flow is enabled.
     */
    ...((isServerless || isDev) && !isIngestHubOnboardingEnabled
      ? [cloudforwarderQuickstartCard]
      : []),
  ];
}

function ExtraLabelBadgeWrapper({ children }: { children: React.ReactNode }) {
  return (
    <EuiFlexItem grow={false} css={{ alignSelf: 'center' }}>
      {children}
    </EuiFlexItem>
  );
}
