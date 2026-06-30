/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { extractIocs, type IocTier } from './extract_iocs';

/** Helper: extract IOC values of a specific type from the result. */
const valuesOf = (result: ReturnType<typeof extractIocs>, type: string) =>
  result.iocs.filter((ioc) => ioc.type === type).map((ioc) => ioc.value);

const emailValues = (result: ReturnType<typeof extractIocs>) => valuesOf(result, 'email');
const walletValues = (result: ReturnType<typeof extractIocs>) => valuesOf(result, 'wallet');
const cidrValues = (result: ReturnType<typeof extractIocs>) => valuesOf(result, 'cidr');
const ipValues = (result: ReturnType<typeof extractIocs>) => valuesOf(result, 'ip');

const domainValues = (result: ReturnType<typeof extractIocs>) => valuesOf(result, 'domain');
const hashValues = (result: ReturnType<typeof extractIocs>) => valuesOf(result, 'hash');
const urlValues = (result: ReturnType<typeof extractIocs>) => valuesOf(result, 'url');

/** Filter to IOCs of a given tier. */
const tieredValues = (result: ReturnType<typeof extractIocs>, tier: IocTier, type?: string) =>
  result.iocs
    .filter((ioc) => ioc.tier === tier && (!type || ioc.type === type))
    .map((ioc) => ioc.value);

/** All domain values that are anchor-eligible (not reference or denied). */
const anchorDomainValues = (result: ReturnType<typeof extractIocs>) =>
  result.iocs
    .filter((ioc) => ioc.type === 'domain' && ioc.tier !== 'reference' && ioc.tier !== 'denied')
    .map((ioc) => ioc.value);

// ── Refang + normalization (Phase 1a) ─────────────────────────────────────────

describe('extract_iocs — refang pre-pass and value normalization', () => {
  describe('refang: recovers defanged domains', () => {
    test('recovers [.] bracket dot', () => {
      const r = extractIocs({ text: 'C2 at evil[.]com' });
      expect(domainValues(r)).toContain('evil.com');
    });

    test('recovers (.) paren dot', () => {
      const r = extractIocs({ text: 'callback to bad(.)example.net' });
      expect(domainValues(r)).toContain('bad.example.net');
    });

    test('recovers {.} brace dot', () => {
      const r = extractIocs({ text: 'stage2 from evil{.}org' });
      expect(domainValues(r)).toContain('evil.org');
    });

    test('recovers [dot] bracketed spelled-out form', () => {
      const r = extractIocs({ text: 'beacon to c2[dot]attacker[dot]top' });
      expect(domainValues(r)).toContain('c2.attacker.top');
    });

    test('recovers (dot) parenthesized spelled-out form', () => {
      const r = extractIocs({ text: 'C2 at evil(dot)example(dot)com' });
      expect(domainValues(r)).toContain('evil.example.com');
    });

    test('does NOT refang bare " dot " prose (too FP-prone)', () => {
      // "asp dot net", "polka dot" must not be corrupted
      const r = extractIocs({ text: 'visit asp dot net for docs' });
      expect(domainValues(r)).not.toContain('asp.net');
    });

    test('recovers multi-label defanged domain: evil[.]example[.]com', () => {
      const r = extractIocs({ text: 'dropper calls home to evil[.]example[.]com' });
      expect(domainValues(r)).toContain('evil.example.com');
    });
  });

  describe('refang: recovers defanged IPs', () => {
    test('recovers 1.2.3[.]4', () => {
      const r = extractIocs({ text: 'C2 server at 1.2.3[.]4' });
      expect(valuesOf(r, 'ip')).toContain('1.2.3.4');
    });

    test('recovers 10[.]0[.]0[.]1 (private — emitted as reference tier, not anchor-eligible)', () => {
      // Refang recovers the dotted-quad; private-IP filter tags it reference but keeps it.
      const r = extractIocs({ text: 'LAN hop at 10[.]0[.]0[.]1' });
      const ioc = r.iocs.find((i) => i.value === '10.0.0.1');
      expect(ioc?.tier).toBe('reference');
      expect(ioc?.tier_basis).toBe('private_ip');
    });

    test('recovers 192[.]168[.]1[.]100 (private — emitted as reference tier)', () => {
      const r = extractIocs({ text: 'pivot via 192[.]168[.]1[.]100' });
      const ioc = r.iocs.find((i) => i.value === '192.168.1.100');
      expect(ioc?.tier).toBe('reference');
      expect(ioc?.tier_basis).toBe('private_ip');
    });
  });

  describe('refang: recovers hxxp/hxxps URLs', () => {
    test('recovers hxxps:// scheme', () => {
      const r = extractIocs({ text: 'payload from hxxps://bad[.]com/x' });
      expect(urlValues(r)).toContain('https://bad.com/x');
    });

    test('recovers hxxp:// scheme', () => {
      const r = extractIocs({ text: 'download hxxp://evil.top/drop' });
      expect(urlValues(r)).toContain('http://evil.top/drop');
    });

    test('recovers mixed-case hXXps://', () => {
      const r = extractIocs({ text: 'seen hXXps://malware.io/payload' });
      expect(urlValues(r)).toContain('https://malware.io/payload');
    });

    test('recovers hxxps:// with [.] in host', () => {
      const r = extractIocs({ text: 'C2: hxxps://bad[.]com/x' });
      expect(urlValues(r)).toContain('https://bad.com/x');
    });
  });

  describe('value normalization: lowercase canonical values', () => {
    test('mixed-case domain is stored lowercase', () => {
      const r = extractIocs({ text: 'beacon to Evil.COM' });
      expect(domainValues(r)).toContain('evil.com');
      expect(domainValues(r)).not.toContain('Evil.COM');
    });

    test('defanged Evil[.]com and fanged evil.com produce the SAME value (collision)', () => {
      const r1 = extractIocs({ text: 'C2 at Evil[.]com' });
      const r2 = extractIocs({ text: 'C2 at evil.com' });
      expect(domainValues(r1)).toEqual(domainValues(r2));
    });

    test('url value is lowercased', () => {
      const r = extractIocs({ text: 'from hXXps://Bad.Example.Com/Path' });
      expect(urlValues(r)).toContain('https://bad.example.com/path');
    });

    test('hash value is lowercased (unchanged from prior behavior)', () => {
      const r = extractIocs({ text: 'hash: D41D8CD98F00B204E9800998ECF8427E' });
      expect(valuesOf(r, 'hash')).toContain('d41d8cd98f00b204e9800998ecf8427e');
    });
  });

  describe('ioc_set_hash stability with normalization', () => {
    test('Evil[.]com and evil.com produce the same ioc_set_hash', () => {
      const r1 = extractIocs({ text: 'C2 at Evil[.]com' });
      const r2 = extractIocs({ text: 'C2 at evil.com' });
      expect(r1.ioc_set_hash).not.toBeNull();
      expect(r1.ioc_set_hash).toEqual(r2.ioc_set_hash);
    });

    test('hxxps://bad[.]com and https://bad.com produce the same ioc_set_hash', () => {
      const r1 = extractIocs({ text: 'from hxxps://bad[.]com/x' });
      const r2 = extractIocs({ text: 'from https://bad.com/x' });
      expect(r1.ioc_set_hash).not.toBeNull();
      expect(r1.ioc_set_hash).toEqual(r2.ioc_set_hash);
    });

    test('hash IOC is unchanged: same hash in defanged or fanged report', () => {
      const hash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
      const r1 = extractIocs({ text: `sha256: ${hash}` });
      const r2 = extractIocs({ text: `sha256: ${hash.toUpperCase()}` });
      expect(r1.ioc_set_hash).not.toBeNull();
      expect(r1.ioc_set_hash).toEqual(r2.ioc_set_hash);
    });
  });
});

