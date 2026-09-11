/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export interface OwaspCategory {
  id: string;
  name: string;
  description: string;
}

export const OWASP_LLM_TOP_10: Record<string, OwaspCategory> = {
  LLM01: {
    id: 'LLM01',
    name: 'Prompt Injection',
    description: 'Manipulating LLM behavior through crafted inputs',
  },
  LLM02: {
    id: 'LLM02',
    name: 'Insecure Output Handling',
    description: 'Failing to validate/sanitize LLM outputs',
  },
  LLM03: {
    id: 'LLM03',
    name: 'Training Data Poisoning',
    description: 'Manipulating training data to introduce vulnerabilities',
  },
  LLM04: {
    id: 'LLM04',
    name: 'Model Denial of Service',
    description: 'Causing resource exhaustion through crafted inputs',
  },
  LLM05: {
    id: 'LLM05',
    name: 'Supply Chain Vulnerabilities',
    description: 'Compromised components in the LLM supply chain',
  },
  LLM06: {
    id: 'LLM06',
    name: 'Sensitive Information Disclosure',
    description: 'Exposing confidential data through LLM responses',
  },
  LLM07: {
    id: 'LLM07',
    name: 'Insecure Plugin Design',
    description: 'Plugins with insufficient access controls',
  },
  LLM08: {
    id: 'LLM08',
    name: 'Excessive Agency',
    description: 'Granting LLMs too much autonomy or capability',
  },
  LLM09: {
    id: 'LLM09',
    name: 'Overreliance',
    description: 'Blindly trusting LLM outputs without verification',
  },
  LLM10: {
    id: 'LLM10',
    name: 'Model Theft',
    description: 'Unauthorized access to proprietary LLM models',
  },
};

export const getOwaspCategory = (id: string): OwaspCategory => {
  return (
    OWASP_LLM_TOP_10[id] ?? { id, name: 'Unknown', description: 'Unrecognized OWASP category' }
  );
};
