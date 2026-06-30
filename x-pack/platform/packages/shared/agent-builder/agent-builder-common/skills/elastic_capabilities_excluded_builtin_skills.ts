/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Built-in skills that are registered and visible in the skills library, but are not
 * automatically enabled when `enable_elastic_capabilities` is true. Users must add
 * these skills explicitly on an agent.
 */
export const elasticCapabilitiesExcludedBuiltinSkillIds = ['ml.anomaly-detection'] as const;

export type ElasticCapabilitiesExcludedBuiltinSkillId =
  (typeof elasticCapabilitiesExcludedBuiltinSkillIds)[number];

export const isElasticCapabilitiesExcludedBuiltinSkill = (skillId: string): boolean =>
  (elasticCapabilitiesExcludedBuiltinSkillIds as readonly string[]).includes(skillId);

export const isBuiltinSkillAutoIncludedForElasticCapabilities = (
  skill: { readonly: boolean; id: string },
  enableElasticCapabilities: boolean
): boolean =>
  enableElasticCapabilities &&
  skill.readonly &&
  !isElasticCapabilitiesExcludedBuiltinSkill(skill.id);
