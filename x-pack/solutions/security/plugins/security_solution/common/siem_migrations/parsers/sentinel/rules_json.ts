/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { SentinelArmResource } from '../../model/vendor/rules/sentinel.gen';
import {
  SENTINEL_NRT_RULE_KIND,
  SENTINEL_SCHEDULED_RULE_KIND,
  type SentinelRule,
  type SentinelRuleKind,
} from './types';

const isSupportedSentinelRuleKind = (kind: string | undefined): kind is SentinelRuleKind =>
  kind === SENTINEL_SCHEDULED_RULE_KIND || kind === SENTINEL_NRT_RULE_KIND;

/**
 * Processes pre-validated Sentinel ARM template resources into SentinelRule objects.
 *
 * Only "Scheduled" and "NRT" rule kinds are extracted, as these map to detection rules.
 * The resources array is expected to be already validated by the API schema.
 */
export class SentinelRulesParser {
  private readonly resources: SentinelArmResource[];

  constructor(resources: SentinelArmResource[]) {
    this.resources = resources;
  }

  /**
   * Returns all valid Scheduled and NRT Analytics Rules from the resources.
   */
  public getRules(): SentinelRule[] {
    return this.resources
      .flatMap((resource) => this.processResource(resource))
      .filter(Boolean) as SentinelRule[];
  }

  private processResource(resource: SentinelArmResource): SentinelRule | undefined {
    // Only process Sentinel analytics rule kinds that share the KQL detection path.
    if (!isSupportedSentinelRuleKind(resource.kind)) {
      return undefined;
    }

    const { properties } = resource;
    if (!properties) {
      return undefined;
    }

    const { displayName, description, query, queryFrequency, queryPeriod, severity } = properties;

    if (!displayName || !query) {
      return undefined;
    }

    const id = resource.name ?? resource.id ?? displayName;

    return {
      id,
      kind: resource.kind,
      displayName,
      description: description ?? '',
      query,
      severity: severity ?? 'medium',
      queryFrequency,
      queryPeriod,
      tactics: properties.tactics,
      techniques: properties.techniques,
    };
  }
}
