/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

import type { AwsServiceMatrixEntry } from '../../aws_service_matrix';

export type TransportType = 'aws-s3' | 'aws-cloudwatch';

export const AWS_REGION_OPTIONS = [
  'ap-southeast-1',
  'ap-southeast-2',
  'eu-west-1',
  'eu-west-2',
  'us-east-1',
  'us-east-2',
  'us-west-1',
  'us-west-2',
].map((r) => ({ label: r }));

export interface FieldMeta {
  label: string;
  placement: 'inline' | 'flyout';
  type?: 'text' | 'boolean';
  defaultValue?: boolean;
  transport?: TransportType;
  placeholder?: string;
  helpText?: string;
}

export const FIELD_CONFIG: Record<string, FieldMeta> = {
  bucket_arn: {
    label: i18n.translate('xpack.ingestHub.serviceSettingsStep.field.bucketArn.label', {
      defaultMessage: 'Bucket ARN',
    }),
    placement: 'inline',
    transport: 'aws-s3',
    placeholder: 'arn:aws:s3:::my-bucket',
  },
  log_group_arn: {
    label: i18n.translate('xpack.ingestHub.serviceSettingsStep.field.logGroupArn.label', {
      defaultMessage: 'Log Group ARN',
    }),
    placement: 'inline',
    transport: 'aws-cloudwatch',
    placeholder: 'arn:aws:logs:us-east-1:123456789012:log-group:my-log-group',
  },
  region: {
    label: i18n.translate('xpack.ingestHub.serviceSettingsStep.field.region.label', {
      defaultMessage: 'AWS Region',
    }),
    placement: 'flyout',
    transport: 'aws-s3',
  },
  region_name: {
    label: i18n.translate('xpack.ingestHub.serviceSettingsStep.field.regionName.label', {
      defaultMessage: 'AWS Region',
    }),
    placement: 'flyout',
    transport: 'aws-cloudwatch',
  },
  aws_region: {
    label: i18n.translate('xpack.ingestHub.serviceSettingsStep.field.awsRegion.label', {
      defaultMessage: 'AWS Region',
    }),
    placement: 'flyout',
  },
  regions: {
    label: i18n.translate('xpack.ingestHub.serviceSettingsStep.field.regions.label', {
      defaultMessage: 'Regions',
    }),
    placement: 'flyout',
    helpText: i18n.translate('xpack.ingestHub.serviceSettingsStep.field.regions.helpText', {
      defaultMessage: 'Optional. Restrict collection to specific AWS regions.',
    }),
    placeholder: 'us-east-1',
  },
  detector_id: {
    label: i18n.translate('xpack.ingestHub.serviceSettingsStep.field.detectorId.label', {
      defaultMessage: 'Detector ID',
    }),
    placement: 'inline',
    placeholder: 'abc123...',
  },
  metrics: {
    label: i18n.translate('xpack.ingestHub.serviceSettingsStep.field.metrics.label', {
      defaultMessage: 'Metrics',
    }),
    placement: 'flyout',
    helpText: i18n.translate('xpack.ingestHub.serviceSettingsStep.field.metrics.helpText', {
      defaultMessage: 'Optional. Specify custom CloudWatch metrics to collect.',
    }),
  },
  // ── Boolean mandatory fields ────────────────────────────────────────────
  preserve_original_event: {
    label: i18n.translate('xpack.ingestHub.serviceSettingsStep.field.preserveOriginalEvent.label', {
      defaultMessage: 'Preserve original event',
    }),
    placement: 'flyout',
    type: 'boolean',
    defaultValue: false,
    helpText: i18n.translate(
      'xpack.ingestHub.serviceSettingsStep.field.preserveOriginalEvent.helpText',
      { defaultMessage: 'Store the raw event in event.original before any transformation.' }
    ),
  },
  collect_s3_logs: {
    label: i18n.translate('xpack.ingestHub.serviceSettingsStep.field.collectS3Logs.label', {
      defaultMessage: 'Collect S3 logs',
    }),
    placement: 'flyout',
    type: 'boolean',
    defaultValue: false,
    transport: 'aws-s3',
    helpText: i18n.translate('xpack.ingestHub.serviceSettingsStep.field.collectS3Logs.helpText', {
      defaultMessage: 'Enable log collection from the S3 bucket.',
    }),
  },
  preserve_duplicate_custom_fields: {
    label: i18n.translate(
      'xpack.ingestHub.serviceSettingsStep.field.preserveDuplicateCustomFields.label',
      { defaultMessage: 'Preserve duplicate custom fields' }
    ),
    placement: 'flyout',
    type: 'boolean',
    defaultValue: false,
    helpText: i18n.translate(
      'xpack.ingestHub.serviceSettingsStep.field.preserveDuplicateCustomFields.helpText',
      {
        defaultMessage:
          'Preserve custom fields that would otherwise be dropped as duplicates of ECS fields.',
      }
    ),
  },
  collect_esm_metrics: {
    label: i18n.translate('xpack.ingestHub.serviceSettingsStep.field.collectEsmMetrics.label', {
      defaultMessage: 'Collect enhanced monitoring metrics',
    }),
    placement: 'flyout',
    type: 'boolean',
    defaultValue: false,
    helpText: i18n.translate(
      'xpack.ingestHub.serviceSettingsStep.field.collectEsmMetrics.helpText',
      { defaultMessage: 'Enable collection of Lambda enhanced monitoring (ESM) metrics.' }
    ),
  },
  leaderelection: {
    label: i18n.translate('xpack.ingestHub.serviceSettingsStep.field.leaderelection.label', {
      defaultMessage: 'Leader election',
    }),
    placement: 'flyout',
    type: 'boolean',
    defaultValue: false,
    helpText: i18n.translate('xpack.ingestHub.serviceSettingsStep.field.leaderelection.helpText', {
      defaultMessage:
        'Enable leader election to avoid duplicate billing data when multiple agents run in the same account.',
    }),
  },
};

export function hasTransportChoice(service: AwsServiceMatrixEntry): boolean {
  const inputs = service.inputs ?? [];
  return inputs.includes('aws-s3') && inputs.includes('aws-cloudwatch');
}

export function getDefaultTransport(
  service: AwsServiceMatrixEntry | undefined
): TransportType | null {
  const inputs = service?.inputs ?? [];
  if (inputs.includes('aws-s3')) return 'aws-s3';
  if (inputs.includes('aws-cloudwatch')) return 'aws-cloudwatch';
  return null;
}

export function getInlineFields(
  service: AwsServiceMatrixEntry,
  activeTransport: TransportType | null
): string[] {
  return (service.requiredConfig ?? []).filter((f) => {
    const meta = FIELD_CONFIG[f];
    if (!meta) return false;
    if (meta.placement !== 'inline') return false;
    if (meta.transport && activeTransport && meta.transport !== activeTransport) return false;
    return true;
  });
}

export function getFlyoutFields(
  service: AwsServiceMatrixEntry,
  activeTransport: TransportType | null
): string[] {
  return (service.requiredConfig ?? []).filter((f) => {
    const meta = FIELD_CONFIG[f];
    if (!meta) return false;
    if (meta.placement !== 'flyout') return false;
    if (meta.transport && activeTransport && meta.transport !== activeTransport) return false;
    return true;
  });
}

export function getMandatoryBooleanFields(
  service: AwsServiceMatrixEntry,
  activeTransport: TransportType | null
): string[] {
  return (service.mandatoryFields ?? []).filter((f) => {
    const meta = FIELD_CONFIG[f];
    if (!meta) return false;
    if (meta.transport && activeTransport && meta.transport !== activeTransport) return false;
    return true;
  });
}
