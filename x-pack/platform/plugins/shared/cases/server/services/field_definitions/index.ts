/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import type { SavedObject, SavedObjectsClientContract } from '@kbn/core/server';
import { castArray } from 'lodash';
import { escapeKuery } from '@kbn/es-query';
import type {
  CreateFieldDefinitionInput,
  FieldDefinition,
  UpdateFieldDefinitionInput,
} from '../../../common/types/domain/field_definition/v1';
import {
  CASE_FIELD_DEFINITION_SAVED_OBJECT,
  MAX_FIELD_DEFINITIONS_PER_OWNER,
} from '../../../common/constants';
import type { FieldDefinitionsFindResponse } from '../../../common/types/api/field_definition/v1';

export class FieldDefinitionsService {
  constructor(
    private readonly dependencies: {
      unsecuredSavedObjectsClient: SavedObjectsClientContract;
    }
  ) {}

  /**
   * Returns field definitions for the given owner(s).
   *
   * `isGlobal: true`  — returns only definitions flagged as global.
   * `isGlobal: false` — same as `undefined`: returns ALL definitions.
   *
   * NOTE: `isGlobal` filtering is done in application code (not via KQL) because
   * the `isGlobal` boolean is not reliably indexed for all documents (e.g. documents
   * created before the mapping was applied). In-app filtering on `_source` is always
   * accurate.
   */
  async getFieldDefinitions(
    owner: string | string[],
    { isGlobal }: { isGlobal?: boolean } = {}
  ): Promise<FieldDefinitionsFindResponse> {
    // Dedupe to prevent duplicate owners from inflating the perPage multiplier.
    const owners = [...new Set(castArray(owner))];

    if (owners.length === 0) {
      return { fieldDefinitions: [], total: 0 };
    }

    const ownerFilter = owners
      .map((o) => `${CASE_FIELD_DEFINITION_SAVED_OBJECT}.attributes.owner: "${escapeKuery(o)}"`)
      .join(' OR ');

    const result = await this.dependencies.unsecuredSavedObjectsClient.find<FieldDefinition>({
      type: CASE_FIELD_DEFINITION_SAVED_OBJECT,
      filter: ownerFilter,
      perPage: MAX_FIELD_DEFINITIONS_PER_OWNER * owners.length,
    });

    const allDefs = result.saved_objects.map((so) => so.attributes);

    const fieldDefinitions =
      isGlobal === true ? allDefs.filter((fd) => fd.isGlobal === true) : allDefs;

    return {
      fieldDefinitions,
      total: fieldDefinitions.length,
    };
  }

  async getFieldDefinition(id: string): Promise<SavedObject<FieldDefinition>> {
    return this.dependencies.unsecuredSavedObjectsClient.get<FieldDefinition>(
      CASE_FIELD_DEFINITION_SAVED_OBJECT,
      id
    );
  }

  async createFieldDefinition(
    input: CreateFieldDefinitionInput
  ): Promise<SavedObject<FieldDefinition>> {
    const id = uuidv4();
    return this.dependencies.unsecuredSavedObjectsClient.create<FieldDefinition>(
      CASE_FIELD_DEFINITION_SAVED_OBJECT,
      { ...input, fieldDefinitionId: id },
      { id }
    );
  }

  async updateFieldDefinition(
    id: string,
    input: UpdateFieldDefinitionInput
  ): Promise<SavedObject<FieldDefinition>> {
    await this.dependencies.unsecuredSavedObjectsClient.update<FieldDefinition>(
      CASE_FIELD_DEFINITION_SAVED_OBJECT,
      id,
      input
    );
    return this.getFieldDefinition(id);
  }

  async deleteFieldDefinition(id: string): Promise<void> {
    await this.dependencies.unsecuredSavedObjectsClient.delete(
      CASE_FIELD_DEFINITION_SAVED_OBJECT,
      id
    );
  }
}
