/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ElasticsearchClient, Logger } from '@kbn/core/server';
import {
  GLOBAL_SPACE_ID,
  THREAT_INTEL_SOURCES_INDEX,
  type ThreatCategory,
} from '../../../common/threat_intelligence/hub';

/**
 * Default sources seeded into `.kibana-threat-intel-sources` on first boot.
 *
 * The first section ("Curated starter set") is the small, hand-picked list
 * we've maintained inline: first-party vendor research, top-tier
 * government/CERT advisories, the major independent outlets, and
 * ransomware-extortion watch feeds. These entries carry rich, hand-assigned
 * `tags` so the dashboard's category panels light up correctly on a fresh
 * install, and Elastic Security Labs is the canonical `vendor_api` source.
 *
 * The second section ("Imported from security-ciso-news-aggregator") is the
 * full 214-feed catalog imported from the
 * `elastic/security-ciso-news-aggregator` repo's `src/lib/feed-catalog.ts`.
 * Entries whose URL or stable id already exist in the curated section above
 * are skipped (the curated tags are richer); tags on the imported entries
 * are derived from the upstream `category` (news / blog / advisory /
 * research) plus a keyword scan over name + description against the
 * vocabulary that `CATEGORY_KEYWORDS` reads.
 *
 * Coverage across the feed-level categories is enforced by the
 * `verifyCategoryCoverage` invariant below: every SOURCE-SHAPE category
 * (the ones feeds are actually tagged with) must have at least **two**
 * distinct feeds so the dashboard's category panel isn't a one-source view.
 * Content-classification categories (`nation-state`, `financial`,
 * `regulatory`, `zero-day`, `general`) are NOT enforced here — they are
 * assigned per-report by `enrich_taxonomy` at ingest time, not by feed
 * membership (a single Unit42 or Mandiant feed publishes across all of them).
 *
 * Operators still expand the set further via the manage-sources flow; this
 * file just bootstraps the catalog so the skill has a useful set of feeds
 * on day one.
 */
interface DefaultSource {
  id: string;
  adapter_type: 'rss' | 'vendor_api';
  name: string;
  config: { url: string };
  tags: string[];
}

