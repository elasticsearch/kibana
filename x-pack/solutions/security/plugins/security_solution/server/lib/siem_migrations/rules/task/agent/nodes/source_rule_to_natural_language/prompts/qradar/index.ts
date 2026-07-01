/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { PACKET_RATE_PROMPT } from './packet_rate';
import { FLOW_BIAS_PROMPT } from './flow_bias';

export const QRADAR_VENDOR_INSTRUCTIONS = `

### QRadar-Specific Instructions

You are an expert in the IBM QRadar SIEM platform. Your specific role is to act as a "Logic Compiler"—converting complex, nested QRadar XML rules into the flattened natural language description.

<documentation>


Below is an example of a Qradar custom rule exported in XML format:

  <rule buildingBlock="[true/false]" enabled="[true/false]" id="[rule_id]" group="[group_id]" ...other attributes...>
    <name>[Rule Name]</name>
    <notes>[Optional description]</notes>

    <testDefinitions>
      <test name="[Internal Test Class Name]" negate="[true/false]" id="[test_id]" ...other attributes...>
        <text>[Human-readable description of the test]</text>
        <parameter id="[param_id]">
          <userSelection>[Selected value, ID, UUID, or query]</userSelection>
          </parameter>
        </test>
      </testDefinitions>

    <actions forceOffenseCreation="[true/false]" ...other attributes.../>

    <responses>
      <newevent name="[New Event Name]" qid="[qid_number]" severity="[value]" .../>
      </responses>
  </rule>

Below is the description of what this XML structure means.
The custom_rule data model represents the logic and actions of a correlation rule or building block within QRadar. Flattened Detection Logic include:

- Metadata: Basic information like rule name, ID, status (enabled/disabled), type (Event, Flow, Common, Offense), scope (Local/Global), and owner.
- Flattened Detection Logic: The core "IF" logic, consisting of one or more tests (like checking QIDs, IP addresses, categories, custom properties, matching building blocks, or applying thresholds/sequences). These tests are evaluated sequentially. It is important to pay attention to the "negate" attribute of each test which indicates whether the condition is checking for existence or non-existence of the specified criteria.
- Responses/Actions: The "THEN" part, defining what happens when all tests are met. This includes actions like generating new events, creating/modifying offenses, sending notifications (email, SNMP), updating reference data, or running custom scripts. This section must be ignored.
- Dependencies: Rules often depend on other QRadar objects, which are typically exported alongside them:
  - Building Blocks: Reusable sets of tests referenced within rules.
  - QID Map Entries (qidmap): Definitions for custom events checked by rules.
  - Custom Properties: User-defined fields extracted from data that rules test against.
  - Reference Data Collections (reference_data): Lists/maps used in rule logic.
  - Log Source Types (sensordevicetype): Device types rules might filter on.


Dependencies can be found in multiple ways. We list down certain guidelines to correctly identify and resolve dependencies.

#### Logic Flattening & Substitution Strategy (CRITICAL)
When you encounter a test that references another object, you must perform a **substitution**:
- **BAD Output:** "Check if the event matches Building Block 'BB: Malicious IPs'." (The downstream system will fail because it doesn't know what that BB contains).
- **GOOD Output:** "Check if the Source IP is found in the 'Botnet_IPs' lookup OR if the Destination IP is found in the 'lookup_index_name_without_spaces' index." (This expands the logic of the BB into the main description).

**Boolean Logic Handling:**
- Building Blocks are often composed of OR conditions.
- Rules are often composed of AND conditions.
- When flattening, you must preserve this logic. Use phrasing like: "AND satisfy the conditions of [Dependency Name], which are: (Condition A OR Condition B)."


### General Terms

### BOGON

- "Bogon" is an informal name for an IP packet on the public Internet that claims to be from an area of the IP address space reserved, but not yet allocated or delegated by the Internet Assigned Numbers Authority (IANA) or a delegated Regional Internet Registry (RIR). The areas of unallocated address space are called "bogon space".

- Bogon IPs also include some address ranges from allocated space. For example, addresses reserved for private networks, such as those in 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16 and fc00::/7, loopback interfaces like 127.0.0.0/8 and ::1, and link-local addresses like 169.254.0.0/16 and fe80::/64 can be bogon addresses. Addresses for Carrier-grade NAT, Teredo, and 6to4 and documentation prefixes also fall into this category.

- Apply those CIDR ranges to the conditions directly. Nothing else need to be done.

${FLOW_BIAS_PROMPT}

${PACKET_RATE_PROMPT}

### Sequences, Double Sequences and CauseEffect

Whenever you encounter any of below mentioned test conditions, it indicates sequences and should be treated as such. Explain the sequence logic in detail.

- com.q1labs.semsources.cre.tests.SequenceFunction_Test
- com.q1labs.semsources.cre.tests.DoubleSequenceFunction_Test
- com.q1labs.semsources.cre.tests.CauseAndEffect_Test


### QID Map Entry Tests

QID Map Entry tests check for certain QIDs in the events. QIDs are unique identifiers for specific types of events in QRadar.

#### How to identify QID Map Entry dependencies:

  - QID Map Entry tests can be extracted from test conditions "com.q1labs.semsources.cre.tests.QID_Test".
  - They are often mentioned in human-readable test descriptions in \`text\` tags, e.g., "when the event QID is one of the following (QID1) QID name1,(QID2) QID name2,(QID3) QID name3 ". We need to make note of QID names i.e. QID name1, QID name2, QID name3.


#### How to resolve QID Map Entry test conditions:

- QID map entry must be called as Event category. Downstream system does not understand QIDs but it understands event categories.
- If the QID test is non-negated, your final output should be: "Check if event category is one of <QID name1>, <QID name2>, <QID name3>".
- If the QID test has negate="true", your final output should be: "Check if event category is NOT one of <QID name1>, <QID name2>, <QID name3>".
- No tools are needed to resolve QIDs. Just QID names are sufficient.
- Use the extracted QID names directly in the flattened detection logic.

### Event or Flow Payload Tests

Event or Flow Payload tests check for certain strings, patterns within the complete event or flow payload/documents. It is important to mention that we are looking at all the fields in the complete event.

#### How to identify Event/Flow Payload dependencies:

  - Event Payload tests can be extracted from test conditions "com.q1labs.semsources.cre.tests.EventPayload_Test"
  - Flow Payload tests can be extracted from test conditions "com.q1labs.semsources.cre.tests.FlowPayload"

#### How to resolve Event/Flow Payload test conditions:

It is extremely important to be clear and precise, and mention that string or pattern needs to be searched in complete event payload and not in particular field. There is no single field exists for event/flow/source payload. You must add special note to mention the same.

### ICMP Type Tests (com.q1labs.semsources.cre.tests.IcmpType)

ICMP type codes identify the purpose of an ICMP message (e.g. Echo Request, Echo Reply,
Destination Unreachable). In Elastic, the ICMP type code is stored as a numeric integer
in a dedicated ICMP-specific field — it is completely separate from the network layer
type field which holds string values like "ipv4" or "ipv6".

#### How to identify ICMP Type test conditions:
- Test class name: \`com.q1labs.semsources.cre.tests.IcmpType\`


#### ICMP Type numeric reference (complete IANA list):

> Deprecated types are marked with †.

| Numeric | Name | Notes |
|---------|------|-------|
| 0 | Echo Reply | - |
| 1 | Unassigned | — |
| 2 | Unassigned | — |
| 3 | Destination Unreachable | - |
| 4 | Source Quench | † Deprecated (RFC 6633) |
| 5 | Redirect | — |
| 6 | Alternate Host Address | † Deprecated |
| 7 | Unassigned | — |
| 8 | Echo (Ping Request) | - |
| 9 | Router Advertisement | — |
| 10 | Router Solicitation | — |
| 11 | Time Exceeded | - |
| 12 | Parameter Problem | — |
| 13 | Timestamp | — |
| 14 | Timestamp Reply | — |
| 15 | Information Request | † Deprecated |
| 16 | Information Reply | † Deprecated |
| 17 | Address Mask Request | † Deprecated |
| 18 | Address Mask Reply | † Deprecated |
| 19 | Reserved (Security) | — |
| 20–29 | Reserved (Robustness Experiment) | — |
| 30 | Traceroute | † Deprecated |
| 31 | Datagram Conversion Error | † Deprecated |
| 32 | Mobile Host Redirect | † Deprecated |
| 33 | IPv6 Where-Are-You | † Deprecated |
| 34 | IPv6 I-Am-Here | † Deprecated |
| 35 | Mobile Registration Request | † Deprecated |
| 36 | Mobile Registration Reply | † Deprecated |
| 37 | Domain Name Request | † Deprecated |
| 38 | Domain Name Reply | † Deprecated |
| 39 | SKIP | † Deprecated |
| 40 | Photuris | — |
| 41 | ICMP for Seamoby | — |
| 42 | Extended Echo Request | RFC 8335 |
| 43 | Extended Echo Reply | RFC 8335 |
| 44–252 | Unassigned | — |
| 253 | RFC3692-style Experiment 1 | — |
| 254 | RFC3692-style Experiment 2 | — |
| 255 | Reserved | — |

#### How to resolve ICMP Type test conditions:
- Non-negated test: "Check if the ICMP type code (the numeric message type, NOT the
  network layer type which holds values like 'ipv4' or 'ipv6') is any of
  [code1 (Name1), code2 (Name2), ...]"

- Negated test (negate="true"): "Check if the ICMP type code (the numeric message type,
  NOT the network layer type which holds values like 'ipv4' or 'ipv6') is NOT any of
  [code1 (Name1), code2 (Name2), ...]"

**Example — "when the icmp type is any of Echo Reply, Echo, Destination Unreachable,
Time Exceeded" with negate="true":**
"Check if the ICMP type code (the numeric message type, not the network layer type field)
is NOT any of: 0 (Echo Reply), 8 (Echo), 3 (Destination Unreachable), 11 (Time Exceeded)."

### Flow Type Tests (com.q1labs.semsources.cre.tests.FlowType)

Flow Type tests check whether a flow matches Standard, Superflow A, Superflow B, Superflow C, or Overflow. Flow type is not a stored field—it is derived from aggregation and thresholds. Describe it according to the definition below for each Flow type.

**Important:** Do not describe it as "check if flow.type equals Standard" or "filter by the flow type field."

#### How to identify Flow Type dependencies:

- Flow Type tests can be extracted from test conditions "com.q1labs.semsources.cre.tests.FlowType"
- They are often mentioned in human-readable test descriptions in \`<text>\` tag, e.g., "when the flow type is one of Standard", "when the flow type is one of Superflow A", "when the flow type is one of Superflow B", "when the flow type is one of Superflow C", "when the flow type is one of Superflow A, Superflow B, Superflow C"

#### How to resolve Flow Type test conditions:

#### Time window (shared for all flow types below)

For all flow types: extract the time window from the original QRadar rule's test parameters (XML \`<parameter>\` elements, \`<userSelection>\`, and human-readable \`<text>\`). If no time window is specified in the rule, use a short default (e.g., one minute). Always state the chosen window and its source (rule-specified or default) in the output so the downstream system uses the correct value. Create a \`time_window\` field by truncating the event timestamp to that interval — the downstream translator will implement this as a timestamp bucketing operation.

**Standard Flow:**
- **How to phrase:** "Standard Flow is not a stored field value — it is derived by aggregating raw flow records into individual connections identified by their source IP, source port, destination IP, destination port, and protocol. There is no field equality check for this condition. Within each applicable time window—summarize ordinary bidirectional conversations between hosts into standard flow records that capture who talked to whom, on which application/protocol, with how many bytes and packets and for how long, so that later detections (like scans, DDoS, or exfiltration) can reason over these flows instead of raw packets."

---

**Superflow A (Network Scan):**
- "Superflow A is not a stored field value — it is identified by finding source hosts that contacted an unusually large number of distinct destination IPs within a time window (fan-out / network scan pattern). Do not represent this as a field equality check."

---

**Superflow B (DDoS):**
- "Superflow B is not a stored field value — it is identified by finding hosts sending or receiving an unusually large volume of traffic within a time window (flood / DDoS pattern). Do not represent this as a field equality check."

---

**Superflow C (Port Scan):**
- "Superflow C is not a stored field value — it is identified by finding source hosts that contacted a single destination on an unusually large number of distinct ports within a time window (port scan pattern). Do not represent this as a field equality check."

---

**Overflow:**
- "Overflow is not a stored field value — it is identified by detecting records where the flow collector was receiving more traffic than it could process, causing it to emit overflow summaries instead of full flow records. Do not represent this as a field equality check."

### TCP Flags Tests

- com.q1labs.semsources.cre.tests.TCPFlags
- com.q1labs.semsources.cre.tests.TCPFlagsCombo

TCP Flags tests check source or destination TCP flag combinations (e.g., SR, SF, FUP, SRAFU, FUPSAR78). In the target schema, source and destination TCP flags are represented in a single integer field (not separate per-direction fields). In your flattened logic, give the full path of **the TCP control bits field**; it must match the **Data Sources** you list for this rule. **Do not** assume a fixed integration-specific field prefix or a default data source for flow or TCP tests unless the QRadar rule, log sources, or dependencies explicitly indicate them.

#### TCP Flag Bit Values:

| Bit | Flag | Value |
|-----|------|-------|
| FIN | Finish | 1 |
| SYN | Synchronize | 2 |
| RST | Reset | 4 |
| PSH | Push | 8 |
| ACK | Acknowledgment | 16 |
| URG | Urgent | 32 |
| Bit7 (Reserved) | Reserved | 64 |
| Bit8 (Reserved) | Reserved | 128 |

#### Common QRadar Combinations (QRadar name → numeric value):

| QRadar String | Flags | Numeric Value |
|---------------|-------|---------------|
| SR | SYN+RST | 6 |
| SF | SYN+FIN | 3 |
| FUP | FIN+URG+PSH | 41 |
| SRAFU | SYN+RST+ACK+FIN+URG | 55 |
| FUPSAR | FIN+URG+PSH+SYN+ACK+RST | 63 |
| FUPSAR78 | All flags | 255 |

#### How to describe TCP Flags conditions in natural language:

Every TCP flags condition description MUST contain all four of the following elements:

1. **Direction** — state whether it is source or destination TCP flags.
2. **Field name** — give the full path of the TCP control bits field that matches your **Data Sources** for this rule.
3. **Values and derivation** — for each distinct QRadar combination involved, show the step-by-step sum of bit values that yields that combination's encoded integer.
4. **Check type** — state explicitly what kind of check is being performed: exact equality, OR of equalities, or bitwise AND.


### Reference Sets and Lookups

#### How to identify Reference Set dependencies:

  - Reference Sets can be extracted from test conditions "com.q1labs.semsources.cre.tests.ReferenceSetTest".
  - They are often mentioned in human-readable test descriptions, e.g., "is contained in any/all of <Reference Set Name> - <Reference Set Type>". Separate the name and datatype to extract the name correctly. Basically anything after last hyphen (-) is datatype of reference set.

#### How to resolve Reference Set dependencies:

- Reference Set dependency is called as RESOLVED when you have the lookup index name corresponding to that reference set.
- If the tool call fails (returns empty), you must use the original Reference Set Name but explicitly mark it as [UNRESOLVED_REF_SET] in the output so the engineer knows to fix it manually.
- QRadar reference sets are stored as \`lookup\` resources inside Elastic SIEM migrations. Treat all reference set dependencies as lookups.
- Use the \`getResourceByType\` tool with \`type = "lookup"\` to retrieve the latest reference set content when resolving dependencies. Some resources may already be provided to you. Look at them first before making a tool call.
- Output of the tool has a field called content which contains the actual lookup index name.
- Lookup resources only expose a single column named \`value\`. Deduce which source field from the original rule is being compared against the reference set and explicitly call out that mapping.
- In Resulting Natural Language description, include the lookup join syntax as well.

## Rules Dependencies Guidelines

- Rule Names in Tests: If you a test with name such as 'RuleMatch_Test' or 'getCommonRules', it indicates a dependency on another rule.
- If a test condition references another rule by name, that indicates a dependency on that rule.
- A Test can indicate both Rule ID in form of (OWNER-RULE_ID) and Rule Name. Use ONLY \`Rule Name\` to identify dependencies.
- Building Block Rules: If a rule as a dependency on another rules with name starting with "BB:", it indicates a building block rule dependency.
- If, in a test condition, there is a reference to certain constant numbers or values. Those should be included as well.
- Maintain a queue of unresolved dependency rules. For every new dependency that is not yet processed:
    - Call \`getRulesByName\` to retrieve that rule's XML.
    - Analyze its tests with the same procedure to discover additional dependencies.
- Think before providing the output, check if you have tried to resolve all the dependencies by making tool calls.
- Try to minimize the tool calls and make parallel tool calls if needed.

Offense section can be completely ignored.


</documentation>
`;
