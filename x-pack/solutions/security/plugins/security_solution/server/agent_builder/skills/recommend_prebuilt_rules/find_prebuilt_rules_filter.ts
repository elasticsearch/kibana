/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { prepareKQLStringParam } from '../../../../common/utils/kql';
import { PREBUILT_RULE_ASSETS_SO_TYPE } from '../../../lib/detection_engine/prebuilt_rules/logic/rule_assets/prebuilt_rule_assets_type';
interface PrebuiltRulesFilter {
  keywords?: string;
  severity?: string[];
  ruleType?: string[];
  tags?: string[];
  mitreTechnique?: string[];
  mitreTactic?: string[];
  relatedIntegrations?: string[];
  ruleIds?: string[];
}

const field = (name: string): string => `${PREBUILT_RULE_ASSETS_SO_TYPE}.${name}`;

const NAME_FIELD = field('name');
const DESCRIPTION_FIELD = field('description');
const SEVERITY_FIELD = field('severity');
const TYPE_FIELD = field('type');
const TAGS_FIELD = field('tags');
const TACTIC_ID_FIELD = field('threat.tactic.id');
const TECHNIQUE_ID_FIELD = field('threat.technique.id');
const RELATED_INTEGRATIONS_PACKAGE_FIELD = field('related_integrations.package');
const RULE_ID_FIELD = field('rule_id');

/**
 * Searches if keywords appear in either name or description. Order does not matter.
 *
 * @example
 * buildKeywordsClause('mimikatz')         // (name: "mimikatz" OR description: "mimikatz")
 * buildKeywordsClause('lateral movement') // (name: ("lateral" AND "movement") OR description: ("lateral" AND "movement"))
 */
const buildKeywordsClause = (keywords: string): string | undefined => {
  const tokens = keywords
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((token) => prepareKQLStringParam(token));

  if (tokens.length === 0) {
    return undefined;
  }

  const value = tokens.length === 1 ? tokens[0] : `(${tokens.join(' AND ')})`;
  return `(${NAME_FIELD}: ${value} OR ${DESCRIPTION_FIELD}: ${value})`;
};

/**
 * Builds a KQL clause like `field: ("value1" OR "value2" OR ...)`.
 * @example
 * orClause('threat.tactic.id', ['TA0001', 'TA0006']) // threat.tactic.id: ("TA0001" OR "TA0006")
 * orClause('tags', ['OS: Windows', 'OS: Linux'])     // tags: ("OS: Windows" OR "OS: Linux")
 */
const orClause = (fieldName: string, values: string[]): string => {
  return `${fieldName}: (${values.map(prepareKQLStringParam).join(' OR ')})`;
};

export const buildPrebuiltRulesToolFilter = (
  filter: PrebuiltRulesFilter = {}
): string | undefined => {
  const parts: string[] = [];

  if (filter.keywords) {
    const clause = buildKeywordsClause(filter.keywords);
    if (clause) {
      parts.push(clause);
    }
  }

  if (filter.severity?.length) {
    parts.push(orClause(SEVERITY_FIELD, filter.severity));
  }

  if (filter.ruleType?.length) {
    parts.push(orClause(TYPE_FIELD, filter.ruleType));
  }

  if (filter.tags?.length) {
    parts.push(orClause(TAGS_FIELD, filter.tags));
  }

  if (filter.mitreTechnique?.length) {
    parts.push(orClause(TECHNIQUE_ID_FIELD, filter.mitreTechnique));
  }

  if (filter.mitreTactic?.length) {
    parts.push(orClause(TACTIC_ID_FIELD, filter.mitreTactic));
  }

  if (filter.relatedIntegrations?.length) {
    parts.push(orClause(RELATED_INTEGRATIONS_PACKAGE_FIELD, filter.relatedIntegrations));
  }

  if (filter.ruleIds?.length) {
    parts.push(orClause(RULE_ID_FIELD, filter.ruleIds));
  }

  return parts.length > 0 ? parts.join(' AND ') : undefined;
};
