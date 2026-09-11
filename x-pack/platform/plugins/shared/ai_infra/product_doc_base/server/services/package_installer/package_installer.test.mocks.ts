/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

export const validateArtifactArchiveMock = jest.fn();
export const validateOpenApiArtifactArchiveMock = jest.fn();
export const fetchArtifactVersionsMock = jest.fn();
export const fetchSecurityLabsVersionsMock = jest.fn();
export const createIndexMock = jest.fn();
export const populateIndexMock = jest.fn();

jest.doMock('./steps', () => {
  const actual = jest.requireActual('./steps');
  return {
    ...actual,
    validateArtifactArchive: validateArtifactArchiveMock,
    validateOpenApiArtifactArchive: validateOpenApiArtifactArchiveMock,
    fetchArtifactVersions: fetchArtifactVersionsMock,
    fetchSecurityLabsVersions: fetchSecurityLabsVersionsMock,
    createIndex: createIndexMock,
    populateIndex: populateIndexMock,
  };
});

export const downloadToDiskMock = jest.fn();
export const openZipArchiveMock = jest.fn();
export const loadMappingFileMock = jest.fn();
export const loadManifestFileMock = jest.fn();
export const ensureDefaultElserDeployedMock = jest.fn();

jest.doMock('./utils', () => {
  const actual = jest.requireActual('./utils');
  return {
    ...actual,
    downloadToDisk: downloadToDiskMock,
    openZipArchive: openZipArchiveMock,
    loadMappingFile: loadMappingFileMock,
    loadManifestFile: loadManifestFileMock,
    ensureDefaultElserDeployed: ensureDefaultElserDeployedMock,
  };
});
