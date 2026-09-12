/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import type { ExceptionListItemSchema } from '@kbn/securitysolution-io-ts-list-types';
import { ENDPOINT_ARTIFACT_LISTS } from '@kbn/securitysolution-list-constants';

import type {
  CreateExceptionListItemOptions,
  UpdateExceptionListItemOptions,
} from '@kbn/lists-plugin/server';

import type { PromiseFromStreams } from '@kbn/lists-plugin/server/services/exception_lists/import_exception_list_and_items';
import type { ExceptionItemLikeOptions } from '../types';

import { BaseValidator } from './base_validator';
import { EndpointArtifactExceptionValidationError } from './errors';
import { ENTRY_FIELD_MAX_LENGTH } from './constants';

const EventFilterDataSchema = schema.object(
  {
    entries: schema.arrayOf(
      schema.object(
        {
          field: schema.string({ maxLength: ENTRY_FIELD_MAX_LENGTH }),
        },
        { unknowns: 'ignore' }
      ),
      { minSize: 1, maxSize: 250 }
    ),
  },
  {
    unknowns: 'ignore',
  }
);

export class EventFilterValidator extends BaseValidator {
  static isEventFilter(item: { listId: string }): boolean {
    return item.listId === ENDPOINT_ARTIFACT_LISTS.eventFilters.id;
  }

  protected async validateHasWritePrivilege(): Promise<void> {
    return super.validateHasPrivilege('canWriteEventFilters');
  }

  protected async validateHasReadPrivilege(): Promise<void> {
    return super.validateHasPrivilege('canReadEventFilters');
  }

  async validatePreImport(items: PromiseFromStreams): Promise<void> {
    await this.validateHasWritePrivilege();

    await this.validatePreImportItems(items, async (item) => {
      // import specific validations
      await this.validateImportOwnerSpaceIds(item); // instead of validateCreateOwnerSpaceIds
      await this.validateCanImportGlobalArtifacts(item); // instead of validateCanCreateGlobalArtifacts
      await this.removeInvalidPolicyIds(item); // instead of validateByPolicyItem

      // usual validators from pre-create
      await this.validateEventFilterData(item);
      await this.validateCanCreateByPolicyArtifacts(item);
    });
  }

  async validatePreCreateItem(item: CreateExceptionListItemOptions) {
    await this.validateHasWritePrivilege();
    await this.validateEventFilterData(item);

    // user can always create a global entry so additional checks not needed
    if (this.isItemByPolicy(item)) {
      await this.validateCanCreateByPolicyArtifacts(item);
      await this.validateByPolicyItem(item);
    }

    await this.validateCreateOwnerSpaceIds(item);
    await this.validateCanCreateGlobalArtifacts(item);

    return item;
  }

  async validatePreUpdateItem(
    _updatedItem: UpdateExceptionListItemOptions,
    currentItem: ExceptionListItemSchema
  ): Promise<UpdateExceptionListItemOptions> {
    const updatedItem = _updatedItem as ExceptionItemLikeOptions;

    await this.validateHasWritePrivilege();
    await this.validateEventFilterData(updatedItem);

    try {
      await this.validateCanCreateByPolicyArtifacts(updatedItem);
    } catch (noByPolicyAuthzError) {
      // Not allowed to create/update by policy data. Validate that the effective scope of the item
      // remained unchanged with this update or was set to `global` (only allowed update). If not,
      // then throw the validation error that was catch'ed
      if (this.wasByPolicyEffectScopeChanged(updatedItem, currentItem)) {
        throw noByPolicyAuthzError;
      }
    }

    await this.validateByPolicyItem(updatedItem, currentItem);
    await this.validateUpdateOwnerSpaceIds(_updatedItem, currentItem);
    await this.validateCanUpdateItemInActiveSpace(_updatedItem, currentItem);

    return _updatedItem;
  }

  private async validateEventFilterData(item: ExceptionItemLikeOptions): Promise<void> {
    this.validateEntryValueCharacters(item);
    await this.validateBasicData(item);

    try {
      EventFilterDataSchema.validate(item);
    } catch (error) {
      throw new EndpointArtifactExceptionValidationError(error.message);
    }
  }

  async validatePreGetOneItem(currentItem: ExceptionListItemSchema): Promise<void> {
    await this.validateHasReadPrivilege();
    await this.validateCanReadItemInActiveSpace(currentItem);
  }

  async validatePreSummary(): Promise<void> {
    await this.validateHasReadPrivilege();
  }

  async validatePreDeleteItem(currentItem: ExceptionListItemSchema): Promise<void> {
    await this.validateHasWritePrivilege();
    await this.validateCanDeleteItemInActiveSpace(currentItem);
  }

  async validatePreExport(): Promise<void> {
    await this.validateHasReadPrivilege();
  }

  async validatePreSingleListFind(): Promise<void> {
    await this.validateHasReadPrivilege();
  }

  async validatePreMultiListFind(): Promise<void> {
    await this.validateHasReadPrivilege();
  }
}