// ── DROP side: tokens that must NOT appear in IOC output ──────────────────────

describe('extract_iocs — DROP side (precision filters)', () => {
  describe('file extensions (step 1) — dropped before IANA check', () => {
    test('rejects .exe filenames', () => {
      const r = extractIocs({
        text: 'dropper WinRing0x64.exe loaded svchost.exe and explorer.exe',
      });
      expect(domainValues(r)).toEqual([]);
    });

    test('rejects .dll filenames', () => {
      const r = extractIocs({ text: 'atiadlxx.dll and uxtheme.dll injected' });
      expect(domainValues(r)).toEqual([]);
    });

    test('rejects .sys driver names', () => {
      const r = extractIocs({ text: 'WinRing0x64.sys dropped to %TEMP%' });
      expect(domainValues(r)).toEqual([]);
    });

    test('rejects .txt filenames', () => {
      const r = extractIocs({ text: 'wrote 0226.txt to disk' });
      expect(domainValues(r)).toEqual([]);
    });

    test('rejects .vbs script names', () => {
      const r = extractIocs({ text: 'executed payload.vbs via wscript' });
      expect(domainValues(r)).toEqual([]);
    });

    test('rejects .zip archives — including gTLD collision', () => {
      // .zip is an IANA gTLD since 2023 but must still be treated as a file extension
      const r = extractIocs({ text: 'dropped update.zip and malware.zip to %APPDATA%' });
      expect(domainValues(r)).toEqual([]);
    });

    test('rejects .mov — gTLD collision', () => {
      const r = extractIocs({ text: 'lure.mov sent via phishing email' });
      expect(domainValues(r)).toEqual([]);
    });

    test('rejects .bat and .cmd script filenames', () => {
      const r = extractIocs({ text: 'ran persistence.bat and stage.cmd via cmd' });
      expect(domainValues(r)).toEqual([]);
    });

    test('rejects .ps1 PowerShell scripts', () => {
      const r = extractIocs({ text: 'executed payload.ps1 via powershell' });
      expect(domainValues(r)).toEqual([]);
    });

    test('rejects .js and .jse script filenames', () => {
      const r = extractIocs({ text: 'dropped loader.js and encoded.jse to %TEMP%' });
      expect(domainValues(r)).toEqual([]);
    });
  });

  describe('IANA TLD validation (step 2)', () => {
    test('rejects code symbols (non-TLD suffix)', () => {
      // .Serializer / .Sleep / .MaxValue / .Execute are not IANA TLDs → rejected.
      // NOTE: .shell IS a real branded gTLD (Shell petroleum), so WScript.Shell is
      // intentionally NOT tested here — the IANA check correctly passes it.
      const r = extractIocs({
        text: 'ProtoBuf.Serializer and Thread.Sleep and int.MaxValue and WScript.Execute called',
      });
      expect(domainValues(r)).toEqual([]);
    });

    test('rejects truncated C2 domain fragment', () => {
      // 'hopto' is NOT an IANA TLD; 'wndlogon.hopto' must be dropped
      const r = extractIocs({ text: 'beacon to wndlogon.hopto on port 443' });
      expect(domainValues(r)).toEqual([]);
    });

    test('rejects bare CDN hostname without TLD', () => {
      // 'd3nxbjuv18k2dn.cloudfront' — 'cloudfront' is not a TLD
      const r = extractIocs({ text: 'payload from d3nxbjuv18k2dn.cloudfront over https' });
      expect(domainValues(r)).toEqual([]);
    });
  });

  describe('binary names with exe extension are dropped; with real TLD are KEPT', () => {
    test('drops powershell.exe (extension form)', () => {
      const r = extractIocs({ text: 'spawned powershell.exe -enc ...' });
      expect(domainValues(r)).toEqual([]);
    });

    test('drops svchost.dll (extension form)', () => {
      const r = extractIocs({ text: 'injected into svchost.dll in memory' });
      expect(domainValues(r)).toEqual([]);
    });
  });

  describe('noise domain denylist (step 4) — emitted as reference tier, NOT as anchor IOCs', () => {
    test('elastic.co is emitted with tier=reference, excluded from anchor set', () => {
      const r = extractIocs({ text: 'report analyzed via elastic.co detection rules' });
      // Now kept (for observability) but tagged reference — not an anchor IOC.
      expect(anchorDomainValues(r)).not.toContain('elastic.co');
      expect(tieredValues(r, 'reference', 'domain')).toContain('elastic.co');
    });

    test('urlscan.io is emitted with tier=reference, excluded from anchor set', () => {
      const r = extractIocs({ text: 'scan at urlscan.io shows the payload' });
      expect(anchorDomainValues(r)).not.toContain('urlscan.io');
      expect(tieredValues(r, 'reference', 'domain')).toContain('urlscan.io');
    });

    test('virustotal.com is emitted with tier=reference, excluded from anchor set', () => {
      const r = extractIocs({ text: 'virustotal.com detection rate 12/72' });
      expect(anchorDomainValues(r)).not.toContain('virustotal.com');
      expect(tieredValues(r, 'reference', 'domain')).toContain('virustotal.com');
    });

    test('abuse.ch and bazaar.abuse.ch are emitted with tier=reference', () => {
      const r = extractIocs({ text: 'hash listed on abuse.ch and bazaar.abuse.ch' });
      expect(anchorDomainValues(r)).not.toContain('abuse.ch');
      expect(anchorDomainValues(r)).not.toContain('bazaar.abuse.ch');
      expect(tieredValues(r, 'reference', 'domain')).toContain('abuse.ch');
      expect(tieredValues(r, 'reference', 'domain')).toContain('bazaar.abuse.ch');
    });

    test('github.com bare domain passes through to uncertain (content-host, path is the signal)', () => {
      const r = extractIocs({ text: 'source code at github.com' });
      const ioc = r.iocs.find((i) => i.type === 'domain' && i.value === 'github.com');
      expect(ioc?.tier).toBe('uncertain');
    });

    test('attack.mitre.org is emitted with tier=reference', () => {
      const r = extractIocs({ text: 'technique T1059 at attack.mitre.org' });
      expect(anchorDomainValues(r)).not.toContain('attack.mitre.org');
      expect(tieredValues(r, 'reference', 'domain')).toContain('attack.mitre.org');
    });
  });

  describe('longest-match dedup (step 5)', () => {
    test('drops suffix fragment when full domain is present', () => {
      // Both 'hopto.org' and 'wndlogon.hopto.org' survive steps 1-4;
      // longest-match should keep only the longer one.
      const r = extractIocs({
        text: 'C2 at wndlogon.hopto.org — some reports truncate to hopto.org',
      });
      expect(domainValues(r)).toContain('wndlogon.hopto.org');
      expect(domainValues(r)).not.toContain('hopto.org');
    });

    test('keeps standalone domain when no longer match exists', () => {
      // 'malicious' is not in LOLBAS_NAMES, so this passes all filters
      const r = extractIocs({ text: 'beacon to malicious.evil.top' });
      expect(domainValues(r)).toContain('malicious.evil.top');
    });
  });
});

