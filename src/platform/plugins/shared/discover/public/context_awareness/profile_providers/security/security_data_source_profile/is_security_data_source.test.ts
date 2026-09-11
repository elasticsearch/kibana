/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  containsOnlySecuritySourcePatterns,
  isSecurityDataViewId,
  isSecuritySourcePattern,
} from './is_security_data_source';

describe('Security data source classification', () => {
  it.each([
    '.alerts-security.alerts-default',
    '.internal.alerts-security.alerts-default-000001',
    '.preview.alerts-security.alerts-default',
    '.alerts-security.attack.discovery.alerts-default',
    '.adhoc.alerts-security.attack.discovery.alerts-default',
    '.siem-signals-default',
    'logs-endpoint.events.process-default',
    '.ds-logs-endpoint.events.network-default-000001',
    'logs-endpoint.alerts-default',
    'endgame-*',
    'logs-cloud_defend.process-default',
    'logs-ti_abusech.malware-default',
    'logs-cloud_security_posture.findings-default',
    'security_solution-acme.misconfiguration_latest',
    'logs-crowdstrike.fdr-default',
    'logs-sentinel_one.activity-default',
    'logs-m365_defender.event-default',
    'remote:.alerts-security.alerts-default',
    'logs-endpoint.events.process-*::data',
  ])('recognizes %s', (sourcePattern) => {
    expect(isSecuritySourcePattern(sourcePattern)).toBe(true);
  });

  it.each([
    'logs-*',
    'logs-aws.cloudtrail-*',
    'filebeat-*',
    'traces-apm-*',
    'metrics-endpoint.metadata-*',
    '.logs-endpoint.actions-*',
    '.entity_analytics.*',
    'risk-score.risk-score-*',
    '.asset-criticality.asset-criticality-*',
  ])('rejects %s', (sourcePattern) => {
    expect(isSecuritySourcePattern(sourcePattern)).toBe(false);
  });

  it('requires every positive source to be Security data', () => {
    expect(
      containsOnlySecuritySourcePatterns(
        '.alerts-security.alerts-default,logs-endpoint.events.process-*,-logs-endpoint.events.file-*'
      )
    ).toBe(true);
    expect(
      containsOnlySecuritySourcePatterns(
        '.alerts-security.alerts-default,logs-endpoint.events.process-*,logs-nginx.access-*'
      )
    ).toBe(false);
    expect(containsOnlySecuritySourcePatterns(',-logs-*')).toBe(false);
  });

  it.each([
    'security-solution-default',
    'security-solution-alert-default',
    'security-solution-attack-default',
    'security_solution_cdr_latest_misconfigurations_v2-default',
    'security_solution_cdr_latest_vulnerabilities_v2-default',
    'cloud_security_posture-303eea10-c475-11ec-af18-c5b9b437dbbe',
  ])('recognizes managed data view %s', (dataViewId) => {
    expect(isSecurityDataViewId(dataViewId)).toBe(true);
  });
});
