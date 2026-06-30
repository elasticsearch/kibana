/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  proposeAtomicEsqlFromIocs,
  proposedAtomicEsqlRule,
  severityToRiskScore,
} from './rule_export';

describe('proposedAtomicEsqlRule', () => {
  it('emits an ES|QL body that searches every ECS field hunt_for_threat searches for an IP IOC', () => {
    const proposal = proposedAtomicEsqlRule({
      ioc_type: 'ip',
      ioc_value: '198.51.100.5',
      report_id: 'report-1',
    });
    expect(proposal.ioc_type).toBe('ip');
    expect(proposal.ioc_value).toBe('198.51.100.5');
    // Field set mirrors hunt_for_threat.buildIocShould — drift between
    // the two would cause recall mismatch between the hunt and the
    // durable rule. Test pins them together.
    expect(proposal.esql).toContain('source.ip == "198.51.100.5"');
    expect(proposal.esql).toContain('destination.ip == "198.51.100.5"');
    expect(proposal.esql).toContain('host.ip == "198.51.100.5"');
    expect(proposal.esql).toContain('client.ip == "198.51.100.5"');
    expect(proposal.esql).toContain('server.ip == "198.51.100.5"');
    expect(proposal.esql).toContain('LIMIT 100');
  });

  it('emits domain-flavoured fields for a domain IOC', () => {
    const proposal = proposedAtomicEsqlRule({
      ioc_type: 'domain',
      ioc_value: 'evil.example.com',
    });
    expect(proposal.esql).toContain('dns.question.name == "evil.example.com"');
    expect(proposal.esql).toContain('destination.domain == "evil.example.com"');
    expect(proposal.esql).toContain('url.domain == "evil.example.com"');
  });

  it('emits url-flavoured fields for a URL IOC', () => {
    const proposal = proposedAtomicEsqlRule({
      ioc_type: 'url',
      ioc_value: 'https://evil.example.com/payload',
    });
    expect(proposal.esql).toContain('url.full == "https://evil.example.com/payload"');
    expect(proposal.esql).toContain('url.original == "https://evil.example.com/payload"');
  });

  it('emits hash-flavoured fields for a hash IOC', () => {
    const proposal = proposedAtomicEsqlRule({
      ioc_type: 'hash',
      ioc_value: 'd41d8cd98f00b204e9800998ecf8427e',
    });
    expect(proposal.esql).toContain('file.hash.md5 == "d41d8cd98f00b204e9800998ecf8427e"');
    expect(proposal.esql).toContain('file.hash.sha1 == "d41d8cd98f00b204e9800998ecf8427e"');
    expect(proposal.esql).toContain('file.hash.sha256 == "d41d8cd98f00b204e9800998ecf8427e"');
  });

  it('truncates long IOC values in the rule name (≤16 chars + ellipsis)', () => {
    const longSha = 'a'.repeat(64);
    const proposal = proposedAtomicEsqlRule({ ioc_type: 'hash', ioc_value: longSha });
    // 13 chars + Unicode ellipsis = "aaaaaaaaaaaaa…" (length 14).
    expect(proposal.rule_name).toContain('aaaaaaaaaaaaa…');
    expect(proposal.rule_name).not.toContain('aaaaaaaaaaaaaa');
  });

  it('builds a stable finding_id (deterministic across calls)', () => {
    const a = proposedAtomicEsqlRule({ ioc_type: 'ip', ioc_value: '1.2.3.4', report_id: 'r1' });
    const b = proposedAtomicEsqlRule({ ioc_type: 'ip', ioc_value: '1.2.3.4', report_id: 'r1' });
    expect(a.finding_id).toBe(b.finding_id);
    expect(a.finding_id).toBe('r1:atomic:ip:1.2.3.4');
  });

  it('defaults severity to high and computes the matching risk_score', () => {
    const proposal = proposedAtomicEsqlRule({ ioc_type: 'ip', ioc_value: '1.2.3.4' });
    expect(proposal.severity).toBe('high');
    expect(proposal.risk_score).toBe(severityToRiskScore('high'));
  });

  it('embeds rule metadata in the body for analyst review (rule_name, severity, ioc_type)', () => {
    const proposal = proposedAtomicEsqlRule({
      ioc_type: 'ip',
      ioc_value: '1.2.3.4',
      report_id: 'report-1',
    });
    expect(proposal.esql).toContain('// rule_name: Atomic IOC match — ip: 1.2.3.4');
    expect(proposal.esql).toContain('// severity: high');
    // `ioc_type` and `ioc_value` share a comment line — see
    // `rule_export.ts`. The assertion matches the combined form.
    expect(proposal.esql).toContain('// ioc_type: ip  ioc_value: 1.2.3.4');
  });
});

describe('proposeAtomicEsqlFromIocs', () => {
  it('emits one proposal per unique (ioc_type, ioc_value) pair', () => {
    const proposals = proposeAtomicEsqlFromIocs(
      [
        { type: 'ip', value: '1.2.3.4' },
        { type: 'ip', value: '5.6.7.8' },
        { type: 'domain', value: 'evil.example.com' },
      ],
      'report-1'
    );
    expect(proposals).toHaveLength(3);
    expect(proposals.map((p) => p.ioc_value)).toEqual(['1.2.3.4', '5.6.7.8', 'evil.example.com']);
  });

  it('de-duplicates identical IOCs that appear twice (e.g. defanged + raw)', () => {
    const proposals = proposeAtomicEsqlFromIocs(
      [
        { type: 'ip', value: '1.2.3.4' },
        { type: 'ip', value: '1.2.3.4' },
      ],
      'r1'
    );
    expect(proposals).toHaveLength(1);
  });

  it('drops entries with empty values', () => {
    const proposals = proposeAtomicEsqlFromIocs(
      [
        { type: 'ip', value: '' },
        { type: 'ip', value: '1.2.3.4' },
      ],
      'r1'
    );
    expect(proposals).toHaveLength(1);
    expect(proposals[0].ioc_value).toBe('1.2.3.4');
  });

  it('caps the result at 20 proposals even when input is much larger', () => {
    const big = Array.from({ length: 50 }, (_, i) => ({
      type: 'ip' as const,
      value: `10.0.0.${i + 1}`,
    }));
    const proposals = proposeAtomicEsqlFromIocs(big, 'r1');
    expect(proposals).toHaveLength(20);
  });

  it('forwards the optional report_id into every finding_id and rule_name', () => {
    const proposals = proposeAtomicEsqlFromIocs([{ type: 'ip', value: '1.2.3.4' }], 'report-xyz');
    expect(proposals[0].finding_id).toBe('report-xyz:atomic:ip:1.2.3.4');
    expect(proposals[0].rule_name).toContain('(report-xyz');
  });

  it('returns an empty list when given an empty input', () => {
    expect(proposeAtomicEsqlFromIocs([], 'r1')).toEqual([]);
  });
});
