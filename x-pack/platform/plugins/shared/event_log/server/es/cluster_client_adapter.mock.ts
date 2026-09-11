/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { IClusterClientAdapter } from './cluster_client_adapter';

const createClusterClientMock = () => {
  const mock: jest.Mocked<IClusterClientAdapter> = {
    indexDocument: jest.fn(),
    indexDocuments: jest.fn(),
    doesIndexTemplateExist: jest.fn(),
    createIndexTemplate: jest.fn(),
    updateIndexTemplate: jest.fn(),
    doesDataStreamExist: jest.fn(),
    createDataStream: jest.fn(),
    updateConcreteIndices: jest.fn(),
    getExistingLegacyIndexTemplates: jest.fn(),
    setLegacyIndexTemplateToHidden: jest.fn(),
    getExistingIndices: jest.fn(),
    setIndexToHidden: jest.fn(),
    getExistingIndexAliases: jest.fn(),
    setIndexAliasToHidden: jest.fn(),
    queryEventsBySavedObjects: jest.fn(),
    queryEventsWithAuthFilter: jest.fn(),
    aggregateEventsBySavedObjects: jest.fn(),
    aggregateEventsWithAuthFilter: jest.fn(),
    shutdown: jest.fn(),
    updateDocuments: jest.fn(),
    queryEventsByDocumentIds: jest.fn(),
    queryEventsBySavedObjectsSearchAfter: jest.fn(),
    closePointInTime: jest.fn(),
    refreshIndex: jest.fn(),
    softDeleteByQuery: jest.fn(),
  };
  return mock;
};

export const clusterClientAdapterMock = {
  create: createClusterClientMock,
};
