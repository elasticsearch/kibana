/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { i18n } from '@kbn/i18n';

export const POLICY_SETTING_SECTION_DESCRIPTIONS = Object.freeze({
  malware: i18n.translate('xpack.securitySolution.endpoint.policy.details.malwareDescription', {
    defaultMessage:
      'Configure how Elastic Defend protects your endpoints. Changes apply to all hosts assigned to this policy.',
  }),
  maliciousBehavior: i18n.translate(
    'xpack.securitySolution.endpoint.policy.details.maliciousBehaviorDescription',
    {
      defaultMessage:
        'Control how Elastic Defend responds to malicious behavior on your endpoints. Choose between detection only or full prevention, and configure user notification behavior.',
    }
  ),
  memoryThreat: i18n.translate(
    'xpack.securitySolution.endpoint.policy.details.memoryThreatDescription',
    {
      defaultMessage:
        'Prevent in-memory attacks such as shellcode injection, reflective DLL loading, and malicious Office macros.',
    }
  ),
  ransomware: i18n.translate(
    'xpack.securitySolution.endpoint.policy.details.ransomwareDescription',
    {
      defaultMessage:
        'Detect ransomware by monitoring canary files and taking response actions when encryption activity is identified.',
    }
  ),
  antivirusSolution: i18n.translate(
    'xpack.securitySolution.endpoint.policy.details.antivirusSolutionDescription',
    {
      defaultMessage:
        'Register Elastic as an official Antivirus solution for Windows OS. This will also disable Windows Defender.',
    }
  ),
  deviceControl: i18n.translate(
    'xpack.securitySolution.endpoint.policy.details.deviceControlDescription',
    {
      defaultMessage:
        'Control which external devices — such as USB drives and removable media — can interact with your endpoints. Set read, write, and execute permissions per OS.',
    }
  ),
  attackSurfaceReduction: i18n.translate(
    'xpack.securitySolution.endpoint.policy.details.attackSurfaceReductionDescription',
    {
      defaultMessage:
        'Limit the ways attackers can compromise your endpoints by reducing exposure to common attack techniques. Enable credential hardening to prevent unauthorized access to system credentials on Windows.',
    }
  ),
  eventCollection: i18n.translate(
    'xpack.securitySolution.endpoint.policy.details.eventCollectionDescription',
    {
      defaultMessage:
        'Select which system events to collect for monitoring and analysis. Selecting more event types increases visibility but may impact performance — enable only what you use and require.',
    }
  ),
});
