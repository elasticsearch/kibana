/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { AIMessage, ToolMessage } from '@langchain/core/messages';
import type { MatchPrebuiltRuleState } from '../../state';

interface MockPrebuiltRule {
  rule_id: string;
  name: string;
  description: string;
}

export const mockRule: MockPrebuiltRule = {
  rule_id: 'test-rule',
  name: 'Suspicious MS Office Child Process',
  description: 'test-description',
};

export const mockOtherRule: MockPrebuiltRule = {
  rule_id: 'other-rule',
  name: 'wrong-name',
  description: 'other-description',
};

export const baseState = {
  original_rule: {
    title: 'Office Document Executing Macro Code',
    description: 'Detects macro execution from office documents',
    vendor: 'splunk',
    query: '`sysmon` EventCode=7',
  },
  nl_query: '',
  match_prebuilt_rules_messages: [],
} as unknown as MatchPrebuiltRuleState;

export const toolCallMessage = (query: string) =>
  new AIMessage({
    content: '',
    tool_calls: [{ type: 'tool_call', id: 'call-1', name: 'searchPrebuiltRules', args: { query } }],
  });

export const finalMessage = (match: string, summary = '## Prebuilt Rule Matching Summary\nfoo') =>
  new AIMessage({ content: `\`\`\`json\n${JSON.stringify({ match, summary })}\n\`\`\`` });

export const matchResult = (match: string, summary = '## Prebuilt Rule Matching Summary\nfoo') => ({
  match,
  summary,
});

export const malformedMessage = () => new AIMessage({ content: 'not valid json' });

export const searchToolMessage = (candidates: MockPrebuiltRule[]) =>
  new ToolMessage({
    tool_call_id: 'call-1',
    name: 'searchPrebuiltRules',
    content: JSON.stringify(
      candidates.map((rule) => ({ name: rule.name, description: rule.description }))
    ),
    artifact: candidates,
  });

export const qradarDosFloodRule: MatchPrebuiltRuleState['original_rule'] = {
  id: '101477',
  vendor: 'qradar',
  title: 'DoS: Local Flood (TCP) Dest',
  description:
    'Detects when a single local host sends a large number of packets (greater than 1000pps) to an internet destination over a small period of time. The packet rate in this rule can be adjusted as needed to reflect the network.',
  query:
    '<rule buildingBlock="false" enabled="true" id="101477" overrideid="101477" owner="admin" roleDefinition="false" scope="LOCAL" type="FLOW"><name>DoS: Local Flood (TCP) Dest</name><notes>Detects when a single local host sends a large number of packets (greater than 1000pps) to an internet destination over a small period of time. The packet rate in this rule can be adjusted as needed to reflect the network.</notes><testDefinitions><test group="Flow Property Tests" id="203" name="com.q1labs.semsources.cre.tests.PacketRate" requiredCapabilities="EventViewer.RULECREATION|SURVEILLANCE.RULECREATION" uid="1"><text>when the destination packet rate is greater than 1000 packets/second</text></testDefinitions></rule>',
  query_language: 'xml',
};

export const qradarDosFloodState = {
  original_rule: qradarDosFloodRule,
  nl_query: '',
  match_prebuilt_rules_messages: [],
} as unknown as MatchPrebuiltRuleState;

export const qradarDosFloodSearchQuery =
  'network flow TCP denial of service flood high packet rate inbound traffic DoS attack local host destination';

export const qradarDosFloodSearchCandidates: MockPrebuiltRule[] = [
  {
    rule_id: 'possible-okta-dos-attack',
    name: 'Possible Okta DoS Attack',
    description:
      "Detects possible Denial of Service (DoS) attacks against an Okta organization. An adversary may attempt to disrupt an organization's business operations by performing a DoS attack against its Okta service.",
  },
  {
    rule_id: 'network-traffic-to-rare-destination-country',
    name: 'Network Traffic to Rare Destination Country',
    description:
      'A machine learning job detected a rare destination country name in the network logs. This can be due to initial access, persistence, command-and-control, or exfiltration activity.',
  },
  {
    rule_id: 'potential-denial-of-azure-openai-ml-service',
    name: 'Potential Denial of Azure OpenAI ML Service',
    description:
      'Detects patterns indicative of Denial-of-Service (DoS) attacks on machine learning (ML) models, focusing on unusually high volume and frequency of requests or patterns of requests that are known to cause performance degradation or service disruption, such as large input sizes or rapid API calls.',
  },
  {
    rule_id: 'spike-in-network-traffic',
    name: 'Spike in Network Traffic',
    description:
      'A machine learning job detected an unusually large spike in network traffic. Such a burst of traffic, if not caused by a surge in business activity, can be due to suspicious or malicious activity. Denial-of-service attacks or traffic floods may also produce such a surge in traffic.',
  },
  {
    rule_id: 'spike-in-host-based-traffic',
    name: 'Spike in host-based traffic',
    description:
      'A machine learning job has detected a sudden spike in host based traffic. This can be due to a range of security issues, such as a compromised system, DDoS attacks, malware infections, privilege escalation, or data exfiltration.',
  },
];

