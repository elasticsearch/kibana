/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Glossary of labels that should be displayed with specific formatting.
 * Store with the exact formatting you want to display.
 */
const TITLE_CASE_GLOSSARY = [
  'Machine Learning',
  'Index Management',
  'Index Lifecycle Policies',
  'Snapshot and Restore',
  'Rollup Jobs',
  'Data Set Quality',
  'Ingest Pipelines',
  'Logstash Pipelines',
  'Content Connectors',
  'Stack Monitoring',
  'Maintenance Windows',
  'Trained Models',
  'Anomaly Detection Jobs',
  'Data Frame Analytics Jobs',
  'GenAI Settings',
  'AI Assistant',
  'AI Assistants',
  'Role Mappings',
  'Cross-Cluster Replication',
  'Remote Clusters',
  'Saved Objects',
  'Advanced Settings',
  'Data Views',
  'MITRE ATT&CK® Coverage',
  'License Management',
  'Developer Tools',
  'Stack Management',
  'Alerts and Insights',
  'AI',
  'Ingest and Integrations',
  'API keys',
  'Detection rules (SIEM)',
  'SLOs',
  'TLS certificates',
  'Cloud Connect',
  'SIEM Readiness',
  'V2 Alerting Preview',
  'Ingest Hub',
  'Elastic Inference',
  'ES|QL Data Federation',
] as const;

const TITLE_CASE_MAP = new Map(TITLE_CASE_GLOSSARY.map((entry) => [entry.toLowerCase(), entry]));

/**
 * Converts a string to sentence case.
 * For glossary terms, applies the exact formatting from the glossary.
 * For non-glossary terms, capitalizes only the first letter.
 *
 * @param label - The label string to format
 * @returns formatted label string
 * @example
 * toSentenceCase('machine learning') // 'Machine Learning' - Glossary term
 * toSentenceCase('settings') // 'Settings' - First letter capitalized
 */
export function toSentenceCase(label: string): string {
  if (!label || typeof label !== 'string') {
    return label;
  }

  const normalized = label.toLowerCase().trim();
  const glossaryMatch = TITLE_CASE_MAP.get(normalized);

  if (glossaryMatch) {
    return glossaryMatch;
  }

  // Capitalize first letter for non-glossary terms
  return normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();
}