export const DEFAULT_SOURCES: readonly DefaultSource[] = [
  // --- Vendor research blogs ---------------------------------------------
  {
    id: 'vendor_api:elastic-security-labs',
    adapter_type: 'vendor_api',
    name: 'Elastic Security Labs',
    config: { url: 'https://www.elastic.co/security-labs/rss/feed.xml' },
    tags: ['vendor', 'elastic', 'research', 'research-tools'],
  },
  {
    id: 'rss:mandiant-research',
    adapter_type: 'rss',
    name: 'Mandiant / Google Cloud Threat Intelligence',
    config: { url: 'https://cloud.google.com/security/blog/threat-intelligence/rss' },
    tags: ['vendor', 'research', 'apt'],
  },
  {
    id: 'rss:unit42',
    adapter_type: 'rss',
    name: 'Palo Alto Networks Unit 42',
    config: { url: 'https://unit42.paloaltonetworks.com/feed/' },
    tags: ['vendor', 'research', 'malware', 'apt'],
  },
  {
    id: 'rss:talos',
    adapter_type: 'rss',
    name: 'Cisco Talos Intelligence',
    config: { url: 'https://blog.talosintelligence.com/rss/' },
    tags: ['vendor', 'research', 'malware'],
  },
  {
    id: 'rss:crowdstrike',
    adapter_type: 'rss',
    name: 'CrowdStrike Blog',
    config: { url: 'https://www.crowdstrike.com/blog/feed/' },
    tags: ['vendor', 'research', 'apt'],
  },
  {
    id: 'rss:sentinelone',
    adapter_type: 'rss',
    name: 'SentinelOne Labs',
    config: { url: 'https://www.sentinelone.com/labs/feed/' },
    tags: ['vendor', 'research', 'malware'],
  },
  {
    id: 'rss:microsoft-security-blog',
    adapter_type: 'rss',
    name: 'Microsoft Security Blog',
    config: { url: 'https://www.microsoft.com/en-us/security/blog/feed/' },
    tags: ['vendor', 'research', 'cloud'],
  },
  {
    id: 'rss:microsoft-msrc',
    adapter_type: 'rss',
    name: 'Microsoft Security Response Center',
    config: { url: 'https://msrc-blog.microsoft.com/feed/' },
    tags: ['vendor', 'advisories', 'vulnerability'],
  },
  {
    id: 'rss:google-tag',
    adapter_type: 'rss',
    name: 'Google Threat Analysis Group',
    config: { url: 'https://blog.google/threat-analysis-group/rss/' },
    tags: ['vendor', 'research', 'apt'],
  },
  {
    id: 'rss:trend-micro',
    adapter_type: 'rss',
    name: 'Trend Micro Research',
    config: { url: 'https://www.trendmicro.com/en_us/research.rss' },
    tags: ['vendor', 'research', 'malware', 'cloud'],
  },
  {
    id: 'rss:proofpoint',
    adapter_type: 'rss',
    name: 'Proofpoint Threat Insight',
    config: { url: 'https://www.proofpoint.com/us/rss.xml' },
    tags: ['vendor', 'research', 'phishing'],
  },
  {
    id: 'rss:wiz',
    adapter_type: 'rss',
    name: 'Wiz Cloud Security Research',
    config: { url: 'https://www.wiz.io/feed.xml' },
    tags: ['vendor', 'research', 'cloud'],
  },
  {
    id: 'rss:google-project-zero',
    adapter_type: 'rss',
    name: 'Google Project Zero',
    config: { url: 'https://googleprojectzero.blogspot.com/feeds/posts/default' },
    tags: ['vendor', 'research', 'vulnerability'],
  },

  // --- Government / CERT advisories --------------------------------------
  {
    id: 'rss:cisa-alerts',
    adapter_type: 'rss',
    name: 'CISA Alerts and Advisories',
    config: { url: 'https://www.cisa.gov/cybersecurity-advisories/all.xml' },
    tags: ['government', 'advisories', 'vulnerability', 'government-policy'],
  },
  {
    id: 'rss:cisa-ics-advisories',
    adapter_type: 'rss',
    name: 'CISA ICS Advisories',
    config: { url: 'https://www.cisa.gov/cybersecurity-advisories/ics-advisories.xml' },
    tags: ['government', 'advisories', 'ot-ics'],
  },
  {
    id: 'rss:ncsc-uk',
    adapter_type: 'rss',
    name: 'UK National Cyber Security Centre',
    config: { url: 'https://www.ncsc.gov.uk/api/1/services/v1/all-rss-feed.xml' },
    tags: ['government', 'advisories', 'government-policy'],
  },
  {
    id: 'rss:acsc-au',
    adapter_type: 'rss',
    name: 'Australian Cyber Security Centre',
    config: { url: 'https://www.cyber.gov.au/about-us/view-all-content/alerts/rss.xml' },
    tags: ['government', 'advisories', 'government-policy'],
  },
  {
    id: 'rss:nvd-recent',
    adapter_type: 'rss',
    name: 'NVD Recent CVEs',
    config: { url: 'https://nvd.nist.gov/feeds/xml/cve/misc/nvd-rss-analyzed.xml' },
    tags: ['government', 'vulnerability'],
  },

  // --- Independent / investigative outlets -------------------------------
  {
    id: 'rss:krebs-on-security',
    adapter_type: 'rss',
    name: 'Krebs on Security',
    config: { url: 'https://krebsonsecurity.com/feed/' },
    tags: ['investigative', 'cybercrime', 'data-breach'],
  },
  {
    id: 'rss:bleeping-computer',
    adapter_type: 'rss',
    name: 'BleepingComputer',
    config: { url: 'https://www.bleepingcomputer.com/feed/' },
    tags: ['general-news', 'malware', 'ransomware'],
  },
  {
    id: 'rss:the-hacker-news',
    adapter_type: 'rss',
    name: 'The Hacker News',
    config: { url: 'https://feeds.feedburner.com/TheHackersNews' },
    tags: ['general-news', 'malware', 'vulnerability'],
  },
  {
    id: 'rss:dark-reading',
    adapter_type: 'rss',
    name: 'Dark Reading',
    config: { url: 'https://www.darkreading.com/rss.xml' },
    tags: ['general-news', 'cybercrime', 'insider-threat'],
  },
  {
    id: 'rss:securityweek',
    adapter_type: 'rss',
    name: 'SecurityWeek',
    config: { url: 'https://www.securityweek.com/feed/' },
    tags: ['general-news', 'data-breach', 'privacy-compliance'],
  },
  {
    id: 'rss:therecord',
    adapter_type: 'rss',
    name: 'The Record by Recorded Future',
    config: { url: 'https://therecord.media/feed/' },
    tags: ['general-news', 'cybercrime', 'apt'],
  },
  {
    id: 'rss:schneier',
    adapter_type: 'rss',
    name: 'Schneier on Security',
    config: { url: 'https://www.schneier.com/feed/atom/' },
    tags: ['analysis', 'privacy-compliance', 'government-policy'],
  },

  // --- Ransomware / extortion watch --------------------------------------
  {
    id: 'rss:ransomlook-news',
    adapter_type: 'rss',
    name: 'RansomLook News',
    config: { url: 'https://www.ransomlook.io/feeds/news.xml' },
    tags: ['ransomware', 'extortion', 'cybercrime'],
  },
  {
    id: 'rss:ransomware-live',
    adapter_type: 'rss',
    name: 'Ransomware.live',
    config: { url: 'https://www.ransomware.live/rss.xml' },
    tags: ['ransomware', 'extortion'],
  },

  // --- IoT / OT-ICS niche -------------------------------------------------
  {
    id: 'rss:iot-security-foundation',
    adapter_type: 'rss',
    name: 'IoT Security Foundation Blog',
    config: { url: 'https://iotsecurityfoundation.org/feed/' },
    tags: ['iot', 'research'],
  },
  {
    id: 'rss:claroty-team82',
    adapter_type: 'rss',
    name: 'Claroty Team82 Research',
    config: { url: 'https://claroty.com/team82/research/rss.xml' },
    tags: ['vendor', 'research', 'ot-ics', 'iot'],
  },
  {
    id: 'rss:dragos-blog',
    adapter_type: 'rss',
    name: 'Dragos Blog',
    config: { url: 'https://www.dragos.com/blog/feed/' },
    tags: ['vendor', 'research', 'ot-ics'],
  },
  {
    id: 'rss:nozomi-labs',
    adapter_type: 'rss',
    name: 'Nozomi Networks Labs',
    config: { url: 'https://www.nozominetworks.com/blog/feed/' },
    tags: ['vendor', 'research', 'ot-ics', 'iot'],
  },

  // --- Cloud / SaaS -------------------------------------------------------
  {
    id: 'rss:aws-security',
    adapter_type: 'rss',
    name: 'AWS Security Blog',
    config: { url: 'https://aws.amazon.com/blogs/security/feed/' },
    tags: ['vendor', 'advisories', 'cloud'],
  },
  {
    id: 'rss:gcp-security',
    adapter_type: 'rss',
    name: 'Google Cloud Security Blog',
    config: { url: 'https://cloud.google.com/blog/products/identity-security/rss' },
    tags: ['vendor', 'advisories', 'cloud'],
  },
  {
    id: 'rss:datadog-security-labs',
    adapter_type: 'rss',
    name: 'Datadog Security Labs',
    config: { url: 'https://securitylabs.datadoghq.com/rss/feed.xml' },
    tags: ['vendor', 'research', 'cloud', 'supply-chain'],
  },

  // --- Phishing / credential abuse ---------------------------------------
  {
    id: 'rss:phishlabs',
    adapter_type: 'rss',
    name: 'Fortra PhishLabs',
    config: { url: 'https://www.fortra.com/blog/feed' },
    tags: ['vendor', 'research', 'phishing'],
  },
  {
    id: 'rss:openphish-news',
    adapter_type: 'rss',
    name: 'OpenPhish Notices',
    config: { url: 'https://openphish.com/feed.txt' },
    tags: ['phishing', 'feed'],
  },

  // --- Supply chain / open-source -----------------------------------------
  {
    id: 'rss:reversinglabs-blog',
    adapter_type: 'rss',
    name: 'ReversingLabs Blog',
    config: { url: 'https://www.reversinglabs.com/blog/rss.xml' },
    tags: ['vendor', 'research', 'supply-chain', 'malware'],
  },
  {
    id: 'rss:snyk-vulnerability-db',
    adapter_type: 'rss',
    name: 'Snyk Vulnerability Disclosures',
    config: { url: 'https://snyk.io/vuln/feed.xml' },
    tags: ['vendor', 'advisories', 'supply-chain', 'vulnerability'],
  },
  {
    id: 'rss:github-advisory-database',
    adapter_type: 'rss',
    name: 'GitHub Advisory Database',
    config: { url: 'https://github.com/advisories.atom' },
    tags: ['advisories', 'supply-chain', 'vulnerability'],
  },

  // --- Data breach / leak tracking ---------------------------------------
  {
    id: 'rss:hibp-feed',
    adapter_type: 'rss',
    name: 'Have I Been Pwned Latest Breaches',
    config: { url: 'https://feeds.feedburner.com/HaveIBeenPwnedLatestBreaches' },
    tags: ['data-breach'],
  },
  {
    id: 'rss:databreaches-net',
    adapter_type: 'rss',
    name: 'DataBreaches.net',
    config: { url: 'https://www.databreaches.net/feed/' },
    tags: ['data-breach', 'cybercrime'],
  },

  // --- Insider threat / fraud --------------------------------------------
  {
    id: 'rss:cert-insider-threat',
    adapter_type: 'rss',
    name: 'CERT Insider Threat Center',
    config: { url: 'https://insights.sei.cmu.edu/insider-threat/feed/' },
    tags: ['research', 'insider-threat'],
  },
  {
    id: 'rss:ic3-public',
    adapter_type: 'rss',
    name: 'FBI IC3 Public Service Announcements',
    config: { url: 'https://www.ic3.gov/Media/News/RssFeed' },
    tags: ['government', 'cybercrime', 'insider-threat'],
  },

  // --- Government / CERT (extended) --------------------------------------
  {
    id: 'rss:cccs-canada',
    adapter_type: 'rss',
    name: 'Canadian Centre for Cyber Security',
    config: { url: 'https://www.cyber.gc.ca/api/cccs/threats/v1/rss/en' },
    tags: ['government', 'advisories', 'government-policy'],
  },
  {
    id: 'rss:enisa',
    adapter_type: 'rss',
    name: 'ENISA News',
    config: { url: 'https://www.enisa.europa.eu/rss/news' },
    tags: ['government', 'government-policy', 'privacy-compliance'],
  },
  {
    id: 'rss:bsi-de',
    adapter_type: 'rss',
    name: 'German BSI CERT-Bund WID',
    config: { url: 'https://wid.cert-bund.de/content/public/securityAdvisory/rss' },
    tags: ['government', 'advisories'],
  },
  {
    id: 'rss:jpcert',
    adapter_type: 'rss',
    name: 'JPCERT/CC Alerts',
    config: { url: 'https://www.jpcert.or.jp/english/rss/jpcert-en.rdf' },
    tags: ['government', 'advisories'],
  },

  // --- Privacy / compliance ----------------------------------------------
  {
    id: 'rss:iapp-news',
    adapter_type: 'rss',
    name: 'IAPP Privacy Tracker',
    config: { url: 'https://iapp.org/news/rss/' },
    tags: ['privacy-compliance', 'government-policy'],
  },
  {
    id: 'rss:edps-news',
    adapter_type: 'rss',
    name: 'European Data Protection Supervisor',
    config: { url: 'https://www.edps.europa.eu/press-publications/press-news/rss_en' },
    tags: ['government', 'privacy-compliance'],
  },

  // --- APT / nation-state tracking ---------------------------------------
  {
    id: 'rss:volexity',
    adapter_type: 'rss',
    name: 'Volexity Threat Research',
    config: { url: 'https://www.volexity.com/blog/feed/' },
    tags: ['vendor', 'research', 'apt'],
  },
  {
    id: 'rss:eset-welivesecurity',
    adapter_type: 'rss',
    name: 'ESET WeLiveSecurity',
    config: { url: 'https://www.welivesecurity.com/feed/' },
    tags: ['vendor', 'research', 'apt', 'malware'],
  },

  // --- Research tools / OSINT --------------------------------------------
  {
    id: 'rss:malwarebytes-labs',
    adapter_type: 'rss',
    name: 'Malwarebytes Labs',
    config: { url: 'https://www.malwarebytes.com/blog/feed' },
    tags: ['vendor', 'research', 'malware', 'research-tools'],
  },
  {
    id: 'rss:sans-isc',
    adapter_type: 'rss',
    name: 'SANS Internet Storm Center Diaries',
    config: { url: 'https://isc.sans.edu/rssfeed_full.xml' },
    tags: ['research', 'research-tools'],
  },

  // ----------------------------------------------------------------------
  // Imported from `elastic/security-ciso-news-aggregator` (src/lib/feed-catalog.ts).
  // Tags are derived from the upstream `category` field plus a keyword
  // scan over name + description; entries whose URL or id already appears
  // in the curated section above are skipped so the hand-tuned tags win.
  // ----------------------------------------------------------------------
  {
    id: 'rss:404-media',
    adapter_type: 'rss',
    name: '404 Media',
    config: { url: 'https://www.404media.co/rss' },
    tags: ['general-news'],
  },
  {
    id: 'rss:ars-technica-security',
    adapter_type: 'rss',
    name: 'Ars Technica Security',
    config: { url: 'https://arstechnica.com/tag/security/feed' },
    tags: ['general-news'],
  },
  {
    id: 'rss:bankinfosecurity',
    adapter_type: 'rss',
    name: 'BankInfoSecurity',
    config: { url: 'https://www.bankinfosecurity.com/rss-feeds' },
    tags: ['general-news', 'government-policy'],
  },
  {
    id: 'rss:bloomberg-tech',
    adapter_type: 'rss',
    name: 'Bloomberg Technology',
    config: { url: 'https://feeds.bloomberg.com/technology/news.rss' },
    tags: ['general-news'],
  },
  {
    id: 'rss:c4isrnet-cyber',
    adapter_type: 'rss',
    name: 'C4ISRNet Cyber',
    config: {
      url: 'https://www.c4isrnet.com/arc/outboundfeeds/rss/category/cyber/?outputType=xml',
    },
    tags: ['general-news'],
  },
  {
    id: 'rss:computerweekly-security',
    adapter_type: 'rss',
    name: 'ComputerWeekly Security',
    config: { url: 'https://www.computerweekly.com/rss/IT-security.xml' },
    tags: ['general-news'],
  },
  {
    id: 'rss:crunchbase-news',
    adapter_type: 'rss',
    name: 'Crunchbase News',
    config: { url: 'https://news.crunchbase.com/feed' },
    tags: ['general-news'],
  },
  {
    id: 'rss:cso-online',
    adapter_type: 'rss',
    name: 'CSO Online',
    config: { url: 'https://www.csoonline.com/feed/' },
    tags: ['general-news'],
  },
  {
    id: 'rss:cyber-defense-magazine',
    adapter_type: 'rss',
    name: 'Cyber Defense Magazine',
    config: { url: 'https://www.cyberdefensemagazine.com/feed/' },
    tags: ['general-news'],
  },
  {
    id: 'rss:cybercrime-magazine',
    adapter_type: 'rss',
    name: 'Cybercrime Magazine',
    config: { url: 'https://cybersecurityventures.com/feed/' },
    tags: ['cybercrime', 'general-news', 'research'],
  },
  {
    id: 'rss:cyberscoop',
    adapter_type: 'rss',
    name: 'CyberScoop',
    config: { url: 'https://www.cyberscoop.com/feed' },
    tags: ['general-news'],
  },
  {
    id: 'rss:cybersecurity-dive',
    adapter_type: 'rss',
    name: 'Cybersecurity Dive',
    config: { url: 'https://www.cybersecuritydive.com/feeds/news/' },
    tags: ['general-news', 'research'],
  },
  {
    id: 'rss:cybersecurity-news',
    adapter_type: 'rss',
    name: 'Cyber Security News',
    config: { url: 'https://cybersecuritynews.com/feed/' },
    tags: ['general-news'],
  },
  {
    id: 'rss:databreachtoday',
    adapter_type: 'rss',
    name: 'DataBreachToday',
    config: { url: 'https://www.databreachtoday.co.uk/rss-feeds' },
    tags: ['data-breach', 'general-news', 'government-policy'],
  },
  {
    id: 'rss:digital-journal',
    adapter_type: 'rss',
    name: 'Digital Journal',
    config: { url: 'https://www.digitaljournal.com/feed' },
    tags: ['general-news'],
  },
  {
    id: 'rss:esecurityplanet',
    adapter_type: 'rss',
    name: 'eSecurityPlanet',
    config: { url: 'https://www.esecurityplanet.com/feed' },
    tags: ['general-news', 'research'],
  },
  {
    id: 'rss:forbes-cybersecurity',
    adapter_type: 'rss',
    name: 'Forbes Cybersecurity',
    config: { url: 'https://www.forbes.com/cybersecurity/feed/' },
    tags: ['general-news'],
  },
  {
    id: 'rss:gbhackers',
    adapter_type: 'rss',
    name: 'GBHackers on Security',
    config: { url: 'http://feeds.feedburner.com/gbhackers' },
    tags: ['general-news', 'research'],
  },
  {
    id: 'rss:govinfosecurity',
    adapter_type: 'rss',
    name: 'GovInfoSecurity',
    config: { url: 'https://www.govinfosecurity.com/rss-feeds' },
    tags: ['general-news', 'government', 'government-policy'],
  },
  {
    id: 'rss:guardian-data-security',
    adapter_type: 'rss',
    name: 'The Guardian Data Security',
    config: { url: 'https://www.theguardian.com/technology/data-computer-security/rss' },
    tags: ['general-news'],
  },
  {
    id: 'rss:hackread',
    adapter_type: 'rss',
    name: 'HackRead',
    config: { url: 'https://www.hackread.com/feed' },
    tags: ['general-news'],
  },
  {
    id: 'rss:health-it-security',
    adapter_type: 'rss',
    name: 'HealthITSecurity',
    config: { url: 'https://healthitsecurity.com/feed' },
    tags: ['general-news', 'privacy-compliance'],
  },
  {
    id: 'rss:help-net-security',
    adapter_type: 'rss',
    name: 'Help Net Security',
    config: { url: 'https://www.helpnetsecurity.com/feed' },
    tags: ['general-news'],
  },
  {
    id: 'rss:industrial-cyber',
    adapter_type: 'rss',
    name: 'Industrial Cyber',
    config: { url: 'https://industrialcyber.co/feed/' },
    tags: ['general-news', 'ot-ics'],
  },
  {
    id: 'rss:infosecurity-magazine',
    adapter_type: 'rss',
    name: 'Infosecurity Magazine',
    config: { url: 'https://www.infosecurity-magazine.com/rss/news' },
    tags: ['general-news'],
  },
  {
    id: 'rss:it-security-guru',
    adapter_type: 'rss',
    name: 'IT Security Guru',
    config: { url: 'https://www.itsecurityguru.org/feed/' },
    tags: ['general-news'],
  },
  {
    id: 'rss:itpro-security',
    adapter_type: 'rss',
    name: 'ITPro Security',
    config: { url: 'https://www.itpro.com/feeds/tag/security' },
    tags: ['general-news'],
  },
  {
    id: 'rss:itworldcanada-security',
    adapter_type: 'rss',
    name: 'IT World Canada Security',
    config: { url: 'https://www.itworldcanada.com/category/security/feed' },
    tags: ['general-news'],
  },
  {
    id: 'rss:lawfare',
    adapter_type: 'rss',
    name: 'Lawfare',
    config: { url: 'https://www.lawfareblog.com/rss.xml' },
    tags: ['general-news'],
  },
  {
    id: 'rss:mit-cybersecurity',
    adapter_type: 'rss',
    name: 'MIT News Cybersecurity',
    config: { url: 'https://news.mit.edu/topic/mitcyber-security-rss.xml' },
    tags: ['general-news'],
  },
  {
    id: 'rss:netblocks',
    adapter_type: 'rss',
    name: 'NetBlocks',
    config: { url: 'https://netblocks.org/feed' },
    tags: ['general-news'],
  },
  {
    id: 'rss:new-scientist-tech',
    adapter_type: 'rss',
    name: 'New Scientist Technology',
    config: { url: 'https://www.newscientist.com/subject/technology/feed/' },
    tags: ['general-news'],
  },
  {
    id: 'rss:nyt-cybersecurity',
    adapter_type: 'rss',
    name: 'NYT Cybersecurity',
    config: {
      url: 'https://www.nytimes.com/svc/collections/v1/publish/https://www.nytimes.com/spotlight/cybersecurity/rss.xml',
    },
    tags: ['general-news'],
  },
  {
    id: 'rss:reuters-tech',
    adapter_type: 'rss',
    name: 'Reuters Technology',
    config: { url: 'https://www.reutersagency.com/feed/?best-topics=tech' },
    tags: ['general-news'],
  },
  {
    id: 'rss:rest-of-world',
    adapter_type: 'rss',
    name: 'Rest of World',
    config: { url: 'https://restofworld.org/feed/latest/' },
    tags: ['general-news'],
  },
  {
    id: 'rss:security-affairs',
    adapter_type: 'rss',
    name: 'Security Affairs',
    config: { url: 'http://securityaffairs.co/wordpress/feed' },
    tags: ['general-news'],
  },
  {
    id: 'rss:security-boulevard',
    adapter_type: 'rss',
    name: 'Security Boulevard',
    config: { url: 'https://securityboulevard.com/feed/' },
    tags: ['general-news'],
  },
  {
    id: 'rss:security-intelligence',
    adapter_type: 'rss',
    name: 'Security Intelligence',
    config: { url: 'https://securityintelligence.com/feed' },
    tags: ['general-news', 'research'],
  },
  {
    id: 'rss:silicon-republic',
    adapter_type: 'rss',
    name: 'Silicon Republic',
    config: { url: 'https://www.siliconrepublic.com/feed' },
    tags: ['general-news'],
  },
  {
    id: 'rss:siliconangle-security',
    adapter_type: 'rss',
    name: 'SiliconANGLE Security',
    config: { url: 'https://siliconangle.com/category/security/feed' },
    tags: ['general-news'],
  },
  {
    id: 'rss:techcrunch',
    adapter_type: 'rss',
    name: 'TechCrunch',
    config: { url: 'https://techcrunch.com/feed/' },
    tags: ['general-news'],
  },
  {
    id: 'rss:techmeme',
    adapter_type: 'rss',
    name: 'Techmeme',
    config: { url: 'https://www.techmeme.com/feed.xml' },
    tags: ['general-news'],
  },
  {
    id: 'rss:tech-monitor',
    adapter_type: 'rss',
    name: 'Tech Monitor',
    config: { url: 'https://techmonitor.ai/feed' },
    tags: ['general-news'],
  },
  {
    id: 'rss:techrepublic-security',
    adapter_type: 'rss',
    name: 'TechRepublic Security',
    config: { url: 'https://www.techrepublic.com/rssfeeds/topic/security/' },
    tags: ['general-news'],
  },
  {
    id: 'rss:techspot',
    adapter_type: 'rss',
    name: 'TechSpot',
    config: { url: 'https://www.techspot.com/backend.xml' },
    tags: ['general-news'],
  },
  {
    id: 'rss:techxplore-security',
    adapter_type: 'rss',
    name: 'Tech Xplore Security',
    config: { url: 'https://techxplore.com/rss-feed/security-news/' },
    tags: ['general-news', 'malware'],
  },
  {
    id: 'rss:the-register-security',
    adapter_type: 'rss',
    name: 'The Register Security',
    config: { url: 'https://www.theregister.com/security/headlines.atom' },
    tags: ['general-news', 'research'],
  },
  {
    id: 'rss:the-stack',
    adapter_type: 'rss',
    name: 'The Stack',
    config: { url: 'https://www.thestack.technology/rss/' },
    tags: ['general-news'],
  },
  {
    id: 'rss:venturebeat-security',
    adapter_type: 'rss',
    name: 'VentureBeat Security',
    config: { url: 'https://venturebeat.com/category/security/feed' },
    tags: ['general-news'],
  },
  {
    id: 'rss:wired-security',
    adapter_type: 'rss',
    name: 'WIRED Security',
    config: { url: 'https://www.wired.com/feed/category/security/latest/rss' },
    tags: ['general-news'],
  },
  {
    id: 'rss:zdnet-security',
    adapter_type: 'rss',
    name: 'ZDNet Security',
    config: { url: 'https://www.zdnet.com/topic/security/rss.xml' },
    tags: ['general-news', 'ot-ics'],
  },
  {
    id: 'rss:cyber-security-hub-news',
    adapter_type: 'rss',
    name: 'Cyber Security Hub News',
    config: { url: 'https://www.cshub.com/rss/news' },
    tags: ['general-news'],
  },
  {
    id: 'rss:biometric-update',
    adapter_type: 'rss',
    name: 'Biometric Update',
    config: { url: 'http://feeds.feedburner.com/biometricupdate' },
    tags: ['general-news', 'ot-ics'],
  },
  {
    id: 'rss:darknet-live',
    adapter_type: 'rss',
    name: 'DarknetLive',
    config: { url: 'https://darknetlive.com/rss' },
    tags: ['cybercrime', 'general-news'],
  },
  {
    id: 'rss:hakin9',
    adapter_type: 'rss',
    name: 'Hakin9 Magazine',
    config: { url: 'https://hakin9.org/feed/' },
    tags: ['general-news', 'research-tools'],
  },
  {
    id: 'rss:information-security-buzz',
    adapter_type: 'rss',
    name: 'Information Security Buzz',
    config: { url: 'https://feeds.feedburner.com/InformationSecurityBuzz' },
    tags: ['general-news', 'research'],
  },
  {
    id: 'rss:itnews-au',
    adapter_type: 'rss',
    name: 'iTnews Australia',
    config: { url: 'https://www.itnews.com.au/RSS/rss.ashx' },
    tags: ['general-news'],
  },
  {
    id: 'rss:itnews-asia',
    adapter_type: 'rss',
    name: 'iTnews Asia',
    config: { url: 'https://www.itnews.asia/rss/rss.ashx' },
    tags: ['general-news'],
  },
  {
    id: 'rss:the-last-watchdog',
    adapter_type: 'rss',
    name: 'The Last Watchdog',
    config: { url: 'https://www.lastwatchdog.com/feed/' },
    tags: ['general-news'],
  },
  {
    id: 'rss:tripwire-state-of-security',
    adapter_type: 'rss',
    name: 'The State of Security',
    config: { url: 'https://www.tripwire.com/state-of-security/feed/' },
    tags: ['general-news'],
  },
  {
    id: 'rss:the-new-stack',
    adapter_type: 'rss',
    name: 'The New Stack',
    config: { url: 'https://thenewstack.io/feed' },
    tags: ['general-news'],
  },
  {
    id: 'rss:protos',
    adapter_type: 'rss',
    name: 'Protos',
    config: { url: 'https://protos.com/feed' },
    tags: ['general-news'],
  },
  {
    id: 'rss:risky-business',
    adapter_type: 'rss',
    name: 'Risky Business',
    config: { url: 'https://risky.biz/feeds/risky-business' },
    tags: ['general-news'],
  },
  {
    id: 'rss:cyber-tech-park',
    adapter_type: 'rss',
    name: 'AI-TechPark Cyber Security',
    config: { url: 'https://ai-techpark.com/category/cyber-security/feed' },
    tags: ['general-news', 'iot', 'research'],
  },
  {
    id: 'rss:tech-eu-cybersecurity',
    adapter_type: 'rss',
    name: 'Tech.eu Cybersecurity',
    config: { url: 'https://tech.eu/category/cybersecurity/feed' },
    tags: ['general-news'],
  },
  {
    id: 'rss:cloud7-news',
    adapter_type: 'rss',
    name: 'Cloud7 News',
    config: { url: 'https://cloud7.news/feed/gn' },
    tags: ['cloud', 'general-news'],
  },
  {
    id: 'rss:the-cybersecurity-pulse',
    adapter_type: 'rss',
    name: 'The Cybersecurity Pulse',
    config: { url: 'https://www.cybersecuritypulse.net/feed' },
    tags: ['general-news'],
  },
  {
    id: 'rss:akamai-blog',
    adapter_type: 'rss',
    name: 'Akamai Blog',
    config: { url: 'http://feeds.feedburner.com/akamai/blog' },
    tags: ['blog', 'cloud', 'vendor'],
  },
  {
    id: 'rss:anomali-blog',
    adapter_type: 'rss',
    name: 'Anomali Blog',
    config: { url: 'https://www.anomali.com/site/blog-rss' },
    tags: ['apt', 'blog', 'research', 'vendor'],
  },
  {
    id: 'rss:api-security-news',
    adapter_type: 'rss',
    name: 'API Security News',
    config: { url: 'https://apisecurity.io/feed/index.xml' },
    tags: ['blog'],
  },
  {
    id: 'rss:bishopfox',
    adapter_type: 'rss',
    name: 'Bishop Fox',
    config: { url: 'https://bishopfox.com/feeds/blog.rss' },
    tags: ['blog', 'vendor'],
  },
  {
    id: 'rss:blockchain-threat-intel',
    adapter_type: 'rss',
    name: 'Blockchain Threat Intelligence',
    config: { url: 'https://newsletter.blockthreat.io/feed' },
    tags: ['apt', 'blog'],
  },
  {
    id: 'rss:check-point-research',
    adapter_type: 'rss',
    name: 'Check Point Research',
    config: { url: 'https://research.checkpoint.com/feed' },
    tags: ['blog', 'research', 'vendor'],
  },
  {
    id: 'rss:cisco-talos',
    adapter_type: 'rss',
    name: 'Cisco Talos',
    config: { url: 'https://feeds.feedburner.com/feedburner/Talos' },
    tags: ['apt', 'blog', 'research', 'vendor'],
  },
  {
    id: 'rss:cloudflare-blog',
    adapter_type: 'rss',
    name: 'Cloudflare Blog',
    config: { url: 'http://blog.cloudflare.com/rss/' },
    tags: ['blog', 'cloud', 'vendor'],
  },
  {
    id: 'rss:cloud-security-alliance',
    adapter_type: 'rss',
    name: 'Cloud Security Alliance',
    config: { url: 'https://cloudsecurityalliance.org/blog/feed/' },
    tags: ['blog', 'cloud'],
  },
  {
    id: 'rss:cofense',
    adapter_type: 'rss',
    name: 'Cofense',
    config: { url: 'https://cofense.com/feed/' },
    tags: ['blog', 'vendor'],
  },
  {
    id: 'rss:compass-security',
    adapter_type: 'rss',
    name: 'Compass Security Blog',
    config: { url: 'https://blog.compass-security.com/feed/' },
    tags: ['blog', 'vendor'],
  },
  {
    id: 'rss:criminal-ip-blog',
    adapter_type: 'rss',
    name: 'Criminal IP Blog',
    config: { url: 'https://blog.criminalip.io/feed/' },
    tags: ['apt', 'blog', 'cybercrime'],
  },
  {
    id: 'rss:crowdstrike-blog',
    adapter_type: 'rss',
    name: 'CrowdStrike Blog',
    config: { url: 'https://www.crowdstrike.com/blog/feed' },
    tags: ['blog', 'vendor'],
  },
  {
    id: 'rss:deep-instinct-blog',
    adapter_type: 'rss',
    name: 'Deep Instinct Blog',
    config: { url: 'https://www.deepinstinct.com/blog/feed' },
    tags: ['blog', 'vendor'],
  },
  {
    id: 'rss:eff-deeplinks',
    adapter_type: 'rss',
    name: 'EFF Deeplinks',
    config: { url: 'https://www.eff.org/rss/updates.xml' },
    tags: ['blog'],
  },
  {
    id: 'rss:elastic-blog',
    adapter_type: 'rss',
    name: 'Elastic Blog',
    config: { url: 'https://www.elastic.co/blog/feed' },
    tags: ['blog', 'vendor'],
  },
  {
    id: 'rss:embrace-the-red',
    adapter_type: 'rss',
    name: 'Embrace The Red',
    config: { url: 'https://embracethered.com/blog/index.xml' },
    tags: ['blog', 'research'],
  },
  {
    id: 'rss:f5-labs',
    adapter_type: 'rss',
    name: 'F5 Labs',
    config: { url: 'https://www.f5.com/labs/rss-feeds/all.xml' },
    tags: ['blog', 'research', 'vendor'],
  },
  {
    id: 'rss:fingerprint-blog',
    adapter_type: 'rss',
    name: 'Fingerprint Blog',
    config: { url: 'https://fingerprint.com/rss.xml' },
    tags: ['blog', 'vendor'],
  },
  {
    id: 'rss:google-online-security',
    adapter_type: 'rss',
    name: 'Google Online Security Blog',
    config: { url: 'https://googleonlinesecurity.blogspot.com/atom.xml' },
    tags: ['blog', 'vendor'],
  },
  {
    id: 'rss:google-threat-intel',
    adapter_type: 'rss',
    name: 'Google Threat Intelligence',
    config: { url: 'https://cloudblog.withgoogle.com/topics/threat-intelligence/rss' },
    tags: ['apt', 'blog', 'cloud', 'vendor'],
  },
  {
    id: 'rss:graham-cluley',
    adapter_type: 'rss',
    name: 'Graham Cluley',
    config: { url: 'https://www.grahamcluley.com/feed/' },
    tags: ['blog', 'vendor'],
  },
  {
    id: 'rss:greynoise-blog',
    adapter_type: 'rss',
    name: 'GreyNoise Blog',
    config: { url: 'https://www.greynoise.io/blog/rss.xml' },
    tags: ['blog', 'vendor'],
  },
  {
    id: 'rss:hackerone-blog',
    adapter_type: 'rss',
    name: 'HackerOne Blog',
    config: { url: 'https://www.hackerone.com/blog.rss' },
    tags: ['blog', 'vendor'],
  },
  {
    id: 'rss:heimdal-security',
    adapter_type: 'rss',
    name: 'Heimdal Security Blog',
    config: { url: 'https://heimdalsecurity.com/blog/feed' },
    tags: ['blog', 'vendor'],
  },
  {
    id: 'rss:imperva-blog',
    adapter_type: 'rss',
    name: 'Imperva Blog',
    config: { url: 'https://www.imperva.com/blog/feed/' },
    tags: ['blog', 'vendor'],
  },
  {
    id: 'rss:legit-security-blog',
    adapter_type: 'rss',
    name: 'Legit Security Blog',
    config: { url: 'https://www.legitsecurity.com/blog/rss.xml' },
    tags: ['blog', 'vendor'],
  },
  {
    id: 'rss:malwaretech',
    adapter_type: 'rss',
    name: 'MalwareTech',
    config: { url: 'https://malwaretech.com/feed.xml' },
    tags: ['blog', 'malware', 'research'],
  },
  {
    id: 'rss:mozilla-security',
    adapter_type: 'rss',
    name: 'Mozilla Security Blog',
    config: { url: 'https://blog.mozilla.org/security/feed/' },
    tags: ['advisories', 'blog', 'research', 'vendor'],
  },
  {
    id: 'rss:naked-security',
    adapter_type: 'rss',
    name: 'Naked Security',
    config: { url: 'https://nakedsecurity.sophos.com/feed' },
    tags: ['blog', 'research'],
  },
  {
    id: 'rss:ncc-group-research',
    adapter_type: 'rss',
    name: 'NCC Group Research',
    config: { url: 'https://research.nccgroup.com/feed' },
    tags: ['blog', 'research', 'vendor'],
  },
  {
    id: 'rss:palo-alto-unit42',
    adapter_type: 'rss',
    name: 'Palo Alto Unit42',
    config: { url: 'https://unit42.paloaltonetworks.com/feed' },
    tags: ['apt', 'blog', 'research', 'vendor'],
  },
  {
    id: 'rss:praetorian-blog',
    adapter_type: 'rss',
    name: 'Praetorian Blog',
    config: { url: 'https://www.praetorian.com/blog/feed/' },
    tags: ['blog', 'vendor'],
  },
  {
    id: 'rss:proton-blog',
    adapter_type: 'rss',
    name: 'Proton Blog',
    config: { url: 'https://proton.me/blog/feed' },
    tags: ['blog', 'privacy-compliance', 'vendor'],
  },
  {
    id: 'rss:rapid7-blog',
    adapter_type: 'rss',
    name: 'Rapid7 Blog',
    config: { url: 'https://blog.rapid7.com/rss/' },
    tags: ['blog', 'vendor'],
  },
  {
    id: 'rss:resecurity',
    adapter_type: 'rss',
    name: 'Resecurity Blog',
    config: { url: 'https://www.resecurity.com/feed' },
    tags: ['apt', 'blog', 'vendor'],
  },
  {
    id: 'rss:sam-curry',
    adapter_type: 'rss',
    name: 'Sam Curry Blog',
    config: { url: 'https://samcurry.net/feed.rss' },
    tags: ['blog', 'research'],
  },
  {
    id: 'rss:schneier-on-security',
    adapter_type: 'rss',
    name: 'Schneier on Security',
    config: { url: 'https://www.schneier.com/feed/atom' },
    tags: ['blog', 'vendor'],
  },
  {
    id: 'rss:scott-helme',
    adapter_type: 'rss',
    name: 'Scott Helme',
    config: { url: 'https://scotthelme.co.uk/rss/' },
    tags: ['blog', 'research'],
  },
  {
    id: 'rss:sentinelone-labs',
    adapter_type: 'rss',
    name: 'SentinelOne Labs',
    config: { url: 'https://www.sentinelone.com/feed/' },
    tags: ['blog', 'research', 'vendor'],
  },
  {
    id: 'rss:signal-blog',
    adapter_type: 'rss',
    name: 'Signal Blog',
    config: { url: 'https://signal.org/blog/rss.xml' },
    tags: ['blog', 'privacy-compliance', 'vendor'],
  },
  {
    id: 'rss:socradar',
    adapter_type: 'rss',
    name: 'SOCRadar Blog',
    config: { url: 'https://socradar.io/feed/' },
    tags: ['blog', 'vendor'],
  },
  {
    id: 'rss:sucuri-blog',
    adapter_type: 'rss',
    name: 'Sucuri Blog',
    config: { url: 'https://blog.sucuri.net/feed/' },
    tags: ['blog', 'government', 'vendor'],
  },
  {
    id: 'rss:trail-of-bits',
    adapter_type: 'rss',
    name: 'Trail of Bits Blog',
    config: { url: 'https://blog.trailofbits.com/feed/' },
    tags: ['blog', 'research', 'vendor'],
  },
  {
    id: 'rss:troy-hunt',
    adapter_type: 'rss',
    name: 'Troy Hunt',
    config: { url: 'https://feeds.feedburner.com/TroyHunt' },
    tags: ['blog'],
  },
  {
    id: 'rss:trustedsec',
    adapter_type: 'rss',
    name: 'TrustedSec',
    config: { url: 'http://www.trustedsec.com/feed/' },
    tags: ['blog', 'vendor'],
  },
  {
    id: 'rss:welivesecurity',
    adapter_type: 'rss',
    name: 'WeLiveSecurity',
    config: { url: 'https://www.welivesecurity.com/feed' },
    tags: ['blog', 'vendor'],
  },
  {
    id: 'rss:wordfence',
    adapter_type: 'rss',
    name: 'Wordfence',
    config: { url: 'https://www.wordfence.com/feed/' },
    tags: ['blog', 'vendor'],
  },
  {
    id: 'rss:zerofox-blog',
    adapter_type: 'rss',
    name: 'ZeroFox Blog',
    config: { url: 'https://www.zerofox.com/blog/feed' },
    tags: ['blog', 'vendor'],
  },
  {
    id: 'rss:fox-it-blog',
    adapter_type: 'rss',
    name: 'Fox-IT Blog',
    config: { url: 'https://blog.fox-it.com/feed/' },
    tags: ['blog', 'vendor'],
  },
  {
    id: 'rss:phylum-blog',
    adapter_type: 'rss',
    name: 'Phylum Blog',
    config: { url: 'https://blog.phylum.io/rss/' },
    tags: ['blog', 'supply-chain', 'vendor'],
  },
  {
    id: 'rss:bitsight-blog',
    adapter_type: 'rss',
    name: 'BitSight Blog',
    config: { url: 'https://www.bitsight.com/blog/rss.xml' },
    tags: ['blog', 'vendor'],
  },
  {
    id: 'rss:avast-threat-labs',
    adapter_type: 'rss',
    name: 'Avast Threat Labs',
    config: { url: 'https://decoded.avast.io/feed/' },
    tags: ['blog', 'ot-ics', 'research', 'research-tools', 'vendor'],
  },
  {
    id: 'rss:asec-blog',
    adapter_type: 'rss',
    name: 'ASEC Blog',
    config: { url: 'https://asec.ahnlab.com/en/feed/' },
    tags: ['blog', 'research'],
  },
  {
    id: 'rss:lansweeper',
    adapter_type: 'rss',
    name: 'Lansweeper Blog',
    config: { url: 'https://www.lansweeper.com/feed/' },
    tags: ['blog', 'vendor'],
  },
  {
    id: 'rss:tenable-cyber-exposure',
    adapter_type: 'rss',
    name: 'Tenable Cyber Exposure',
    config: { url: 'https://www.tenable.com/blog/cyber-exposure-alerts/feed' },
    tags: ['blog', 'vendor'],
  },
  {
    id: 'rss:veracode-blog',
    adapter_type: 'rss',
    name: 'Veracode Blog',
    config: { url: 'https://www.veracode.com/blog/feed' },
    tags: ['blog', 'research', 'vendor'],
  },
  {
    id: 'rss:hacking-the-cloud',
    adapter_type: 'rss',
    name: 'Hacking The Cloud',
    config: { url: 'https://hackingthe.cloud/feed_rss_created.xml' },
    tags: ['blog', 'cloud'],
  },
  {
    id: 'rss:daniel-haxx',
    adapter_type: 'rss',
    name: 'daniel.haxx.se',
    config: { url: 'https://daniel.haxx.se/blog/feed/' },
    tags: ['blog'],
  },
  {
    id: 'rss:cloudvulndb',
    adapter_type: 'rss',
    name: 'Cloud Vulnerability DB',
    config: { url: 'https://www.cloudvulndb.org/rss/feed.xml' },
    tags: ['blog', 'cloud', 'vulnerability'],
  },
  {
    id: 'rss:letsencrypt',
    adapter_type: 'rss',
    name: "Let's Encrypt",
    config: { url: 'https://letsencrypt.org/feed.xml' },
    tags: ['blog'],
  },
  {
    id: 'rss:portswigger-blog',
    adapter_type: 'rss',
    name: 'PortSwigger Blog',
    config: { url: 'https://portswigger.net/blog/rss' },
    tags: ['blog', 'vendor'],
  },
  {
    id: 'rss:digital-shadows',
    adapter_type: 'rss',
    name: 'Digital Shadows',
    config: { url: 'https://www.digitalshadows.com/blog-and-research/feed/' },
    tags: ['blog', 'vendor'],
  },
  {
    id: 'rss:hackaday',
    adapter_type: 'rss',
    name: 'Hackaday',
    config: { url: 'https://hackaday.com/feed/' },
    tags: ['blog'],
  },
  {
    id: 'rss:palant-blog',
    adapter_type: 'rss',
    name: 'Almost Secure',
    config: { url: 'https://palant.info/rss.xml' },
    tags: ['blog'],
  },
  {
    id: 'rss:objective-see',
    adapter_type: 'rss',
    name: 'Objective-See',
    config: { url: 'https://objective-see.org/rss.xml' },
    tags: ['blog'],
  },
  {
    id: 'rss:rootshell',
    adapter_type: 'rss',
    name: '/dev/random',
    config: { url: 'https://blog.rootshell.be/feed' },
    tags: ['blog'],
  },
  {
    id: 'rss:citizen-lab',
    adapter_type: 'rss',
    name: 'The Citizen Lab',
    config: { url: 'https://citizenlab.ca/feed/' },
    tags: ['blog', 'research'],
  },
  {
    id: 'rss:sonatype-blog',
    adapter_type: 'rss',
    name: 'Sonatype Blog',
    config: { url: 'https://blog.sonatype.com/rss.xml' },
    tags: ['blog', 'supply-chain', 'vendor'],
  },
  {
    id: 'rss:sans-blog',
    adapter_type: 'rss',
    name: 'SANS Blog',
    config: { url: 'https://www.sans.org/blog/feed.xml' },
    tags: ['blog', 'vendor'],
  },
  {
    id: 'rss:crypto-engineering',
    adapter_type: 'rss',
    name: 'Cryptographic Engineering',
    config: { url: 'https://blog.cryptographyengineering.com/feed' },
    tags: ['blog', 'research'],
  },
  {
    id: 'rss:spiderlabs',
    adapter_type: 'rss',
    name: 'SpiderLabs Blog',
    config: { url: 'https://www.trustwave.com/en-us/rss/spiderlabs-blog/' },
    tags: ['blog', 'research', 'vendor'],
  },
  {
    id: 'rss:nviso-labs',
    adapter_type: 'rss',
    name: 'NVISO Labs',
    config: { url: 'https://blog.nviso.eu/feed' },
    tags: ['blog', 'research', 'vendor'],
  },
  {
    id: 'rss:secureworks-ctu',
    adapter_type: 'rss',
    name: 'Secureworks CTU',
    config: { url: 'https://www.secureworks.com/rss?feed=research' },
    tags: ['blog', 'research', 'vendor'],
  },
  {
    id: 'rss:watchtowr-labs',
    adapter_type: 'rss',
    name: 'watchTowr Labs',
    config: { url: 'https://labs.watchtowr.com/rss/' },
    tags: ['blog', 'research', 'vendor'],
  },
  {
    id: 'rss:the-dfir-report',
    adapter_type: 'rss',
    name: 'The DFIR Report',
    config: { url: 'https://thedfirreport.com/feed/' },
    tags: ['blog'],
  },
  {
    id: 'rss:vulncheck-blog',
    adapter_type: 'rss',
    name: 'VulnCheck Blog',
    config: { url: 'https://vulncheck.com/feed/blog/atom.xml' },
    tags: ['blog', 'research', 'vendor', 'vulnerability'],
  },
  {
    id: 'rss:malware-sloth',
    adapter_type: 'rss',
    name: 'Malware Sloth',
    config: { url: 'https://malwaresloth.com/rss.xml' },
    tags: ['blog', 'malware', 'research'],
  },
  {
    id: 'rss:cisa-blog',
    adapter_type: 'rss',
    name: 'CISA Blog',
    config: { url: 'https://www.cisa.gov/cisa/blog.xml' },
    tags: ['advisories', 'government', 'government-policy'],
  },
  {
    id: 'rss:cisa-news',
    adapter_type: 'rss',
    name: 'CISA News',
    config: { url: 'https://www.cisa.gov/news.xml' },
    tags: ['advisories', 'government', 'government-policy'],
  },
  {
    id: 'rss:cert-vulnerability-notes',
    adapter_type: 'rss',
    name: 'CERT Vulnerability Notes',
    config: { url: 'https://www.kb.cert.org/vulfeed/' },
    tags: ['advisories', 'vulnerability'],
  },
  {
    id: 'rss:cis-advisories',
    adapter_type: 'rss',
    name: 'CIS Advisories',
    config: { url: 'https://www.cisecurity.org/feed/advisories' },
    tags: ['advisories', 'vulnerability'],
  },
  {
    id: 'rss:cve-threatint',
    adapter_type: 'rss',
    name: 'CVE THREATINT',
    config: { url: 'https://cve.threatint.com/rss/new' },
    tags: ['advisories', 'vulnerability'],
  },
  {
    id: 'rss:exploit-db',
    adapter_type: 'rss',
    name: 'Exploit-DB',
    config: { url: 'https://www.exploit-db.com/rss.xml' },
    tags: ['advisories', 'research-tools', 'vulnerability'],
  },
  {
    id: 'rss:exploitalert',
    adapter_type: 'rss',
    name: 'ExploitAlert',
    config: { url: 'http://www.exploitalert.com/feed/' },
    tags: ['advisories', 'vulnerability'],
  },
  {
    id: 'rss:fortiguard-advisories',
    adapter_type: 'rss',
    name: 'FortiGuard Advisories',
    config: { url: 'https://filestore.fortinet.com/fortiguard/rss/ir.xml' },
    tags: ['advisories', 'vendor', 'vulnerability'],
  },
  {
    id: 'rss:fortiguard-threat-signal',
    adapter_type: 'rss',
    name: 'FortiGuard Threat Signal',
    config: { url: 'https://filestore.fortinet.com/fortiguard/rss/threatsignal.xml' },
    tags: ['advisories', 'research', 'vendor'],
  },
  {
    id: 'rss:github-security',
    adapter_type: 'rss',
    name: 'GitHub Security Blog',
    config: { url: 'https://github.blog/category/security/feed/' },
    tags: ['advisories'],
  },
  {
    id: 'rss:msrc',
    adapter_type: 'rss',
    name: 'MSRC Security Update Guide',
    config: { url: 'https://api.msrc.microsoft.com/update-guide/rss' },
    tags: ['advisories'],
  },
  {
    id: 'rss:msrc-blog',
    adapter_type: 'rss',
    name: 'MSRC Blog',
    config: { url: 'https://msrc-blog.microsoft.com/feed' },
    tags: ['advisories'],
  },
  {
    id: 'rss:nist-cybersecurity',
    adapter_type: 'rss',
    name: 'NIST Cybersecurity',
    config: { url: 'https://www.nist.gov/news-events/cybersecurity/rss.xml' },
    tags: ['advisories', 'government', 'government-policy'],
  },
  {
    id: 'rss:nist-cybersecurity-insights',
    adapter_type: 'rss',
    name: 'NIST Cybersecurity Insights',
    config: { url: 'https://www.nist.gov/blogs/cybersecurity-insights/rss.xml' },
    tags: ['advisories', 'government', 'government-policy'],
  },
  {
    id: 'rss:packet-storm',
    adapter_type: 'rss',
    name: 'Packet Storm',
    config: { url: 'https://rss.packetstormsecurity.com/' },
    tags: ['advisories', 'research-tools', 'vulnerability'],
  },
  {
    id: 'rss:pci-perspectives',
    adapter_type: 'rss',
    name: 'PCI Perspectives',
    config: { url: 'https://blog.pcisecuritystandards.org/rss.xml' },
    tags: ['advisories', 'privacy-compliance'],
  },
  {
    id: 'rss:red-hat-security',
    adapter_type: 'rss',
    name: 'Red Hat Security',
    config: { url: 'https://www.redhat.com/en/rss/blog/channel/security' },
    tags: ['advisories', 'vendor'],
  },
  {
    id: 'rss:siemens-productcert',
    adapter_type: 'rss',
    name: 'Siemens ProductCERT',
    config: { url: 'https://cert-portal.siemens.com/productcert/rss/advisories.atom' },
    tags: ['advisories', 'ot-ics', 'vendor', 'vulnerability'],
  },
  {
    id: 'rss:tenable-research',
    adapter_type: 'rss',
    name: 'Tenable Research Advisories',
    config: { url: 'https://www.tenable.com/security/research/feed' },
    tags: ['advisories', 'research', 'vendor', 'vulnerability'],
  },
  {
    id: 'rss:ubuntu-security',
    adapter_type: 'rss',
    name: 'Ubuntu Security Notices',
    config: { url: 'https://ubuntu.com/security/notices/rss.xml' },
    tags: ['advisories', 'vendor'],
  },
  {
    id: 'rss:zdi-published',
    adapter_type: 'rss',
    name: 'ZDI Published Advisories',
    config: { url: 'https://www.zerodayinitiative.com/rss/published/' },
    tags: ['advisories', 'vulnerability'],
  },
  {
    id: 'rss:zdi-upcoming',
    adapter_type: 'rss',
    name: 'ZDI Upcoming Advisories',
    config: { url: 'https://www.zerodayinitiative.com/rss/upcoming/' },
    tags: ['advisories', 'vulnerability'],
  },
  {
    id: 'rss:aws-security-bulletins',
    adapter_type: 'rss',
    name: 'AWS Security Bulletins',
    config: { url: 'https://aws.amazon.com/security/security-bulletins/rss/feed/' },
    tags: ['advisories', 'cloud', 'vendor'],
  },
  {
    id: 'rss:cisco-newsroom-security',
    adapter_type: 'rss',
    name: 'Cisco Newsroom Security',
    config: {
      url: 'https://newsroom.cisco.com/c/services/i/servlets/newsroom/rssfeed.json?feed=security',
    },
    tags: ['advisories', 'vendor'],
  },
  {
    id: 'rss:linux-debian-advisories',
    adapter_type: 'rss',
    name: 'LinuxSecurity Debian',
    config: { url: 'https://linuxsecurity.com/advisories/debian?format=feed&type=rss' },
    tags: ['advisories', 'vulnerability'],
  },
  {
    id: 'rss:linux-ubuntu-advisories',
    adapter_type: 'rss',
    name: 'LinuxSecurity Ubuntu',
    config: { url: 'https://linuxsecurity.com/advisories/ubuntu?format=feed&type=rss' },
    tags: ['advisories', 'vendor', 'vulnerability'],
  },
  {
    id: 'rss:portswigger-research',
    adapter_type: 'rss',
    name: 'PortSwigger Research',
    config: { url: 'https://portswigger.net/research/rss' },
    tags: ['research'],
  },
  {
    id: 'rss:arxiv-crypto-security',
    adapter_type: 'rss',
    name: 'arXiv Crypto & Security',
    config: { url: 'https://export.arxiv.org/rss/cs.CR/' },
    tags: ['research', 'research-tools'],
  },
  {
    id: 'rss:iacr-news',
    adapter_type: 'rss',
    name: 'IACR News',
    config: { url: 'https://iacr.org/news/rss' },
    tags: ['research', 'research-tools'],
  },
  {
    id: 'rss:encryption-sciencedaily',
    adapter_type: 'rss',
    name: 'Encryption Research',
    config: { url: 'https://www.sciencedaily.com/rss/computers_math/encryption.xml' },
    tags: ['research'],
  },
  {
    id: 'rss:hacking-sciencedaily',
    adapter_type: 'rss',
    name: 'Hacking Research',
    config: { url: 'https://www.sciencedaily.com/rss/computers_math/hacking.xml' },
    tags: ['research'],
  },
  {
    id: 'rss:lightblue-touchpaper',
    adapter_type: 'rss',
    name: 'Light Blue Touchpaper',
    config: { url: 'https://www.lightbluetouchpaper.org/feed/' },
    tags: ['research'],
  },
  {
    id: 'rss:positive-security',
    adapter_type: 'rss',
    name: 'Positive Security',
    config: { url: 'https://positive.security/blog/rss.xml' },
    tags: ['research'],
  },
  {
    id: 'rss:rce-security',
    adapter_type: 'rss',
    name: 'RCE Security',
    config: { url: 'https://www.rcesecurity.com/feed' },
    tags: ['research', 'research-tools'],
  },
  {
    id: 'rss:rtcsec',
    adapter_type: 'rss',
    name: 'RTCSec',
    config: { url: 'https://www.rtcsec.com/index.xml' },
    tags: ['research'],
  },
  {
    id: 'rss:malware-news',
    adapter_type: 'rss',
    name: 'Malware Analysis News',
    config: { url: 'https://malware.news/latest.rss' },
    tags: ['malware', 'research'],
  },
  {
    id: 'rss:rekt-news',
    adapter_type: 'rss',
    name: 'Rekt',
    config: { url: 'https://rekt.news/rss/feed.xml' },
    tags: ['research', 'vulnerability'],
  },
  {
    id: 'rss:detection-at-scale',
    adapter_type: 'rss',
    name: 'Detection at Scale',
    config: { url: 'https://jacknaglieri.substack.com/feed' },
    tags: ['research', 'research-tools'],
  },
  {
    id: 'rss:bluepurple-substack',
    adapter_type: 'rss',
    name: 'Blue/Purple Team Digest',
    config: { url: 'https://bluepurple.substack.com/feed' },
    tags: ['research'],
  },
  {
    id: 'rss:tldrsec',
    adapter_type: 'rss',
    name: 'tl;dr sec',
    config: { url: 'https://rss.beehiiv.com/feeds/xgTKUmMmUm.xml' },
    tags: ['research'],
  },
  {
    id: 'rss:return-on-security',
    adapter_type: 'rss',
    name: 'Return on Security',
    config: { url: 'https://rss.beehiiv.com/feeds/tLSvUYOBwf.xml' },
    tags: ['research'],
  },
  {
    id: 'rss:venture-in-security',
    adapter_type: 'rss',
    name: 'Venture in Security',
    config: { url: 'https://ventureinsecurity.net/feed' },
    tags: ['research'],
  },
  {
    id: 'rss:strategy-of-security',
    adapter_type: 'rss',
    name: 'Strategy of Security',
    config: { url: 'https://strategyofsecurity.com/rss' },
    tags: ['research'],
  },
  {
    id: 'rss:osint-newsletter',
    adapter_type: 'rss',
    name: 'The OSINT Newsletter',
    config: { url: 'https://osintnewsletter.com/feed' },
    tags: ['ot-ics', 'research', 'research-tools'],
  },
  {
    id: 'rss:zero-day-substack',
    adapter_type: 'rss',
    name: 'Zero Day',
    config: { url: 'https://zetter.substack.com/feed' },
    tags: ['research', 'vulnerability'],
  },
  {
    id: 'rss:opalsec',
    adapter_type: 'rss',
    name: 'Opalsec',
    config: { url: 'https://opalsec.substack.com/feed' },
    tags: ['apt', 'research'],
  },
  {
    id: 'rss:latio-pulse',
    adapter_type: 'rss',
    name: 'Latio Pulse',
    config: { url: 'https://pulse.latio.tech/feed' },
    tags: ['cloud', 'research'],
  },
  {
    id: 'rss:shellsharks',
    adapter_type: 'rss',
    name: 'shellsharks',
    config: { url: 'https://shellsharks.github.io/feed.xml' },
    tags: ['research'],
  },
  {
    id: 'rss:omer-on-security',
    adapter_type: 'rss',
    name: 'Omer on Security',
    config: { url: 'https://www.omeronsecurity.com/feed' },
    tags: ['research'],
  },
  {
    id: 'rss:cylab-be',
    adapter_type: 'rss',
    name: 'cylab.be',
    config: { url: 'https://cylab.be/rss' },
    tags: ['research'],
  },
  {
    id: 'rss:taszk-labs',
    adapter_type: 'rss',
    name: 'Taszk Labs',
    config: { url: 'https://labs.taszk.io/index.xml' },
    tags: ['research'],
  },
];

