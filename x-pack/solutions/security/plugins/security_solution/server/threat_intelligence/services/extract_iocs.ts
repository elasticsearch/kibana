/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createHash } from 'crypto';
import { type IocType } from '../../../common/threat_intelligence/hub';
import { IANA_TLDS } from '../data/iana_tlds';
import { IOC_NOISE_DOMAINS } from '../data/ioc_noise_domains';

/**
 * Discriminating power tier for an extracted IOC.
 *
 * Tiers (in anchoring priority order):
 *   discriminating — high entropy / highly specific; strong anchor for cross-report
 *                    correlation (hashes, defanged-in-source domains).
 *   contextual     — real but common infra; corroborates but should not anchor alone
 *                    (well-known CDN / cloud base domains, ordinary IPs).
 *   reference      — noise-domain denylist hits and private/reserved IPs; kept for
 *                    observability but excluded from anchor match space.
 *   denied         — high-confidence noise (code-shaped tokens that failed corroboration);
 *                    excluded from match space; IRREVERSIBLE — only assign when certain.
 *   uncertain      — heuristic couldn't classify; stored as uncertain so the bucket is
 *                    measurable. Downstream anchor logic MUST treat uncertain == contextual
 *                    (boost-only, never anchor). Do NOT fold into contextual at storage time.
 */
export type IocTier = 'discriminating' | 'contextual' | 'reference' | 'denied' | 'uncertain';

/**
 * Domain capability module for the `extract_iocs` action.
 *
 * Pure (no I/O) — same regex set used by Workflow 2 during automated
 * ingestion as well as by the agent-builder tool wrapper and the internal
 * HTTP route. Designed to favor precision over recall; the LLM-driven
 * `hunt_behavior` flow does the deeper pass.
 *
 * Extraction order (compound-first, span-consuming):
 *  1. email local@host (defang-aware) → type:'email'. Host-domain suppressed.
 *  2. url (https?://…) → type:'url'. Port preserved in value.
 *  3. cidr ip/mask (defang-aware) → type:'cidr' + derived type:'ip'.
 *  4. wallet (BTC/ETH) — BEFORE hash so 32-hex BTC isn't stolen by MD5 regex.
 *  5. socket ip:port / domain:port → host as type:'ip'|'domain', port stored as field.
 *  6. atomic: hash / ip / domain on unconsumed text spans.
 *
 * Domain filter pipeline (applied in order after regex match):
 *  a. Redaction-adjacency drop — drop if the match is immediately preceded by a
 *     masking glyph (* █ ● ＊). Catches victim-domain redaction fragments such as
 *     aad****ie.com → the trailing 'ie.com' token is not a real indicator.
 *  b. File-extension check — drop if the rightmost label is a known file or
 *     executable extension (.exe, .dll, .ps1, …). Done BEFORE IANA validation
 *     to handle .zip/.mov gTLD collisions. Binary names paired with a real TLD
 *     (powershell.ru, svchost.io) are NOT dropped here — those are valid domains
 *     and potential C2; only the extension suffix form (powershell.exe) is rejected.
 *  c. IANA TLD validation — drop if the rightmost label is not a real IANA TLD.
 *     Eliminates code symbols (.Sleep, .MaxValue), truncated tokens (.hopto),
 *     and any extensions not caught by step b.
 *  d. Noise domain denylist — drop if the full domain is in the curated list of
 *     security-tooling / vendor / reference domains (elastic.co, urlscan.io, …).
 *  e. Corroboration gate — drop if the TLD is in AMBIGUOUS_TLDS (doubles as a code
 *     or file token) unless the domain is corroborated by: (1) defanged-in-source
 *     (absent from raw text, present after refang) or (2) host of an extracted URL.
 *  f. Longest-match dedup — if both `a.b.tld` and `b.tld` survive, keep only
 *     `a.b.tld` (PSL-suffix dedup, handles hopto.org vs wndlogon.hopto.org).
 */

export interface ExtractIocsParams {
  text: string;
  defang?: boolean;
}

export interface ExtractedIoc {
  type: IocType;
  value: string;
  defanged?: string;
  tier: IocTier;
  tier_heuristic: IocTier;
  tier_basis: string;
  /** Port number from socket extraction (ip:port / domain:port). Not part of the match key. */
  port?: number;
}

export interface ExtractIocsResult {
  count: number;
  iocs: ExtractedIoc[];
  ioc_set_hash: string | null;
}

