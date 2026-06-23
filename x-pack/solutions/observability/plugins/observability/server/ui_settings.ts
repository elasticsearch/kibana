/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type { UiSettingsParams } from '@kbn/core/types';
import { i18n } from '@kbn/i18n';
import { observabilityFeatureId, ProgressiveLoadingQuality } from '../common';
import {
  enableComparisonByDefault,
  enableInspectEsQueries,
  maxSuggestions,
  defaultApmServiceEnvironment,
  apmProgressiveLoading,
  apmServiceGroupMaxNumberOfServices,
  apmEnableTableSearchBar,
  apmAWSLambdaPriceFactor,
  apmAWSLambdaRequestCostPerMillion,
  syntheticsThrottlingEnabled,
  enableLegacyUptimeApp,
  profilingShowErrorFrames,
  profilingCo2PerKWH,
  profilingDatacenterPUE,
  profilingPervCPUWattX86,
  profilingPervCPUWattArm64,
  profilingAWSCostDiscountRate,
  profilingCostPervCPUPerHour,
  profilingAzureCostDiscountRate,
  apmEnableTransactionProfiling,
  enableInfrastructureAssetCustomDashboards,
  apmEnableServiceInventoryTableSearchBar,
  searchExcludedDataTiers,
  enableDiagnosticMode,
} from '../common/ui_settings_keys';

/**
 * uiSettings definitions for Observability.
 */
