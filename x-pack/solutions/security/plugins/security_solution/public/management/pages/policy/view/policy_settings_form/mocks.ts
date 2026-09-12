/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { set } from '@kbn/safer-lodash-set';
import { createTestSubjGenerator } from '../../../../mocks/utils';
import type { PolicyConfig } from '../../../../../../common/endpoint/types';
import {
  AntivirusRegistrationModes,
  ProtectionModes,
} from '../../../../../../common/endpoint/types';

export const getPolicySettingsFormTestSubjects = (
  formTopLevelTestSubj: string = 'endpointPolicyForm'
) => {
  const genTestSubj = createTestSubjGenerator(formTopLevelTestSubj);
  const malwareTestSubj = genTestSubj.withPrefix('malware');
  const ransomwareTestSubj = genTestSubj.withPrefix('ransomware');
  const memoryTestSubj = genTestSubj.withPrefix('memory');
  const behaviourTestSubj = genTestSubj.withPrefix('behaviour');
  const advancedSectionTestSubj = genTestSubj.withPrefix('advancedSection');
  const windowsEventsTestSubj = genTestSubj.withPrefix('windowsEvents');
  const macEventsTestSubj = genTestSubj.withPrefix('macEvents');
  const linuxEventsTestSubj = genTestSubj.withPrefix('linuxEvents');
  const antivirusTestSubj = genTestSubj.withPrefix('antivirusRegistration');
  const attackSurfaceTestSubj = genTestSubj.withPrefix('attackSurface');
  const deviceControlTestSubj = genTestSubj.withPrefix('deviceControl');

  return {
    form: genTestSubj(),

    malware: {
      card: malwareTestSubj(),
      enableDisableSwitch: malwareTestSubj('enableDisableSwitch'),
      protectionPreventRadio: malwareTestSubj('protectionLevel-preventRadio'),
      protectionDetectRadio: malwareTestSubj('protectionLevel-detectRadio'),
      notifyUserCheckbox: malwareTestSubj('notifyUser-checkbox'),
      notifySupportedVersion: malwareTestSubj('notifyUser-supportedVersion'),
      notifyCustomMessage: malwareTestSubj('notifyUser-customMessage'),
      notifyCustomMessageTooltipIcon: malwareTestSubj('notifyUser-tooltipIcon'),
      notifyCustomMessageTooltipInfo: malwareTestSubj('notifyUser-tooltipInfo'),
      osValuesContainer: malwareTestSubj('osValues'),
      rulesCallout: malwareTestSubj('rulesCallout'),
      blocklistContainer: malwareTestSubj('blocklist'),
      blocklistEnableDisableSwitch: malwareTestSubj('blocklist-enableDisableSwitch'),
      onWriteScanEnableDisableSwitch: malwareTestSubj('onWriteScan-enableDisableSwitch'),
    },
    ransomware: {
      card: ransomwareTestSubj(),
      lockedCard: ransomwareTestSubj('locked'),
      lockedCardTitle: ransomwareTestSubj('locked-title'),
      enableDisableSwitch: ransomwareTestSubj('enableDisableSwitch'),
      protectionPreventRadio: ransomwareTestSubj('protectionLevel-preventRadio'),
      protectionDetectRadio: ransomwareTestSubj('protectionLevel-detectRadio'),
      notifyUserCheckbox: ransomwareTestSubj('notifyUser-checkbox'),
      notifySupportedVersion: ransomwareTestSubj('notifyUser-supportedVersion'),
      notifyCustomMessage: ransomwareTestSubj('notifyUser-customMessage'),
      notifyCustomMessageTooltipIcon: ransomwareTestSubj('notifyUser-tooltipIcon'),
      notifyCustomMessageTooltipInfo: ransomwareTestSubj('notifyUser-tooltipInfo'),
      osValuesContainer: ransomwareTestSubj('osValues'),
      rulesCallout: ransomwareTestSubj('rulesCallout'),
    },
    memory: {
      card: memoryTestSubj(),
      lockedCard: memoryTestSubj('locked'),
      lockedCardTitle: memoryTestSubj('locked-title'),
      enableDisableSwitch: memoryTestSubj('enableDisableSwitch'),
      protectionPreventRadio: memoryTestSubj('protectionLevel-preventRadio'),
      protectionDetectRadio: memoryTestSubj('protectionLevel-detectRadio'),
      notifyUserCheckbox: memoryTestSubj('notifyUser-checkbox'),
      osValuesContainer: memoryTestSubj('osValues'),
      rulesCallout: memoryTestSubj('rulesCallout'),
    },
    behaviour: {
      card: behaviourTestSubj(),
      lockedCard: behaviourTestSubj('locked'),
      lockedCardTitle: behaviourTestSubj('locked-title'),
      enableDisableSwitch: behaviourTestSubj('enableDisableSwitch'),
      protectionPreventRadio: behaviourTestSubj('protectionLevel-preventRadio'),
      protectionDetectRadio: behaviourTestSubj('protectionLevel-detectRadio'),
      reputationServiceCheckbox: behaviourTestSubj('reputationService-checkbox'),
      notifyUserCheckbox: behaviourTestSubj('notifyUser-checkbox'),
      osValuesContainer: behaviourTestSubj('osValues'),
      rulesCallout: behaviourTestSubj('rulesCallout'),
    },
    attackSurface: {
      card: attackSurfaceTestSubj(),
      lockedCard: attackSurfaceTestSubj('locked'),
      lockedCardTitle: attackSurfaceTestSubj('locked-title'),
      enableDisableSwitch: attackSurfaceTestSubj('enableDisableSwitch'),
      switchLabel: attackSurfaceTestSubj('switchLabel'),
      osValues: attackSurfaceTestSubj('osValues'),
    },

    windowsEvents: {
      card: windowsEventsTestSubj(),
      osValueContainer: windowsEventsTestSubj('osValueContainer'),
      optionsContainer: windowsEventsTestSubj('options'),
      credentialsCheckbox: windowsEventsTestSubj('credential_access'),
      dllCheckbox: windowsEventsTestSubj('dll_and_driver_load'),
      dnsCheckbox: windowsEventsTestSubj('dns'),
      fileCheckbox: windowsEventsTestSubj('file'),
      networkCheckbox: windowsEventsTestSubj('network'),
      processCheckbox: windowsEventsTestSubj('process'),
      registryCheckbox: windowsEventsTestSubj('registry'),
      securityCheckbox: windowsEventsTestSubj('security'),
    },
    macEvents: {
      card: macEventsTestSubj(),
      osValueContainer: macEventsTestSubj('osValueContainer'),
      optionsContainer: macEventsTestSubj('options'),
      fileCheckbox: macEventsTestSubj('file'),
      networkCheckbox: macEventsTestSubj('network'),
      processCheckbox: macEventsTestSubj('process'),
    },
    linuxEvents: {
      card: linuxEventsTestSubj(),
      osValueContainer: linuxEventsTestSubj('osValueContainer'),
      optionsContainer: linuxEventsTestSubj('options'),
      dnsCheckbox: linuxEventsTestSubj('dns'),
      fileCheckbox: linuxEventsTestSubj('file'),
      networkCheckbox: linuxEventsTestSubj('network'),
      processCheckbox: linuxEventsTestSubj('process'),
      sessionDataCheckbox: linuxEventsTestSubj('session_data'),
      captureTerminalCheckbox: linuxEventsTestSubj('tty_io'),
    },
    antivirusRegistration: {
      card: antivirusTestSubj(),
      radioButtons: antivirusTestSubj('radioButtons'),
      disabledRadioButton: antivirusTestSubj(AntivirusRegistrationModes.disabled),
      enabledRadioButton: antivirusTestSubj(AntivirusRegistrationModes.enabled),
      syncRadioButton: antivirusTestSubj(AntivirusRegistrationModes.sync),
      osValueContainer: antivirusTestSubj('osValueContainer'),
    },
    deviceControl: {
      card: deviceControlTestSubj(),
      lockedCard: deviceControlTestSubj('locked'),
      lockedCardTitle: deviceControlTestSubj('locked-title'),
      enableDisableSwitch: deviceControlTestSubj('enableDisableSwitch'),
      protectionAuditRadio: deviceControlTestSubj('protectionLevel-auditRadio'),
      notifyUserCheckbox: deviceControlTestSubj('notifyUser-checkbox'),
      osValuesContainer: deviceControlTestSubj('osValues'),
    },
    advancedSection: {
      container: advancedSectionTestSubj(''),
      showHideButton: advancedSectionTestSubj('showButton'),
      settingsContainer: advancedSectionTestSubj('settings'),
      warningCallout: advancedSectionTestSubj('warning'),
      search: advancedSectionTestSubj('search'),
      osFilter: advancedSectionTestSubj('osFilter'),
      emptyState: advancedSectionTestSubj('emptyState'),
      settingRowTestSubjects: (settingKeyPath: string) => {
        const testSubjForSetting = advancedSectionTestSubj.withPrefix(settingKeyPath);

        return {
          container: testSubjForSetting('container'),
          label: testSubjForSetting('label'),
          tooltipIcon: testSubjForSetting('tooltipIcon'),
          versionInfo: testSubjForSetting('versionInfo'),
          textField: settingKeyPath,
          viewValue: testSubjForSetting('viewValue'),
        };
      },
    },
  };
};