// ── Atomic patterns ────────────────────────────────────────────────────────────
const HASH_PATTERN = /\b([a-f0-9]{32}|[a-f0-9]{40}|[a-f0-9]{64})\b/gi;
// IPv4 dotted quad with octet bounds; IPv6 left out (false-positive prone).
const IP_PATTERN = /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\b/g;
// Domain: 2+ labels, last label 2+ alpha chars.
const DOMAIN_PATTERN = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}\b/gi;
const URL_PATTERN = /\bhttps?:\/\/[^\s<>"']{4,}/gi;

// ── Compound patterns ──────────────────────────────────────────────────────────
// email: local-part @ host (with optional defanged [.] in host)
// local-part: printable non-whitespace non-@ chars
const EMAIL_PATTERN = /\b[a-z0-9._%+\-]+@(?:[a-z0-9](?:[a-z0-9\-]*[a-z0-9])?\.)+[a-z]{2,24}\b/gi;

// CIDR: IPv4/mask (defang already applied before this runs)
const CIDR_PATTERN =
  /\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\/(?:3[0-2]|[12]?\d)\b/g;

// Crypto wallets — MUST run before hash.
// BTC legacy: starts with 1 or 3, base58, 26-34 chars.
const BTC_LEGACY_PATTERN = /\b[13][a-km-zA-HJ-NP-Z1-9]{25,34}\b/g;
// BTC bech32: bc1 prefix, lowercase alphanumeric, 20+ chars after prefix.
const BTC_BECH32_PATTERN = /\bbc1[a-z0-9]{20,}\b/g;
// ETH: 0x + exactly 40 hex chars.
const ETH_PATTERN = /\b0x[a-fA-F0-9]{40}\b/g;

// Socket: ip:port or domain:port.
// Captures host and port separately. Host can be IPv4 or domain.
const IPV4_OCTET = '(?:25[0-5]|2[0-4]\\d|[01]?\\d?\\d)';
const IPV4 = `(?:${IPV4_OCTET}\\.){3}${IPV4_OCTET}`;
const DOMAIN_LABEL = '[a-z0-9](?:[a-z0-9\\-]*[a-z0-9])?';
const DOMAIN_HOST = `(?:${DOMAIN_LABEL}\\.)+[a-z]{2,24}`;
const SOCKET_PATTERN = new RegExp(`\\b(${IPV4}|${DOMAIN_HOST}):(\\d{1,5})\\b`, 'gi');

// ── Keep existing filter infrastructure ─────────────────────────────────────

const PRIVATE_IP_PREFIXES = ['10.', '127.', '169.254.', '192.168.'];

/**
 * File / executable / script extensions (alpha-only) that look like TLD tokens in
 * dotted notation. Checked BEFORE IANA validation to handle the .zip/.mov gTLD
 * collision: those strings are valid IANA TLDs but `update.zip` / `video.mov`
 * in a CTI report are filenames, not C2 domains.
 *
 * Rule: binary names paired with a real TLD (powershell.ru, svchost.io,
 * powershell.com) are NOT in this set and are NOT dropped — they are valid
 * domains and potential C2 infrastructure. Only the extension form
 * (powershell.exe, svchost.dll) is rejected via this set.
 *
 * NOT included: .com (overwhelmingly a real TLD; command.com false drops not worth it),
 * .py/.pl/.sh (ccTLDs with real registrars — malware C2 on .py/.pl/.sh does exist).
 */
const FILE_EXTENSION_TLDS = new Set([
  // Executable / system
  'exe',
  'dll',
  'sys',
  'drv',
  'ocx',
  'cpl',
  'scr',
  'pif',
  // Scripts and interpreted executables
  'bat',
  'cmd',
  'vbs',
  'vbe',
  'js',
  'jse',
  'wsf',
  'wsh',
  'hta',
  'ps1',
  // Installers / packages
  'msi',
  'msp',
  'msu',
  'cab',
  'inf',
  // Code (not ccTLDs)
  'ts',
  'rb',
  'lua',
  'cs',
  'kt',
  'asm',
  'php',
  'asp',
  'jsp',
  // Data / documents
  'txt',
  'log',
  'ini',
  'cfg',
  'dat',
  'tmp',
  'bak',
  'lnk',
  'dmp',
  'xml',
  'json',
  'yaml',
  'yml',
  'toml',
  'md',
  'rst',
  'csv',
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'rtf',
  'odt',
  // Archives — includes .zip and .mov which are IANA gTLDs since 2023
  'zip',
  'rar',
  'tar',
  'iso',
  'dmg',
  'pkg',
  'deb',
  'rpm',
  'jar',
  'war',
  // Media — includes .mov (IANA gTLD)
  'mov',
  'avi',
  'mkv',
  'wmv',
  'flv',
  'ogg',
  'png',
  'jpg',
  'gif',
  'svg',
  'ico',
  'bmp',
  // Crypto / certs
  'pem',
  'cer',
  'crt',
  'key',
  'pfx',
  'csr',
  'sig',
  'asc',
  // Binaries / other
  'bin',
  'dex',
  'apk',
  'ipa',
]);

/**
 * TLDs that double as common code/file tokens (e.g. ld.py, subprocess.run,
 * WScript.Shell). These require positive corroboration before being emitted
 * as IOCs. Tunable/expandable as the corpus evolves.
 *
 * Corroboration contract: a domain whose TLD ∈ AMBIGUOUS_TLDS is KEPT only if:
 *   (1) it was defanged-in-source (absent from raw text, present after refang), OR
 *   (2) it is the host of a separately-extracted URL.
 * Structured adapters (future enrichment sources) would be a third corroboration path.
 */
const AMBIGUOUS_TLDS = new Set(['py', 'sh', 'run', 'shell', 'name', 'pl', 'rb', 'lua', 'ps']);

/**
 * Multi-label public suffixes that are registry boundaries, not registrable domains.
 * A token that exactly matches one of these (e.g. `co.uk`, `com.br`) carries no
 * registrant identity and should never be emitted as an IOC. Only the BARE suffix
 * is dropped — a domain with a registrable label in front (e.g. `evil.co.uk`) passes.
 *
 * Curated from corpus FPs; expandable as new suffix patterns appear.
 * We intentionally do NOT pull in the full ICANN PSL to avoid a heavy dependency.
 */
const PUBLIC_SUFFIX_DROPLIST = new Set([
  // UK second-level registry suffixes
  'co.uk',
  'org.uk',
  'me.uk',
  'net.uk',
  'ltd.uk',
  'plc.uk',
  // Australia
  'com.au',
  'net.au',
  'org.au',
  'id.au',
  // Brazil
  'com.br',
  'net.br',
  'org.br',
  // New Zealand
  'co.nz',
  'net.nz',
  'org.nz',
  // Israel
  'co.il',
  'org.il',
  'net.il',
  // South Korea
  'co.kr',
  'or.kr',
  'ne.kr',
  // Saudi Arabia
  'com.sa',
  'net.sa',
  'org.sa',
  // Indonesia (c.id and co.id are both registry suffixes)
  'co.id',
  'c.id',
  'net.id',
  'or.id',
  // Argentina
  'com.ar',
  'net.ar',
  'org.ar',
  // Japan
  'co.jp',
  'ne.jp',
  'or.jp',
  // China
  'com.cn',
  'net.cn',
  'org.cn',
  // India
  'co.in',
  'net.in',
  'org.in',
  // South Africa
  'co.za',
  'net.za',
  'org.za',
]);

const isPrivateIp = (ip: string) => PRIVATE_IP_PREFIXES.some((p) => ip.startsWith(p));

/**
 * Pure security-vendor and research domains — exact-match OR suffix-match
 * (so research.kaspersky.com, blog.eset.com are caught without explicit enumeration).
 *
 * Match rule: domain === base  OR  domain.endsWith('.' + base)
 * The dotted `.${base}` form prevents collisions (reset.com must NOT match eset.com).
 *
 * Only pure security vendors / research orgs belong here. Content-hosting platforms
 * (github.com, npmjs.com) belong in the uncertain bucket — their path is the signal.
 * microsoft.com stays here: it appears only as a product/download reference in CTI.
 */
const VENDOR_RESEARCH_DOMAINS = new Set([
  'kaspersky.com',
  'securelist.com',
  'eset.com',
  'welivesecurity.com',
  'paloaltonetworks.com',
  'mandiant.com',
  'sentinelone.com',
  'sophos.com',
  'fortinet.com',
  'dragos.com',
  'recordedfuture.com',
  'ahnlab.com',
  'nviso.eu',
  'harfanglab.io',
  'microsoft.com',
]);

/**
 * Well-known CDN / cloud / hosting base domains that appear regularly as IOC
 * infrastructure but are too common to be discriminating anchors. Subdomains of
 * these that appear in threat reports are real (contextual), but they cannot
 * uniquely fingerprint a campaign the way a purpose-registered C2 domain can.
 *
 * Intentionally small — extend conservatively. A missed entry means an IOC gets
 * `uncertain` (safe contextual fallback) rather than `contextual`; that is
 * acceptable. An over-aggressive entry means a genuine C2 is downgraded, which
 * costs detection signal.
 *
 * NOT listed: github.com, virustotal.com, elastic.co — those are in
 * IOC_NOISE_DOMAINS (reference tier) or VENDOR_RESEARCH_DOMAINS, not here.
 */
const LOW_DISCRIMINATION_DOMAINS = new Set([
  'amazonaws.com',
  's3.amazonaws.com',
  'cloudfront.net',
  'azurewebsites.net',
  'blob.core.windows.net',
  'azureedge.net',
  'onmicrosoft.com',
  'googleapis.com',
  'storage.googleapis.com',
  'aliyuncs.com',
  'oss-cn-hangzhou.aliyuncs.com',
  'fcapp.run',
  'workers.dev',
  'pages.dev',
  'netlify.app',
  'vercel.app',
  'ngrok.io',
  'ngrok.app',
  'serveo.net',
  'dyndns.org',
  'no-ip.com',
  'ddns.net',
  'hopto.org',
  'zapto.org',
  'myftp.biz',
  'myftp.org',
  'sytes.net',
  'redirectme.net',
  'onthewifi.com',
]);

/**
 * Classifies an already-kept domain into an IOC tier.
 * Called AFTER the domain has passed all filter gates (it is a real IOC).
 * Returns { tier, basis } where tier is the heuristic assignment and
 * basis is the rule name for observability.
 */
const classifyDomainTier = (
  domain: string,
  defangedDomains: ReadonlySet<string>
): { tier: IocTier; basis: string } => {
  // Defanged-in-source is the strongest discriminating signal — vendor deliberately
  // marked this domain as live C2.
  if (defangedDomains.has(domain)) {
    return { tier: 'discriminating', basis: 'defanged_source' };
  }

  // Well-known CDN / cloud / DynDNS base domains — real but not specific.
  if (LOW_DISCRIMINATION_DOMAINS.has(domain)) {
    return { tier: 'contextual', basis: 'known_cdn' };
  }

  // Check if domain ends with a LOW_DISCRIMINATION_DOMAINS suffix (e.g. *.amazonaws.com)
  for (const cdnBase of LOW_DISCRIMINATION_DOMAINS) {
    if (domain.endsWith(`.${cdnBase}`)) {
      return { tier: 'contextual', basis: 'known_cdn' };
    }
  }

  return { tier: 'uncertain', basis: 'uncertain_default' };
};

/**
 * Returns the rightmost label (the TLD portion) of a dotted domain string.
 * E.g. 'wndlogon.hopto.org' → 'org'
 */
const extractTld = (domain: string): string => {
  const lastDot = domain.lastIndexOf('.');
  return lastDot === -1 ? domain : domain.slice(lastDot + 1);
};

type DomainFilterResult = { emit: false } | { emit: true; tier: IocTier; basis: string };

/**
 * Domain filter pipeline.
 *
 * Hard drops (emit: false) — these tokens are not IOCs at all:
 *   b.  File extension TLDs (.exe, .dll, .zip, .mov …)
 *   b2. Bare public-suffix tokens (co.uk, com.br …)
 *   c.  Non-IANA TLDs (code symbols, truncated fragments)
 *   a.  (Checked upstream) Redaction-adjacency masked tokens
 *
 * Soft emit (emit: true with tier) — real tokens that are tracked but
 * excluded from the discrimination / anchor match space:
 *   d.  Noise-domain denylist  → reference / tier_basis: denylist
 *   e.  Ambiguous-TLD code-shape gate (failed corroboration) → denied / tier_basis: code_shaped
 *
 * Kept IOCs (emit: true) — real threat indicators:
 *   Passed all hard-drop tests → classified by classifyDomainTier.
 *
 * Redaction-adjacency (step a) is checked upstream because it requires match
 * position from matchAll; this function receives already-position-filtered tokens.
 */
const classifyDomain = (
  domain: string,
  defangedDomains: ReadonlySet<string>,
  urlHosts: ReadonlySet<string>
): DomainFilterResult => {
  const lower = domain.toLowerCase();
  const tld = extractTld(lower);

  // Step b — file extension (before IANA to handle .zip/.mov gTLD collisions)
  if (FILE_EXTENSION_TLDS.has(tld)) return { emit: false };

  // Step b2 — bare public-suffix guard
  if (PUBLIC_SUFFIX_DROPLIST.has(lower)) return { emit: false };

  // Step c — IANA TLD validation
  if (!IANA_TLDS.has(tld)) return { emit: false };

  // Step d — noise domain denylist: KEEP but tag reference so it's visible + measurable.
  if (IOC_NOISE_DOMAINS.has(lower)) {
    return { emit: true, tier: 'reference', basis: 'denylist' };
  }

  // Step d2 — vendor/research domain suffix match: KEEP but tag reference.
  // Exact match OR subdomain of a known vendor base (dotted prefix prevents collisions).
  for (const base of VENDOR_RESEARCH_DOMAINS) {
    if (lower === base || lower.endsWith(`.${base}`)) {
      return { emit: true, tier: 'reference', basis: 'vendor_research' };
    }
  }

  // Step e — corroboration gate for ambiguous/code-shaped TLDs: KEEP but tag denied.
  // denied = high-confidence noise, excluded from anchor match space. Only assigned
  // here because we are CERTAIN (code-shaped token without any corroboration signal).
  if (AMBIGUOUS_TLDS.has(tld)) {
    if (!defangedDomains.has(lower) && !urlHosts.has(lower)) {
      return { emit: true, tier: 'denied', basis: 'code_shaped' };
    }
  }

  // Passed all filters — classify by discriminating signal.
  const { tier, basis } = classifyDomainTier(lower, defangedDomains);
  return { emit: true, tier, basis };
};

interface DomainCandidate {
  domain: string;
  tier: IocTier;
  basis: string;
}

/**
 * Longest-match PSL-style deduplication for domains.
 *
 * If domain A is a proper suffix of domain B (B ends with `.A`), A is subsumed
 * by B and should be dropped. Example:
 *   'hopto.org' + 'wndlogon.hopto.org' → keep 'wndlogon.hopto.org' only.
 *
 * Only applies within the set of kept (non-hard-dropped) candidates that have
 * the same or compatible tiers; reference/denied items are always kept as-is
 * (their presence is informational, not inferential).
 */
const longestMatchDomainDedup = (candidates: DomainCandidate[]): DomainCandidate[] => {
  const domainSet = new Set(candidates.map((c) => c.domain));
  return candidates.filter((c) => {
    // Always keep reference/denied — they are observability entries, not anchors.
    if (c.tier === 'reference' || c.tier === 'denied') return true;
    return !Array.from(domainSet).some(
      (other) => other !== c.domain && other.endsWith(`.${c.domain}`)
    );
  });
};

const defangValue = (type: IocType, value: string, shouldDefang: boolean): string => {
  if (!shouldDefang) return value;
  if (type === 'ip' || type === 'domain' || type === 'cidr') return value.replace(/\./g, '[.]');
  if (type === 'email') return value.replace(/@/, '[@]');
  if (type === 'url') return value.replace(/^https?:\/\//, (m) => m.replace(/:\/\//, '[:]//'));
  return value;
};

/**
 * Refangs defanged IOC strings back to their canonical form before regex matching.
 *
 * Applied to the full source text once before any pattern matching so that
 * defanged IOCs — the way vendors actually publish live C2 infrastructure —
 * are recovered and matched by the standard patterns.
 *
 * Transformations (applied in order; case-insensitive where noted):
 *   [.] / (.) / {.}              → .    bracket/paren/brace-wrapped dot
 *   [dot] / (dot)                 → .    spelled-out dot (bracketed/parenthesized only;
 *                                        bare " dot " is omitted — too FP-prone in prose)
 *   [://] / [:]//                → ://  bracket-wrapped scheme separator
 *   [:]                          → :    bracket-wrapped colon
 *   hxxp:// / hxxps:// (any case)→ http:// / https://   obfuscated scheme prefix
 *   [@] / (at)                   → @    email defang markers
 */
const refang = (text: string): string =>
  text
    // Bracket/paren/brace-wrapped dot
    .replace(/\[\.\]|\(\.\)|\{\.\}/g, '.')
    // Spelled-out dot in brackets or parens only — bare " dot " is NOT refanged
    // (too FP-prone: "asp dot net", "polka dot pattern" would corrupt natural language)
    .replace(/\[dot\]|\(dot\)/gi, '.')
    // Bracket-wrapped scheme separator: [://] or [:]// → ://
    .replace(/\[:\/\/\]|\[:\]\/\//g, '://')
    // Bracket-wrapped colon (after scheme separator already handled)
    .replace(/\[:\]/g, ':')
    // Obfuscated scheme prefix: hxxps?:// (any casing of the XX) → http(s)://
    .replace(/hxxps?:\/\//gi, (m) => (m.toLowerCase().startsWith('hxxps') ? 'https://' : 'http://'))
    // Email defang: [@] or (at) → @
    .replace(/\[@\]|\(at\)/gi, '@');

/** Masking glyphs used in victim-domain redaction tables (e.g. aad****ie.com). */
const REDACTION_GLYPHS = new Set(['*', '＊', '█', '●']);

/**
 * Span-consumption tracker. After each compound match we record the [start, end)
 * character range so later passes only look at unconsumed text.
 */
type Span = readonly [number, number];

const isConsumed = (index: number, len: number, consumed: readonly Span[]): boolean => {
  const end = index + len;
  return consumed.some(([s, e]) => index >= s && end <= e);
};

/**
 * Mask consumed spans in text so later regexes don't match inside them.
 * Replaces each consumed character with a null byte (not a word character,
 * not alphanumeric, won't create new regex matches).
 */
const maskConsumedSpans = (text: string, consumed: readonly Span[]): string => {
  if (consumed.length === 0) return text;
  const chars = text.split('');
  for (const [s, e] of consumed) {
    for (let i = s; i < e; i++) {
      chars[i] = '\x00';
    }
  }
  return chars.join('');
};

export const extractIocs = ({ text, defang = true }: ExtractIocsParams): ExtractIocsResult => {
  // Pre-pass: recover defanged IOCs before regex matching.
  const refangedText = refang(text);
  const seen = new Set<string>();
  const iocByKey = new Map<string, ExtractedIoc>();
  const iocs: ExtractedIoc[] = [];
  const consumed: Span[] = [];

  // ── Corroboration signal 1: defanged-in-source domains ───────────────────
  // A domain present in refangedText but absent from the original text was
  // created BY refang, meaning the vendor deliberately defanged it — strongest
  // possible corroboration that it is a live indicator.
  const originalLower = text.toLowerCase();
  const rawDomainsInOriginal = new Set(
    (originalLower.match(DOMAIN_PATTERN) ?? []).map((d) => d.toLowerCase())
  );

  // Mask email spans before scanning for defanged domains so that a provider host
  // that was defanged ONLY inside an email (gmail[.]com in admin@gmail[.]com) is not
  // promoted into defangedDomains. A domain that is ALSO defanged standalone elsewhere
  // (evil[.]com in "admin@evil[.]com and C2 evil[.]com") still surfaces correctly
  // because its standalone occurrence survives the masking.
  const emailSpans: Span[] = [];
  {
    const emailPat = new RegExp(EMAIL_PATTERN.source, EMAIL_PATTERN.flags);
    for (const m of refangedText.matchAll(emailPat)) {
      if (m.index !== undefined) emailSpans.push([m.index, m.index + m[0].length]);
    }
  }
  const refangedTextNoEmails = maskConsumedSpans(refangedText, emailSpans);
  const refangedLowerNoEmails = refangedTextNoEmails.toLowerCase();
  const rawDomainsInRefangedNoEmails = (refangedLowerNoEmails.match(DOMAIN_PATTERN) ?? []).map(
    (d) => d.toLowerCase()
  );

  const defangedDomains: ReadonlySet<string> = new Set(
    rawDomainsInRefangedNoEmails.filter((d) => !rawDomainsInOriginal.has(d))
  );

  // ── Corroboration signal 1b: defanged-in-source IPs ──────────────────────
  // Mirrors defangedDomains: an IP present in refangedTextNoEmails but absent
  // from the original text was created by refang → vendor deliberately defanged
  // it (e.g. 142[.]11[.]206[.]73) → strongest discriminating signal for IPs.
  const rawIpsInOriginal = new Set(
    (originalLower.match(new RegExp(IP_PATTERN.source, IP_PATTERN.flags)) ?? []).map((ip) =>
      ip.toLowerCase()
    )
  );
  const defangedIps: ReadonlySet<string> = new Set(
    (refangedLowerNoEmails.match(new RegExp(IP_PATTERN.source, IP_PATTERN.flags)) ?? []).filter(
      (ip) => !rawIpsInOriginal.has(ip)
    )
  );

  const pushIoc = (ioc: ExtractedIoc) => {
    const dedupKey = `${ioc.type}:${ioc.value.toLowerCase()}`;
    if (seen.has(dedupKey)) return;
    seen.add(dedupKey);
    iocs.push(ioc);
    iocByKey.set(dedupKey, ioc);
  };

  // ── PASS 1: emails ────────────────────────────────────────────────────────
  // Full address is the indicator; host-domain is suppressed (mail provider noise).
  {
    const pattern = new RegExp(EMAIL_PATTERN.source, EMAIL_PATTERN.flags);
    for (const match of refangedText.matchAll(pattern)) {
      if (match.index === undefined) continue;
      const raw = match[0].toLowerCase();
      const idx = match.index;
      consumed.push([idx, idx + match[0].length]);

      // Email tier: defanged-in-source → discriminating (like a defanged domain)
      // We check if the @ was in the original text or reconstructed by refang.
      const wasDefanged = !text.toLowerCase().includes(raw);
      const tier: IocTier = wasDefanged ? 'discriminating' : 'uncertain';
      const basis = wasDefanged ? 'defanged_source' : 'uncertain_default';

      pushIoc({
        type: 'email',
        value: raw,
        defanged: defangValue('email', raw, defang),
        tier,
        tier_heuristic: tier,
        tier_basis: basis,
      });
    }
  }

  // ── PASS 2: URLs ──────────────────────────────────────────────────────────
  const rawUrls: string[] = [];
  {
    const pattern = new RegExp(URL_PATTERN.source, URL_PATTERN.flags);
    for (const match of refangedText.matchAll(pattern)) {
      if (match.index === undefined) continue;
      const raw = match[0].toLowerCase();
      const idx = match.index;
      consumed.push([idx, idx + match[0].length]);
      rawUrls.push(raw);

      // URL tier: lift-only. A discriminating host lifts the URL to discriminating.
      // Any non-discriminating host (reference, contextual, uncertain) leaves the URL
      // uncertain — the path/query carries the signal and B2 should judge the full URL.
      let tier: IocTier = 'uncertain';
      let basis = 'uncertain_default';
      try {
        const host = new URL(raw).hostname.toLowerCase();
        if (host) {
          const hostResult = classifyDomainTier(host, defangedDomains);
          if (hostResult.tier === 'discriminating') {
            tier = 'discriminating';
            basis = `url_host_inherited:${hostResult.basis}`;
          }
        }
      } catch {
        // malformed URL — keep uncertain
      }

      pushIoc({
        type: 'url',
        value: raw,
        defanged: defangValue('url', raw, defang),
        tier,
        tier_heuristic: tier,
        tier_basis: basis,
      });
    }
  }

  // ── Corroboration signal 2: URL hosts ─────────────────────────────────────
  const urlHostList: string[] = rawUrls.flatMap((url) => {
    try {
      return [new URL(url).hostname.toLowerCase()];
    } catch {
      return [];
    }
  });
  const urlHosts: ReadonlySet<string> = new Set(urlHostList);

  // Derive URL host domains as explicit IOCs (like CIDR → bare IP).
  // The URL consumes its span; the host must be derived explicitly so it
  // isn't lost. Run through domain filter pipeline — urlHosts corroboration
  // means ambiguous TLDs (evil.py) correctly pass the gate here.
  for (const host of urlHostList) {
    const result = classifyDomain(host, defangedDomains, urlHosts);
    if (!result.emit) continue;
    const dedupKey = `domain:${host}`;
    if (!seen.has(dedupKey)) {
      seen.add(dedupKey);
      iocs.push({
        type: 'domain',
        value: host,
        defanged: defangValue('domain', host, defang),
        tier: result.tier,
        tier_heuristic: result.tier,
        tier_basis: result.basis,
      });
    }
  }

  // ── PASS 3: CIDRs ─────────────────────────────────────────────────────────
  // Emit cidr value AND derive bare network IP.
  {
    const pattern = new RegExp(CIDR_PATTERN.source, CIDR_PATTERN.flags);
    for (const match of refangedText.matchAll(pattern)) {
      if (match.index === undefined) continue;
      if (isConsumed(match.index, match[0].length, consumed)) continue;
      const raw = match[0];
      const idx = match.index;
      consumed.push([idx, idx + raw.length]);

      const slashIdx = raw.indexOf('/');
      const networkIp = raw.slice(0, slashIdx);
      const maskWidth = parseInt(raw.slice(slashIdx + 1), 10);

      // CIDR tier: mask-width driven. ≥/29 → discriminating (narrow/near-host), else contextual.
      const cidrTier: IocTier = maskWidth >= 29 ? 'discriminating' : 'contextual';
      const cidrBasis = maskWidth >= 29 ? 'cidr_narrow' : 'cidr_broad';

      pushIoc({
        type: 'cidr',
        value: raw,
        defanged: defangValue('cidr', raw, defang),
        tier: cidrTier,
        tier_heuristic: cidrTier,
        tier_basis: cidrBasis,
      });

      // Derived bare IP — private wins, then defanged-in-source, else uncertain.
      let ipTier: IocTier;
      let ipBasis: string;
      if (isPrivateIp(networkIp)) {
        ipTier = 'reference';
        ipBasis = 'private_ip';
      } else if (defangedIps.has(networkIp)) {
        ipTier = 'discriminating';
        ipBasis = 'defanged_source';
      } else {
        ipTier = 'uncertain';
        ipBasis = 'uncertain_default';
      }
      pushIoc({
        type: 'ip',
        value: networkIp,
        defanged: defangValue('ip', networkIp, defang),
        tier: ipTier,
        tier_heuristic: ipTier,
        tier_basis: ipBasis,
      });
    }
  }

  // ── PASS 4: Wallets (BEFORE hash) ─────────────────────────────────────────
  {
    const walletPatterns: RegExp[] = [
      new RegExp(BTC_LEGACY_PATTERN.source, BTC_LEGACY_PATTERN.flags),
      new RegExp(BTC_BECH32_PATTERN.source, BTC_BECH32_PATTERN.flags),
      new RegExp(ETH_PATTERN.source, ETH_PATTERN.flags),
    ];
    for (const pattern of walletPatterns) {
      for (const match of refangedText.matchAll(pattern)) {
        if (match.index === undefined) continue;
        if (isConsumed(match.index, match[0].length, consumed)) continue;
        const raw = match[0];
        const idx = match.index;
        consumed.push([idx, idx + raw.length]);

        pushIoc({
          type: 'wallet',
          value: raw,
          defanged: raw,
          tier: 'discriminating',
          tier_heuristic: 'discriminating',
          tier_basis: 'wallet_high_entropy',
        });
      }
    }
  }

  // ── PASS 5: Sockets (host:port) ───────────────────────────────────────────
  // Emit the HOST as the indicator; port stored as a field.
  {
    const pattern = new RegExp(SOCKET_PATTERN.source, SOCKET_PATTERN.flags);
    for (const match of refangedText.matchAll(pattern)) {
      if (match.index === undefined) continue;
      if (isConsumed(match.index, match[0].length, consumed)) continue;

      const host = match[1].toLowerCase();
      const portNum = parseInt(match[2], 10);
      if (portNum < 1 || portNum > 65535) continue;

      const idx = match.index;
      consumed.push([idx, idx + match[0].length]);

      // Classify host as ip or domain
      const ipMatch =
        /^(?:(?:25[0-5]|2[0-4]\d|[01]?\d?\d)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d?\d)$/.test(host);

      if (ipMatch) {
        let tier: IocTier;
        let basis: string;
        if (isPrivateIp(host)) {
          tier = 'reference';
          basis = 'private_ip';
        } else if (defangedIps.has(host)) {
          tier = 'discriminating';
          basis = 'defanged_source';
        } else {
          tier = 'uncertain';
          basis = 'uncertain_default';
        }
        const dedupKey = `ip:${host}`;
        if (!seen.has(dedupKey)) {
          seen.add(dedupKey);
          const ioc: ExtractedIoc = {
            type: 'ip',
            value: host,
            defanged: defangValue('ip', host, defang),
            tier,
            tier_heuristic: tier,
            tier_basis: basis,
            port: portNum,
          };
          iocs.push(ioc);
          iocByKey.set(dedupKey, ioc);
        } else {
          // Already seen (e.g. derived from CIDR pass or atomic pass) — merge port if
          // the existing entry has no port yet (first socket wins).
          const existing = iocByKey.get(dedupKey);
          if (existing && existing.port === undefined) {
            existing.port = portNum;
          }
        }
      } else {
        // Domain host — run through domain filter pipeline
        const result = classifyDomain(host, defangedDomains, urlHosts);
        if (result.emit) {
          const dedupKey = `domain:${host}`;
          if (!seen.has(dedupKey)) {
            seen.add(dedupKey);
            const ioc: ExtractedIoc = {
              type: 'domain',
              value: host,
              defanged: defangValue('domain', host, defang),
              tier: result.tier,
              tier_heuristic: result.tier,
              tier_basis: result.basis,
              port: portNum,
            };
            iocs.push(ioc);
            iocByKey.set(dedupKey, ioc);
          } else {
            // Merge port onto existing domain IOC if not yet set.
            const existing = iocByKey.get(dedupKey);
            if (existing && existing.port === undefined) {
              existing.port = portNum;
            }
          }
        }
      }
    }
  }

  // ── PASS 6: Atomic pass on unconsumed spans ───────────────────────────────
  // Mask consumed spans so regexes don't match inside compound structures.
  const remainderText = maskConsumedSpans(refangedText, consumed);

  // Hashes
  {
    const matches = remainderText.match(new RegExp(HASH_PATTERN.source, HASH_PATTERN.flags)) ?? [];
    for (const raw of matches) {
      const value = raw.toLowerCase();
      pushIoc({
        type: 'hash',
        value,
        defanged: value,
        tier: 'discriminating',
        tier_heuristic: 'discriminating',
        tier_basis: 'hash_high_entropy',
      });
    }
  }

  // IPs
  {
    const matches = remainderText.match(new RegExp(IP_PATTERN.source, IP_PATTERN.flags)) ?? [];
    for (const raw of matches) {
      let tier: IocTier;
      let basis: string;
      if (isPrivateIp(raw)) {
        tier = 'reference';
        basis = 'private_ip';
      } else if (defangedIps.has(raw)) {
        tier = 'discriminating';
        basis = 'defanged_source';
      } else {
        tier = 'uncertain';
        basis = 'uncertain_default';
      }
      pushIoc({
        type: 'ip',
        value: raw,
        defanged: defangValue('ip', raw, defang),
        tier,
        tier_heuristic: tier,
        tier_basis: basis,
      });
    }
  }

  // Domains — need matchAll for redaction-adjacency position check.
  // We run on remainder text but need original positions, so we also track
  // which domain tokens in refangedText are inside consumed spans.
  const domainPattern = new RegExp(DOMAIN_PATTERN.source, DOMAIN_PATTERN.flags);
  const candidateDomains: DomainCandidate[] = [];

  for (const match of refangedText.matchAll(domainPattern)) {
    if (match.index === undefined) continue;
    if (isConsumed(match.index, match[0].length, consumed)) continue;

    const raw = match[0].toLowerCase();

    // Step a — redaction-adjacency: drop tokens immediately preceded by a masking glyph
    // that is glued to a preceding alphanumeric label (aad****ie.com → drop 'ie.com').
    if (match.index > 0 && REDACTION_GLYPHS.has(refangedText[match.index - 1])) {
      let g = match.index - 1;
      while (g >= 0 && REDACTION_GLYPHS.has(refangedText[g])) g--;
      if (g >= 0 && /[a-z0-9]/i.test(refangedText[g])) continue;
    }

    // Steps b–e + discriminating classification.
    const result = classifyDomain(raw, defangedDomains, urlHosts);
    if (!result.emit) continue;

    candidateDomains.push({ domain: raw, tier: result.tier, basis: result.basis });
  }

  // Step f — longest-match PSL dedup (reference/denied candidates are exempt).
  const filteredDomains = longestMatchDomainDedup(candidateDomains);
  for (const { domain, tier, basis } of filteredDomains) {
    const dedupKey = `domain:${domain}`;
    if (!seen.has(dedupKey)) {
      seen.add(dedupKey);
      iocs.push({
        type: 'domain',
        value: domain,
        defanged: defangValue('domain', domain, defang),
        tier,
        tier_heuristic: tier,
        tier_basis: basis,
      });
    }
  }

  // Sorted-set fingerprint of the anchor-eligible IOC values in this report.
  // Only discriminating / contextual / uncertain tiers are hashed — reference and
  // denied items are noise-tagged entries that must not affect the fingerprint used
  // for cross-report correlation (adding a denylist hit to a document should not
  // change whether two reports are considered to share infrastructure).
  // `value` is already normalized (lowercase for domain/url/hash); the .toLowerCase()
  // call is a safety net for ip and future types.
  const anchorEligible = iocs.filter((ioc) => ioc.tier !== 'reference' && ioc.tier !== 'denied');
  const iocSetHash =
    anchorEligible.length === 0
      ? null
      : createHash('sha256')
          .update(
            anchorEligible
              .map((ioc) => ioc.value.toLowerCase())
              .sort()
              .join('\n')
          )
          .digest('hex');

  return {
    count: iocs.length,
    iocs,
    ioc_set_hash: iocSetHash,
  };
};
