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
  EuiButtonIcon,
  EuiCallOut,
  EuiComboBox,
  EuiFieldText,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiFlyoutHeader,
  EuiFormRow,
  EuiSpacer,
  EuiSwitch,
  EuiTitle,
  EuiToolTip,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';

import type { AwsServiceMatrixEntry } from '../../aws_service_matrix';
import type { ServiceVars } from './use_service_settings';
import {
  AWS_REGION_OPTIONS,
  FIELD_CONFIG,
  getFlyoutFields,
  getMandatoryBooleanFields,
} from './field_config';

interface CollectionSettingsFlyoutProps {
  service: AwsServiceMatrixEntry;
  config: ServiceVars;
  globalRegion: string;
  onApply: (fields: Record<string, string>) => void;
  onClose: () => void;
}

const REGION_FIELD_NAMES = new Set(['region', 'region_name', 'aws_region']);

function getRegionFieldName(
  service: AwsServiceMatrixEntry,
  activeTransport: string | null
): string {
  const rc = service.requiredConfig ?? [];
  if (activeTransport === 'aws-s3' && rc.includes('region')) return 'region';
  if (activeTransport === 'aws-cloudwatch' && rc.includes('region_name')) return 'region_name';
  if (rc.includes('aws_region')) return 'aws_region';
  return 'aws_region';
}

