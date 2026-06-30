/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { CodeOwnerArea } from './code_owner_areas';
import {
  CODE_OWNER_AREAS,
  CODE_OWNER_AREA_MAPPINGS,
  findAreaForCodeOwner,
} from './code_owner_areas';
import { getTeamByGithubHandle } from './teams';

/**
 * Frozen snapshot of the hardcoded area mapping that used to live in
 * `code_owner_areas.ts` before it was migrated to derive from `teams.jsonc`.
 *
 * This guards the ~10 consumers of `findAreaForCodeOwner` (Scout/FTR reporters)
 * against regressions: every handle that previously had an area must keep
 * resolving to the same area through the registry.
 */
const LEGACY_CODE_OWNER_AREA_MAPPINGS: { [area in CodeOwnerArea]: string[] } = {
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

/** Mirrors the legacy `findAreaForCodeOwner`: first area (in order) containing the handle. */
const legacyAreaForOwner = (owner: string): CodeOwnerArea | undefined =>
  CODE_OWNER_AREAS.find((area) => LEGACY_CODE_OWNER_AREA_MAPPINGS[area].includes(owner));

const allLegacyHandles = [...new Set(Object.values(LEGACY_CODE_OWNER_AREA_MAPPINGS).flat())];

describe('code owner areas (registry-backed)', () => {
  describe('findAreaForCodeOwner regression', () => {
    it.each(allLegacyHandles)('resolves %s to its historical area', (handle) => {
      expect(getTeamByGithubHandle(handle)).toBeDefined();
      expect(findAreaForCodeOwner(handle)).toBe(legacyAreaForOwner(handle));
    });

    it('returns undefined for an owner with no area', () => {
      expect(findAreaForCodeOwner('elastic/does-not-exist')).toBeUndefined();
    });
  });

  describe('CODE_OWNER_AREA_MAPPINGS', () => {
    it('only references known areas', () => {
      expect(Object.keys(CODE_OWNER_AREA_MAPPINGS).sort()).toEqual([...CODE_OWNER_AREAS].sort());
    });

    it.each(CODE_OWNER_AREAS)(
      'contains exactly the historical handles for area %s (incl. multi-area teams)',
      (area) => {
        // Multi-area teams (e.g. elastic/search-kibana under search, workplaceai
        // and vectordb) must still appear under every one of their areas.
        expect([...CODE_OWNER_AREA_MAPPINGS[area]].sort()).toEqual(
          [...LEGACY_CODE_OWNER_AREA_MAPPINGS[area]].sort()
        );
      }
    );
  });
});