export const expectIsViewOnly = (elem: HTMLElement): void => {
  elem
    .querySelectorAll(
      'button:not(.euiLink, [data-test-subj*="advancedSection-showButton"], [data-test-subj="euiDismissCalloutButton"]),input,select,textarea'
    )
    .forEach((inputElement) => {
      expect(inputElement).toHaveAttribute('disabled');
    });
};

/**
 * Create a regular expression with the provided text that ensure it matches the entire string.
 * @param text
 */
export const exactMatchText = (text: string): RegExp => {
  // RegExp below taken from: https://github.com/sindresorhus/escape-string-regexp/blob/main/index.js
  return new RegExp(`^${text.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&')}$`);
};

/**
 * Sets malware off or on (to prevent protection level) in the given policy settings
 *
 * NOTE: this utiliy MUTATES `policy` provided on input
 *
 * @param policy
 * @param turnOff
 * @param includePopup
 * @param includeSubfeatures
 * @param includeAntivirus
 */
export const setMalwareMode = ({
  policy,
  turnOff = false,
  includePopup = true,
  includeSubfeatures = true,
  includeAntivirus = false,
}: {
  policy: PolicyConfig;
  turnOff?: boolean;
  includePopup?: boolean;
  includeSubfeatures?: boolean;
  includeAntivirus?: boolean;
}) => {
  const mode = turnOff ? ProtectionModes.off : ProtectionModes.prevent;
  const enableValue = mode !== ProtectionModes.off;

  set(policy, 'windows.malware.mode', mode);
  set(policy, 'mac.malware.mode', mode);
  set(policy, 'linux.malware.mode', mode);

  if (includeAntivirus) {
    set(policy, 'windows.antivirus_registration.enabled', !turnOff);
  }

  if (includePopup) {
    set(policy, 'windows.popup.malware.enabled', enableValue);
    set(policy, 'mac.popup.malware.enabled', enableValue);
    set(policy, 'linux.popup.malware.enabled', enableValue);
  }

  if (includeSubfeatures) {
    set(policy, 'windows.malware.blocklist', enableValue);
    set(policy, 'mac.malware.blocklist', enableValue);
    set(policy, 'linux.malware.blocklist', enableValue);

    set(policy, 'windows.malware.on_write_scan', enableValue);
    set(policy, 'mac.malware.on_write_scan', enableValue);
    set(policy, 'linux.malware.on_write_scan', enableValue);
  }
};

export const setMalwareModeToDetect = (policy: PolicyConfig) => {
  set(policy, 'windows.malware.mode', ProtectionModes.detect);
  set(policy, 'mac.malware.mode', ProtectionModes.detect);
  set(policy, 'linux.malware.mode', ProtectionModes.detect);

  set(policy, 'windows.popup.malware.enabled', false);
  set(policy, 'mac.popup.malware.enabled', false);
  set(policy, 'linux.popup.malware.enabled', false);
};

export const setAntivirusRegistration = (
  policy: PolicyConfig,
  mode: AntivirusRegistrationModes,
  enabled: boolean
) => {
  policy.windows.antivirus_registration.mode = mode;
  policy.windows.antivirus_registration.enabled = enabled;
};