export function CollectionSettingsFlyout({
  service,
  config,
  globalRegion,
  onApply,
  onClose,
}: CollectionSettingsFlyoutProps) {
  const flyoutTitleId = useGeneratedHtmlId();
  const [draft, setDraft] = useState<Record<string, string>>({ ...config.vars });

  const [regionsRows, setRegionsRows] = useState<string[]>(() => {
    const parts = (config.vars.regions ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    return parts.length > 0 ? parts : [''];
  });

  const syncRegionsToDraft = (rows: string[]) => {
    setDraft((prev) => ({ ...prev, regions: rows.filter(Boolean).join(',') }));
  };

  const handleRegionRowChange = (index: number, value: string) => {
    const next = regionsRows.map((r, i) => (i === index ? value : r));
    setRegionsRows(next);
    syncRegionsToDraft(next);
  };

  const handleRegionRowAdd = () => setRegionsRows((prev) => [...prev, '']);

  const handleRegionRowRemove = (index: number) => {
    const next = regionsRows.filter((_, i) => i !== index);
    const final = next.length > 0 ? next : [''];
    setRegionsRows(final);
    syncRegionsToDraft(final);
  };

  const flyoutFields = getFlyoutFields(service, config.trigger);
  const regionField = getRegionFieldName(service, config.trigger);
  const otherFlyoutFields = flyoutFields.filter((f) => !REGION_FIELD_NAMES.has(f));
  const mandatoryBoolFields = getMandatoryBooleanFields(service, config.trigger);

  const regionValue = draft[regionField]?.trim() || globalRegion;
  const selectedRegionOption = regionValue ? [{ label: regionValue }] : [];

  const handleRegionChange = (selected: Array<{ label: string }>) => {
    setDraft((prev) => ({ ...prev, [regionField]: selected[0]?.label ?? '' }));
  };

  const handleRegionCreate = (searchValue: string) => {
    setDraft((prev) => ({ ...prev, [regionField]: searchValue }));
  };

  const handleFieldChange = (fieldName: string, value: string) => {
    setDraft((prev) => ({ ...prev, [fieldName]: value }));
  };

  const getBoolValue = (fieldName: string): boolean => {
    if (draft[fieldName] !== undefined) return draft[fieldName] === 'true';
    return FIELD_CONFIG[fieldName]?.defaultValue === true;
  };

  const handleApply = () => {
    onApply(draft);
  };

  return (
    <EuiFlyout size="m" ownFocus onClose={onClose} aria-labelledby={flyoutTitleId}>
      <EuiFlyoutHeader hasBorder>
        <EuiTitle size="m" id={flyoutTitleId}>
          <h2>
            <FormattedMessage
              id="xpack.ingestHub.serviceSettingsStep.flyout.title"
              defaultMessage="Collection settings — {serviceName}"
              values={{ serviceName: service.name }}
            />
          </h2>
        </EuiTitle>
      </EuiFlyoutHeader>
      <EuiFlyoutBody>
        <EuiCallOut
          title={i18n.translate('xpack.ingestHub.serviceSettingsStep.flyout.callout.title', {
            defaultMessage: 'Sensible defaults applied',
          })}
          color="success"
          iconType="checkInCircleFilled"
        >
          <p>
            <FormattedMessage
              id="xpack.ingestHub.serviceSettingsStep.flyout.callout.body"
              defaultMessage="{awsRegion} overrides the global region for this service only."
              values={{ awsRegion: <strong>AWS Region</strong> }}
            />
            {otherFlyoutFields.includes('regions') && (
              <>
                {' '}
                <FormattedMessage
                  id="xpack.ingestHub.serviceSettingsStep.flyout.callout.bodyRegions"
                  defaultMessage="{regions} is an optional filter to restrict collection to specific regions."
                  values={{ regions: <strong>Regions</strong> }}
                />
              </>
            )}
          </p>
        </EuiCallOut>
        <EuiSpacer size="m" />
        <EuiTitle size="xs">
          <h3>
            <FormattedMessage
              id="xpack.ingestHub.serviceSettingsStep.flyout.advancedHeading"
              defaultMessage="ADVANCED COLLECTION SETTINGS"
            />
          </h3>
        </EuiTitle>
        <EuiSpacer size="s" />
        <EuiFormRow
          label={i18n.translate('xpack.ingestHub.serviceSettingsStep.flyout.regionOverride.label', {
            defaultMessage: 'AWS Region (override)',
          })}
          isInvalid={!regionValue.trim()}
        >
          <EuiComboBox
            singleSelection={{ asPlainText: true }}
            options={AWS_REGION_OPTIONS}
            selectedOptions={selectedRegionOption}
            onChange={handleRegionChange}
            onCreateOption={handleRegionCreate}
            isInvalid={!regionValue.trim()}
            customOptionText='Use "{searchValue}" as region'
          />
        </EuiFormRow>
        {otherFlyoutFields.map((fieldName) => {
          const meta = FIELD_CONFIG[fieldName];
          if (!meta) return null;
          if (fieldName === 'regions') {
            return (
              <EuiFormRow key="regions" label={meta.label} helpText={meta.helpText}>
                <div>
                  {regionsRows.map((row, index) => (
                    <EuiFlexGroup
                      key={index}
                      gutterSize="xs"
                      alignItems="center"
                      responsive={false}
                      style={{ marginBottom: 4 }}
                    >
                      <EuiFlexItem>
                        <EuiFieldText
                          compressed
                          value={row}
                          onChange={(e) => handleRegionRowChange(index, e.target.value)}
                          placeholder={meta.placeholder}
                        />
                      </EuiFlexItem>
                      {regionsRows.length > 1 && (
                        <EuiFlexItem grow={false}>
                          <EuiToolTip
                            content={i18n.translate(
                              'xpack.ingestHub.serviceSettingsStep.flyout.regions.removeRow',
                              { defaultMessage: 'Remove region' }
                            )}
                            disableScreenReaderOutput
                          >
                            <EuiButtonIcon
                              iconType="cross"
                              onClick={() => handleRegionRowRemove(index)}
                              aria-label={i18n.translate(
                                'xpack.ingestHub.serviceSettingsStep.flyout.regions.removeRow',
                                { defaultMessage: 'Remove region' }
                              )}
                            />
                          </EuiToolTip>
                        </EuiFlexItem>
                      )}
                    </EuiFlexGroup>
                  ))}
                  <EuiButtonEmpty size="xs" iconType="plusInCircle" onClick={handleRegionRowAdd}>
                    <FormattedMessage
                      id="xpack.ingestHub.serviceSettingsStep.flyout.regions.addRow"
                      defaultMessage="Add region"
                    />
                  </EuiButtonEmpty>
                </div>
              </EuiFormRow>
            );
          }
          return (
            <EuiFormRow key={fieldName} label={meta.label} helpText={meta.helpText}>
              <EuiFieldText
                value={draft[fieldName] ?? ''}
                onChange={(e) => handleFieldChange(fieldName, e.target.value)}
                placeholder={meta.placeholder}
              />
            </EuiFormRow>
          );
        })}
        {mandatoryBoolFields.length > 0 && (
          <>
            <EuiSpacer size="m" />
            {mandatoryBoolFields.map((fieldName) => {
              const meta = FIELD_CONFIG[fieldName];
              if (!meta) return null;
              return (
                <EuiFormRow key={fieldName} display="rowCompressed" helpText={meta.helpText}>
                  <EuiSwitch
                    label={meta.label}
                    checked={getBoolValue(fieldName)}
                    onChange={(e) =>
                      handleFieldChange(fieldName, e.target.checked ? 'true' : 'false')
                    }
                  />
                </EuiFormRow>
              );
            })}
          </>
        )}
      </EuiFlyoutBody>
      <EuiFlyoutFooter>
        <EuiFlexGroup justifyContent="spaceBetween">
          <EuiFlexItem grow={false}>
            <EuiButtonEmpty onClick={onClose} data-test-subj="collectionSettingsFlyout-closeButton">
              <FormattedMessage
                id="xpack.ingestHub.serviceSettingsStep.flyout.closeButton"
                defaultMessage="Close"
              />
            </EuiButtonEmpty>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton fill onClick={handleApply}>
              <FormattedMessage
                id="xpack.ingestHub.serviceSettingsStep.flyout.applyButton"
                defaultMessage="Apply"
              />
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlyoutFooter>
    </EuiFlyout>
  );
}
