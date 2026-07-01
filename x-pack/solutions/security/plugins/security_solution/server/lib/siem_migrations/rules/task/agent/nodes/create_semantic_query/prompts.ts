/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ChatPromptTemplate } from '@langchain/core/prompts';

export const CREATE_SEMANTIC_QUERY_PROMPT = ChatPromptTemplate.fromMessages<{
  ruleContext: string;
}>([
  [
    'system',
    `You are a helpful assistant that extracts keywords from SIEM detection rule descriptions to create semantic search queries for matching Elastic integrations.

Your task is to produce a short, keyword-rich query that captures:
- The vendor, product, or technology involved (e.g. AWS, Azure, Windows, Okta, CrowdStrike, Palo Alto, Linux, Fortinet)
- The data source type (e.g. endpoint, network, cloud, authentication, audit logs)
- The type of activity being detected (e.g. process creation, sign-in failure, lateral movement, exfiltration)

<guidelines>
- The query should be short and concise (one line of space-separated keywords).
- Include keywords that are relevant to the data source and detection use case.
- Add related vendor, product, cloud provider, OS platform keywords you can identify.
- If the rule focuses on endpoint data, make sure "endpoint" and "security" keywords are included.
- Always reply with a JSON object with the key "semantic_query" inside three backticks.
</guidelines>

<example_response>
A: Please find the semantic_query keywords JSON object below:
\`\`\`json
{{"semantic_query": "windows host endpoint netsh.exe process creation command-line utility network configuration persistence proxy dll execution sysmon event id 1"}}
\`\`\`
</example_response>`,
  ],
  [
    'human',
    `Create a collection of keywords specifically crafted to be used as a semantic search query from the following SIEM detection rule context:

{ruleContext}`,
  ],
]);
