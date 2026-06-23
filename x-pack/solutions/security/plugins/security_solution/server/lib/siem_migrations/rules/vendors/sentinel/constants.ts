/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export { TACTICS_BASE_URL, TECHNIQUES_BASE_URL } from '../qradar/constants';
export {
  SENTINEL_NRT_RULE_KIND,
  SENTINEL_SCHEDULED_RULE_KIND,
} from '../../../../../../common/siem_migrations/parsers/sentinel/types';
export {
  SENTINEL_DEFAULT_QUERY_FREQUENCY,
  SENTINEL_RULE_KIND_ANNOTATION_KEY,
} from '../../../../../../common/siem_migrations/constants';

/**
 * Map of Sentinel tactic display names to MITRE ATT&CK tactic IDs.
 * Sentinel exports use human-readable names (e.g. "InitialAccess") rather than IDs (e.g. "TA0001").
 */
export const SENTINEL_TACTIC_NAME_TO_ID: Record<string, string> = {
  Reconnaissance: 'TA0043',
  ResourceDevelopment: 'TA0042',
  InitialAccess: 'TA0001',
  Execution: 'TA0002',
  Persistence: 'TA0003',
  PrivilegeEscalation: 'TA0004',
  DefenseEvasion: 'TA0005',
  CredentialAccess: 'TA0006',
  Discovery: 'TA0007',
  LateralMovement: 'TA0008',
  Collection: 'TA0009',
  CommandAndControl: 'TA0011',
  Exfiltration: 'TA0010',
  Impact: 'TA0040',
  PreAttack: 'TA0043',
  ImpairProcessControl: 'TA0106',
  InhibitResponseFunction: 'TA0107',
};

/**
 * Map of Sentinel tactic display names to human-readable MITRE ATT&CK tactic names.
 */
export const SENTINEL_TACTIC_NAME_TO_DISPLAY: Record<string, string> = {
  Reconnaissance: 'Reconnaissance',
  ResourceDevelopment: 'Resource Development',
  InitialAccess: 'Initial Access',
  Execution: 'Execution',
  Persistence: 'Persistence',
  PrivilegeEscalation: 'Privilege Escalation',
  DefenseEvasion: 'Defense Evasion',
  CredentialAccess: 'Credential Access',
  Discovery: 'Discovery',
  LateralMovement: 'Lateral Movement',
  Collection: 'Collection',
  CommandAndControl: 'Command and Control',
  Exfiltration: 'Exfiltration',
  Impact: 'Impact',
  PreAttack: 'Pre-ATT&CK',
  ImpairProcessControl: 'Impair Process Control',
  InhibitResponseFunction: 'Inhibit Response Function',
};

/**
 * Matches the integer-only ISO 8601 duration subset supported by the Sentinel rule transform.
 *
 * Supported units are years, months, days, hours, minutes, and seconds. Weeks (`P1W`),
 * fractional values (`PT0.5H`), and comma decimals are intentionally not supported.
 * The converter accepts either one date unit or a time-only duration. Mixed date units
 * (`P1Y2M`) and date-plus-time durations (`P1DT2H`) are intentionally rejected to avoid
 * changing schedule semantics during migration.
 *
 * `T` starts the time portion and is required when the duration includes hours,
 * minutes, or seconds:
 *
 * PT5M = 5 minutes
 * PT1H = 1 hour
 * PT30S = 30 seconds
 *
 * `T` is not used for date-only units:
 *
 * P1D = 1 day
 * P2M = 2 months
 * P1Y = 1 year
 *
 * Important ambiguity: M means months before T, but minutes after T.
 * P1M = 1 month
 * PT1M = 1 minute
 */
export const ISO_8601_DURATION_PATTERN =
  /^P(?=\d|T\d)(?:(?<years>\d+)Y)?(?:(?<months>\d+)M)?(?:(?<days>\d+)D)?(?:T(?=\d)(?:(?<hours>\d+)H)?(?:(?<minutes>\d+)M)?(?:(?<seconds>\d+)S)?)?$/;