export const qradarDosFloodMatch = 'Spike in Network Traffic';

export const qradarDosFloodSummary = `## Prebuilt Rule Matching Summary

The source QRadar rule detects TCP-based DoS flood attacks by measuring destination packet rates (>1000 packets/second) on inbound network flow data from external internet sources to local hosts.

The closest candidate from the search results is **"Spike in Network Traffic"**, which uses an ML job to detect unusually large spikes in network traffic and explicitly mentions that "Denial-of-service attacks or traffic floods may also produce such a surge in traffic" as a use case.

However, the match is not confident enough to declare as exact because:
- The source rule uses a **threshold-based detection mechanism** (packet rate > 1000 pps) on **network flow data** (NetFlow/IPFIX/sFlow), while the Elastic rule uses **ML anomaly detection** on aggregate traffic.
- The source rule is specifically scoped to **TCP protocol**, **inbound direction**, and **local destination hosts** from **internet sources** — a much more specific detection logic.
- The Elastic rule is broader and covers general traffic spikes (exfiltration, reconnaissance, DoS), not specifically TCP flood DoS from external to internal hosts.

Given the significant differences in detection mechanism, data source specificity, and logic complexity, no Elastic pre-built rule is a confident match for this source rule.`;

export const qradarHoneypotRule: MatchPrebuiltRuleState['original_rule'] = {
  id: '1271',
  vendor: 'qradar',
  title: 'NetworkDefinition: Honeypot like Addresses',
  description:
    'Edit this BB by replace the other network with network objects defined in your network hierarchy that are currently not in use in your network or are used in a honeypot or tarpit installation. Once these have been defined, you must enable the Anomaly: Potential Honeypot Access rule. You must also add a security/policy sentry to these network objects to generate events based on attempted access',
  query:
    '<rule buildingBlock="false" enabled="true" id="1271" overrideid="1271" owner="admin" roleDefinition="false" scope="LOCAL" type="COMMON"><name>NetworkDefinition: Honeypot like Addresses</name><notes>Edit this BB by replace the other network with network objects defined in your network hierarchy that are currently not in use in your network or are used in a honeypot or tarpit installation.</notes><testDefinitions><test group="Network Property Tests" id="104" name="com.q1labs.semsources.cre.tests.NetworkView_Test" requiredCapabilities="EventViewer.RULECREATION|SURVEILLANCE.RULECREATION" uid="0"><text>when the destination IP is a part of any of the following Bogon</text></testDefinitions></rule>',
  query_language: 'xml',
};

export const qradarHoneypotState = {
  original_rule: qradarHoneypotRule,
  nl_query: '',
  match_prebuilt_rules_messages: [],
} as unknown as MatchPrebuiltRuleState;

interface QradarHoneypotSearchAttempt {
  query: string;
  candidates: MockPrebuiltRule[];
}

