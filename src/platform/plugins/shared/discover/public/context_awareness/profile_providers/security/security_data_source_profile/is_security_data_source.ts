/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

const SECURITY_DATA_VIEW_ID_PREFIXES = [
  'security-solution-',
  'security_solution_cdr_latest_misconfigurations',
  'security_solution_cdr_latest_vulnerabilities',
  'cloud_security_posture-',
];

const SECURITY_SOURCE_PATTERNS = [
  /^(?:\.internal)?\.alerts-security\.alerts-/,
  /^\.preview\.alerts-security\.alerts-/,
  /^(?:\.internal)?\.alerts-security\.attack\.discovery\.alerts-/,
  /^(?:\.internal)?\.adhoc\.alerts-security\.attack\.discovery\.alerts-/,
  /^\.siem-signals-/,
  /^logs-endpoint\.events\./,
  /^logs-endpoint\.alerts-/,
  /^endgame-/,
  /^logs-cloud_defend\./,
  /^logs-ti_/,
  /^logs-cloud_security_posture\.(?:findings|findings_latest|vulnerabilities|vulnerabilities_latest)-/,
  /^security_solution-.*\.(?:misconfiguration_latest|vulnerability_latest)$/,
  /^logs-crowdstrike\.(?:alert|falcon|fdr)-/,
  /^logs-sentinel_one\.(?:activity|alert)-/,
  /^logs-m365_defender\.(?:alert|event)-/,
];

export const isSecurityDataViewId = (dataViewId?: string): boolean =>
  Boolean(
    dataViewId && SECURITY_DATA_VIEW_ID_PREFIXES.some((prefix) => dataViewId.startsWith(prefix))
  );

export const isSecuritySourcePattern = (sourcePattern: string): boolean => {
  const normalizedPattern = sourcePattern
    .trim()
    .replace(/^[^:]+:(?!:)/, '')
    .replace(/::[^,]+$/, '')
    .replace(/^\.ds-/, '');

  return SECURITY_SOURCE_PATTERNS.some((pattern) => pattern.test(normalizedPattern));
};

export const containsOnlySecuritySourcePatterns = (indexPattern: string | null): boolean => {
  if (!indexPattern) {
    return false;
  }

  const sourcePatterns = indexPattern
    .split(',')
    .map((sourcePattern) => sourcePattern.trim())
    .filter((sourcePattern) => sourcePattern && !sourcePattern.startsWith('-'));

  return sourcePatterns.length > 0 && sourcePatterns.every(isSecuritySourcePattern);
};
