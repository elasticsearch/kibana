/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Domain denylist for IOC extraction — domains that are never adversary IOCs.
 *
 * Edit this file to add/remove noise entries. Each entry requires:
 *   domain:    exact hostname (lowercase, no trailing dot)
 *   rationale: why this domain is noise, not a C2/IOC
 *   added:     ISO date when the entry was added
 *   source:    origin of the decision (manual | corpus-review | <ticket-id>)
 *
 * Deferred: UI auto-suggester, operator-config surface, and test fixtures live in
 * the backlog. Entries here are the canonical source of truth for all extraction paths.
 *
 * Scope: exact hostname only — subdomains are NOT automatically covered.
 * Add both `abuse.ch` and `bazaar.abuse.ch` if both are noise.
 *
 * NOT in scope here:
 *   - Vendor CDNs / cloud providers that can also appear as IOC infra
 *     (e.g. cloudflare.com, amazonaws.com) — intentionally excluded.
 *   - Pure security-vendor / research domains (kaspersky.com, eset.com, etc.) —
 *     covered by VENDOR_RESEARCH_DOMAINS in extract_iocs.ts with suffix matching
 *     so subdomains (research.kaspersky.com, blog.eset.com) are automatically included.
 *   - Content-hosting / dual-use platforms where the path is the discriminating
 *     signal (github.com, raw.githubusercontent.com, npmjs.com) — left as uncertain
 *     so B2 can judge the full URL rather than the bare host.
 */

interface NoiseDomainEntry {
  readonly domain: string;
  readonly rationale: string;
  readonly added: string;
  readonly source: string;
}

export const IOC_NOISE_DOMAIN_LIST: readonly NoiseDomainEntry[] = [
  // ── CTI research infrastructure ───────────────────────────────────────────
  {
    domain: 'elastic.co',
    rationale: 'Elasticsearch/Kibana vendor — appears in reports as tool reference, never C2',
    added: '2026-06-08',
    source: 'corpus-review',
  },
  {
    domain: 'urlscan.io',
    rationale: 'URL scanning service — cited as analysis tool/reference, never as IOC target',
    added: '2026-06-08',
    source: 'corpus-review',
  },
  {
    domain: 'virustotal.com',
    rationale: 'AV/sandbox platform — cited as analysis reference, never as IOC target',
    added: '2026-06-08',
    source: 'corpus-review',
  },
  {
    domain: 'shodan.io',
    rationale: 'Internet scanner — cited as recon tool reference, never as adversary infra',
    added: '2026-06-08',
    source: 'corpus-review',
  },
  {
    domain: 'any.run',
    rationale: 'Interactive malware sandbox — appears as analysis link, never as IOC',
    added: '2026-06-08',
    source: 'corpus-review',
  },
  {
    domain: 'app.any.run',
    rationale: 'Interactive malware sandbox subdomain — analysis link, never IOC',
    added: '2026-06-08',
    source: 'corpus-review',
  },
  {
    domain: 'hybrid-analysis.com',
    rationale: 'Malware sandbox — analysis reference, not adversary infrastructure',
    added: '2026-06-08',
    source: 'corpus-review',
  },
  {
    domain: 'joesandbox.com',
    rationale: 'Malware sandbox — analysis reference, not adversary infrastructure',
    added: '2026-06-08',
    source: 'corpus-review',
  },
  // ── Abuse.ch tracker network ──────────────────────────────────────────────
  {
    domain: 'abuse.ch',
    rationale: 'Abuse.ch threat tracker network — cited as data source, not C2',
    added: '2026-06-08',
    source: 'corpus-review',
  },
  {
    domain: 'bazaar.abuse.ch',
    rationale: 'MalwareBazaar — malware repository/reference, not adversary infra',
    added: '2026-06-08',
    source: 'corpus-review',
  },
  {
    domain: 'malwarebazaar.abuse.ch',
    rationale: 'MalwareBazaar alternate hostname — same as bazaar.abuse.ch',
    added: '2026-06-08',
    source: 'corpus-review',
  },
  {
    domain: 'feodotracker.abuse.ch',
    rationale: 'Feodo tracker — botnet C2 tracker, not itself a C2',
    added: '2026-06-08',
    source: 'corpus-review',
  },
  {
    domain: 'urlhaus.abuse.ch',
    rationale: 'URLhaus — malware URL tracker, not itself adversary infra',
    added: '2026-06-08',
    source: 'corpus-review',
  },
  {
    domain: 'threatfox.abuse.ch',
    rationale: 'ThreatFox IOC sharing platform — data source, not adversary infra',
    added: '2026-06-08',
    source: 'corpus-review',
  },
  // ── CTI / OSINT reference domains ─────────────────────────────────────────
  {
    domain: 'example.com',
    rationale: 'RFC-reserved placeholder — never a real IOC',
    added: '2026-06-08',
    source: 'manual',
  },
  {
    domain: 'localhost',
    rationale: 'Loopback hostname — never an external IOC',
    added: '2026-06-08',
    source: 'manual',
  },
  {
    domain: 'twitter.com',
    rationale: 'Social media reference link — never adversary C2 in direct-domain form',
    added: '2026-06-08',
    source: 'manual',
  },
  {
    domain: 'mitre.org',
    rationale: 'MITRE ATT&CK/CVE reference — appears as framework citation, not IOC',
    added: '2026-06-08',
    source: 'manual',
  },
  {
    domain: 'attack.mitre.org',
    rationale: 'MITRE ATT&CK framework URL — framework citation, not IOC',
    added: '2026-06-08',
    source: 'manual',
  },
  {
    domain: 'nvd.nist.gov',
    rationale: 'NIST NVD CVE database — vulnerability reference, not IOC',
    added: '2026-06-08',
    source: 'manual',
  },
  {
    domain: 'cve.mitre.org',
    rationale: 'CVE reference database — vulnerability citation, not IOC',
    added: '2026-06-08',
    source: 'manual',
  },
  // ── Package registries ────────────────────────────────────────────────────
  {
    domain: 'packages.npm.org',
    rationale: 'npm CDN/packages host — distribution infrastructure reference, never IOC',
    added: '2026-06-25',
    source: 'eval-2026-06-23',
  },
  {
    domain: 'npmjs.org',
    rationale: 'npm organization domain — package registry citation, not adversary infra',
    added: '2026-06-25',
    source: 'eval-2026-06-23',
  },
];

export const IOC_NOISE_DOMAINS: ReadonlySet<string> = new Set(
  IOC_NOISE_DOMAIN_LIST.map((entry) => entry.domain.toLowerCase())
);
