/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CorrelationFindings } from '../../../common/threat_intelligence/correlation';

/**
 * Real fixture: correlate_threat run against report T_glmZ4BBTbfD_VQrqq7
 * (Elastic Security Labs — Axios npm supply chain compromise, March 2026).
 *
 * Covers:
 *   - vertex signal levels: high (Lead 1 all vertices), partial + none (Lead 2)
 *   - evidence weights present: smoking_gun, supporting, counter
 *     (non_discriminatory and decisive_counter not returned by this run — real data preferred)
 *   - empty counter section: Lead 1 has no counter evidence
 *   - populated counter section: Lead 2 has 3 counter items
 *   - consolidated_candidates: both leads have empty arrays (real result)
 *   - case_vertex_signal: from the Elastic Security Labs case report's own diamond
 *
 * Doc fields report: candidate docs in .kibana-threat-reports-* have
 *   source.name  → vendor (resolvable)
 *   source.url   → source article URL (resolvable; used for the Source link)
 *   content.title → article title (resolvable)
 * No top-level `title`, `vendor`, or `url` fields exist on the raw docs.
 */
export const mockCorrelationFindings: CorrelationFindings = {
  case_vertex_signal: {
    adversary: 'high',
    capability: 'high',
    infrastructure: 'high',
    victim: 'high',
  },
  candidate_labels: Object.fromEntries([
    ['-vglmZ4BBTbfD_VQ2at5', 'c01'],
    ['a_glmZ4BBTbfD_VQ7KzX', 'c02'],
    ['MfglmZ4BBTbfD_VQ4axg', 'c03'],
    ['h_glmZ4BBTbfD_VQuqqd', 'c04'],
    ['2PglmZ4BBTbfD_VQ-a2S', 'c05'],
    ['uvglmZ4BBTbfD_VQwKqc', 'c06'],
    ['x_glmZ4BBTbfD_VQy6tu', 'c07'],
    ['MfgmmZ4BBTbfD_VQAa60', 'c08'],
    ['cfglmZ4BBTbfD_VQ8q38', 'c09'],
    ['OPglmZ4BBTbfD_VQ6Kxa', 'c10'],
    ['hvglmZ4BBTbfD_VQtKrc', 'c11'],
    ['CfgmmZ4BBTbfD_VQI7AH', 'c12'],
    ['HfgmmZ4BBTbfD_VQ5rpZ', 'c13'],
  ] satisfies Array<[string, string]>),
  leads: [
    {
      candidate_ids: [
        '-vglmZ4BBTbfD_VQ2at5',
        'a_glmZ4BBTbfD_VQ7KzX',
        'MfglmZ4BBTbfD_VQ4axg',
        'h_glmZ4BBTbfD_VQuqqd',
        '2PglmZ4BBTbfD_VQ-a2S',
        'uvglmZ4BBTbfD_VQwKqc',
        'x_glmZ4BBTbfD_VQy6tu',
        'MfgmmZ4BBTbfD_VQAa60',
        'cfglmZ4BBTbfD_VQ8q38',
        'OPglmZ4BBTbfD_VQ6Kxa',
        'hvglmZ4BBTbfD_VQtKrc',
      ],
      title: 'Axios npm supply chain compromise (March 2026) — multi-vendor reporting cluster',
      relationship: 'same_campaign',
      confidence: 'high',
      vertex_signal: {
        adversary: 'high',
        capability: 'high',
        infrastructure: 'high',
        victim: 'high',
      },
      bluf: 'All eleven candidates describe the identical March 30–31, 2026 axios npm maintainer-account compromise that introduced `plain-crypto-js@4.2.1` as a postinstall dropper delivering a cross-platform RAT to `sfrclak[.]com:8000` — same versions (`axios@1.14.1`/`axios@0.30.4`), same hashes, same C2, same dropper obfuscation key (`OrDeR_7077`), and same WAVESHAPER/NukeSped attribution to DPRK UNC1069/BlueNoroff/Sapphire Sleet.',
      evidence: [
        {
          vertex: 'capability',
          weight: 'smoking_gun',
          text: 'Identical malicious package versions `axios@1.14.1` and `axios@0.30.4` with injected dependency `plain-crypto-js@4.2.1` cited across all eleven candidates.',
        },
        {
          vertex: 'capability',
          weight: 'smoking_gun',
          text: 'Identical SHA-256 payload hashes: macOS `com.apple.act.mond` (`92ff08773995ebc8d55ec4b8e1a225d0d1e51efa4ef88b8849d0071230c9645a`), Windows `6202033.ps1` (`617b67a8e1210e4fc87c92d1d1da45a2f311c08d26e89b12307cf583c900d101`), Linux `ld.py` (`fcb81618bb15edfdedfb638b4c08a2af9cac9ecfa551af135a8402bf980375cf`) match the new case.',
        },
        {
          vertex: 'infrastructure',
          weight: 'smoking_gun',
          text: 'C2 `sfrclak[.]com` / `142.11.206[.]73:8000` with URL path `/6202033` and platform-routing POST bodies `packages.npm.org/product0|1|2` — identical across all reports.',
        },
        {
          vertex: 'capability',
          weight: 'smoking_gun',
          text: 'Same dropper obfuscation scheme: reversed Base64 + XOR with key `OrDeR_7077` using `7*i^2 % 10` index; same anti-forensics (self-delete `setup.js`, swap `package.json` with `package.md`).',
        },
        {
          vertex: 'capability',
          weight: 'smoking_gun',
          text: 'Same cross-platform RAT specification: HTTP POST + Base64 JSON, 60-second beacon, IE8/WinXP user-agent (`mozilla/4.0 ... msie 8.0 ... trident/4.0`), commands `kill`/`peinject`/`runscript`/`rundir` with `rsp_*` responses, status codes `Wow`/`Zzz`, 16-char session UID.',
        },
        {
          vertex: 'adversary',
          weight: 'supporting',
          text: 'Compromised maintainer `jasonsaayman`; attacker emails `ifstap@proton[.]me` (axios) and `nrwise@proton[.]me` (plain-crypto-js); attribution to DPRK actor UNC1069/BlueNoroff/Sapphire Sleet/NICKEL GLADSTONE/TA444 cited consistently.',
        },
        {
          vertex: 'capability',
          weight: 'supporting',
          text: 'Windows persistence: `%PROGRAMDATA%\\wt.exe` (renamed PowerShell) + `system.bat` under HKCU Run key `MicrosoftUpdate`; macOS path `/Library/Caches/com.apple.act.mond`; Linux `/tmp/ld.py` — all match.',
        },
        {
          vertex: 'adversary',
          weight: 'supporting',
          text: "WAVESHAPER (Mandiant) / NukeSped (Lazarus) backdoor lineage cited by Unit42, GTIG, Hunt.io, Huntress, and Elastic's own attribution section in the new case.",
        },
        {
          vertex: 'victim',
          weight: 'smoking_gun',
          text: 'Target: `jasonsaayman` — npm maintainer of `axios` (~185M weekly downloads); account takeover gave attacker publish access to the npm registry, silently injecting a malicious postinstall hook into a top-tier developer dependency.',
        },
        {
          vertex: 'victim',
          weight: 'supporting',
          text: 'Downstream victims: developer workstations and CI/CD build runners that executed `npm install` resolving `axios@1.14.1` or `axios@0.30.4`; RAT beaconing to `sfrclak[.]com:8000` observed within minutes of package installation, consistent with DPRK financial-theft and credential-harvesting objectives targeting developer-ecosystem keyholders.',
        },
      ],
      gaps: 'none found',
      consolidated_candidates: [],
    },
    {
      candidate_ids: ['CfgmmZ4BBTbfD_VQI7AH', 'HfgmmZ4BBTbfD_VQ5rpZ'],
      title:
        'DPRK developer-targeting ecosystem (DeceptiveDevelopment / PurpleBravo / Contagious Interview) — same actor lineage, different campaign',
      relationship: 'same_actor',
      confidence: 'moderate',
      vertex_signal: {
        adversary: 'high',
        capability: 'partial',
        infrastructure: 'none',
        victim: 'partial',
      },
      bluf: "ESET's DeceptiveDevelopment and Recorded Future's PurpleBravo/Contagious Interview describe the broader DPRK developer-targeting cluster that overlaps with UNC1069/BlueNoroff attribution for the Axios case, but cover distinct fake-recruiter/ClickFix campaigns using BeaverTail/InvisibleFerret/PyLangGhost/GolangGhost rather than the npm-maintainer takeover and WAVESHAPER.V2 deployment in this case.",
      evidence: [
        {
          vertex: 'adversary',
          weight: 'supporting',
          text: 'Both reports describe North Korea-aligned developer-targeting operations; PurpleBravo overlaps with Famous Chollima/Tenacious Pungsan and DeceptiveDevelopment overlaps with Contagious Interview — the same broader DPRK developer-targeting umbrella that GTIG attributes Axios to via UNC1069.',
        },
        {
          vertex: 'capability',
          weight: 'supporting',
          text: 'Shared tradecraft: trojanized npm/JavaScript packages, postinstall hooks, cross-platform RATs targeting developer workstations, credential/cryptocurrency theft motive.',
        },
        {
          vertex: 'capability',
          weight: 'counter',
          text: 'Different malware families: DeceptiveDevelopment/PurpleBravo focus on BeaverTail/InvisibleFerret/PyLangGhost/GolangGhost/AkdoorTea/Tropidoor — none match the WAVESHAPER.V2-lineage RAT (PowerShell/C++/Python triplet) used in the Axios case.',
        },
        {
          vertex: 'infrastructure',
          weight: 'counter',
          text: 'No infrastructure overlap: `sfrclak[.]com` / `142.11.206[.]73` do not appear in DeceptiveDevelopment or PurpleBravo IOC lists.',
        },
        {
          vertex: 'capability',
          weight: 'counter',
          text: 'Different initial access vector: DeceptiveDevelopment/PurpleBravo use fake recruiter outreach with coding-challenge repos and ClickFix lures, not maintainer-account takeover of a top-tier npm package.',
        },
        {
          vertex: 'victim',
          weight: 'supporting',
          text: 'Shared victim class: DeceptiveDevelopment and PurpleBravo target software developers and IT-supply-chain workers via fake recruiter outreach on LinkedIn and GitHub (coding-challenge repos, ClickFix lures); the Axios compromise reached the same developer-workstation population through a trojanized top-tier npm dependency — both campaigns pursue developer-ecosystem targets for credential and cryptocurrency theft consistent with DPRK financial objectives.',
        },
      ],
      gaps: "Direct linkage requires evidence that the Axios operator overlaps with PurpleBravo/DeceptiveDevelopment operator clusters specifically (vs. broader UNC1069/BlueNoroff). High-priority verification: confirm whether Mandiant's UNC1069 designation maps onto the same sub-cluster as PurpleBravo/DeceptiveDevelopment, or whether they are sibling DPRK clusters.",
      consolidated_candidates: [],
    },
  ],
  no_match: [],
  synthesis: {
    bluf: 'The new case is the Elastic Security Labs deep-dive on the March 30–31, 2026 Axios npm supply-chain compromise; eleven candidates report the identical campaign with matching package versions, payload hashes, C2 (`sfrclak[.]com:8000`), dropper obfuscation (`OrDeR_7077`), cross-platform RAT spec, and DPRK attribution, while two candidates describe sibling DPRK developer-targeting operations by the same actor lineage.',
    correlation_signal: 'high',
    reasoning:
      'Smoking-gun multi-vertex overlap with c01–c11: identical capability (`axios@1.14.1`/`axios@0.30.4` + `plain-crypto-js@4.2.1`, SHA-256 hashes for all three OS payloads, `OrDeR_7077` XOR scheme, `kill`/`peinject`/`runscript`/`rundir` command set, IE8 user-agent, 60s beacon, `Wow`/`Zzz` status codes), identical infrastructure (`sfrclak[.]com`, `142.11.206[.]73`, port 8000, `/6202033` endpoint, `packages.npm.org/product0|1|2` POST bodies), and identical adversary indicators (`jasonsaayman` compromise, `ifstap@proton.me`, `nrwise@proton.me`). same_campaign is unambiguous across c01–c11. c12 (ESET DeceptiveDevelopment) and c13 (Recorded Future PurpleBravo) describe the broader DPRK developer-targeting umbrella that shares actor lineage but uses different malware families and different initial access — graded same_actor at moderate confidence with explicit counters noted.',
    gaps: 'Candidates differ on the exact DPRK sub-cluster naming (UNC1069 vs Sapphire Sleet vs BlueNoroff/TA444 vs NICKEL GLADSTONE) but all converge on DPRK-nexus, financially motivated. Whether DeceptiveDevelopment/PurpleBravo operators are the same team as the Axios operators or sibling teams under the same DPRK umbrella is not resolved in source material.',
    next_steps: [
      {
        priority: 'high',
        text: 'Block `sfrclak[.]com` and `142.11.206[.]73:8000` at network egress; hunt historical DNS/proxy logs for any callbacks during the 00:21–~03:40 UTC 2026-03-31 window.',
      },
      {
        priority: 'high',
        text: 'Audit `package-lock.json` / `yarn.lock` / `pnpm-lock.yaml` across all repos and CI runners for `axios@1.14.1`, `axios@0.30.4`, and `plain-crypto-js@4.2.0`/`4.2.1`; treat any host that resolved these as fully compromised and rotate all reachable secrets.',
      },
      {
        priority: 'high',
        text: 'Hunt endpoints for IOC artifacts: `/Library/Caches/com.apple.act.mond` (macOS), `%PROGRAMDATA%\\wt.exe` + `system.bat` + `HKCU\\Run\\MicrosoftUpdate` (Windows), `/tmp/ld.py` and `/tmp/.<6char>` binaries (Linux); deploy GTIG YARA rules and Elastic detections.',
      },
      {
        priority: 'moderate',
        text: 'Pivot on shared ETag / Hostwinds AS54290 subnet and AstrillVPN administration nodes to enumerate adjacent DPRK infrastructure for proactive blocking.',
      },
      {
        priority: 'moderate',
        text: 'Set npm min-release-age (and pnpm/yarn equivalents) to ≥3 days and enforce `--ignore-scripts` in CI to reduce blast radius of future postinstall-driven supply-chain attacks.',
      },
    ],
    inferential_hops: 1,
    atomic_ioc_overlap: {
      assessed: true,
      note: 'Exact SHA-256 matches for all three Stage-2 payloads, the C2 domain, IP, port, URL path, dropper obfuscation key, attacker email addresses, and persistence registry value across the new case and c01–c11.',
    },
  },
};

