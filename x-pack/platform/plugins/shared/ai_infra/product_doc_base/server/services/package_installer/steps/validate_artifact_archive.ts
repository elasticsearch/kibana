/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { DocumentationProduct, isArtifactContentFilePath } from '@kbn/product-doc-common';
import type { ZipArchive } from '../utils/zip_archive';

type ValidationResult = { valid: true } | { valid: false; error: string };

const MANIFEST_FILE_PATH = 'manifest.json';
const MAPPINGS_FILE_PATH = 'mappings.json';

const OPEN_API_SPEC_PRODUCT_NAMES = [
  DocumentationProduct.elasticsearch,
  DocumentationProduct.kibana,
] as const;

const openApiContentFileRegexp = /^[a-z]+\/content\/content-[0-9]+\.ndjson$/;

const isOpenApiArtifactContentFilePath = (path: string): boolean => {
  return openApiContentFileRegexp.test(path);
};

const formatMissingFileError = ({
  filePath,
  archivePath,
}: {
  filePath: string;
  archivePath?: string;
}): string => {
  const archiveSuffix = archivePath ? ` in archive [${archivePath}]` : '';
  return `File not found at path [${filePath}]${archiveSuffix}`;
};

export const validateArtifactArchive = (
  archive: ZipArchive,
  { archivePath }: { archivePath?: string } = {}
): ValidationResult => {
  if (!archive.hasEntry(MANIFEST_FILE_PATH)) {
    return {
      valid: false,
      error: `Manifest file not found: ${formatMissingFileError({
        filePath: MANIFEST_FILE_PATH,
        archivePath,
      })}`,
    };
  }
  if (!archive.hasEntry(MAPPINGS_FILE_PATH)) {
    return {
      valid: false,
      error: `Mapping file not found: ${formatMissingFileError({
        filePath: MAPPINGS_FILE_PATH,
        archivePath,
      })}`,
    };
  }
  if (!archive.getEntryPaths().some(isArtifactContentFilePath)) {
    const archiveSuffix = archivePath ? ` in archive [${archivePath}]` : '';
    return { valid: false, error: `No content files were found${archiveSuffix}` };
  }
  return { valid: true };
};

/**
 * OpenAPI artifacts are multi-product zips with a nested layout:
 *   {productName}/manifest.json
 *   {productName}/mappings.json
 *   {productName}/content/content-N.ndjson
 */
export const validateOpenApiArtifactArchive = (
  archive: ZipArchive,
  { archivePath }: { archivePath?: string } = {}
): ValidationResult => {
  for (const productName of OPEN_API_SPEC_PRODUCT_NAMES) {
    const manifestPath = `${productName}/${MANIFEST_FILE_PATH}`;
    const mappingsPath = `${productName}/${MAPPINGS_FILE_PATH}`;

    if (!archive.hasEntry(manifestPath)) {
      return {
        valid: false,
        error: `Manifest file not found: ${formatMissingFileError({
          filePath: manifestPath,
          archivePath,
        })}`,
      };
    }
    if (!archive.hasEntry(mappingsPath)) {
      return {
        valid: false,
        error: `Mapping file not found: ${formatMissingFileError({
          filePath: mappingsPath,
          archivePath,
        })}`,
      };
    }

    const contentPrefix = `${productName}/content/`;
    const hasProductContent = archive
      .getEntryPaths()
      .some((path) => path.startsWith(contentPrefix) && isOpenApiArtifactContentFilePath(path));

    if (!hasProductContent) {
      const archiveSuffix = archivePath ? ` in archive [${archivePath}]` : '';
      return {
        valid: false,
        error: `No content files were found for product [${productName}]${archiveSuffix}`,
      };
    }
  }

  return { valid: true };
};
