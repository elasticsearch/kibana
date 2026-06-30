/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export {
  getArtifactName,
  parseArtifactName,
  getSecurityLabsArtifactName,
  parseSecurityLabsArtifactName,
  getResourceTypeFromArtifactName,
  isValidSecurityLabsVersion,
} from './src/artifact';
export { LATEST_MANIFEST_FORMAT_VERSION, type ArtifactManifest } from './src/manifest';
export { DocumentationProduct, type ProductName } from './src/product';
export { ResourceTypes, type ResourceType } from './src/resource_type';
export { isArtifactContentFilePath } from './src/artifact_content';
export {
  productDocIndexPrefix,
  productDocIndexPattern,
  getProductDocIndexName,
  securityLabsIndexPrefix,
  securityLabsIndexPattern,
  getSecurityLabsIndexName,
  openApiSpecIndexPrefix,
  openApiSpecIndexPattern,
  getOpenApiSpecIndexName,
} from './src/indices';
export type { ProductDocumentationAttributes } from './src/documents';
export {
  getProductDocInferenceIdCandidates,
  productDocInferenceIdCandidates,
  resolveDefaultInferenceId,
  resolveDefaultInferenceIdFromInferenceGet,
  resolveInstalledProductDocInferenceId,
} from './src/default_inference_id';
