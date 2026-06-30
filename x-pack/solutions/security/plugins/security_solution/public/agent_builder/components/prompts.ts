/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
export const ATTACK_DISCOVERY_ATTACHMENT_PROMPT = `Summarize the attached attack discovery and recommend next steps. Include entity risk scores for the involved hosts and users, and any associated case URLs. Respond in markdown.`;
export const ALERT_ATTACHMENT_PROMPT = `Help me triage the attached alert and decide what to do with it. Use the alert-analysis skill to investigate: assess the alert, find related alerts, enrich with Security Labs and entity risk context, and recommend a disposition with concrete next steps. Respond in markdown suitable for attaching to a case.`;
export const EVENT_ATTACHMENT_PROMPT = `Evaluate the security event described above and provide a structured, markdown-formatted summary suitable for inclusion in an Elastic Security case. Ensure you're using all tools available to you. Your response must include:
1. Event Description
  - Summarize the event using extracted data:
    * **Entities**: \`host.name\`, \`user.name\`, \`service.name\`
    * Include associated **risk scores** for each entity (from the risk score tool)
  - Reference relevant MITRE ATT&CK techniques, with hyperlinks to the official MITRE pages.
2. Triage Steps
  - List clear, bulleted triage steps tailored to Elastic Security workflows (e.g., alert investigation, timeline creation, entity analytics review).
  - Highlight any relevant detection rules or anomaly findings.
3. Recommended Actions
  - Provide prioritized response actions, including:
    - Elastic Defend endpoint response actions (e.g., isolate host, kill process, retrieve/delete file), with links to Elastic documentation.
    - Example ES|QL queries for further investigation, formatted as code blocks.
    - Example OSQuery Manager queries for further investigation, formatted as code blocks.
    - Guidance on using Timelines and Entity Analytics for deeper context, with documentation links.
4. MITRE ATT&CK Context
  - Summarize the mapped MITRE ATT&CK techniques and provide actionable recommendations based on MITRE guidance, with hyperlinks.
5. Documentation Links
  - Include direct links to all referenced Elastic Security documentation and MITRE ATT&CK pages.
Formatting Requirements:
  - Use markdown headers, tables, and code blocks for clarity.
  - Organize the response into visually distinct sections.
  - Use concise, actionable language.
  - Include relevant emojis in section headers for visual clarity (e.g., 📝, 🛡️, 🔍, 📚).`;

export const ENTITY_PROMPT = `Explain how inputs contributed to the risk score, including any risk modifiers such as asset criticality or privileged user monitoring status. Additionally, outline the recommended next steps for investigating or mitigating the risk if the entity is deemed risky.\nTo answer risk score questions, fetch the risk score information and take into consideration both the risk score inputs and any modifiers that adjusted the final score.`;

export const LEAD_ATTACHMENT_PROMPT = `Analyze this hunting lead using the evidence already gathered by the lead generation engine. The attached lead contains entity risk scores, alert severity counts, observation details, and investigation recommendations that have already been collected. Summarize the threat, present the key findings per entity, assess overall severity, and recommend concrete next steps for investigation. Do not re-query for data that is already provided in the lead.`;

export const RULE_EXPLORATION_ATTACHMENT_PROMPT = `
Analyze the attached Security detection rule and provide actionable insights.

Important:
- Always read the rule from the attachment data (attachment type: security.rule)
- If the attachment data is not found, use the dedicated attachment read tool (attachment type: security.rule)
- Always use latest version of the rule attachment. Discard older versions.
- Always render inline the latest version of the rule attachment(attachment type: security.rule). Do not render older versions.
- To ensure you are using the latest version, always use the attachment read tool (attachment type: security.rule) before analyzing the rule.

Analysis Framework:
1. Detection Intent & Strategy
   - What threats does this rule detect?
   - What is the detection approach (behavior-based, IOC, anomaly, etc.)?

2. Query Logic & Data Sources
   - What data sources are required?
   - What are the key detection conditions?
   - What assumptions does the query make?
   - What blind spots or edge cases might exist?
   - What are likely sources of false positives?

3. MITRE ATT&CK Coverage
   - Explain each mapped technique briefly, provide links to the MITRE ATT&CK pages
   - Assess coverage quality: Is the mapping accurate and complete?
   - Identify gaps: Are there related techniques that should be included?

4. Timing & Scheduling
   - Evaluate rule schedule and lookback window
   - Identify timing risks (e.g., missed events, duplicate alerts)
   - Check if lookback aligns with detection logic

5. Rule Metadata Quality
   - name: Is it clear, specific, and searchable?
   - description: Does it explain what/why/how to respond?
   - tags: List tags comma separated. Are they accurate and useful for filtering?
   - severity & risk score: Are they appropriate for the threat?

6. Investigation Guide
   - Suggest triage steps specific to this detection
   - Include key fields to examine
   - Provide context on expected vs. suspicious behavior

When Suggesting Improvements:
- Be specific and practical - focus on what will improve detection quality
- Put each suggested field value in a separate, copyable code block with a clear label
- If you need more context, ask concise follow-up questions
`;

export const BULK_ALERTS_ATTACHMENT_PROMPT = `Triage and prioritize these security alerts`;
