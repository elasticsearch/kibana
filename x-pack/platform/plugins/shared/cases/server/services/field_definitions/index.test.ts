/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { savedObjectsClientMock } from '@kbn/core/server/mocks';
import type { SavedObject, SavedObjectsFindResponse } from '@kbn/core/server';
import {
  CASE_FIELD_DEFINITION_SAVED_OBJECT,
  MAX_FIELD_DEFINITIONS_PER_OWNER,
} from '../../../common/constants';
import { FieldDefinitionsService } from '.';
import type { FieldDefinition } from '../../../common/types/domain/field_definition/v1';

const makeFieldDefinitionSO = (
  overrides: Partial<FieldDefinition> = {}
): SavedObject<FieldDefinition> => ({
  id: 'fd-1',
  type: CASE_FIELD_DEFINITION_SAVED_OBJECT,
  references: [],
  attributes: {
    fieldDefinitionId: 'fd-1',
    name: 'my_field',
    owner: 'securitySolution',
    definition: 'name: my_field\ncontrol: INPUT_TEXT\ntype: keyword\n',
    ...overrides,
  },
});

describe('FieldDefinitionsService', () => {
  let soClient: ReturnType<typeof savedObjectsClientMock.create>;
  let service: FieldDefinitionsService;

  beforeEach(() => {
    soClient = savedObjectsClientMock.create();
    service = new FieldDefinitionsService({ unsecuredSavedObjectsClient: soClient });
  });

  describe('getFieldDefinitions', () => {
    it('returns an empty result when no owners are provided', async () => {
      const result = await service.getFieldDefinitions([]);
      expect(result).toEqual({ fieldDefinitions: [], total: 0 });
      expect(soClient.find).not.toHaveBeenCalled();
    });

    it('calls find with correct filter for a single owner', async () => {
      const so = makeFieldDefinitionSO();
      soClient.find.mockResolvedValue({
        saved_objects: [so],
        total: 1,
        per_page: MAX_FIELD_DEFINITIONS_PER_OWNER,
        page: 1,
      } as SavedObjectsFindResponse<FieldDefinition>);

      const result = await service.getFieldDefinitions(['securitySolution']);

      expect(soClient.find).toHaveBeenCalledWith(
        expect.objectContaining({
          type: CASE_FIELD_DEFINITION_SAVED_OBJECT,
          filter: `${CASE_FIELD_DEFINITION_SAVED_OBJECT}.attributes.owner: "securitySolution"`,
          perPage: MAX_FIELD_DEFINITIONS_PER_OWNER,
        })
      );
      expect(result.fieldDefinitions).toHaveLength(1);
      expect(result.fieldDefinitions[0]).toEqual(so.attributes);
      expect(result.total).toBe(1);
    });

    it('builds an OR filter for multiple owners', async () => {
      soClient.find.mockResolvedValue({
        saved_objects: [],
        total: 0,
        per_page: MAX_FIELD_DEFINITIONS_PER_OWNER,
        page: 1,
      } as SavedObjectsFindResponse<FieldDefinition>);

      await service.getFieldDefinitions(['securitySolution', 'observability']);

      expect(soClient.find).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: `${CASE_FIELD_DEFINITION_SAVED_OBJECT}.attributes.owner: "securitySolution" OR ${CASE_FIELD_DEFINITION_SAVED_OBJECT}.attributes.owner: "observability"`,
        })
      );
    });

    it('accepts a string owner (not an array)', async () => {
      soClient.find.mockResolvedValue({
        saved_objects: [],
        total: 0,
        per_page: MAX_FIELD_DEFINITIONS_PER_OWNER,
        page: 1,
      } as SavedObjectsFindResponse<FieldDefinition>);

      await service.getFieldDefinitions('securitySolution');

      expect(soClient.find).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: `${CASE_FIELD_DEFINITION_SAVED_OBJECT}.attributes.owner: "securitySolution"`,
        })
      );
    });

    it('filters by isGlobal in application code when isGlobal is true (new isGlobal attribute)', async () => {
      const globalField = makeFieldDefinitionSO({ isGlobal: true });
      const nonGlobalField = makeFieldDefinitionSO({ name: 'non_global', isGlobal: false });
      soClient.find.mockResolvedValue({
        saved_objects: [globalField, nonGlobalField],
        total: 2,
        per_page: MAX_FIELD_DEFINITIONS_PER_OWNER,
        page: 1,
      } as SavedObjectsFindResponse<FieldDefinition>);

      const result = await service.getFieldDefinitions('securitySolution', { isGlobal: true });

      // No KQL isGlobal filter — filtering is done in application code
      expect(soClient.find).toHaveBeenCalledWith(
        expect.objectContaining({
          filter: `${CASE_FIELD_DEFINITION_SAVED_OBJECT}.attributes.owner: "securitySolution"`,
        })
      );
      expect(result.fieldDefinitions).toHaveLength(1);
      expect(result.fieldDefinitions[0].name).toBe('my_field');
    });

    it('returns all definitions when isGlobal is false (no filtering)', async () => {
      const fd1 = makeFieldDefinitionSO({ isGlobal: true });
      const fd2 = makeFieldDefinitionSO({ name: 'non_global', isGlobal: false });
      soClient.find.mockResolvedValue({
        saved_objects: [fd1, fd2],
        total: 2,
        per_page: MAX_FIELD_DEFINITIONS_PER_OWNER,
        page: 1,
      } as SavedObjectsFindResponse<FieldDefinition>);

      const result = await service.getFieldDefinitions('securitySolution', { isGlobal: false });

      expect(result.fieldDefinitions).toHaveLength(2);
    });
  });

  describe('getFieldDefinition', () => {
    it('retrieves a single field definition by id', async () => {
      const so = makeFieldDefinitionSO();
      soClient.get.mockResolvedValue(so);

      const result = await service.getFieldDefinition('fd-1');

      expect(soClient.get).toHaveBeenCalledWith(CASE_FIELD_DEFINITION_SAVED_OBJECT, 'fd-1');
      expect(result).toBe(so);
    });
  });

  describe('createFieldDefinition', () => {
    it('creates a saved object with a generated id', async () => {
      const so = makeFieldDefinitionSO();
      soClient.create.mockResolvedValue(so);

      const input = {
        name: 'my_field',
        owner: 'securitySolution' as const,
        definition: 'name: my_field\ncontrol: INPUT_TEXT\ntype: keyword\n',
      };
      const result = await service.createFieldDefinition(input);

      expect(soClient.create).toHaveBeenCalledWith(
        CASE_FIELD_DEFINITION_SAVED_OBJECT,
        expect.objectContaining({ name: 'my_field', owner: 'securitySolution' }),
        expect.objectContaining({ id: expect.any(String) })
      );
      expect(result).toBe(so);
    });

    it('stores the generated id as fieldDefinitionId in attributes', async () => {
      const so = makeFieldDefinitionSO();
      soClient.create.mockResolvedValue(so);

      await service.createFieldDefinition({
        name: 'my_field',
        owner: 'securitySolution',
        definition: 'name: my_field\ncontrol: INPUT_TEXT\ntype: keyword\n',
      });

      const [, attributes, options] = soClient.create.mock.calls[0];
      expect((attributes as FieldDefinition).fieldDefinitionId).toBe(options!.id);
    });
  });

  describe('updateFieldDefinition', () => {
    it('calls update then re-fetches the saved object', async () => {
      const so = makeFieldDefinitionSO({ name: 'updated_field' });
      soClient.update.mockResolvedValue(so as never);
      soClient.get.mockResolvedValue(so);

      const result = await service.updateFieldDefinition('fd-1', {
        name: 'updated_field',
        owner: 'securitySolution',
        definition: 'name: updated_field\ncontrol: INPUT_TEXT\ntype: keyword\n',
      });

      expect(soClient.update).toHaveBeenCalledWith(
        CASE_FIELD_DEFINITION_SAVED_OBJECT,
        'fd-1',
        expect.objectContaining({ name: 'updated_field' })
      );
      expect(soClient.get).toHaveBeenCalledWith(CASE_FIELD_DEFINITION_SAVED_OBJECT, 'fd-1');
      expect(result).toBe(so);
    });
  });

  describe('deleteFieldDefinition', () => {
    it('deletes the saved object by id', async () => {
      soClient.delete.mockResolvedValue({});

      await service.deleteFieldDefinition('fd-1');

      expect(soClient.delete).toHaveBeenCalledWith(CASE_FIELD_DEFINITION_SAVED_OBJECT, 'fd-1');
    });
  });
});
