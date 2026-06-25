/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { coreMock } from '@kbn/core/server/mocks';
import { createCaseSavedObjectType } from './cases';
import {
  createModelVersionTestMigrator,
  type ModelVersionTestMigrator,
} from '@kbn/core-test-helpers-model-versions';
import { loggerMock } from '@kbn/logging-mocks';
import { createCaseSavedObjectResponse, createESJiraConnector } from '../../services/test_utils';
import { ConnectorTypes } from '../../../common/types/domain';
import { modelVersion9 } from './model_versions';

const mockLogger = loggerMock.create();
const mockCoreSetup = coreMock.createSetup();
const caseSavedObjectType = createCaseSavedObjectType(mockCoreSetup, mockLogger, {} as never);

describe('caseSavedObjectType model version transformations', () => {
  let migrator: ModelVersionTestMigrator;

  beforeEach(() => {
    migrator = createModelVersionTestMigrator({ type: caseSavedObjectType });
  });

  describe('Model version 1 to 2', () => {
    const version2Fields = ['observables'];
    it('by default does not add the new fields to the object', () => {
      const caseObj = createCaseSavedObjectResponse();

      const migrated = migrator.migrate({
        document: caseObj,
        fromVersion: 1,
        toVersion: 2,
      });

      version2Fields.forEach((field) => {
        expect(migrated.attributes).not.toHaveProperty(field);
      });
    });
  });

  describe('Model version 2 to 3', () => {
    const version3Fields = ['incremental_id'];

    it('by default does not add the new fields to the object', () => {
      const migrated = migrator.migrate({
        document: createCaseSavedObjectResponse(),
        fromVersion: 2,
        toVersion: 3,
      });

      version3Fields.forEach((field) => {
        expect(migrated.attributes).not.toHaveProperty(field);
      });
    });
  });

  describe('Model version 3 to 4', () => {
    const version4Fields = ['incremental_id'];

    it('by default does not add the new fields to the object', () => {
      const migrated = migrator.migrate({
        document: createCaseSavedObjectResponse(),
        fromVersion: 3,
        toVersion: 4,
      });

      version4Fields.forEach((field) => {
        expect(migrated.attributes).not.toHaveProperty(field);
      });
    });
  });

  describe('Model version 4 to 5', () => {
    const version5Fields = ['incremental_id'];

    it('by default does not add the new fields to the object', () => {
      const migrated = migrator.migrate({
        document: createCaseSavedObjectResponse(),
        fromVersion: 4,
        toVersion: 5,
      });

      version5Fields.forEach((field) => {
        expect(migrated.attributes).not.toHaveProperty(field);
      });
    });

    it('properly backfill the observables settings when converting from v4 to v5', () => {
      const migrated = migrator.migrate({
        document: createCaseSavedObjectResponse(),
        fromVersion: 4,
        toVersion: 5,
      });

      expect(migrated.attributes).toHaveProperty('settings.extractObservables');
    });

    it('properly removes the observables settings when converting from v5 to v4', () => {
      const migrated = migrator.migrate({
        document: createCaseSavedObjectResponse({
          connector: {
            id: 'none',
            name: 'none',
            type: ConnectorTypes.none,
            fields: [],
          },
          overrides: {
            severity: 10, // Severity value that matches v1 schema (10, 20, 30, 40)
          },
        }),
        fromVersion: 5,
        toVersion: 4,
      });

      expect(migrated.attributes).not.toHaveProperty('settings.extractObservables');
    });
  });

  describe('Model version 5 to 6', () => {
    it('properly backfill the total_events field when converting from v5 to v6', () => {
      const migrated = migrator.migrate({
        document: createCaseSavedObjectResponse(),
        fromVersion: 5,
        toVersion: 6,
      });

      expect(migrated.attributes).toHaveProperty('total_events');
    });
  });

  describe('Model version 6 to 7', () => {
    const version7Fields = ['observables.description'];

    it('by default does not add the new fields to the object', () => {
      const migrated = migrator.migrate({
        document: createCaseSavedObjectResponse(),
        fromVersion: 6,
        toVersion: 7,
      });

      version7Fields.forEach((field) => {
        expect(migrated.attributes).not.toHaveProperty(field);
      });
    });
  });

  describe('Model version 7 to 8', () => {
    it('properly backfill the total_observables field when converting from v7 to v8', () => {
      const migrated = migrator.migrate({
        document: createCaseSavedObjectResponse(),
        fromVersion: 7,
        toVersion: 8,
      });

      expect(migrated.attributes).toHaveProperty('total_observables');
    });
  });

  describe('Model version 8 to 9', () => {
    const version9Fields = ['template.id', 'template.version', 'extended_fields'];

    it('by default does not add the new fields to the object', () => {
      const migrated = migrator.migrate({
        document: createCaseSavedObjectResponse(),
        fromVersion: 8,
        toVersion: 9,
      });

      version9Fields.forEach((field) => {
        expect(migrated.attributes).not.toHaveProperty(field);
      });
    });

    it('create schema allows null connector field values', () => {
      const createSchema = modelVersion9.schemas?.create;
      expect(createSchema).toBeDefined();

      const attributes = createCaseSavedObjectResponse({
        connector: createESJiraConnector({
          fields: [
            { key: 'issueType', value: 'task' },
            { key: 'priority', value: 'high' },
            { key: 'parent', value: null },
          ],
        }),
        overrides: {
          total_observables: 0,
        },
      }).attributes;

      expect(() => createSchema!.validate(attributes)).not.toThrow();
    });
  });
});
