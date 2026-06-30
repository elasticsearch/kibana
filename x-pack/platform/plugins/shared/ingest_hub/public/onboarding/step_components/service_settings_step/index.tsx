/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useState } from 'react';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiComboBox,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFormRow,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';

import { AWS_REGION_OPTIONS } from './field_config';
import { useServiceSettings } from './use_service_settings';
import { ServiceSettingsCard } from './service_settings_card';
import { CollectionSettingsFlyout } from './collection_settings_flyout';
import type { TransportType } from './field_config';

interface ServiceSettingsStepProps {
  onContinue: () => void;
  onBack?: () => void;
}

export function ServiceSettingsStep({ onContinue, onBack }: ServiceSettingsStepProps) {
  const {
    globalRegion,
    setGlobalRegion,
    selectedServices,
    getServiceVars,
    setServiceTransport,
    setServiceField,
    setServiceFields,
    showValidation,
    handleNext,
  } = useServiceSettings({ onContinue });

  const [activeFlyoutServiceId, setActiveFlyoutServiceId] = useState<string | null>(null);

  const activeFlyoutService = activeFlyoutServiceId
    ? selectedServices.find((s) => s.id === activeFlyoutServiceId) ?? null
    : null;

  const handleTransportChange = (serviceId: string) => (transport: TransportType) => {
    setServiceTransport(serviceId, transport);
  };

  const handleFieldChange = (serviceId: string) => (fieldName: string, value: string) => {
    setServiceField(serviceId, fieldName, value);
  };

  const handleFlyoutApply = (serviceId: string) => (fields: Record<string, string>) => {
    setServiceFields(serviceId, fields);
    setActiveFlyoutServiceId(null);
  };

  const globalRegionOptions = AWS_REGION_OPTIONS;
  const selectedGlobalRegionOption = globalRegion ? [{ label: globalRegion }] : [];

  return (
    <div data-test-subj="onboardingStep-serviceSettings">
      <EuiFlexGroup alignItems="flexStart" gutterSize="l" responsive={false}>
        <EuiFlexItem>
          <EuiTitle size="m">
            <h2>
              <FormattedMessage
                id="xpack.ingestHub.serviceSettingsStep.title"
                defaultMessage="Service settings"
              />
            </h2>
          </EuiTitle>
          <EuiSpacer size="xs" />
          <EuiText size="s" color="subdued">
            <p>
              <FormattedMessage
                id="xpack.ingestHub.serviceSettingsStep.subtitle"
                defaultMessage="Configure each selected service. Click {collectionSettings} on any service to tune optional settings."
                values={{ collectionSettings: <strong>Collection settings</strong> }}
              />
            </p>
          </EuiText>
        </EuiFlexItem>
        <EuiFlexItem grow={false} style={{ minWidth: 260 }}>
          <EuiFormRow
            display="rowCompressed"
            label={i18n.translate('xpack.ingestHub.serviceSettingsStep.globalRegion.label', {
              defaultMessage:
                'Global AWS Region — can be overridden per service in Collection settings',
            })}
            isInvalid={showValidation && !globalRegion.trim()}
            error={
              showValidation && !globalRegion.trim() ? (
                <span data-test-subj="serviceSettingsStep-globalRegionError">
                  {i18n.translate('xpack.ingestHub.serviceSettingsStep.globalRegion.error', {
                    defaultMessage: 'A global region is required.',
                  })}
                </span>
              ) : undefined
            }
          >
            <EuiComboBox
              compressed
              singleSelection={{ asPlainText: true }}
              options={globalRegionOptions}
              selectedOptions={selectedGlobalRegionOption}
              onChange={(selected) => setGlobalRegion(selected[0]?.label ?? '')}
              onCreateOption={(searchValue) => setGlobalRegion(searchValue)}
              isInvalid={showValidation && !globalRegion.trim()}
              customOptionText='Use "{searchValue}" as region'
              placeholder={i18n.translate(
                'xpack.ingestHub.serviceSettingsStep.globalRegion.placeholder',
                { defaultMessage: 'Select or enter a region' }
              )}
            />
          </EuiFormRow>
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiSpacer size="m" />

      {selectedServices.map((service) => {
        const config = getServiceVars(service.id);
        return (
          <React.Fragment key={service.id}>
            <ServiceSettingsCard
              service={service}
              config={config}
              showValidation={showValidation}
              onTransportChange={handleTransportChange(service.id)}
              onFieldChange={handleFieldChange(service.id)}
              onOpenFlyout={() => setActiveFlyoutServiceId(service.id)}
            />
            <EuiSpacer size="s" />
          </React.Fragment>
        );
      })}

      <EuiSpacer size="m" />

      <EuiFlexGroup justifyContent="spaceBetween">
        <EuiFlexItem grow={false}>
          {onBack && (
            <EuiButtonEmpty iconType="arrowLeft" iconSide="left" onClick={onBack}>
              <FormattedMessage
                id="xpack.ingestHub.serviceSettingsStep.backButton"
                defaultMessage="Back"
              />
            </EuiButtonEmpty>
          )}
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <EuiButton fill onClick={handleNext} data-test-subj="serviceSettingsStep-continueButton">
            <FormattedMessage
              id="xpack.ingestHub.serviceSettingsStep.continueButton"
              defaultMessage="Continue"
            />
          </EuiButton>
        </EuiFlexItem>
      </EuiFlexGroup>

      {activeFlyoutService && (
        <CollectionSettingsFlyout
          service={activeFlyoutService}
          config={getServiceVars(activeFlyoutService.id)}
          globalRegion={globalRegion}
          onApply={handleFlyoutApply(activeFlyoutService.id)}
          onClose={() => setActiveFlyoutServiceId(null)}
        />
      )}
    </div>
  );
}