export const qradarHoneypotSearchAttempts: QradarHoneypotSearchAttempt[] = [
  {
    query:
      'network traffic destination IP bogon reserved private address space honeypot RFC 1918 loopback link-local detection',
    candidates: [
      {
        rule_id: 'network-traffic-to-rare-destination-country',
        name: 'Network Traffic to Rare Destination Country',
        description:
          'A machine learning job detected a rare destination country name in the network logs. This can be due to initial access, persistence, command-and-control, or exfiltration activity.',
      },
      {
        rule_id: 'potential-dns-rebinding-from-public-to-private-address',
        name: 'Potential DNS Rebinding from Public to Private Address',
        description:
          'Identifies a client resolving the same public registered domain to both a public IP address and a private, loopback, link-local, unique-local IPv6, or shared address.',
      },
      {
        rule_id: 'alerts-from-multiple-integrations-by-destination-address',
        name: 'Alerts From Multiple Integrations by Destination Address',
        description:
          'This rule uses alert data to determine when multiple alerts from different integrations with unique event categories and involving the same destination.ip are triggered.',
      },
      {
        rule_id: 'unusual-network-destination-domain-name',
        name: 'Unusual Network Destination Domain Name',
        description:
          'A machine learning job detected an unusual network destination domain name. This can be due to initial access, persistence, command-and-control, or exfiltration activity.',
      },
      {
        rule_id: 'external-ip-address-discovery-via-curl',
        name: 'External IP Address Discovery via Curl',
        description:
          "Detects applications making a curl request to a known public IP address lookup web service. Malware commonly performs this action during reconnaissance to assess potential targets and identify the victim's external IP address.",
      },
    ],
  },
  {
    query:
      'honeypot tarpit access internal network scanning unusual connection dark address space intrusion detection',
    candidates: [
      {
        rule_id: 'connection-to-internal-network-via-telnet',
        name: 'Connection to Internal Network via Telnet',
        description:
          'Telnet provides a command line interface for communication with a remote device or server. This rule identifies Telnet network connections to non-publicly routable IP addresses.',
      },
      {
        rule_id: 'unusual-process-network-connection',
        name: 'Unusual Process Network Connection',
        description:
          'Identifies network activity from unexpected system applications. This may indicate adversarial activity as these applications are often leveraged by adversaries to execute code and evade detection.',
      },
      {
        rule_id: 'unusual-network-connection-via-dllhost',
        name: 'Unusual Network Connection via DllHost',
        description:
          'Identifies unusual instances of dllhost.exe making outbound network connections. This may indicate adversarial Command and Control activity.',
      },
      {
        rule_id: 'unusual-network-connection-via-rundll32',
        name: 'Unusual Network Connection via RunDLL32',
        description:
          'Identifies unusual instances of rundll32.exe making outbound network connections. This may indicate adversarial Command and Control activity.',
      },
      {
        rule_id: 'unusual-linux-network-connection-discovery',
        name: 'Unusual Linux Network Connection Discovery',
        description:
          'Looks for commands related to system network connection discovery from an unusual user context. This can be due to uncommon troubleshooting activity or due to a compromised account.',
      },
    ],
  },
  {
    query:
      'anomaly potential access unallocated unused IP CIDR match private network flow reconnaissance lateral movement',
    candidates: [
      {
        rule_id: 'potential-wsus-abuse-for-lateral-movement',
        name: 'Potential WSUS Abuse for Lateral Movement',
        description:
          'Identifies a potential Windows Server Update Services (WSUS) abuse to execute psexec to enable for lateral movement.',
      },
      {
        rule_id: 'suspected-lateral-movement-from-compromised-host',
        name: 'Suspected Lateral Movement from Compromised Host',
        description:
          'Detects potential lateral movement or post-compromise activity by correlating alerts where the host.ip of one alert matches the source.ip of a subsequent alert.',
      },
      {
        rule_id: 'at-exe-command-lateral-movement',
        name: 'At.exe Command Lateral Movement',
        description:
          'Identifies use of at.exe to interact with the task scheduler on remote hosts. Remote task creations, modifications or execution could be indicative of adversary lateral movement.',
      },
      {
        rule_id: 'service-command-lateral-movement',
        name: 'Service Command Lateral Movement',
        description:
          'Identifies use of sc.exe to create, modify, or start services on remote hosts. This could be indicative of adversary lateral movement but will be noisy if commonly done by admins.',
      },
      {
        rule_id: 'wmi-incoming-lateral-movement',
        name: 'WMI Incoming Lateral Movement',
        description:
          'Identifies processes executed via Windows Management Instrumentation (WMI) on a remote host. This could be indicative of adversary lateral movement.',
      },
    ],
  },
];

export const qradarHoneypotNoMatchSummary = `## Prebuilt Rule Matching Summary
After three searches across different keyword angles — Bogon/private IP address space detection, honeypot/tarpit access, and anomaly/reconnaissance against unallocated IP ranges — none of the returned candidates match the source rule's use case.

The source QRadar rule is a **building block** that classifies network traffic whose destination IP falls within Bogon/reserved address space (RFC 1918, loopback, link-local, documentation ranges, etc.), intended to serve as a dependency for a "Potential Honeypot Access" anomaly rule. The final search returned only lateral movement rules (WSUS, at.exe, sc.exe, WMI, alert correlation), which are entirely unrelated.

No Elastic pre-built rule covers this specific use case of a generic Bogon/reserved IP address classifier building block for honeypot or tarpit access detection. The closest tangential candidate from earlier searches was "Connection to Internal Network via Telnet," but that rule is narrowly scoped to Telnet process-based connections rather than being a general-purpose Bogon destination IP classifier across all network traffic.`;