// ── KEEP side: real IOCs that must survive all filters ────────────────────────

describe('extract_iocs — KEEP side (real IOCs retained)', () => {
  describe('binary name + real TLD — MUST be kept (valid C2 domains)', () => {
    test('retains powershell.ru', () => {
      const r = extractIocs({ text: 'C2 callback to powershell.ru:8443' });
      expect(domainValues(r)).toContain('powershell.ru');
    });

    test('retains powershell.com', () => {
      const r = extractIocs({ text: 'phishing domain powershell.com observed' });
      expect(domainValues(r)).toContain('powershell.com');
    });

    test('retains svchost.io', () => {
      const r = extractIocs({ text: 'beacon POST to svchost.io/check' });
      expect(domainValues(r)).toContain('svchost.io');
    });

    test('retains find.attacker.top', () => {
      const r = extractIocs({ text: 'DNS lookup for find.attacker.top' });
      expect(domainValues(r)).toContain('find.attacker.top');
    });

    test('retains explorer.net', () => {
      const r = extractIocs({ text: 'stage2 pulled from explorer.net/payload' });
      expect(domainValues(r)).toContain('explorer.net');
    });

    test('retains rundll32.io', () => {
      const r = extractIocs({ text: 'C2 at rundll32.io identified in PCAP' });
      expect(domainValues(r)).toContain('rundll32.io');
    });
  });

  describe('real C2 domains (from live corpus evidence)', () => {
    test('retains .top C2 domain', () => {
      const r = extractIocs({ text: 'C2 callback observed to malware.top on port 8080' });
      expect(domainValues(r)).toContain('malware.top');
    });

    test('retains .ws domain', () => {
      const r = extractIocs({ text: 'stage2 payload from stage.attacker.ws' });
      expect(domainValues(r)).toContain('stage.attacker.ws');
    });

    test('retains .cv ccTLD domain', () => {
      const r = extractIocs({ text: 'C2 at beacon.threat.cv:443' });
      expect(domainValues(r)).toContain('beacon.threat.cv');
    });

    test('retains DynDNS C2 (wndlogon.hopto.org)', () => {
      const r = extractIocs({ text: 'persistent callback to wndlogon.hopto.org' });
      expect(domainValues(r)).toContain('wndlogon.hopto.org');
    });

    test('retains multi-label C2 with rare TLD', () => {
      const r = extractIocs({ text: 'drop1.cdn.malicious.xyz exfil server' });
      expect(domainValues(r)).toContain('drop1.cdn.malicious.xyz');
    });

    test('retains .io C2 domain (not svchost, not noise)', () => {
      const r = extractIocs({ text: 'C2 at c2infrastructure.io' });
      expect(domainValues(r)).toContain('c2infrastructure.io');
    });

    test('retains raw.githubusercontent.com as uncertain (content-host, URL carries the signal)', () => {
      const r = extractIocs({
        text: 'payload fetched from raw.githubusercontent.com via certutil',
      });
      expect(domainValues(r)).toContain('raw.githubusercontent.com');
      const ioc = r.iocs.find((i) => i.value === 'raw.githubusercontent.com');
      expect(ioc?.tier).toBe('uncertain');
    });
  });

  describe('hashes — unchanged by domain filters', () => {
    test('retains MD5 hash', () => {
      const r = extractIocs({ text: 'md5: d41d8cd98f00b204e9800998ecf8427e' });
      expect(hashValues(r)).toContain('d41d8cd98f00b204e9800998ecf8427e');
    });

    test('retains SHA-256 hash', () => {
      const r = extractIocs({
        text: 'sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      });
      expect(hashValues(r)).toContain(
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
      );
    });

    test('retains multiple hashes from RoningLoader-style report', () => {
      const text = [
        'WinRing0x64.sys hash: a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
        'atiadlxx.dll hash: 0226ab4e2f07ab1c6a4b5e3d8f9c2a1b',
      ].join('\n');
      const r = extractIocs({ text });
      expect(hashValues(r)).toContain(
        'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2'
      );
      expect(hashValues(r)).toContain('0226ab4e2f07ab1c6a4b5e3d8f9c2a1b');
    });
  });

  describe('URLs — retained (url extraction unaffected by domain filters)', () => {
    test('retains GitHub raw payload URL', () => {
      const r = extractIocs({
        text: 'loader fetches https://raw.githubusercontent.com/attacker/repo/main/payload.bin',
      });
      expect(urlValues(r)).toContain(
        'https://raw.githubusercontent.com/attacker/repo/main/payload.bin'
      );
    });

    test('retains C2 URL', () => {
      const r = extractIocs({ text: 'beacon POST to https://update.evil.top/checkin?id=1234' });
      expect(urlValues(r)).toContain('https://update.evil.top/checkin?id=1234');
    });
  });

  describe('real C2 gold corpus — unchanged by new filters', () => {
    test('retains qaqkongtiao.com', () => {
      const r = extractIocs({ text: 'C2 observed at qaqkongtiao.com' });
      expect(domainValues(r)).toContain('qaqkongtiao.com');
    });

    test('retains sfrclak.com', () => {
      const r = extractIocs({ text: 'beacon to sfrclak.com:8080' });
      expect(domainValues(r)).toContain('sfrclak.com');
    });
  });

  describe('ioc_set_hash — computed from anchor-eligible IOCs only (not reference/denied)', () => {
    test('returns null when all tokens are reference or denied tier', () => {
      // elastic.co → reference; virustotal.com → reference; WScript.Execute → hard drop (non-IANA TLD).
      // All emitted domains are reference/denied so ioc_set_hash = null.
      const r = extractIocs({
        text: 'svchost.exe explorer.exe WScript.Execute Thread.Sleep elastic.co virustotal.com',
      });
      expect(r.ioc_set_hash).toBeNull();
      // count is > 0 now because reference-tier domains are kept for observability
      expect(r.count).toBeGreaterThan(0);
    });

    test('returns a hash when at least one real IOC survives', () => {
      const r = extractIocs({ text: 'C2 at wndlogon.hopto.org after dropping update.zip' });
      // 'wndlogon.hopto.org' is a real domain; 'update.zip' is a file extension
      expect(r.ioc_set_hash).not.toBeNull();
      expect(domainValues(r)).toContain('wndlogon.hopto.org');
    });
  });

  describe('noise domain denylist additions (eval-2026-06-23) — reference tier', () => {
    test('registry.npmjs.org → uncertain (content-host removed from denylist; path is the signal)', () => {
      const r = extractIocs({ text: 'package fetched from registry.npmjs.org/lodash' });
      const ioc = r.iocs.find((i) => i.value === 'registry.npmjs.org');
      expect(ioc?.tier).toBe('uncertain');
    });

    test('eset.com → reference/vendor_research tier, not anchor-eligible', () => {
      const r = extractIocs({ text: 'ESET researchers at eset.com published this analysis' });
      expect(anchorDomainValues(r)).not.toContain('eset.com');
      expect(tieredValues(r, 'reference', 'domain')).toContain('eset.com');
      const ioc = r.iocs.find((i) => i.value === 'eset.com');
      expect(ioc?.tier_basis).toBe('vendor_research');
    });
  });

  describe('redaction-adjacency drop (step a)', () => {
    test('drops ie.com when immediately preceded by * (aad****ie.com pattern)', () => {
      // The regex matches 'ie.com' as a separate token after the masking chars.
      const r = extractIocs({ text: 'victim domain aad****ie.com redacted in table' });
      expect(domainValues(r)).not.toContain('ie.com');
    });

    test('drops ie.com when preceded by block-glyph redaction (a██ie.com)', () => {
      const r = extractIocs({ text: 'victim domain a██ie.com redacted in table' });
      expect(domainValues(r)).not.toContain('ie.com');
    });

    test('keeps ie.com when NOT preceded by a masking glyph', () => {
      const r = extractIocs({ text: 'TLD ccTLD for Ireland is ie.com example' });
      expect(domainValues(r)).toContain('ie.com');
    });

    test('keeps evil.com when wrapped in markdown bold (**evil.com**)', () => {
      // Bold emphasis: glyph run is at start of token, not glued to an alnum label.
      const r = extractIocs({ text: 'C2 callback to **evil.com** per the report' });
      expect(domainValues(r)).toContain('evil.com');
    });

    test('keeps bad.org when wrapped in markdown italic (*bad.org*)', () => {
      const r = extractIocs({ text: 'dropper contacts *bad.org* for staging' });
      expect(domainValues(r)).toContain('bad.org');
    });

    test('keeps evil.com when preceded by a bullet (* evil.com with space)', () => {
      const r = extractIocs({ text: '* evil.com\n* other.net' });
      expect(domainValues(r)).toContain('evil.com');
    });
  });

  describe('corroboration gate for ambiguous TLDs (step e) — emitted as denied tier', () => {
    test('ld.py — ambiguous TLD, uncorroborated → tier=denied, not anchor-eligible', () => {
      const r = extractIocs({ text: 'script calls ld.py to link objects' });
      expect(anchorDomainValues(r)).not.toContain('ld.py');
      expect(tieredValues(r, 'denied', 'domain')).toContain('ld.py');
    });

    test('subprocess.run — ambiguous TLD, uncorroborated → tier=denied', () => {
      const r = extractIocs({ text: 'code calls subprocess.run(cmd, shell=True)' });
      expect(anchorDomainValues(r)).not.toContain('subprocess.run');
      expect(tieredValues(r, 'denied', 'domain')).toContain('subprocess.run');
    });

    test('WScript.Shell — ambiguous TLD, uncorroborated → tier=denied', () => {
      const r = extractIocs({ text: 'macro creates WScript.Shell object' });
      expect(anchorDomainValues(r)).not.toContain('wscript.shell');
      expect(tieredValues(r, 'denied', 'domain')).toContain('wscript.shell');
    });

    test('keeps evil.py when defanged-in-source (defanged corroboration)', () => {
      const r = extractIocs({ text: 'C2 beacon to evil[.]py' });
      expect(domainValues(r)).toContain('evil.py');
    });

    test('keeps evil.py when it is the host of an extracted URL (url-host corroboration)', () => {
      const r = extractIocs({ text: 'payload from https://evil.py/x' });
      expect(domainValues(r)).toContain('evil.py');
    });

    test('normal domain evil.com passes gate unchanged (gate only touches AMBIGUOUS_TLDS)', () => {
      const r = extractIocs({ text: 'C2 callback to evil.com' });
      expect(domainValues(r)).toContain('evil.com');
    });
  });

  describe('public-suffix guard (step b2)', () => {
    test('drops bare co.uk (multi-label public suffix)', () => {
      const r = extractIocs({ text: 'victim domain was co.uk in the table' });
      expect(domainValues(r)).not.toContain('co.uk');
    });

    test('drops bare co.nz', () => {
      const r = extractIocs({ text: 'registrant suffix co.nz observed' });
      expect(domainValues(r)).not.toContain('co.nz');
    });

    test('drops bare com.br', () => {
      const r = extractIocs({ text: 'fragment com.br in redacted table' });
      expect(domainValues(r)).not.toContain('com.br');
    });

    test('drops bare c.id', () => {
      const r = extractIocs({ text: 'suffix fragment c.id extracted' });
      expect(domainValues(r)).not.toContain('c.id');
    });

    test('drops bare wl.gl (single registrar, commonly a suffix fragment)', () => {
      // wl.gl is not in PUBLIC_SUFFIX_DROPLIST — it is a registrable .gl domain.
      // This test documents the boundary: only explicit droplist entries are dropped.
      // wl.gl survives; only the listed multi-label suffixes are affected.
      const r = extractIocs({ text: 'redirect via wl.gl shortener' });
      // wl.gl is NOT in the droplist — it passes (this test confirms no over-dropping)
      expect(domainValues(r)).toContain('wl.gl');
    });

    test('KEEPS evil.co.uk — registrable domain built on a public suffix', () => {
      const r = extractIocs({ text: 'C2 callback to evil.co.uk:443' });
      expect(domainValues(r)).toContain('evil.co.uk');
    });

    test('KEEPS acme.com — normal TLD unaffected by public-suffix guard', () => {
      const r = extractIocs({ text: 'beacon to acme.com' });
      expect(domainValues(r)).toContain('acme.com');
    });

    test('KEEPS sub.evil.co.uk — multi-label registrable domain', () => {
      const r = extractIocs({ text: 'stage2 from sub.evil.co.uk/payload' });
      expect(domainValues(r)).toContain('sub.evil.co.uk');
    });
  });

  describe('tier fields — heuristic assignment (Stage B1)', () => {
    test('hash IOC gets tier=discriminating, basis=hash_high_entropy', () => {
      const r = extractIocs({
        text: 'sha256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
      });
      const hash = r.iocs.find((ioc) => ioc.type === 'hash');
      expect(hash?.tier).toBe('discriminating');
      expect(hash?.tier_heuristic).toBe('discriminating');
      expect(hash?.tier_basis).toBe('hash_high_entropy');
    });

    test('defanged domain gets tier=discriminating, basis=defanged_source', () => {
      const r = extractIocs({ text: 'C2 at evil[.]com' });
      const ioc = r.iocs.find((i) => i.value === 'evil.com');
      expect(ioc?.tier).toBe('discriminating');
      expect(ioc?.tier_basis).toBe('defanged_source');
    });

    test('ordinary unknown domain gets tier=uncertain', () => {
      const r = extractIocs({ text: 'C2 callback to qaqkongtiao.com' });
      const ioc = r.iocs.find((i) => i.value === 'qaqkongtiao.com');
      expect(ioc?.tier).toBe('uncertain');
      expect(ioc?.tier_basis).toBe('uncertain_default');
    });

    test('private IP gets tier=reference, basis=private_ip', () => {
      // Private IPs are now emitted (previously dropped silently).
      const r = extractIocs({ text: 'LAN hop at 10.0.0.1' });
      const ioc = r.iocs.find((i) => i.value === '10.0.0.1');
      expect(ioc?.tier).toBe('reference');
      expect(ioc?.tier_basis).toBe('private_ip');
    });

    test('noise denylist domain gets tier=reference, basis=denylist', () => {
      const r = extractIocs({ text: 'scan via virustotal.com' });
      const ioc = r.iocs.find((i) => i.value === 'virustotal.com');
      expect(ioc?.tier).toBe('reference');
      expect(ioc?.tier_basis).toBe('denylist');
    });

    test('uncorroborated ambiguous-TLD token gets tier=denied, basis=code_shaped', () => {
      const r = extractIocs({ text: 'script calls ld.py' });
      const ioc = r.iocs.find((i) => i.value === 'ld.py');
      expect(ioc?.tier).toBe('denied');
      expect(ioc?.tier_basis).toBe('code_shaped');
    });

    test('tier == tier_heuristic for all IOCs (no LLM override yet)', () => {
      const r = extractIocs({ text: 'C2 evil[.]com, hash: d41d8cd98f00b204e9800998ecf8427e' });
      for (const ioc of r.iocs) {
        expect(ioc.tier).toBe(ioc.tier_heuristic);
      }
    });

    test('amazonaws.com subdomain gets tier=contextual, basis=known_cdn', () => {
      const r = extractIocs({ text: 'payload from attacker.s3.amazonaws.com' });
      const ioc = r.iocs.find((i) => i.value === 'attacker.s3.amazonaws.com');
      expect(ioc?.tier).toBe('contextual');
      expect(ioc?.tier_basis).toBe('known_cdn');
    });

    test('ioc_set_hash excludes reference and denied IOCs', () => {
      const withNoise = extractIocs({ text: 'C2 evil.com virustotal.com' });
      const withoutNoise = extractIocs({ text: 'C2 evil.com' });
      // Both should produce the same hash — virustotal.com is reference and excluded.
      expect(withNoise.ioc_set_hash).toBe(withoutNoise.ioc_set_hash);
    });
  });

  describe('mixed realistic report — RoningLoader-style smoke test', () => {
    const roningLoaderText = `
      The threat actor distributed a signed driver WinRing0x64.sys
      (SHA256: a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2)
      alongside atiadlxx.dll (MD5: 0226ab4e2f07ab1c6a4b5e3d8f9c2a1b).
      Loader calls ProtoBuf.Serializer.Deserialize and Thread.Sleep(5000).
      System binaries svchost.exe, explorer.exe, powershell.exe used as cover.
      C2 infrastructure: wndlogon.hopto.org:443, backup domain payload.attacker.top.
      Payload fetched from https://raw.githubusercontent.com/attacker/malware/main/stage2.bin
      Report sourced from virustotal.com and elastic.co intelligence feeds.
      Analysis tools: urlscan.io scan at urlscan.io/result/abc123.
    `;

    test('noise tokens are not anchor-eligible (reference/denied tier or hard-dropped)', () => {
      const r = extractIocs({ text: roningLoaderText });
      const anchors = anchorDomainValues(r);
      // File-extension hard drops still absent entirely:
      expect(domainValues(r)).not.toContain('wndlogon.hopto'); // truncated fragment
      // hopto.org is longest-match deduped by wndlogon.hopto.org (both are not denylist):
      expect(anchors).not.toContain('hopto.org'); // suffix fragment
      // Noise denylist domains are emitted as reference but not anchors:
      expect(anchors).not.toContain('virustotal.com');
      expect(anchors).not.toContain('elastic.co');
      expect(anchors).not.toContain('urlscan.io');
    });

    test('retains all real IOCs', () => {
      const r = extractIocs({ text: roningLoaderText });
      const domains = domainValues(r);
      const hashes = hashValues(r);
      const urls = urlValues(r);

      expect(domains).toContain('wndlogon.hopto.org');
      expect(domains).toContain('payload.attacker.top');
      expect(hashes).toContain('a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2');
      expect(hashes).toContain('0226ab4e2f07ab1c6a4b5e3d8f9c2a1b');
      expect(urls).toContain('https://raw.githubusercontent.com/attacker/malware/main/stage2.bin');
    });
  });
});

// ── New type: email ───────────────────────────────────────────────────────────

describe('extract_iocs — email extraction (shred fix)', () => {
  test('extracts full email address, not bare provider domain', () => {
    const r = extractIocs({ text: 'contact nrwise@proton.me for attribution' });
    expect(emailValues(r)).toContain('nrwise@proton.me');
    // Provider domain must NOT be emitted separately
    expect(domainValues(r)).not.toContain('proton.me');
  });

  test('extracts gmail address without emitting gmail.com as a domain', () => {
    const r = extractIocs({ text: 'attacker used jasonsaayman@gmail.com as comms' });
    expect(emailValues(r)).toContain('jasonsaayman@gmail.com');
    expect(domainValues(r)).not.toContain('gmail.com');
  });

  test('extracts service-account email (complex local-part)', () => {
    const r = extractIocs({ text: 'actor used dev0-660@project123.iam.gserviceaccount.com' });
    expect(emailValues(r)).toContain('dev0-660@project123.iam.gserviceaccount.com');
  });

  test('defanged email with [.] in host is extracted as email, host not emitted separately', () => {
    const r = extractIocs({ text: 'attacker emailed from bad@evil[.]com' });
    expect(emailValues(r)).toContain('bad@evil.com');
    expect(domainValues(r)).not.toContain('evil.com');
  });

  test('fanged email → uncertain tier (not defanged-in-source)', () => {
    const r = extractIocs({ text: 'attacker used actor@malicious.org for c2' });
    const ioc = r.iocs.find((i) => i.value === 'actor@malicious.org');
    expect(ioc?.type).toBe('email');
    expect(ioc?.tier).toBe('uncertain');
  });

  test('email is included in ioc_set_hash (anchor-eligible)', () => {
    const withEmail = extractIocs({ text: 'attacker actor@malicious.org contacted server' });
    const withoutEmail = extractIocs({ text: 'attacker contacted server' });
    expect(withEmail.ioc_set_hash).not.toBe(withoutEmail.ioc_set_hash);
  });
});

// ── New type: wallet ──────────────────────────────────────────────────────────

describe('extract_iocs — wallet extraction (shred fix)', () => {
  test('BTC legacy address (32-hex) extracts as wallet, NOT hash', () => {
    // 3C75CEDB1196DF5EAB91F31411ED4B33 would be stolen by MD5 regex — but it is
    // actually base58 format and won't match BTC legacy (starts with 1 or 3, base58).
    // Use a real-format BTC legacy address for the test.
    const btcAddr = '1A1zP1eP5QGefi2DMPTfTL5SLmv7Divf6n'; // genesis block coinbase
    const r = extractIocs({ text: `BTC ransom to ${btcAddr}` });
    expect(walletValues(r)).toContain(btcAddr);
    expect(hashValues(r)).not.toContain(btcAddr.toLowerCase());
  });

  test('ETH address extracts as wallet', () => {
    // Standard 0x + 40 hex chars ETH address
    const ethAddr = '0xde0B295669a9FD93d5F28D9Ec85E40f4cb697BAe';
    const r = extractIocs({ text: `ETH wallet ${ethAddr}` });
    expect(walletValues(r)).toContain(ethAddr);
    // The 40-hex suffix alone must not appear as a hash
    expect(hashValues(r)).not.toContain(ethAddr.toLowerCase().slice(2));
  });

  test('BTC bech32 address extracts as wallet', () => {
    const bech32 = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
    const r = extractIocs({ text: `payment to ${bech32}` });
    expect(walletValues(r)).toContain(bech32);
  });

  test('wallet tier is discriminating', () => {
    const btcAddr = '1A1zP1eP5QGefi2DMPTfTL5SLmv7Divf6n';
    const r = extractIocs({ text: `ransom ${btcAddr}` });
    const ioc = r.iocs.find((i) => i.type === 'wallet');
    expect(ioc?.tier).toBe('discriminating');
    expect(ioc?.tier_basis).toBe('wallet_high_entropy');
  });
});

// ── New type: cidr ────────────────────────────────────────────────────────────

describe('extract_iocs — cidr extraction (shred fix)', () => {
  test('CIDR keeps full range value — not shredded to bare network IP', () => {
    const r = extractIocs({ text: 'blocklist includes 106.41.253.0/24' });
    expect(cidrValues(r)).toContain('106.41.253.0/24');
  });

  test('CIDR also derives bare network IP as separate indicator', () => {
    const r = extractIocs({ text: 'range 106.41.253.0/24 in blocklist' });
    expect(cidrValues(r)).toContain('106.41.253.0/24');
    expect(ipValues(r)).toContain('106.41.253.0');
  });

  test('defanged CIDR with [.] extracts correctly', () => {
    const r = extractIocs({ text: 'block range 106[.]41[.]253[.]0/24' });
    expect(cidrValues(r)).toContain('106.41.253.0/24');
  });

  test('narrow CIDR (/30) → discriminating tier', () => {
    const r = extractIocs({ text: 'C2 range 185.62.58.204/30' });
    const cidr = r.iocs.find((i) => i.type === 'cidr');
    expect(cidr?.tier).toBe('discriminating');
    expect(cidr?.tier_basis).toBe('cidr_narrow');
  });

  test('broad CIDR (/16) → contextual tier', () => {
    const r = extractIocs({ text: 'ASN range 10.20.0.0/16' });
    const cidr = r.iocs.find((i) => i.type === 'cidr');
    expect(cidr?.tier).toBe('contextual');
    expect(cidr?.tier_basis).toBe('cidr_broad');
  });

  test('/29 boundary → discriminating', () => {
    const r = extractIocs({ text: 'infra 185.62.58.200/29' });
    const cidr = r.iocs.find((i) => i.type === 'cidr');
    expect(cidr?.tier).toBe('discriminating');
  });

  test('/28 → contextual (below /29 threshold)', () => {
    const r = extractIocs({ text: 'infra 185.62.58.192/28' });
    const cidr = r.iocs.find((i) => i.type === 'cidr');
    expect(cidr?.tier).toBe('contextual');
    expect(cidr?.tier_basis).toBe('cidr_broad');
  });
});

// ── Socket: host:port ─────────────────────────────────────────────────────────

describe('extract_iocs — socket (ip:port / domain:port)', () => {
  test('ip:port → ip indicator with port field, port not a separate IOC', () => {
    const r = extractIocs({ text: 'C2 at 185.62.58.207:443' });
    const ipIoc = r.iocs.find((i) => i.type === 'ip' && i.value === '185.62.58.207');
    expect(ipIoc).toBeDefined();
    expect(ipIoc?.port).toBe(443);
    // Port 443 is not emitted as a separate type
    expect(r.iocs.filter((i) => i.type === 'ip' && i.value === '443')).toHaveLength(0);
  });

  test('defanged ip:port retains port', () => {
    const r = extractIocs({ text: 'callback 31.172.71[.]5:8008' });
    const ipIoc = r.iocs.find((i) => i.type === 'ip' && i.value === '31.172.71.5');
    expect(ipIoc?.port).toBe(8008);
  });

  test('domain:port → domain indicator with port field', () => {
    const r = extractIocs({ text: 'TOLLBOOTH C2: sfrclak.com:8000' });
    const domIoc = r.iocs.find((i) => i.type === 'domain' && i.value === 'sfrclak.com');
    expect(domIoc).toBeDefined();
    expect(domIoc?.port).toBe(8000);
  });

  test('ip:port does not emit port as an ip value', () => {
    const r = extractIocs({ text: 'C2 server 1.2.3.4:4444' });
    expect(ipValues(r)).not.toContain('4444');
    expect(ipValues(r)).toContain('1.2.3.4');
  });
});

// ── Fix 1: socket port merged onto CIDR-derived / atomic IP ──────────────────

describe('extract_iocs — socket port merge onto prior-seen host (Fix 1)', () => {
  test('CIDR-derived IP followed by socket ip:port retains port (CIDR first)', () => {
    // 36.35.56.0/24 → derives bare ip:36.35.56.0 (no port). Socket 36.35.56.0:443
    // arrives later in Pass 5 — port must be merged onto the existing IOC.
    const r = extractIocs({ text: 'blocklist 36.35.56.0/24 and C2 socket 36.35.56.0:443' });
    const ipIoc = r.iocs.find((i) => i.type === 'ip' && i.value === '36.35.56.0');
    expect(ipIoc).toBeDefined();
    expect(ipIoc?.port).toBe(443);
    // Only one ip IOC for this value
    expect(r.iocs.filter((i) => i.type === 'ip' && i.value === '36.35.56.0')).toHaveLength(1);
  });

  test('socket ip:port followed by CIDR for same IP — port is retained (socket first)', () => {
    // Socket 36.35.56.0:443 is consumed by Pass 5 and emits ip with port. CIDR
    // 36.35.56.0/24 derives ip:36.35.56.0 via pushIoc — already in seen, so skipped.
    // The socket-emitted IOC (with port) is the one retained.
    const r = extractIocs({ text: 'C2 socket 36.35.56.0:443 and block range 36.35.56.0/24' });
    const ipIoc = r.iocs.find((i) => i.type === 'ip' && i.value === '36.35.56.0');
    expect(ipIoc).toBeDefined();
    expect(ipIoc?.port).toBe(443);
    expect(r.iocs.filter((i) => i.type === 'ip' && i.value === '36.35.56.0')).toHaveLength(1);
  });

  test('domain appears bare then as domain:port — port is merged onto existing IOC', () => {
    const r = extractIocs({ text: 'domain evil.com and socket evil.com:8080' });
    const domIoc = r.iocs.find((i) => i.type === 'domain' && i.value === 'evil.com');
    expect(domIoc).toBeDefined();
    expect(domIoc?.port).toBe(8080);
    expect(r.iocs.filter((i) => i.type === 'domain' && i.value === 'evil.com')).toHaveLength(1);
  });

  test('first socket port wins when two sockets reference the same host', () => {
    // Two sockets for same IP — only one IOC emitted; first port (443) wins.
    const r = extractIocs({ text: 'C2 36.35.56.0:443 and also 36.35.56.0:8080' });
    const ipIoc = r.iocs.find((i) => i.type === 'ip' && i.value === '36.35.56.0');
    expect(ipIoc?.port).toBe(443);
    expect(r.iocs.filter((i) => i.type === 'ip' && i.value === '36.35.56.0')).toHaveLength(1);
  });
});

// ── Fix 2: email host domain excluded from defangedDomains ───────────────────

describe('extract_iocs — email host not added to defangedDomains (Fix 2)', () => {
  test('defanged email host (gmail[.]com) does not make gmail.com discriminating elsewhere', () => {
    // Report contains evil@gmail[.]com (defanged). gmail.com appears separately bare.
    // gmail.com must NOT get tier=discriminating from the email host defang.
    const r = extractIocs({ text: 'attacker used evil@gmail[.]com and also gmail.com as relay' });
    const domIoc = r.iocs.find((i) => i.type === 'domain' && i.value === 'gmail.com');
    // gmail.com should be emitted (it appears bare in the text) but NOT discriminating.
    if (domIoc) {
      expect(domIoc.tier).not.toBe('discriminating');
      expect(domIoc.tier_basis).not.toBe('defanged_source');
    }
    // Email IOC is still extracted correctly
    expect(r.iocs.filter((i) => i.type === 'email').map((i) => i.value)).toContain(
      'evil@gmail.com'
    );
  });

  test('defanged email with provider domain — provider domain not emitted as IOC at all', () => {
    // gmail.com appears ONLY as the email host, not standalone — must not be emitted.
    const r = extractIocs({ text: 'attacker only used evil@gmail[.]com for comms' });
    expect(r.iocs.filter((i) => i.type === 'domain' && i.value === 'gmail.com')).toHaveLength(0);
    expect(r.iocs.filter((i) => i.type === 'email').map((i) => i.value)).toContain(
      'evil@gmail.com'
    );
  });

  test('domain defanged in email AND standalone keeps discriminating tier', () => {
    // admin@evil[.]com → email (host suppressed). evil[.]com standalone → defanged domain.
    // evil.com must still get tier=discriminating/defanged_source from the standalone occurrence.
    const r = extractIocs({ text: 'actor admin@evil[.]com contacted C2 at evil[.]com' });
    const domIoc = r.iocs.find((i) => i.type === 'domain' && i.value === 'evil.com');
    expect(domIoc).toBeDefined();
    expect(domIoc?.tier).toBe('discriminating');
    expect(domIoc?.tier_basis).toBe('defanged_source');
  });
});

// ── B1.6 Fix 1: defanged IP promotion ────────────────────────────────────────

describe('extract_iocs — defanged IP promotion (B1.6 Fix 1)', () => {
  test('defanged public IP → discriminating/defanged_source (203[.]0[.]113[.]5)', () => {
    const r = extractIocs({ text: 'C2 server at 203[.]0[.]113[.]5:443' });
    const ioc = r.iocs.find((i) => i.type === 'ip' && i.value === '203.0.113.5');
    expect(ioc?.tier).toBe('discriminating');
    expect(ioc?.tier_basis).toBe('defanged_source');
  });

  test('defanged private IP stays reference/private_ip (10[.]0[.]0[.]1)', () => {
    // private_ip wins over defanged_source — a defanged LAN address is not a C2 indicator
    const r = extractIocs({ text: 'lateral movement via 10[.]0[.]0[.]1' });
    const ioc = r.iocs.find((i) => i.type === 'ip' && i.value === '10.0.0.1');
    expect(ioc?.tier).toBe('reference');
    expect(ioc?.tier_basis).toBe('private_ip');
  });

  test('non-defanged public IP stays uncertain (203.0.113.99)', () => {
    const r = extractIocs({ text: 'C2 at 203.0.113.99' });
    const ioc = r.iocs.find((i) => i.type === 'ip' && i.value === '203.0.113.99');
    expect(ioc?.tier).toBe('uncertain');
    expect(ioc?.tier_basis).toBe('uncertain_default');
  });

  test('defanged C2 IP with hxxps URL → discriminating (142[.]11[.]206[.]73 corpus gold)', () => {
    // Simulates the Axios supply-chain gold TP IP
    const r = extractIocs({ text: 'C2 IP 142[.]11[.]206[.]73 port 8000' });
    const ioc = r.iocs.find((i) => i.type === 'ip' && i.value === '142.11.206.73');
    expect(ioc?.tier).toBe('discriminating');
    expect(ioc?.tier_basis).toBe('defanged_source');
  });
});

// ── B1.6 Fix 2: vendor/research domains + content-host reclassification ──────

describe('extract_iocs — vendor/research domains (B1.6 Fix 2)', () => {
  test('microsoft.com → reference/vendor_research (exact match)', () => {
    const r = extractIocs({ text: 'download from microsoft.com security portal' });
    expect(tieredValues(r, 'reference', 'domain')).toContain('microsoft.com');
    expect(anchorDomainValues(r)).not.toContain('microsoft.com');
    const ioc = r.iocs.find((i) => i.value === 'microsoft.com');
    expect(ioc?.tier_basis).toBe('vendor_research');
  });

  test('kaspersky.com → reference/vendor_research (exact match)', () => {
    const r = extractIocs({ text: 'analysis at kaspersky.com research' });
    expect(tieredValues(r, 'reference', 'domain')).toContain('kaspersky.com');
    expect(anchorDomainValues(r)).not.toContain('kaspersky.com');
    const ioc = r.iocs.find((i) => i.value === 'kaspersky.com');
    expect(ioc?.tier_basis).toBe('vendor_research');
  });

  test('research.kaspersky.com → reference/vendor_research (suffix match)', () => {
    const r = extractIocs({ text: 'blog post at research.kaspersky.com' });
    expect(tieredValues(r, 'reference', 'domain')).toContain('research.kaspersky.com');
    const ioc = r.iocs.find((i) => i.value === 'research.kaspersky.com');
    expect(ioc?.tier_basis).toBe('vendor_research');
  });

  test('reset.com does NOT match eset.com suffix (dotted prefix prevents collision)', () => {
    const r = extractIocs({ text: 'domain reset.com observed' });
    const ioc = r.iocs.find((i) => i.value === 'reset.com');
    expect(ioc?.tier_basis).not.toBe('vendor_research');
    expect(ioc?.tier).toBe('uncertain');
  });

  test('unit42.paloaltonetworks.com → reference/vendor_research (suffix match)', () => {
    const r = extractIocs({ text: 'report at unit42.paloaltonetworks.com' });
    const ioc = r.iocs.find((i) => i.value === 'unit42.paloaltonetworks.com');
    expect(ioc?.tier).toBe('reference');
    expect(ioc?.tier_basis).toBe('vendor_research');
  });

  test('raw.githubusercontent.com → uncertain (content-host; URL IOCs still captured)', () => {
    const r = extractIocs({
      text: 'payload at https://raw.githubusercontent.com/attacker/repo/stage2.bin raw.githubusercontent.com',
    });
    const bareIoc = r.iocs.find((i) => i.type === 'domain' && i.value === 'raw.githubusercontent.com');
    expect(bareIoc?.tier).toBe('uncertain');
    // URL itself is still extracted
    expect(urlValues(r)).toContain('https://raw.githubusercontent.com/attacker/repo/stage2.bin');
  });

  test('github.com → uncertain (content-host, not in denylist or vendor set)', () => {
    const r = extractIocs({ text: 'source at github.com' });
    const ioc = r.iocs.find((i) => i.value === 'github.com');
    expect(ioc?.tier).toBe('uncertain');
  });

  test('baidu.com → uncertain (removed from denylist; benign incumbent for B2 to judge)', () => {
    const r = extractIocs({ text: 'liveness check to baidu.com hardcoded' });
    const ioc = r.iocs.find((i) => i.value === 'baidu.com');
    expect(ioc?.tier).toBe('uncertain');
  });
});

// ── URL host tier inheritance ──────────────────────────────────────────────────

describe('extract_iocs — URL tier inherits from host', () => {
  test('URL with defanged host inherits discriminating tier', () => {
    const r = extractIocs({ text: 'payload from hxxps://evil[.]com/stage2.bin' });
    const url = r.iocs.find((i) => i.type === 'url');
    expect(url?.tier).toBe('discriminating');
    expect(url?.tier_basis).toMatch(/url_host_inherited:defanged_source/);
  });

  test('URL with CDN host stays uncertain (lift-only; non-discriminating host does not propagate)', () => {
    const r = extractIocs({ text: 'C2 at https://attacker.s3.amazonaws.com/payload' });
    const url = r.iocs.find((i) => i.type === 'url');
    expect(url?.tier).toBe('uncertain');
    expect(url?.tier_basis).toBe('uncertain_default');
  });

  test('URL with ordinary unknown host is uncertain', () => {
    const r = extractIocs({ text: 'C2 at https://sfrclak.com/6202033' });
    const url = r.iocs.find((i) => i.type === 'url');
    expect(url?.tier).toBe('uncertain');
  });

  test('C2 URL with port preserves port in value', () => {
    const r = extractIocs({ text: 'beacon to http://sfrclak.com:8000/6202033' });
    expect(urlValues(r)).toContain('http://sfrclak.com:8000/6202033');
  });

  test('URL on content-hosting host stays uncertain even with discriminating path', () => {
    // Path carries the signal — host is not discriminating, so no lift to reference/contextual.
    // B2 judges the full URL.
    const r = extractIocs({
      text: 'payload at https://raw.githubusercontent.com/attacker/repo/payload.ps1',
    });
    const url = r.iocs.find((i) => i.type === 'url');
    expect(url?.tier).toBe('uncertain');
    expect(url?.tier_basis).toBe('uncertain_default');
  });

  test('URL on discriminating (defanged) host lifts to discriminating', () => {
    const r = extractIocs({ text: 'C2 https://evil[.]com/stage2' });
    const url = r.iocs.find((i) => i.type === 'url');
    expect(url?.tier).toBe('discriminating');
    expect(url?.tier_basis).toMatch(/url_host_inherited:defanged_source/);
  });
});

// ── Leak test (critical gate) ────────────────────────────────────────────────
// Exercises the htmlToStructured → extractIocs path (as the route does) and
// asserts that NO emitted anchor value contains raw markdown artifacts.
// This is the gate: if a markdown artifact survives into a stored IOC value,
// it would corrupt anchor matching and downstream correlation.

describe('extract_iocs — htmlToStructured leak test (markdown artifact gate)', () => {
  // Import the helper to wire up the same transformation the route uses.
  // We call it here explicitly to simulate the route's html→structured→extractIocs flow.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { htmlToStructured } = require('../adapters/text') as typeof import('../adapters/text');

  const MARKDOWN_ARTIFACT_PATTERN = /[\[\]|`#()]/;

  const extractFromHtml = (html: string) => extractIocs({ text: htmlToStructured(html) });

  test('IOC table cells produce clean domain values (no pipe, bracket, hash artifacts)', () => {
    const html = `
      <table>
        <tr><th>Type</th><th>Indicator</th><th>Context</th></tr>
        <tr><td>Domain</td><td>evil.com</td><td>C2 server</td></tr>
        <tr><td>Domain</td><td>bad[.]example.net</td><td>Dropper host</td></tr>
        <tr><td>IP</td><td>192.0.2.55</td><td>Pivot host</td></tr>
        <tr><td>Hash</td><td>d41d8cd98f00b204e9800998ecf8427e</td><td>Loader</td></tr>
      </table>
    `;
    const r = extractFromHtml(html);

    // Known good values must be present
    expect(domainValues(r)).toContain('evil.com');
    expect(domainValues(r)).toContain('bad.example.net');
    expect(valuesOf(r, 'ip')).toContain('192.0.2.55');
    expect(hashValues(r)).toContain('d41d8cd98f00b204e9800998ecf8427e');

    // LEAK GATE: no emitted value may contain markdown artifact chars
    for (const ioc of r.iocs) {
      if (ioc.tier === 'reference' || ioc.tier === 'denied') continue; // noise entries OK to skip
      expect(ioc.value).not.toMatch(MARKDOWN_ARTIFACT_PATTERN);
      // Clean canonical form: domain must exactly match the refanged value
      if (ioc.type === 'domain') {
        expect(ioc.value).toMatch(/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/);
      }
    }
  });

  test('heading and list HTML produce clean IOC values', () => {
    const html = `
      <h2>Indicators</h2>
      <ul>
        <li>Domain: evil2.com</li>
        <li>IP: 203.0.113.7</li>
      </ul>
    `;
    const r = extractFromHtml(html);

    expect(domainValues(r)).toContain('evil2.com');
    expect(valuesOf(r, 'ip')).toContain('203.0.113.7');

    for (const ioc of r.iocs) {
      if (ioc.tier === 'reference' || ioc.tier === 'denied') continue;
      expect(ioc.value).not.toMatch(MARKDOWN_ARTIFACT_PATTERN);
    }
  });

  test('anchor href URLs are extractable and value is clean', () => {
    const html = `
      <p>Command-and-control: <a href="https://c2.evil.com/beacon">C2 link</a></p>
    `;
    const r = extractFromHtml(html);

    const urlIoc = r.iocs.find((i) => i.type === 'url' && i.value.includes('c2.evil.com'));
    expect(urlIoc).toBeDefined();
    // Must NOT be [C2 link](https://c2.evil.com/beacon) markdown form
    expect(urlIoc?.value).not.toMatch(MARKDOWN_ARTIFACT_PATTERN);
    expect(urlIoc?.value).toBe('https://c2.evil.com/beacon');
  });

  test('defanged IOC in table cell survives refang and is clean', () => {
    const html = `
      <table>
        <tr><td>C2 Domain</td><td>evil[.]attacker[.]top</td></tr>
        <tr><td>C2 IP</td><td>198[.]51[.]100[.]99</td></tr>
      </table>
    `;
    const r = extractFromHtml(html);

    expect(domainValues(r)).toContain('evil.attacker.top');
    expect(valuesOf(r, 'ip')).toContain('198.51.100.99');

    for (const ioc of r.iocs) {
      if (ioc.tier === 'reference' || ioc.tier === 'denied') continue;
      expect(ioc.value).not.toMatch(MARKDOWN_ARTIFACT_PATTERN);
    }
  });
});
