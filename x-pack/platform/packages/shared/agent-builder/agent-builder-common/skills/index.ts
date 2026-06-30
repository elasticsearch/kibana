/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export {
  type PublicSkillDefinition,
  type PublicSkillSummary,
  type PersistedSkillCreateRequest,
  type PersistedSkillUpdateRequest,
  type SkillReferencedContent,
} from './definition';
export {
  skillCreateRequestSchema,
  skillUpdateRequestSchema,
  validateSkillId,
  skillIdMaxLength,
  skillNameMaxLength,
  skillIdRegexp,
  skillNameRegexp,
  maxToolsPerSkill,
} from './validation';
export {
  maxReferencedContentItems,
  normalizeRelativePathSegments,
  isRootRelativePath,
  canComputeReferencedContentUniquenessKey,
} from './referenced_content_shared';
export {
  REFERENCED_CONTENT_REFINE_ISSUE_CODE,
  type ReferencedContentRefineIssueCode,
  type ReferencedContentRefineIssue,
  collectReferencedContentRefineIssues,
} from './referenced_content_refine';
export {
  elasticCapabilitiesExcludedBuiltinSkillIds,
  type ElasticCapabilitiesExcludedBuiltinSkillId,
  isElasticCapabilitiesExcludedBuiltinSkill,
  isBuiltinSkillAutoIncludedForElasticCapabilities,
} from './elastic_capabilities_excluded_builtin_skills';
