/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { RuleExample } from '../types';

/**
 * Placeholder QRadar rules dataset.
 *
 * TODO: Replace with real QRadar rules from Jatin. Each example needs:
 * - original_rule: QRadar XML rule (base64-decoded rule_data in query field)
 * - resources: Building blocks, QID maps, reference sets, etc.
 * - expected: Ground truth
 *
 * Categories to cover:
 * - Simple QRadar event rules (no dependencies)
 * - Rules with building block dependencies
 * - Rules with reference set dependencies (expecting LOOKUP JOIN in ESQL)
 * - Rules with QID Map Entry test conditions
 * - Rules containing unsupported constructs (Sequence, DoubleSequence, CauseAndEffect)
 * - Rules that should match prebuilt Elastic rules
 * - Rules matching specific Elastic integrations
 */
export const qradarRules: RuleExample[] = [
  {
    id: 'qradar-simple-001',
    input: {
      original_rule: {
        id: 'qradar-simple-001',
        vendor: 'qradar',
        title: 'Multiple Login Failures',
        description: 'Detects multiple failed login attempts from a single source',
        query:
          '<rule><test><and><test name="EventNameTest"><parameter id="regex" value="Failed Login"/></test><test name="LocalSourceIPTest"><parameter id="direction" value="source"/></test></and></test></rule>',
        query_language: 'xml',
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
      vendor: 'qradar',
      category: 'simple',
      complexity: 'low',
    },
  },
  {
    id: 'qradar-reference-set-001',
    input: {
      original_rule: {
        id: 'qradar-reference-set-001',
        vendor: 'qradar',
        title: 'Connection to Suspicious IP from Reference Set',
        description: 'Detects connections to IPs listed in a reference set',
        query:
          '<rule><test><and><test name="ReferenceSetTest"><parameter id="name" value="Suspicious_IPs"/><parameter id="field" value="sourceip"/></test></and></test></rule>',
        query_language: 'xml',
      },
      resources: [
        {
          type: 'lookup',
          name: 'Suspicious_IPs',
          content: '192.168.1.100\n10.0.0.50',
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
      vendor: 'qradar',
      category: 'with_reference_sets',
      complexity: 'medium',
    },
  },
  {
    id: 'qradar-unsupported-001',
    input: {
      original_rule: {
        id: 'qradar-unsupported-001',
        vendor: 'qradar',
        title: 'Rule Using Sequence Function',
        description: 'Uses SequenceFunction_Test which is unsupported',
        query:
          '<rule><test><and><test name="SequenceFunction_Test"><parameter id="function" value="sequence"/></test></and></test></rule>',
        query_language: 'xml',
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
      vendor: 'qradar',
      category: 'unsupported',
      complexity: 'low',
    },
  },
  {
    // Matches Elastic "Attempts to Brute Force an Okta User Account" (e08ccd49-0380-4b2b-8d71-8000377d6e49).
    // An obvious semantic query ("Okta account lockout brute force") should hit on the first
    // search — happy-path match for both v1 and v2.
    id: 'qradar-prebuilt-match-001',
    input: {
      original_rule: {
        id: 'qradar-prebuilt-match-001',
        vendor: 'qradar',
        title: 'Okta User Account Locked After Repeated Failed Logins',
        description:
          'Detects an Okta user account being locked out multiple times within a short window due to repeated authentication failures, indicating a potential brute-force or password-spraying attack.',
        query:
          '<rule><test><and><test name="EventNameTest"><parameter id="regex" value="user.account.lock"/></test><test name="LogSourceTypeTest"><parameter id="type" value="Okta"/></test><test name="ThresholdTest"><parameter id="count" value="3"/><parameter id="window" value="10800"/></test></and></test></rule>',
        query_language: 'xml',
      },
      resources: [],
    },
    output: {
      translation_result: 'full',
      esql_query: null,
      index_pattern: null,
      integration_id: null,
      prebuilt_rule_id: 'e08ccd49-0380-4b2b-8d71-8000377d6e49',
      has_lookup_join: false,
      is_unsupported: false,
    },
    metadata: {
      vendor: 'qradar',
      category: 'prebuilt_match',
      complexity: 'low',
    },
  },
  {
    // Matches Elastic "Microsoft Entra ID Impossible Travel Sign-in" (bc9f5144-0ead-476e-ba6e-cef295601195).
    // Avoids the phrase "impossible travel" so a literal first-pass query is unlikely to hit;
    // finding it requires reformulating — exercises v2's retry loop (v1 has none).
    id: 'qradar-prebuilt-match-002',
    input: {
      original_rule: {
        id: 'qradar-prebuilt-match-002',
        vendor: 'qradar',
        title: 'Anomalous Cross-Region Azure AD Interactive Sign-Ins for Same Identity',
        description:
          'Detects a user principal completing two successful Azure Active Directory interactive sign-ins from source locations separated by more than 500km within a 90 minute window, where the implied velocity between sign-ins exceeds physically possible travel speed.',
        query:
          '<rule><test><and><test name="EventNameTest"><parameter id="regex" value="Sign-in activity"/></test><test name="LogSourceTypeTest"><parameter id="type" value="Microsoft Entra ID"/></test><test name="ReferenceSetTest"><parameter id="name" value="AAD_Recent_SignIn_Locations"/><parameter id="field" value="userPrincipalName"/></test></and></test></rule>',
        query_language: 'xml',
      },
      resources: [
        {
          type: 'lookup',
          name: 'AAD_Recent_SignIn_Locations',
          content: 'userPrincipalName,lastLat,lastLon,lastSeen',
        },
      ],
    },
    output: {
      translation_result: 'partial',
      esql_query: null,
      index_pattern: null,
      integration_id: null,
      prebuilt_rule_id: 'bc9f5144-0ead-476e-ba6e-cef295601195',
      has_lookup_join: true,
      is_unsupported: false,
    },
    metadata: {
      vendor: 'qradar',
      category: 'prebuilt_match',
      complexity: 'high',
    },
  },
  {
    // Matches Elastic "Spike in Network Traffic" (ML, b240bfb8-26b7-4e5e-924e-218144a3fa71, job high_count_network_events).
    // Verbatim QRadar FLOW export — covers the flow-rule shape (testDefinitions/PacketRate) the event fixtures skip.
    // Cross-mechanism GT: per-host packet-rate threshold vs ML volume anomaly, same DoS/flood objective.
    // Tests whether the generic (QRadar/Sentinel) `MATCH_CORE_GUIDELINE_BULLETS` concession applies vs Splunk.
    id: 'qradar-prebuilt-match-003',
    input: {
      original_rule: {
        id: 'qradar-prebuilt-match-003',
        vendor: 'qradar',
        title: 'DoS: Local Flood (TCP) LOCAL',
        description:
          'Detects when a single local host sends a large number of packets (greater than 1000pps) to an internet destination over a small period of time. The packet rate in this rule can be adjusted as needed to reflect the network.',
        query: `<rule buildingBlock="false" enabled="true" id="101477" overrideid="101477" owner="admin" roleDefinition="false" scope="LOCAL" type="FLOW">
    <name>
        DoS: Local Flood (TCP) LOCAL
    </name>
    <notes>
        Detects when a single local host sends a large number of packets (greater than 1000pps) to an internet destination over a small period of time. The packet rate in this rule can be adjusted as needed to reflect the network.
    </notes>
    <testDefinitions>
        <test group="Flow Property Tests" id="203" name="com.q1labs.semsources.cre.tests.PacketRate" requiredCapabilities="EventViewer.RULECREATION|SURVEILLANCE.RULECREATION" uid="1">
            <text>
                when the local packet rate is greater than 1000 packets/second
            </text>
            <parameter id="1">
                <initialText>
                    source
                </initialText>
                <selectionLabel>
                    Select a direction
                </selectionLabel>
                <userOptions format="list" multiselect="false" source="xml">
                    <option id="src">
                        source
                    </option>
                    <option id="dst">
                        destination
                    </option>
                    <option id="local">
                        local
                    </option>
                    <option id="remote">
                        remote
                    </option>
                </userOptions>
                <userSelection>
                    local
                </userSelection>
                <userSelectionId>
                    0
                </userSelectionId>
            </parameter>
            <parameter id="2">
                <initialText>
                    greater than
                </initialText>
                <selectionLabel>
                    Select a test
                </selectionLabel>
                <userOptions format="list" multiselect="false" source="xml">
                    <option id="1">
                        greater than
                    </option>
                    <option id="-1">
                        less than
                    </option>
                    <option id="0">
                        equal to
                    </option>
                </userOptions>
                <userSelection>
                    1
                </userSelection>
                <userSelectionId>
                    0
                </userSelectionId>
            </parameter>
            <parameter id="3">
                <initialText>
                    value
                </initialText>
                <selectionLabel>
                    Enter the value
                </selectionLabel>
                <userOptions errorkey="30001" format="user" multiselect="false" validation="com.q1labs.core.ui.util.ValidatorUtils.validatePositiveNumber"/>
                <userSelection>
                    1000
                </userSelection>
                <userSelectionId>
                    0
                </userSelectionId>
            </parameter>
        </test>
    </testDefinitions>
    <actions flowAnalysisInterval="0" forceOffenseCreation="true" includeAttackerEventsInterval="0" offenseMapping="0"/>
    <responses referenceMap="false" referenceMapOfMaps="false" referenceMapOfMapsRemove="false" referenceMapOfSets="false" referenceMapOfSetsRemove="false" referenceMapRemove="false" referenceTable="false" referenceTableRemove="false">
        <newevent contributeOffenseName="true" credibility="5" describeOffense="true" description="Single local host sending a large number of packets (greater than 1000pps) to an internet destination over a small period of time. This can indicate an attack or a service that has become unresponsive.." forceOffenseCreation="true" lowLevelCategory="2028" name="DoS: Local Flood (TCP)." offenseMapping="0" overrideOffenseName="false" qid="67555203" relevance="7" severity="5"/>
    </responses>
</rule>`,
        query_language: 'xml',
      },
      resources: [],
    },
    output: {
      translation_result: 'full',
      esql_query: null,
      index_pattern: null,
      integration_id: null,
      prebuilt_rule_id: 'b240bfb8-26b7-4e5e-924e-218144a3fa71',
      has_lookup_join: false,
      is_unsupported: false,
    },
    metadata: {
      vendor: 'qradar',
      category: 'prebuilt_match',
      complexity: 'medium',
    },
  },
];
