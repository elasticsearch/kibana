/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KbnClient } from '@kbn/kbn-client';
import type { ToolingLog } from '@kbn/tooling-log';
import type {
  AssessRelevanceInput,
  ClassifySeverityInput,
  ClassifySeverityResponse,
  EnrichTaxonomyInput,
  ExtractDiamondInput,
  ExtractDiamondResponse,
  RelevanceResponse,
  TaxonomyResponse,
} from '../types';

// Paths are inlined rather than imported from the security_solution plugin:
// packages expose a single public entry point, so a subpath import into the
// plugin would break that boundary. These are the stable internal route paths
// registered by the threat_intel plugin routes.
const ASSESS_RELEVANCE_URL = '/internal/threat_intel/assess_relevance';
const CLASSIFY_SEVERITY_URL = '/internal/threat_intel/classify_severity';
const ENRICH_TAXONOMY_URL = '/internal/threat_intel/enrich_taxonomy';
const EXTRACT_DIAMOND_URL = '/internal/threat_intel/extract_diamond';

const INTERNAL_API_HEADERS = {
  'elastic-api-version': '1',
  'x-elastic-internal-origin': 'Kibana',
};

/**
 * Thin wrapper over `kbnClient` for the four threat_intel LLM enrichment routes.
 * Each method POSTs the stage input and returns the route's parsed JSON body.
 */
export class ThreatIntelClient {
  constructor(private readonly kbnClient: KbnClient, private readonly log: ToolingLog) {}

  async assessRelevance(input: AssessRelevanceInput): Promise<RelevanceResponse> {
    this.log.debug(`[ThreatIntelClient] POST ${ASSESS_RELEVANCE_URL}`);
    const response = await this.kbnClient.request<RelevanceResponse>({
      path: ASSESS_RELEVANCE_URL,
      method: 'POST',
      headers: INTERNAL_API_HEADERS,
      body: input,
    });
    return response.data;
  }

  async classifySeverity(input: ClassifySeverityInput): Promise<ClassifySeverityResponse> {
    this.log.debug(`[ThreatIntelClient] POST ${CLASSIFY_SEVERITY_URL}`);
    const response = await this.kbnClient.request<ClassifySeverityResponse>({
      path: CLASSIFY_SEVERITY_URL,
      method: 'POST',
      headers: INTERNAL_API_HEADERS,
      body: input,
    });
    return response.data;
  }

  async enrichTaxonomy(input: EnrichTaxonomyInput): Promise<TaxonomyResponse> {
    this.log.debug(`[ThreatIntelClient] POST ${ENRICH_TAXONOMY_URL}`);
    const response = await this.kbnClient.request<TaxonomyResponse>({
      path: ENRICH_TAXONOMY_URL,
      method: 'POST',
      headers: INTERNAL_API_HEADERS,
      body: input,
    });
    return response.data;
  }

  async extractDiamond(input: ExtractDiamondInput): Promise<ExtractDiamondResponse> {
    this.log.debug(`[ThreatIntelClient] POST ${EXTRACT_DIAMOND_URL}`);
    const response = await this.kbnClient.request<ExtractDiamondResponse>({
      path: EXTRACT_DIAMOND_URL,
      method: 'POST',
      headers: INTERNAL_API_HEADERS,
      body: input,
    });
    return response.data;
  }
}