/**
 * Build-time invariant: every SOURCE-SHAPE category must have at least two
 * seeded feeds. If a future PR drops below the threshold we throw at plugin
 * start so the regression is caught in dev, not in prod.
 *
 * FEED_COVERAGE_CATEGORIES is an explicit subset of THREAT_CATEGORIES: only
 * categories that represent the *type/shape* of a feed (vendor research, apt
 * trackers, malware analysis, etc.) are listed here. Content-classification
 * categories (`nation-state`, `financial`, `regulatory`, `zero-day`,
 * `general`) are intentionally excluded — they are assigned per-report by
 * `enrich_taxonomy` at ingest time, not by feed membership, so requiring
 * dedicated feeds for them would misrepresent sources.
 */
const REQUIRED_MIN_FEEDS_PER_CATEGORY = 2;

// Only feed-level / source-shape categories. Content categories populated by
// enrich_taxonomy are excluded (see comment above).
const FEED_COVERAGE_CATEGORIES = [
  'apt',
  'malware',
  'ransomware',
  'vulnerability',
  'data-breach',
  'phishing',
  'cloud',
  'supply-chain',
  'cybercrime',
  'insider-threat',
  'iot',
  'ot-ics',
  'government-policy',
  'privacy-compliance',
  'research-tools',
] as const satisfies ReadonlyArray<ThreatCategory>;

