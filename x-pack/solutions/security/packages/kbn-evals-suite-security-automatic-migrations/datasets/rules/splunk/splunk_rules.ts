/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RuleExample } from '../types';

/**
 * Placeholder Splunk SPL rules dataset.
 *
 * TODO: Replace with real rules from Jatin. Each example needs:
 * - original_rule: Real Splunk SPL detection rule
 * - resources: Macro/lookup definitions the rule references
 * - expected: Ground truth (expected ESQL, integration, prebuilt match, etc.)
 *
 * Categories to cover:
 * - Simple SPL rules (no macros/lookups)
 * - Rules with macro and/or lookup dependencies that can be resolved
 * - Rules with inputlookup or other unsupported constructs
 * - Rules that should match prebuilt Elastic rules
 * - Rules with lookup dependencies expecting LOOKUP JOIN in ESQL
 * - Rules matching specific Elastic integrations
 */
export const splunkRules: RuleExample[] = [
  {
    id: 'splunk-simple-001',
    input: {
      original_rule: {
        id: 'splunk-simple-001',
        vendor: 'splunk',
        title: 'High Number of Failed Logins',
        description: 'Detects brute force attempts via excessive failed logins',
        query:
          'index=main sourcetype=WinEventLog EventCode=4625 | stats count by src_ip | where count > 10',
        query_language: 'spl',
      },
      resources: [],
    },
    output: {
      translation_result: 'full',
      esql_query: null,
      index_pattern: null,
      integration_id: null,
      prebuilt_rule_id: null,
      has_lookup_join: false,
      is_unsupported: false,
    },
    metadata: {
      vendor: 'splunk',
      category: 'simple',
      complexity: 'low',
    },
  },
  {
    id: 'splunk-lookup-001',
    input: {
      original_rule: {
        id: 'splunk-lookup-001',
        vendor: 'splunk',
        title: 'Connection to Known Malicious IP',
        description: 'Detects network connections to IPs in the threat intelligence lookup',
        query:
          'index=main sourcetype=firewall | lookup threat_intel_ip ip AS dest_ip OUTPUT threat_category | where isnotnull(threat_category)',
        query_language: 'spl',
      },
      resources: [
        {
          type: 'lookup',
          name: 'threat_intel_ip',
          content: 'ip,threat_category\n192.168.1.100,malware\n10.0.0.50,c2',
        },
      ],
    },
    output: {
      translation_result: 'full',
      esql_query: null,
      index_pattern: null,
      integration_id: null,
      prebuilt_rule_id: null,
      has_lookup_join: true,
      is_unsupported: false,
    },
    metadata: {
      vendor: 'splunk',
      category: 'with_lookups',
      complexity: 'medium',
    },
  },
  {
    id: 'splunk-unsupported-001',
    input: {
      original_rule: {
        id: 'splunk-unsupported-001',
        vendor: 'splunk',
        title: 'Rule Using inputlookup',
        description: 'Uses inputlookup which is unsupported for translation',
        query:
          '| inputlookup my_static_list.csv | join src_ip [search index=main sourcetype=firewall]',
        query_language: 'spl',
      },
      resources: [],
    },
    output: {
      translation_result: 'untranslatable',
      esql_query: null,
      index_pattern: null,
      integration_id: null,
      prebuilt_rule_id: null,
      has_lookup_join: false,
      is_unsupported: true,
    },
    metadata: {
      vendor: 'splunk',
      category: 'unsupported',
      complexity: 'low',
    },
  },
  {
    // Real prebuilt rule looked up via GET /api/saved_objects/_find?type=security-rule on a
    // local Kibana with the security_detection_engine package installed (2026-08-20):
    //   rule_id: 8cb84371-d053-4f4f-bce0-c74990e28f28
    //   name: "Potential Successful SSH Brute Force Attack"
    // A single obvious semantic query ("SSH brute force login") should surface this on the
    // first search attempt, so this exercises the "happy path" match for both v1 and v2.
    id: 'splunk-prebuilt-match-001',
    input: {
      original_rule: {
        id: 'splunk-prebuilt-match-001',
        vendor: 'splunk',
        title: 'Repeated SSH Authentication Failures Followed By Success',
        description:
          'Detects multiple failed SSH login attempts followed by a successful login from the same source IP and user, indicating a potential successful brute-force compromise.',
        query:
          'index=linux sourcetype=linux_secure "sshd" (Failed OR Accepted) | eval outcome=if(match(_raw, "Failed password"), "failure", "success") | transaction user, src_ip startswith=eval(outcome="failure") endswith=eval(outcome="success") maxspan=15s | where eventcount > 5',
        query_language: 'spl',
      },
      resources: [],
    },
    output: {
      translation_result: 'full',
      esql_query: null,
      index_pattern: null,
      integration_id: null,
      prebuilt_rule_id: '8cb84371-d053-4f4f-bce0-c74990e28f28',
      has_lookup_join: false,
      is_unsupported: false,
    },
    metadata: {
      vendor: 'splunk',
      category: 'prebuilt_match',
      complexity: 'low',
    },
  },
  {
    // Real prebuilt rule looked up the same way (2026-08-20):
    //   rule_id: aff74d85-5bfa-4ff1-ace2-4e3995a37cfa
    //   name: "Google Workspace Impossible Travel Login"
    // Deliberately avoids the phrase "impossible travel" and instead describes the underlying
    // geo-velocity calculation, so a first-pass query built from the literal wording (haversine
    // distance, GeoIP deltas) is unlikely to surface the right candidate. Finding it should
    // require the model to recognize this is an "impossible travel" pattern and reformulate the
    // search — this is designed to exercise v2's retry loop, which v1 has no equivalent of.
    id: 'splunk-prebuilt-match-002',
    input: {
      original_rule: {
        id: 'splunk-prebuilt-match-002',
        vendor: 'splunk',
        title: 'Geographically Improbable Successive Google Workspace Sign-Ins',
        description:
          'Flags a user account with two successful Google Workspace sign-ins from IP-geolocated countries that are physically too far apart to have been traveled between in the observed time gap, computed via haversine distance over consecutive login events for the same user.',
        query:
          'index=gsuite sourcetype="google:gsuite:login" login_success=true | eval lat=geo_lat, lon=geo_lon | streamstats current=f last(lat) as prev_lat, last(lon) as prev_lon, last(_time) as prev_time by user | eval distance_km=haversine(lat,lon,prev_lat,prev_lon), hours=(_time-prev_time)/3600 | eval speed_kmh=distance_km/hours | where distance_km>500 AND speed_kmh>800',
        query_language: 'spl',
      },
      resources: [],
    },
    output: {
      translation_result: 'partial',
      esql_query: null,
      index_pattern: null,
      integration_id: null,
      prebuilt_rule_id: 'aff74d85-5bfa-4ff1-ace2-4e3995a37cfa',
      has_lookup_join: false,
      is_unsupported: false,
    },
    metadata: {
      vendor: 'splunk',
      category: 'prebuilt_match',
      complexity: 'high',
    },
  },
];
