/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { schema } from '@kbn/config-schema';
import { ENDPOINT_ARTIFACT_LISTS } from '@kbn/securitysolution-list-constants';
import { OperatingSystem } from '@kbn/securitysolution-utils';
import type {
  CreateExceptionListItemOptions,
  UpdateExceptionListItemOptions,
} from '@kbn/lists-plugin/server';
import type { ExceptionListItemSchema } from '@kbn/securitysolution-io-ts-list-types';
import type { PromiseFromStreams } from '@kbn/lists-plugin/server/services/exception_lists/import_exception_list_and_items';
import { BaseValidator, BasicEndpointExceptionDataSchema } from './base_validator';
import { EndpointArtifactExceptionValidationError } from './errors';
import type { ExceptionItemLikeOptions } from '../types';

import { isValidIPv4OrCIDR } from '../../../../common/endpoint/utils/is_valid_ip';

function validateIp(value: string) {
  if (!isValidIPv4OrCIDR(value)) {
    return `invalid ip: ${value}`;
  }
}

const EntrySchema = schema.object({
  field: schema.literal('destination.ip'),
  operator: schema.literal('included'),
  type: schema.literal('match'),
  value: schema.string({
    maxLength: 64,
    validate: validateIp,
  }),
});

const HostIsolationDataSchema = schema.object(
  {
    entries: schema.arrayOf(EntrySchema, { minSize: 1, maxSize: 1 }),
  },
  {
    unknowns: 'ignore',
  }
);

// use the baseSchema and overwrite the os_type
// to accept all OSs in the list for host isolation exception
const HostIsolationBasicDataSchema = BasicEndpointExceptionDataSchema.extends({
  osTypes: schema.arrayOf(
    schema.oneOf([
      schema.literal(OperatingSystem.WINDOWS),
      schema.literal(OperatingSystem.LINUX),
      schema.literal(OperatingSystem.MAC),
    ]),
    { minSize: 3, maxSize: 3 }
  ),
});

export class HostIsolationExceptionsValidator extends BaseValidator {
  static isHostIsolationException(item: { listId: string }): boolean {
    return item.listId === ENDPOINT_ARTIFACT_LISTS.hostIsolationExceptions.id;
  }

  protected async validateHasWritePrivilege(): Promise<void> {
    return this.validateHasPrivilege('canWriteHostIsolationExceptions');
  }

  protected async validateHasDeletePrivilege(): Promise<void> {
    return this.validateHasPrivilege('canDeleteHostIsolationExceptions');
  }

  protected async validateHasReadPrivilege(): Promise<void> {
    return this.validateHasPrivilege('canReadHostIsolationExceptions');
  }

  async validatePreImport(items: PromiseFromStreams): Promise<void> {
    await this.validateHasWritePrivilege();

    await this.validatePreImportItems(items, async (item) => {
      // import specific validations
      await this.validateImportOwnerSpaceIds(item); // instead of validateCreateOwnerSpaceIds
      await this.validateCanImportGlobalArtifacts(item); // instead of validateCanCreateGlobalArtifacts
      await this.removeInvalidPolicyIds(item); // instead of validateByPolicyItem

      // usual validators from pre-create
      await this.validateHostIsolationData(item);
    });
  }

  async validatePreCreateItem(
    item: CreateExceptionListItemOptions
  ): Promise<CreateExceptionListItemOptions> {
    await this.validateHasWritePrivilege();
    await this.validateHostIsolationData(item);
    await this.validateByPolicyItem(item);
    await this.validateCanCreateGlobalArtifacts(item);
    await this.validateCreateOwnerSpaceIds(item);

    return item;
  }

  async validatePreUpdateItem(
    _updatedItem: UpdateExceptionListItemOptions,
    currentItem: ExceptionListItemSchema
  ): Promise<UpdateExceptionListItemOptions> {
    const updatedItem = _updatedItem as ExceptionItemLikeOptions;

    await this.validateHasWritePrivilege();
    await this.validateHostIsolationData(updatedItem);
    await this.validateByPolicyItem(updatedItem, currentItem);
    await this.validateUpdateOwnerSpaceIds(_updatedItem, currentItem);
    await this.validateCanUpdateItemInActiveSpace(_updatedItem, currentItem);

    return _updatedItem;
  }

  async validatePreGetOneItem(currentItem: ExceptionListItemSchema): Promise<void> {
    await this.validateHasReadPrivilege();
    await this.validateCanReadItemInActiveSpace(currentItem);
  }

  async validatePreSummary(): Promise<void> {
    await this.validateHasReadPrivilege();
  }

  async validatePreDeleteItem(currentItem: ExceptionListItemSchema): Promise<void> {
    await this.validateHasDeletePrivilege();
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

  private async validateHostIsolationData(item: ExceptionItemLikeOptions): Promise<void> {
    try {
      HostIsolationBasicDataSchema.validate(item);
      HostIsolationDataSchema.validate(item);
    } catch (error) {
      throw new EndpointArtifactExceptionValidationError(error.message);
    }
  }
}
