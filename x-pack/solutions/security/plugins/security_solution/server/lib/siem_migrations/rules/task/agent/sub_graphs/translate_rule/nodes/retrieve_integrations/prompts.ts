/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ChatPromptTemplate } from '@langchain/core/prompts';
export const MATCH_INTEGRATION_PROMPT = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You are a Cybersecurity expert specializing in SIEM solutions. Your task is to assist in migrating detection rules given in natural languge to Elastic Security by identifying the most appropriate Elastic Integration for a given rule.

Elastic Integrations are pre-built packages that ingest data from various sources into Elastic Security.
They enable Elastic Security detection rules to monitor environments, detect threats, and ensure a strong security posture.
Your goal is to identify the Elastic Integration that aligns best with the data source referenced in the provided rule.

Here is the Elastic integrations context for you to reference for your task, read it carefully as you will get questions about it later:
<context>
<elastic_integrations>
{integrations}
</elastic_integrations>
</context>
`,
  ],
  [
    'human',
    `See the below description of the relevant rule and try to match it with any of the Elastic Integrations from before, do not guess or reply with anything else, only reply with the most relevant Elastic Integration if any.
<rule_description>
{rule}
</rule_description>

<guidelines>
- Carefully analyze the given Detection Rule data provided by the user.
- Match the data source in the rule to the most relevant Elastic Integration from the list provided above.
  - Data source need not be 1:1 match but decision should take based on the requirements that data source is fulfilling in the detection logic.
  - If you see an integration that is not a perfect match but it can fulfill the intention and requirements of the rule, you can consider it as a match. But explain the reasoning behind your decision.
- Focus on data source only and avoid guessing based on other factors.
- Take decision clinically on the data provided. Do not use your knowledge to take decision.
- Some integrations are related to certain type of logs or vendors such as Snort, Nginx, AWS, etc. You need to give important to these entity names and match an integration only and only if you see a clear reference to them in the rule description.
- If there are multiple integrations in the list that match, prioritize the most specific of them, as long as it is compatible with the rule:
  - For example, if the rule is related to "Linux Sysmon" then the "Sysmon for Linux" integration is more specific than any other "Linux" integration.
  - Operating System needs to be compatible, so if the rule is related to "Windows Sysmon", then the "Linux Sysmon" integration is not compatible, so we should assign the "Windows" integration.
- If not completely sure about the best match, there are some general purpose integrations which can be great matches.
  - endpoint : Elastic Defend is one such example which is a cross platform integration that can be used for a wide range of SIEM and detection use cases such as prevention, detection, and response capabilities with deep visibility for EPP, EDR, SIEM, and Security Analytics use cases across Windows, macOS, and Linux operating systems running on both traditional endpoints and public cloud environments. Use Elastic Defend to:
    - Prevent complex attacks - Prevent malware (Windows, macOS, Linux) and ransomware (Windows) from executing, and stop advanced threats with malicious behavior (Windows, macOS, Linux), memory threat (Windows, macOS, Linux), and credential hardening (Windows) protections. All powered by Elastic Labs(external, opens in a new tab or window) and our global community.
    - Alert in high fidelity - Bolster team efficacy by detecting threats centrally and minimizing false positives via extensive corroboration.
    - Detect threats in high fidelity - Elastic Defend facilitates deep visibility by instrumenting the process, file, and network data in your environments with minimal data collection overhead.
    - Triage and respond rapidly - Quickly analyze detailed data from across your hosts. Examine host-based activity with interactive visualizations. Invoke remote response actions across distributed endpoints. Extend investigation capabilities even further with the Osquery integration, fully integrated into Elastic Security workflows.
    - Secure your cloud workloads - Stop threats targeting cloud workloads and cloud-native applications. Gain real-time visibility and control with a lightweight user-space agent, powered by eBPF. Automate the identification of cloud threats with detection rules and machine learning (ML). Achieve rapid time-to-value with MITRE ATT&CK-aligned detections honed by Elastic Security Labs.
    - View terminal sessions - Give your security team a unique and powerful investigative tool for digital forensics and incident response (DFIR), reducing the mean time to respond (MTTR). Session view provides a time-ordered series of process executions in your Linux workloads in the form of a terminal shell, as well as the ability to replay the terminal session.
  - network_traffic : (Network Traffic Capture) is a great match for rules related to network activity, traffic monitoring, and similar use cases. Many complex use cases to analyze network flow can be achieved by this integration. Only avoid if rule specificaly points to data related to some other vendors. This integration may be perfect if rule just analyzes network flow generally.
    - Monitoring your network traffic is critical to gaining observability and securing your environment - ensuring high levels of performance and security. The Network Packet Capture integration captures the network traffic between your application servers, decodes common application layer protocols and records the interesting fields for each transaction.
    - Network Flows
      - Overall flow information about the network connections on a host.
      - You can configure Network Packet Capture to collect and report statistics on network flows. A flow is a group of packets sent over the same time period that share common properties, such as the same source and destination address and protocol. You can use this feature to analyze network traffic over specific protocols on your network.
      - For each flow, Network Packet Capture reports the number of packets and the total number of bytes sent from the source to the destination. Each flow event also contains information about the source and destination hosts, such as their IP address. For bi-directional flows, Network Packet Capture reports statistics for the reverse flow.
      - Network Packet Capture collects and reports statistics up to and including the transport layer.

- If no related integration is found, reply with an empty string.
- Provide a readable and clear reasoning for your decision, explaining why the selected integration is the best fit or why no suitable match was found.
</guidelines>

<expected_output>
- Always reply with a JSON object with the key "id" and the value being the most relevant matched integration id, and a "summary" entry with the reasons behind the match. Do not reply with anything else.
- Only reply with exact matches or an empty string inside the "id" value if no related integration is found, do not guess or reply with anything else.
- Finally, write a "summary" in markdown format with the reasoning behind the integration matching, or otherwise, why none of the integrations suggested matched. Starting with "## Integration Matching Summary\\n".
- Make sure the JSON object is formatted correctly and the values properly escaped.
</expected_output>

<example_response>
U: <splunk_rule_name>
Linux Auditd Add User Account Type
</splunk_rule_name>
A: Please find the match JSON object below:
\`\`\`json
{{
  "id": "auditd_manager",
  "summary": "## Integration Matching Summary\nThe given rule \"Linux Auditd Add User Account Type\" is matched with the \"auditd_manager\" integration because it ingests data from auditd logs which is the right data to detect user account creation on Linux systems."
}}
\`\`\`
</example_response>
`,
  ],
]);
