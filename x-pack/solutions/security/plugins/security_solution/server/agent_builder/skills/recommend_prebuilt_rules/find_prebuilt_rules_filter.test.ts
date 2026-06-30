/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildPrebuiltRulesToolFilter } from './find_prebuilt_rules_filter';

describe('buildPrebuiltRulesToolFilter', () => {
  it('returns undefined when no parameters are provided', () => {
    expect(buildPrebuiltRulesToolFilter({})).toBeUndefined();
  });

  it('builds a single-token keywords clause over name and description', () => {
    expect(buildPrebuiltRulesToolFilter({ keywords: 'mimikatz' })).toBe(
      '(security-rule.name: "mimikatz" OR security-rule.description: "mimikatz")'
    );
  });

  it('ANDs multi-token keywords within each field', () => {
    expect(buildPrebuiltRulesToolFilter({ keywords: 'lsass memory' })).toBe(
      '(security-rule.name: ("lsass" AND "memory") OR security-rule.description: ("lsass" AND "memory"))'
    );
  });

  it('quotes reserved KQL operator words in keywords so they are treated as literal terms', () => {
    expect(buildPrebuiltRulesToolFilter({ keywords: 'ransomware or trojan' })).toBe(
      '(security-rule.name: ("ransomware" AND "or" AND "trojan") OR security-rule.description: ("ransomware" AND "or" AND "trojan"))'
    );
  });

  it('builds severity clause (single)', () => {
    expect(buildPrebuiltRulesToolFilter({ severity: ['critical'] })).toBe(
      'security-rule.severity: ("critical")'
    );
  });

  it('builds severity clause with OR for multiple values', () => {
    expect(buildPrebuiltRulesToolFilter({ severity: ['critical', 'high'] })).toBe(
      'security-rule.severity: ("critical" OR "high")'
    );
  });

  it('builds ruleType clause with OR for multiple values', () => {
    expect(buildPrebuiltRulesToolFilter({ ruleType: ['esql', 'eql'] })).toBe(
      'security-rule.type: ("esql" OR "eql")'
    );
  });

  it('builds tags clause (single)', () => {
    expect(buildPrebuiltRulesToolFilter({ tags: ['OS: Windows'] })).toBe(
      'security-rule.tags: ("OS: Windows")'
    );
  });

  it('builds tags clause with OR for multiple values', () => {
    expect(buildPrebuiltRulesToolFilter({ tags: ['OS: Windows', 'Domain: LLM'] })).toBe(
      'security-rule.tags: ("OS: Windows" OR "Domain: LLM")'
    );
  });

  it('routes a single mitreTechnique to the technique id field', () => {
    expect(buildPrebuiltRulesToolFilter({ mitreTechnique: ['T1059'] })).toBe(
      'security-rule.threat.technique.id: ("T1059")'
    );
  });

  it('ORs multiple techniques in one clause', () => {
    expect(buildPrebuiltRulesToolFilter({ mitreTechnique: ['T1059', 'T1071'] })).toBe(
      'security-rule.threat.technique.id: ("T1059" OR "T1071")'
    );
  });

  it('routes a single tactic ID to threat.tactic.id', () => {
    expect(buildPrebuiltRulesToolFilter({ mitreTactic: ['TA0001'] })).toBe(
      'security-rule.threat.tactic.id: ("TA0001")'
    );
  });

  it('ORs multiple tactic IDs in one clause', () => {
    expect(buildPrebuiltRulesToolFilter({ mitreTactic: ['TA0001', 'TA0006'] })).toBe(
      'security-rule.threat.tactic.id: ("TA0001" OR "TA0006")'
    );
  });

  it('builds relatedIntegrations clause with quoted packages', () => {
    expect(buildPrebuiltRulesToolFilter({ relatedIntegrations: ['okta', 'aws'] })).toBe(
      'security-rule.related_integrations.package: ("okta" OR "aws")'
    );
  });

  it('builds ruleIds clause with quoted ids', () => {
    expect(buildPrebuiltRulesToolFilter({ ruleIds: ['abc-123', 'def-456'] })).toBe(
      'security-rule.rule_id: ("abc-123" OR "def-456")'
    );
  });

  it('ANDs multiple parameters together', () => {
    const result = buildPrebuiltRulesToolFilter({ severity: ['critical'], ruleType: ['esql'] });
    expect(result).toBe('security-rule.severity: ("critical") AND security-rule.type: ("esql")');
  });

  it('escapes embedded quotes and backslashes inside quoted values', () => {
    expect(buildPrebuiltRulesToolFilter({ tags: ['weird"tag\\x'] })).toBe(
      'security-rule.tags: ("weird\\"tag\\\\x")'
    );
  });

  it('treats an empty array the same as an omitted parameter (no clause)', () => {
    expect(buildPrebuiltRulesToolFilter({ tags: [], severity: [] })).toBeUndefined();
  });
});