const CATEGORY_KEYWORDS: Record<(typeof FEED_COVERAGE_CATEGORIES)[number], readonly string[]> = {
  apt: ['apt'],
  malware: ['malware'],
  ransomware: ['ransomware', 'extortion'],
  vulnerability: ['vulnerability', 'advisories'],
  'data-breach': ['data-breach'],
  phishing: ['phishing'],
  cloud: ['cloud'],
  'supply-chain': ['supply-chain'],
  cybercrime: ['cybercrime'],
  'insider-threat': ['insider-threat'],
  iot: ['iot'],
  'ot-ics': ['ot-ics'],
  'government-policy': ['government-policy', 'government'],
  'privacy-compliance': ['privacy-compliance'],
  'research-tools': ['research-tools', 'research'],
};

export const verifyCategoryCoverage = (
  sources: readonly DefaultSource[] = DEFAULT_SOURCES
): void => {
  const gaps: string[] = [];
  for (const category of FEED_COVERAGE_CATEGORIES) {
    const keywords = CATEGORY_KEYWORDS[category];
    const matchCount = sources.filter((s) => s.tags.some((t) => keywords.includes(t))).length;
    if (matchCount < REQUIRED_MIN_FEEDS_PER_CATEGORY) {
      gaps.push(`${category} (only ${matchCount})`);
    }
  }
  if (gaps.length > 0) {
    throw new Error(
      `DEFAULT_SOURCES is missing >=${REQUIRED_MIN_FEEDS_PER_CATEGORY} feeds for: ${gaps.join(
        ', '
      )}`
    );
  }
};

