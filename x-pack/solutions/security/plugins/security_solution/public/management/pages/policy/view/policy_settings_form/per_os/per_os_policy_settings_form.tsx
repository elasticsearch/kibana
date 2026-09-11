/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { PropsWithChildren } from 'react';
import React, { memo, useCallback, useState } from 'react';
import { EuiSpacer, EuiText } from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { updateAntivirusRegistrationEnabled } from '../../../../../../../common/endpoint/utils/update_antivirus_registration_enabled';
import { useIsExperimentalFeatureEnabled } from '../../../../../../common/hooks/use_experimental_features';
import { useKibana } from '../../../../../../common/lib/kibana';
import { useTestIdGenerator } from '../../../../../hooks/use_test_id_generator';
import { AdvancedSection } from '../components/advanced_section';
import { EventMergingBanner } from '../components/event_merging_banner';
import { RelatedDetectionRulesCallout } from '../components/related_detection_rules_callout';
import { useGetProtectionsUnavailableComponent } from '../hooks/use_get_protections_unavailable_component';
import type { PolicyFormComponentCommonProps } from '../types';
import { PerOsAntivirusRegistrationCard } from './per_os_antivirus_registration_card';
import { PerOsAttackSurfaceReductionCard } from './per_os_attack_surface_reduction_card';
import { PerOsBehaviourProtectionCard } from './per_os_behaviour_protection_card';
import { PerOsDeviceControlCard } from './per_os_device_control_card';
import { PerOsEventCollectionCard } from './per_os_event_collection_card';
import { PerOsMalwareProtectionsCard } from './per_os_malware_protections_card';
import { PerOsMemoryProtectionCard } from './per_os_memory_protection_card';
import { PerOsRansomwareProtectionCard } from './per_os_ransomware_protection_card';

// §9.5: the `mac.ransomware.mode` advanced setting is replaced by the macOS row on the
// per-OS Ransomware card, so it is hidden here to avoid two controls for one field. It is
// filtered, never deleted from AdvancedPolicySchema — deleting it would leave macOS
// ransomware with no UI at all while the flag is off. Being inside this component is
// already equivalent to the flag being on, so this needs no second flag check.
const PROTECTIONS_SECTION_TITLE = i18n.translate(
  'xpack.securitySolution.endpoint.policy.details.protections',
  { defaultMessage: 'Protections' }
);

const SETTINGS_SECTION_TITLE = i18n.translate(
  'xpack.securitySolution.endpoint.policy.details.settings',
  { defaultMessage: 'Settings' }
);

const OMITTED_ADVANCED_KEYS: readonly string[] = ['mac.ransomware.mode'];

export type PerOsPolicySettingsFormProps = PolicyFormComponentCommonProps;

export const PerOsPolicySettingsForm = memo(
  ({ policy, onChange, mode, 'data-test-subj': dataTestSubj }: PerOsPolicySettingsFormProps) => {
    const getTestId = useTestIdGenerator(dataTestSubj);
    const ProtectionsUpSellingComponent = useGetProtectionsUnavailableComponent();
    const trustedDevices = useIsExperimentalFeatureEnabled('trustedDevices');
    const { storage } = useKibana().services;
    const [showEventMergingBanner, setShowEventMergingBanner] = useState(
      storage.get('securitySolution.showEventMergingBanner') ?? true
    );
    const onBannerDismiss = useCallback(() => {
      setShowEventMergingBanner(false);
      storage.set('securitySolution.showEventMergingBanner', false);
    }, [storage]);
    const onChangeProxy: PolicyFormComponentCommonProps['onChange'] = ({
      isValid,
      updatedPolicy,
    }) => {
      updateAntivirusRegistrationEnabled(updatedPolicy);
      onChange({ isValid, updatedPolicy });
    };
    const commonProps = { policy, onChange, mode, 'data-test-subj': dataTestSubj };

    const renderDeviceControlSection = () => {
      if (!trustedDevices) {
        return null;
      }

      // PerOsDeviceControlCard performs the serverless upsell and Enterprise-licence checks
      // itself, so this wrapper only applies the trustedDevices flag gate.
      return (
        <>
          <PerOsDeviceControlCard
            {...commonProps}
            data-test-subj={getTestId('perOsDeviceControl')}
          />
          <EuiSpacer size="l" />
        </>
      );
    };

    return (
      <div data-test-subj={getTestId()}>
        {showEventMergingBanner && (
          <>
            <EventMergingBanner onDismiss={onBannerDismiss} />
            <EuiSpacer size="s" />
          </>
        )}
        <FormSectionTitle>{PROTECTIONS_SECTION_TITLE}</FormSectionTitle>

        {ProtectionsUpSellingComponent && (
          <>
            <EuiSpacer size="m" />
            <ProtectionsUpSellingComponent />
            <EuiSpacer size="l" />
          </>
        )}

        {/*
          Card order follows the design (§3.2): Malware, Malicious behavior, Antivirus
          solution, Ransomware, Memory threat, Device control, Attack surface reduction,
          Event collection. Antivirus and Event collection are not protections and must
          still render when the protections upsell replaces the protection cards, so the
          protection cards sit in two conditional blocks around them rather than one.
        */}
        {!ProtectionsUpSellingComponent && (
          <>
            <RelatedDetectionRulesCallout />
            <EuiSpacer size="l" />
            <PerOsMalwareProtectionsCard
              {...commonProps}
              onChange={onChangeProxy}
              data-test-subj={getTestId('perOsMalware')}
            />
            <EuiSpacer size="l" />

            <PerOsBehaviourProtectionCard
              {...commonProps}
              data-test-subj={getTestId('perOsBehaviour')}
            />
            <EuiSpacer size="l" />
          </>
        )}

        <PerOsAntivirusRegistrationCard
          {...commonProps}
          onChange={onChangeProxy}
          data-test-subj={getTestId('perOsAntivirusRegistration')}
        />
        <EuiSpacer size="l" />

        {!ProtectionsUpSellingComponent && (
          <>
            <PerOsRansomwareProtectionCard
              {...commonProps}
              data-test-subj={getTestId('perOsRansomware')}
            />
            <EuiSpacer size="l" />

            <PerOsMemoryProtectionCard {...commonProps} data-test-subj={getTestId('perOsMemory')} />
            <EuiSpacer size="l" />

            {renderDeviceControlSection()}

            <PerOsAttackSurfaceReductionCard
              {...commonProps}
              data-test-subj={getTestId('perOsAttackSurface')}
            />
            <EuiSpacer size="l" />
          </>
        )}

        {/*
          The Phase 4 reorder to mock order (§3.2) moved Antivirus solution up to third,
          so it now sits under "Protections". Everything that is genuinely configuration
          rather than protection — Event collection and the advanced settings — sits under
          "Settings".
        */}
        <FormSectionTitle>{SETTINGS_SECTION_TITLE}</FormSectionTitle>
        <EuiSpacer size="s" />

        <PerOsEventCollectionCard
          {...commonProps}
          data-test-subj={getTestId('perOsEventCollection')}
        />

        <EuiSpacer size="m" />
        <AdvancedSection
          {...commonProps}
          omitKeys={OMITTED_ADVANCED_KEYS}
          fullWidthToggle
          data-test-subj={getTestId('advancedSection')}
        />
      </div>
    );
  }
);
PerOsPolicySettingsForm.displayName = 'PerOsPolicySettingsForm';

const FormSectionTitle = memo<PropsWithChildren<unknown>>(({ children }) => {
  return (
    <EuiText size="xs" color="subdued">
      <h4>{children}</h4>
    </EuiText>
  );
});
FormSectionTitle.displayName = 'FormSectionTitle';
