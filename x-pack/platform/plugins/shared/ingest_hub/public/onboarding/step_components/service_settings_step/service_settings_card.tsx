/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiButtonEmpty,
  EuiButtonGroup,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiPanel,
  EuiSpacer,
  EuiText,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';

import type { AwsServiceMatrixEntry } from '../../aws_service_matrix';
import type { ServiceVars } from './use_service_settings';
import type { TransportType } from './field_config';
import { FIELD_CONFIG, getInlineFields, hasTransportChoice } from './field_config';
import { SignalTypeBadge } from '../services_step/signal_type_badge';

interface ServiceSettingsCardProps {
  service: AwsServiceMatrixEntry;
  config: ServiceVars;
  showValidation: boolean;
  onTransportChange: (transport: TransportType) => void;
  onFieldChange: (fieldName: string, value: string) => void;
  onOpenFlyout: () => void;
}

const TRANSPORT_OPTIONS = [
  {
    id: 'aws-s3' as TransportType,
    label: i18n.translate('xpack.ingestHub.serviceSettingsStep.card.transport.s3', {
      defaultMessage: 'S3',
    }),
  },
  {
    id: 'aws-cloudwatch' as TransportType,
    label: i18n.translate('xpack.ingestHub.serviceSettingsStep.card.transport.cloudwatch', {
      defaultMessage: 'CloudWatch',
    }),
  },
];

export function ServiceSettingsCard({
  service,
  config,
  showValidation,
  onTransportChange,
  onFieldChange,
  onOpenFlyout,
}: ServiceSettingsCardProps) {
  const hasTransport = hasTransportChoice(service);
  const inlineFields = getInlineFields(service, config.trigger);
  const hasFlyoutFields = true; // every service has at least the region override

  const hasEmptyInlineFields = inlineFields.some((f) => (config.vars[f] ?? '').trim() === '');

  function getFieldLabel(fieldName: string): string {
    const meta = FIELD_CONFIG[fieldName];
    if (!meta) return fieldName;
    if (!hasTransport || !meta.transport) return meta.label;
    if (meta.transport === 'aws-s3') {
      return i18n.translate('xpack.ingestHub.serviceSettingsStep.card.field.s3Prefix', {
        defaultMessage: '[S3] {label}',
        values: { label: meta.label },
      });
    }
    return i18n.translate('xpack.ingestHub.serviceSettingsStep.card.field.cwPrefix', {
      defaultMessage: '[CloudWatch] {label}',
      values: { label: meta.label },
    });
  }

  return (
    <EuiPanel hasBorder paddingSize="s">
      <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiText size="s">
            <b>{service.name}</b>
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <SignalTypeBadge signalType={service.signalType} />
        </EuiFlexItem>
        {hasTransport && (
          <EuiFlexItem grow={false}>
            <EuiButtonGroup
              legend={i18n.translate('xpack.ingestHub.serviceSettingsStep.card.transportLegend', {
                defaultMessage: 'Transport type',
              })}
              options={TRANSPORT_OPTIONS}
              idSelected={config.trigger ?? 'aws-s3'}
              onChange={(id) => onTransportChange(id as TransportType)}
              buttonSize="compressed"
              color="primary"
            />
          </EuiFlexItem>
        )}
        <EuiFlexItem />
        {hasFlyoutFields && (
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty size="s" onClick={onOpenFlyout} iconType="arrowRight" iconSide="right">
              <FormattedMessage
                id="xpack.ingestHub.serviceSettingsStep.card.collectionSettingsButton"
                defaultMessage="Collection settings"
              />
            </EuiButtonEmpty>
          </EuiFlexItem>
        )}
      </EuiFlexGroup>

      {showValidation && hasEmptyInlineFields && (
        <>
          <EuiSpacer size="s" />
          <EuiText
            size="xs"
            color="danger"
            data-test-subj="serviceSettingsStep-cardValidationMessage"
          >
            <p>
              <FormattedMessage
                id="xpack.ingestHub.serviceSettingsStep.card.validationMessage"
                defaultMessage="Complete the required fields below before continuing."
              />
            </p>
          </EuiText>
        </>
      )}

      {inlineFields.length > 0 && <EuiSpacer size="xs" />}

      {inlineFields.map((fieldName) => {
        const meta = FIELD_CONFIG[fieldName];
        if (!meta) return null;
        const value = config.vars[fieldName] ?? '';
        const isInvalid = showValidation && value.trim() === '';
        return (
          <EuiFormRow
            key={fieldName}
            display="rowCompressed"
            label={getFieldLabel(fieldName)}
            isInvalid={isInvalid}
          >
            <EuiFieldText
              compressed
              value={value}
              onChange={(e) => onFieldChange(fieldName, e.target.value)}
              placeholder={meta.placeholder}
              isInvalid={isInvalid}
            />
          </EuiFormRow>
        );
      })}
    </EuiPanel>
  );
}