export interface SeedDefaultSourcesResult {
  total: number;
  created: number;
  skipped: number;
  failed: number;
}

const BULK_CREATE_CHUNK_SIZE = 50;

const buildDefaultSourceDocument = (src: DefaultSource, now: string) => ({
  adapter_type: src.adapter_type,
  name: src.name,
  enabled: true,
  config: src.config,
  tags: src.tags,
  // Seeded sources are visible from every space; operator-added
  // sources are tagged with the originating space.
  space_id: GLOBAL_SPACE_ID,
  created_at: now,
  updated_at: now,
});

const isCreateConflict = (error: { type?: string; status?: number } | undefined): boolean =>
  error?.type === 'version_conflict_engine_exception' || error?.status === 409;

/**
 * Idempotent seeding — bulk `create` by stable id so re-runs do not duplicate.
 * Operator edits to enabled, tags, or config survive subsequent seeds because
 * we only insert missing ids (conflicts are treated as already present).
 */
export const seedDefaultSources = async ({
  esClient,
  logger,
}: {
  esClient: ElasticsearchClient;
  logger: Logger;
}): Promise<SeedDefaultSourcesResult> => {
  const log = logger.get('seed-default-sources');
  verifyCategoryCoverage();
  const now = new Date().toISOString();

  const result: SeedDefaultSourcesResult = {
    total: DEFAULT_SOURCES.length,
    created: 0,
    skipped: 0,
    failed: 0,
  };

  log.info(`Seeding ${result.total} default threat-intelligence sources`);

  for (let offset = 0; offset < DEFAULT_SOURCES.length; offset += BULK_CREATE_CHUNK_SIZE) {
    const chunk = DEFAULT_SOURCES.slice(offset, offset + BULK_CREATE_CHUNK_SIZE);
    const operations = chunk.flatMap((src) => [
      { create: { _index: THREAT_INTEL_SOURCES_INDEX, _id: src.id } },
      buildDefaultSourceDocument(src, now),
    ]);

    try {
      const bulkResponse = await esClient.bulk({
        operations,
        refresh: false,
      });

      for (const item of bulkResponse.items) {
        const createItem = item.create;
        if (!createItem) {
          result.failed += 1;
        } else if (createItem.error) {
          if (isCreateConflict(createItem.error)) {
            result.skipped += 1;
          } else {
            result.failed += 1;
            log.warn(
              `Failed to seed default source ${createItem._id}: ${
                createItem.error.type ?? 'error'
              } ${createItem.error.reason ?? ''}`
            );
          }
        } else if (createItem.result === 'created') {
          result.created += 1;
          log.debug(`Seeded default source ${createItem._id}`);
        }
      }
    } catch (err) {
      const message = (err as Error).message;
      result.failed += chunk.length;
      log.warn(
        `Bulk seed failed for sources ${chunk[0]?.id ?? '?'}..${
          chunk[chunk.length - 1]?.id ?? '?'
        }: ${message}`
      );
    }
  }

  if (result.created > 0) {
    await esClient.indices.refresh({ index: THREAT_INTEL_SOURCES_INDEX });
  }

  log.info(
    `Default source seeding finished: ${result.created} created, ${result.skipped} skipped, ${result.failed} failed`
  );

  return result;
};