export const uiSettings: Record<string, UiSettingsParams<boolean | number | string | object>> = {
  [enableInspectEsQueries]: {
    category: [observabilityFeatureId],
    name: i18n.translate('xpack.observability.enableInspectEsQueriesExperimentName', {
      defaultMessage: 'Inspect ES queries',
    }),
    value: false,
    description: i18n.translate('xpack.observability.enableInspectEsQueriesExperimentDescription', {
      defaultMessage: 'Inspect Elasticsearch queries in API responses.',
    }),
    schema: schema.boolean(),
    requiresPageReload: true,
    solutionViews: ['classic', 'oblt'],
  },
  [maxSuggestions]: {
    category: [observabilityFeatureId],
    name: i18n.translate('xpack.observability.maxSuggestionsUiSettingName', {
      defaultMessage: 'Maximum suggestions',
    }),
    value: 100,
    description: i18n.translate('xpack.observability.maxSuggestionsUiSettingDescription', {
      defaultMessage: 'Maximum number of suggestions fetched in autocomplete selection boxes.',
    }),
    schema: schema.number(),
    solutionViews: ['classic', 'oblt'],
  },
  [enableComparisonByDefault]: {
    category: [observabilityFeatureId],
    name: i18n.translate('xpack.observability.enableComparisonByDefault', {
      defaultMessage: 'Comparison feature',
    }),
    value: true,
    description: i18n.translate('xpack.observability.enableComparisonByDefaultDescription', {
      defaultMessage:
        'Determines whether the comparison feature is enabled or disabled by default in the APM app.',
    }),
    schema: schema.boolean(),
    solutionViews: ['classic', 'oblt'],
  },
  [defaultApmServiceEnvironment]: {
    category: [observabilityFeatureId],
    sensitive: true,
    name: i18n.translate('xpack.observability.defaultApmServiceEnvironment', {
      defaultMessage: 'Default service environment',
    }),
    description: i18n.translate('xpack.observability.defaultApmServiceEnvironmentDescription', {
      defaultMessage:
        'Set the default environment for the APM app. When left empty, data from all environments will be displayed by default.',
    }),
    value: '',
    schema: schema.string(),
    solutionViews: ['classic', 'oblt'],
  },
  [apmProgressiveLoading]: {
    category: [observabilityFeatureId],
    name: i18n.translate('xpack.observability.apmProgressiveLoading', {
      defaultMessage: 'Use progressive loading of selected APM views',
    }),
    description: i18n.translate('xpack.observability.apmProgressiveLoadingDescription', {
      defaultMessage:
        'Whether to load data progressively for APM views. Data may be requested with a lower sampling rate first, with lower accuracy but faster response times, while the unsampled data loads in the background',
    }),
    value: ProgressiveLoadingQuality.off,
    schema: schema.oneOf([
      schema.literal(ProgressiveLoadingQuality.off),
      schema.literal(ProgressiveLoadingQuality.low),
      schema.literal(ProgressiveLoadingQuality.medium),
      schema.literal(ProgressiveLoadingQuality.high),
    ]),
    requiresPageReload: false,
    type: 'select',
    options: [
      ProgressiveLoadingQuality.off,
      ProgressiveLoadingQuality.low,
      ProgressiveLoadingQuality.medium,
      ProgressiveLoadingQuality.high,
    ],
    optionLabels: {
      [ProgressiveLoadingQuality.off]: i18n.translate(
        'xpack.observability.apmProgressiveLoadingQualityOff',
        {
          defaultMessage: 'Off',
        }
      ),
      [ProgressiveLoadingQuality.low]: i18n.translate(
        'xpack.observability.apmProgressiveLoadingQualityLow',
        {
          defaultMessage: 'Low sampling rate (fastest, least accurate)',
        }
      ),
      [ProgressiveLoadingQuality.medium]: i18n.translate(
        'xpack.observability.apmProgressiveLoadingQualityMedium',
        {
          defaultMessage: 'Medium sampling rate',
        }
      ),
      [ProgressiveLoadingQuality.high]: i18n.translate(
        'xpack.observability.apmProgressiveLoadingQualityHigh',
        {
          defaultMessage: 'High sampling rate (slower, most accurate)',
        }
      ),
    },
    solutionViews: ['classic', 'oblt'],
  },
  [apmServiceGroupMaxNumberOfServices]: {
    category: [observabilityFeatureId],
    name: i18n.translate('xpack.observability.serviceGroupMaxServicesUiSettingName', {
      defaultMessage: 'Maximum services in a service group',
    }),
    value: 500,
    description: i18n.translate('xpack.observability.serviceGroupMaxServicesUiSettingDescription', {
      defaultMessage: 'Limit the number of services in a given service group',
    }),
    schema: schema.number({ min: 1 }),
    solutionViews: ['classic', 'oblt'],
  },
  [enableInfrastructureAssetCustomDashboards]: {
    category: [observabilityFeatureId],
    name: i18n.translate('xpack.observability.enableInfrastructureAssetCustomDashboards', {
      defaultMessage: 'Custom dashboards for asset details in Infrastructure',
    }),
    value: false,
    description: i18n.translate(
      'xpack.observability.enableInfrastructureAssetCustomDashboardsDescription',
      {
        defaultMessage: 'Enable option to link custom dashboards in the asset details view.',
      }
    ),
    schema: schema.boolean(),
    solutionViews: ['classic', 'oblt'],
    technicalPreview: true,
  },
  [apmEnableTableSearchBar]: {
    category: [observabilityFeatureId],
    name: i18n.translate('xpack.observability.apmEnableTableSearchBar', {
      defaultMessage: 'Instant table search',
    }),
    description: i18n.translate('xpack.observability.apmEnableTableSearchBarDescription', {
      defaultMessage:
        'Enables faster searching in APM tables by adding a handy search bar with live filtering. Available for the following tables: Transactions and Errors',
    }),
    schema: schema.boolean(),
    value: true,
    requiresPageReload: true,
    type: 'boolean',
    solutionViews: ['classic', 'oblt'],
    technicalPreview: true,
  },
  [apmEnableServiceInventoryTableSearchBar]: {
    category: [observabilityFeatureId],
    name: i18n.translate('xpack.observability.apmEnableServiceInventoryTableSearchBar', {
      defaultMessage: 'Service inventory instant table search',
    }),
    description: i18n.translate(
      'xpack.observability.apmEnableServiceInventoryTableSearchBarDescription',
      {
        defaultMessage:
          'Enables faster searching in the APM Service inventory table by adding a handy search bar with live filtering.',
      }
    ),
    schema: schema.boolean(),
    value: true,
    requiresPageReload: true,
    type: 'boolean',
    solutionViews: ['classic', 'oblt'],
    technicalPreview: true,
  },
  [apmAWSLambdaPriceFactor]: {
    category: [observabilityFeatureId],
    name: i18n.translate('xpack.observability.apmAWSLambdaPricePerGbSeconds', {
      defaultMessage: 'AWS lambda price factor',
    }),
    type: 'json',
    value: JSON.stringify({ x86_64: 0.0000166667, arm: 0.0000133334 }, null, 2),
    description: i18n.translate('xpack.observability.apmAWSLambdaPricePerGbSecondsDescription', {
      defaultMessage: 'Price per Gb-second.',
    }),
    schema: schema.object({
      arm: schema.number(),
      x86_64: schema.number(),
    }),
    solutionViews: ['classic', 'oblt'],
  },
  [apmAWSLambdaRequestCostPerMillion]: {
    category: [observabilityFeatureId],
    name: i18n.translate('xpack.observability.apmAWSLambdaRequestCostPerMillion', {
      defaultMessage: 'AWS lambda price per 1M requests',
    }),
    value: 0.2,
    schema: schema.number({ min: 0 }),
    solutionViews: ['classic', 'oblt'],
  },
  [syntheticsThrottlingEnabled]: {
    category: [observabilityFeatureId],
    name: i18n.translate('xpack.observability.syntheticsThrottlingEnabledExperimentName', {
      defaultMessage: 'Enable Synthetics throttling',
    }),
    value: false,
    description: i18n.translate(
      'xpack.observability.syntheticsThrottlingEnabledExperimentDescription',
      {
        defaultMessage:
          'Enable the throttling setting in Synthetics monitor configurations. Note that throttling may still not be available for your monitors even if the setting is active. Intended for internal use only. {link}',
        values: {
          link: throttlingDocsLink({
            href: 'https://github.com/elastic/synthetics/blob/main/docs/throttling.md',
          }),
        },
      }
    ),
    schema: schema.boolean(),
    requiresPageReload: true,
    solutionViews: ['classic', 'oblt'],
    technicalPreview: true,
  },
  [enableLegacyUptimeApp]: {
    category: [observabilityFeatureId],
    name: i18n.translate('xpack.observability.enableLegacyUptimeApp', {
      defaultMessage: 'Always show legacy Uptime app',
    }),
    value: false,
    description: i18n.translate('xpack.observability.enableLegacyUptimeAppDescription', {
      defaultMessage:
        "By default, the legacy Uptime app is hidden from the interface when it doesn't have any data for more than a week. Enable this option to always show it.",
    }),
    schema: schema.boolean(),
    requiresPageReload: true,
    solutionViews: ['classic', 'oblt'],
  },
  [profilingShowErrorFrames]: {
    category: [observabilityFeatureId],
    name: i18n.translate('xpack.observability.profilingShowErrorFramesSettingName', {
      defaultMessage: 'Show error frames in the Universal Profiling views',
    }),
    value: false,
    schema: schema.boolean(),
    requiresPageReload: true,
    solutionViews: ['classic', 'oblt'],
  },
  [profilingPervCPUWattX86]: {
    category: [observabilityFeatureId],
    name: i18n.translate('xpack.observability.profilingPervCPUWattX86UiSettingName', {
      defaultMessage: 'Per vCPU Watts - x86',
    }),
    value: 7,
    description: i18n.translate('xpack.observability.profilingPervCPUWattX86UiSettingDescription', {
      defaultMessage: `The average amortized per-core power consumption (based on 100% CPU utilization) for x86 architecture.`,
    }),
    schema: schema.number({ min: 0 }),
    requiresPageReload: true,
    solutionViews: ['classic', 'oblt'],
  },
  [profilingPervCPUWattArm64]: {
    category: [observabilityFeatureId],
    name: i18n.translate('xpack.observability.profilingPervCPUWattArm64UiSettingName', {
      defaultMessage: 'Per vCPU Watts - arm64',
    }),
    value: 2.8,
    description: i18n.translate(
      'xpack.observability.profilingPervCPUWattArm64UiSettingDescription',
      {
        defaultMessage: `The average amortized per-core power consumption (based on 100% CPU utilization) for arm64 architecture.`,
      }
    ),
    schema: schema.number({ min: 0 }),
    requiresPageReload: true,
    solutionViews: ['classic', 'oblt'],
  },
  [profilingDatacenterPUE]: {
    category: [observabilityFeatureId],
    name: i18n.translate('xpack.observability.profilingDatacenterPUEUiSettingName', {
      defaultMessage: 'Data Center PUE',
    }),
    value: 1.7,
    description: i18n.translate('xpack.observability.profilingDatacenterPUEUiSettingDescription', {
      defaultMessage: `Data center power usage effectiveness (PUE) measures how efficiently a data center uses energy. Defaults to 1.7, the average on-premise data center PUE according to the <a>Uptime Institute</a> survey

      You can also use the PUE that corresponds with your cloud provider:
      '<ul style="list-style-type: none;margin-left: 4px;">
        <li><strong>AWS:</strong> 1.135</li>
        <li><strong>GCP:</strong> 1.1</li>
        <li><strong>Azure:</strong> 1.185</li>
      </ul>'
      `,
      values: {
        a: (chunks) =>
          `<a href="https://ela.st/uptimeinstitute" target="_blank" rel="noopener noreferrer">${chunks}</a>`,
      },
    }),
    schema: schema.number({ min: 0 }),
    requiresPageReload: true,
    solutionViews: ['classic', 'oblt'],
  },
  [profilingCo2PerKWH]: {
    category: [observabilityFeatureId],
    name: i18n.translate('xpack.observability.profilingCo2PerKWHUiSettingName', {
      defaultMessage: 'Regional Carbon Intensity (ton/kWh)',
    }),
    value: 0.000379069,
    description: i18n.translate('xpack.observability.profilingCo2PerKWHUiSettingDescription', {
      defaultMessage: `Carbon intensity measures how clean your data center electricity is.
      Specifically, it measures the average amount of CO2 emitted per kilowatt-hour (kWh) of electricity consumed in a particular region.
      Use the cloud carbon footprint {datasheetLink} to update this value according to your region. Defaults to US East (N. Virginia).`,
      values: {
        datasheetLink:
          '<a href="https://ela.st/grid-datasheet" target="_blank" rel="noopener noreferrer">' +
          i18n.translate(
            'xpack.observability.profilingCo2PerKWHUiSettingDescription.datasheetLink',
            { defaultMessage: 'datasheet' }
          ) +
          '</a>',
      },
    }),
    schema: schema.number({ min: 0 }),
    requiresPageReload: true,
    solutionViews: ['classic', 'oblt'],
  },
  [profilingAWSCostDiscountRate]: {
    category: [observabilityFeatureId],
    name: i18n.translate('xpack.observability.profilingAWSCostDiscountRateUiSettingName', {
      defaultMessage: 'AWS EDP discount rate (%)',
    }),
    value: 0,
    schema: schema.number({ min: 0, max: 100 }),
    requiresPageReload: true,
    description: i18n.translate(
      'xpack.observability.profilingAWSCostDiscountRateUiSettingDescription',
      {
        defaultMessage:
          "If you're enrolled in the AWS Enterprise Discount Program (EDP), enter your discount rate to update the profiling cost calculation.",
      }
    ),
    solutionViews: ['classic', 'oblt'],
  },
  [profilingAzureCostDiscountRate]: {
    category: [observabilityFeatureId],
    name: i18n.translate('xpack.observability.profilingAzureCostDiscountRateUiSettingName', {
      defaultMessage: 'Azure discount rate (%)',
    }),
    value: 0,
    schema: schema.number({ min: 0, max: 100 }),
    requiresPageReload: true,
    description: i18n.translate(
      'xpack.observability.profilingAzureCostDiscountRateUiSettingDescription',
      {
        defaultMessage:
          'If you have an Azure Enterprise Agreement with Microsoft, enter your discount rate to update the profiling cost calculation.',
      }
    ),
    solutionViews: ['classic', 'oblt'],
  },
  [profilingCostPervCPUPerHour]: {
    category: [observabilityFeatureId],
    name: i18n.translate('xpack.observability.profilingCostPervCPUPerHourUiSettingName', {
      defaultMessage: 'Cost per vCPU per hour ($)',
    }),
    value: 0.0425,
    description: i18n.translate(
      'xpack.observability.profilingCostPervCPUPerHourUiSettingNameDescription',
      {
        defaultMessage: `Default Hourly Cost per CPU Core for machines not on AWS or Azure`,
      }
    ),
    schema: schema.number({ min: 0, max: 100 }),
    requiresPageReload: true,
    solutionViews: ['classic', 'oblt'],
  },
  [apmEnableTransactionProfiling]: {
    category: [observabilityFeatureId],
    name: i18n.translate('xpack.observability.apmEnableTransactionProfiling', {
      defaultMessage: 'Enable Universal Profiling on Transaction view',
    }),
    value: true,
    schema: schema.boolean(),
    requiresPageReload: true,
    solutionViews: ['classic', 'oblt'],
  },
  [searchExcludedDataTiers]: {
    category: [observabilityFeatureId],
    name: i18n.translate('xpack.observability.searchExcludedDataTiers', {
      defaultMessage: 'Excluded data tiers from search',
    }),
    description: i18n.translate(
      'xpack.observability.advancedSettings.searchExcludedDataTiersDesc',
      {
        defaultMessage: `Specify the data tiers to exclude from search, such as data_cold and/or data_frozen.
        When configured, indices allocated in the selected tiers will be ignored from search requests. Affected apps: APM, Infrastructure, Synthetics`,
      }
    ),
    value: [],
    schema: schema.arrayOf(
      schema.oneOf([schema.literal('data_cold'), schema.literal('data_frozen')]),
      { maxSize: 2 }
    ),
    requiresPageReload: false,
    solutionViews: ['classic', 'oblt'],
    technicalPreview: true,
  },
  [enableDiagnosticMode]: {
    category: [observabilityFeatureId],
    name: i18n.translate('xpack.observability.enableDiagnosticMode', {
      defaultMessage: 'Enable diagnostic mode',
    }),
    value: false,
    description: i18n.translate('xpack.observability.enableDiagnosticModeDescription', {
      defaultMessage:
        'Enable diagnostic mode for debugging and troubleshooting capabilities. Currently available only in the Service map view.',
    }),
    schema: schema.boolean(),
    requiresPageReload: false,
    solutionViews: ['classic', 'oblt'],
    technicalPreview: true,
  },
};

function throttlingDocsLink({ href }: { href: string }) {
  return `<a href="${href}" target="_blank" rel="noopener noreferrer">${i18n.translate(
    'xpack.observability.uiSettings.throttlingDocsLinkText',
    { defaultMessage: 'read notice here.' }
  )}</a>`;
}
