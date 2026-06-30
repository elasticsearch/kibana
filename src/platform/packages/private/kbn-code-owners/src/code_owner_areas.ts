/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

/**
 * Code owner area names
 */
export const CODE_OWNER_AREAS = [
  'platform',
  'search',
  'observability',
  'security',
  'workplaceai',
  'vectordb',
] as const;
export type CodeOwnerArea = (typeof CODE_OWNER_AREAS)[number];

/**
 * Area mappings for code owners
 */
export const CODE_OWNER_AREA_MAPPINGS: { [area in CodeOwnerArea]: string[] } = {
  // BOOKMARK - List of Kibana solutions
  platform: [
    'elastic/appex-ai-infra',
    'elastic/appex-qa',
    'elastic/appex-sharedux',
    'elastic/docs',
    'elastic/eui-team',
    'elastic/fleet',
    'elastic/kibana-core',
    'elastic/kibana-data-discovery',
    'elastic/kibana-design',
    'elastic/kibana-esql',
    'elastic/kibana-localization',
    'elastic/kibana-management',
    'elastic/kibana-operations',
    'elastic/kibana-performance-testing',
    'elastic/kibana-presentation',
    'elastic/kibana-reporting-services',
    'elastic/kibana-security',
    'elastic/kibana-tech-leads',
    'elastic/kibana-visualizations',
    'elastic/logstash',
    'elastic/ml-ui',
    'elastic/platform-docs',
    'elastic/response-ops',
    'elastic/rna-project-team',
    'elastic/stack-monitoring',
    'elastic/workflows-eng',
  ],
  search: ['elastic/jinastic', 'elastic/search-design', 'elastic/search-kibana'],
  observability: [
    'elastic/actionable-obs-team',
    'elastic/obs-ai-team',
    'elastic/obs-cloudnative-monitoring',
    'elastic/obs-docs',
    'elastic/obs-exploration-team',
    'elastic/obs-knowledge-team',
    'elastic/obs-onboarding-team',
    'elastic/obs-presentation-team',
    'elastic/obs-ux-management-team',
    'elastic/observability-bi',
    'elastic/observability-design',
    'elastic/observability-ui',
    'elastic/obs-sig-events-team',
    'elastic/observablt-robots',
    'elastic/streams-program-team',
  ],
  security: [
    'elastic/contextual-security-apps',
    'elastic/core-analysis',
    'elastic/integration-experience',
    'elastic/kibana-cases',
    'elastic/kibana-cloud-security-posture',
    'elastic/security-data-analytics',
    'elastic/security-defend-workflows',
    'elastic/security-design',
    'elastic/security-detection-engine',
    'elastic/security-detection-engineering',
    'elastic/security-detection-platform',
    'elastic/security-detection-rule-management',
    'elastic/security-engineering-productivity',
    'elastic/security-entity-analytics',
    'elastic/security-genai-research-and-development',
    'elastic/security-generative-ai',
    'elastic/security-pds-deployment',
    'elastic/security-service-integrations',
    'elastic/security-solution',
    'elastic/security-threat-hunting',
    'elastic/security-threat-hunting-investigations',
  ],
  workplaceai: ['elastic/search-kibana', 'elastic/workchat-eng'],
  vectordb: ['elastic/search-kibana'],
};

/**
 * Find what area a code owner belongs to
 *
 * @param owner Owner to find an area name
 * @returns The code owner area if a match for the given owner is found
 */
export function findAreaForCodeOwner(owner: string): CodeOwnerArea | undefined {
  for (const area of CODE_OWNER_AREAS) {
    const owners = CODE_OWNER_AREA_MAPPINGS[area];

    if (owners.includes(owner)) {
      return area;
    }
  }
}
