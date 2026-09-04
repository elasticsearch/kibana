/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export type {
  ArtifactReferenceDescriptor,
  ArtifactTypeDefinition,
  RuleArtifactLike,
} from './types';
export { ArtifactTypeRegistry } from './artifact_type_registry';
export type { ArtifactTypeRegistryContract } from './artifact_type_registry';
export { assertValidDefinition } from './assert_valid_definition';
export {
  buildArtifactReferenceName,
  parseArtifactReferenceName,
  extractArtifactReferences,
  rebuildArtifactReferences,
  injectArtifactReferences,
} from './artifact_references';
export { registerBuiltinArtifactTypes, dashboardIdSchema } from './register_builtin_artifact_types';
