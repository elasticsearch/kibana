/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  CreateExceptionListItemOptions,
  UpdateExceptionListItemOptions,
} from '@kbn/lists-plugin/server';
import { ENDPOINT_ARTIFACT_LISTS } from '@kbn/securitysolution-list-constants';
import type { ExceptionListItemSchema } from '@kbn/securitysolution-io-ts-list-types';
import type { PromiseFromStreams } from '@kbn/lists-plugin/server/services/exception_lists/import_exception_list_and_items';
import { EndpointExceptionsValidationError } from './endpoint_exception_errors';
import { BaseValidator, GLOBAL_ARTIFACT_MANAGEMENT_NOT_ALLOWED_MESSAGE } from './base_validator';
import type { ExceptionItemLikeOptions } from '../types';

export class EndpointExceptionsValidator extends BaseValidator {
  static isEndpointException(item: { listId: string }): boolean {
    return item.listId === ENDPOINT_ARTIFACT_LISTS.endpointExceptions.id;
  }

  protected async validateHasReadPrivilege(): Promise<void> {
    return this.validateHasPrivilege('canReadEndpointExceptions');
  }

  protected async validateHasWritePrivilege(): Promise<void> {
    await this.validateHasPrivilege('canWriteEndpointExceptions');

    if (!(await this.endpointAppContext.isEndpointExceptionsPerPolicyEnabled())) {
      // Without the user opting in, Endpoint Exceptions are ONLY global,
      // so we need to make sure the user also has the new Global Artifacts privilege
      try {
        await this.validateHasPrivilege('canManageGlobalArtifacts');
      } catch (error) {
        // We provide a more detailed error here
        throw new EndpointExceptionsValidationError(
          `${error.message}. ${GLOBAL_ARTIFACT_MANAGEMENT_NOT_ALLOWED_MESSAGE}`,
          403
        );
      }
    }
  }

  async validatePreImport(items: PromiseFromStreams): Promise<void> {
    await this.validateHasWritePrivilege();

    await this.validatePreImportItems(items, async (item) => {
      // import specific validations
      await this.validateImportOwnerSpaceIds(item); // instead of validateCreateOwnerSpaceIds
      await this.validateCanImportGlobalArtifacts(item); // instead of validateCanCreateGlobalArtifacts
      await this.removeInvalidPolicyIds(item); // instead of validateByPolicyItem

      // usual validators from pre-create
      this.validateEntryValueCharacters(item);
      await this.validateCanCreateByPolicyArtifacts(item);
    });
  }

  async validatePreCreateItem(item: CreateExceptionListItemOptions) {
    await this.validateHasWritePrivilege();
    this.validateEntryValueCharacters(item);

    if (await this.endpointAppContext.isEndpointExceptionsPerPolicyEnabled()) {
      await this.validateCanCreateByPolicyArtifacts(item);
      await this.validateByPolicyItem(item);
    }

    await this.validateCanCreateGlobalArtifacts(item);
    await this.validateCreateOwnerSpaceIds(item);

    return item;
  }

  async validatePreUpdateItem(
    _updatedItem: UpdateExceptionListItemOptions,
    currentItem: ExceptionListItemSchema
  ) {
    const updatedItem = _updatedItem as ExceptionItemLikeOptions;

    await this.validateHasWritePrivilege();
    this.validateEntryValueCharacters(updatedItem);

    if (await this.endpointAppContext.isEndpointExceptionsPerPolicyEnabled()) {
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
    }

    await this.validateUpdateOwnerSpaceIds(updatedItem, currentItem);
    await this.validateCanUpdateItemInActiveSpace(updatedItem, currentItem);

    return _updatedItem;
  }

  async validatePreDeleteItem(currentItem: ExceptionListItemSchema): Promise<void> {
    await this.validateHasWritePrivilege();
    await this.validateCanDeleteItemInActiveSpace(currentItem);
  }

  async validatePreGetOneItem(currentItem: ExceptionListItemSchema): Promise<void> {
    await this.validateHasReadPrivilege();
    await this.validateCanReadItemInActiveSpace(currentItem);
  }

  async validatePreMultiListFind(): Promise<void> {
    await this.validateHasReadPrivilege();
  }

  async validatePreExport(): Promise<void> {
    await this.validateHasReadPrivilege();
  }

  async validatePreSingleListFind(): Promise<void> {
    await this.validateHasReadPrivilege();
  }

  async validatePreGetListSummary(): Promise<void> {
    await this.validateHasReadPrivilege();
  }
}