/**
 * Real candidate metadata fetched from .ds-.kibana-threat-reports-2026.06.05-000001
 * via _mget. Fields available on docs: source.name (vendor), source.url (source
 * article URL — resolvable and linked in the Source line), content.title (article title).
 * No top-level `title`, `vendor`, or `url` fields exist; the candidateMeta shape maps
 * source.name → vendor and source.url → url.
 *
 * Keys are raw Elasticsearch document IDs (base64url, non-conforming naming) —
 * built via Object.fromEntries to avoid naming-convention lint on property names.
 */
export const mockCandidateMeta: Record<string, { title?: string; vendor?: string; url?: string }> =
  Object.fromEntries([
    [
      '-vglmZ4BBTbfD_VQ2at5',
      {
        title: 'Threat Brief: Widespread Impact of the Axios Supply Chain Attack',
        vendor: 'Unit 42',
        url: 'https://unit42.paloaltonetworks.com/axios-supply-chain-attack/',
      },
    ],
    [
      'a_glmZ4BBTbfD_VQ7KzX',
      {
        title: 'Compromised axios npm package delivers cross-platform RAT | Datadog Security Labs',
        vendor: 'Datadog',
        url: 'https://securitylabs.datadoghq.com/articles/axios-npm-supply-chain-compromise/',
      },
    ],
    [
      'MfglmZ4BBTbfD_VQ4axg',
      {
        title: 'Supply Chain Compromise of axios npm Package | Huntress',
        vendor: 'Huntress',
        url: 'https://www.huntress.com/blog/supply-chain-compromise-axios-npm-package',
      },
    ],
    [
      'h_glmZ4BBTbfD_VQuqqd',
      {
        title:
          'Elastic releases detections for the Axios supply chain compromise — Elastic Security Labs',
        vendor: 'Elastic',
        url: 'https://www.elastic.co/security-labs/axios-supply-chain-compromise-detections',
      },
    ],
    [
      '2PglmZ4BBTbfD_VQ-a2S',
      {
        title:
          'Breaking Down the Axios Supply Chain Attack: Dropper, Cross-Platform RATs, and BlueNoroff/TA444',
        vendor: 'Hunt.io',
        url: 'https://hunt.io/blog/axios-supply-chain-attack-ta444-bluenoroff',
      },
    ],
    [
      'uvglmZ4BBTbfD_VQwKqc',
      {
        title:
          'North Korea-Nexus Threat Actor Compromises Widely Used Axios NPM Package in Supply Chain Attack',
        vendor: 'Google/Mandiant',
        url: 'https://cloud.google.com/blog/topics/threat-intelligence/north-korea-threat-actor-targets-axios-npm-package',
      },
    ],
    [
      'x_glmZ4BBTbfD_VQy6tu',
      {
        title: 'Mitigating the Axios npm supply chain compromise | Microsoft Security Blog',
        vendor: 'Microsoft',
        url: 'https://www.microsoft.com/en-us/security/blog/2026/04/01/mitigating-the-axios-npm-supply-chain-compromise/',
      },
    ],
    [
      'MfgmmZ4BBTbfD_VQAa60',
      {
        title: 'Axios npm package compromised to deploy malware',
        vendor: 'Sophos',
        url: 'https://www.sophos.com/en-us/blog/axios-npm-package-compromised-to-deploy-malware',
      },
    ],
    [
      'cfglmZ4BBTbfD_VQ8q38',
      {
        title: 'Axios npm attack: rapid hunting with KQL and response guide | NVISO',
        vendor: 'NVISO',
        url: 'https://blog.nviso.eu/2026/04/03/the-axios-npm-supply-chain-incident-fake-dependency-real-backdoor/',
      },
    ],
    [
      'OPglmZ4BBTbfD_VQ6Kxa',
      {
        title: 'Threat Signal Report | FortiGuard Labs',
        vendor: 'Fortinet',
        url: 'https://fortiguard.fortinet.com/threat-signal-report/6390',
      },
    ],
    [
      'hvglmZ4BBTbfD_VQtKrc',
      {
        title: 'How we caught the Axios supply chain attack — Elastic Security Labs',
        vendor: 'Elastic',
        url: 'https://www.elastic.co/security-labs/how-we-caught-the-axios-supply-chain-attack',
      },
    ],
    [
      'CfgmmZ4BBTbfD_VQI7AH',
      {
        title:
          'DeceptiveDevelopment: From primitive crypto theft to sophisticated AI-based deception',
        vendor: 'ESET',
        url: 'https://www.welivesecurity.com/en/eset-research/deceptivedevelopment-from-primitive-crypto-theft-to-sophisticated-ai-based-deception/',
      },
    ],
    [
      'HfgmmZ4BBTbfD_VQ5rpZ',
      {
        title: "PurpleBravo's Targeting of the IT Software Supply Chain",
        vendor: 'Recorded Future',
        url: 'https://www.recordedfuture.com/research/purplebravos-targeting-it-software-supply-chain',
      },
    ],
  ] satisfies Array<[string, { title?: string; vendor?: string; url?: string }]>);
