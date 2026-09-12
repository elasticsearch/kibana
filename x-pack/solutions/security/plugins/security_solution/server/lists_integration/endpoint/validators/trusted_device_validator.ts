/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ENDPOINT_ARTIFACT_LISTS } from '@kbn/securitysolution-list-constants';
import { schema } from '@kbn/config-schema';
import type { ExceptionListItemSchema } from '@kbn/securitysolution-io-ts-list-types';
import type {
  CreateExceptionListItemOptions,
  UpdateExceptionListItemOptions,
} from '@kbn/lists-plugin/server';
import {
  TrustedDeviceConditionEntryField,
  OperatingSystem,
  isTrustedDeviceFieldAvailableForOs,
} from '@kbn/securitysolution-utils';
import type { PromiseFromStreams } from '@kbn/lists-plugin/server/services/exception_lists/import_exception_list_and_items';
import { BaseValidator, BasicEndpointExceptionDataSchema } from './base_validator';
import type { ExceptionItemLikeOptions } from '../types';
import { EndpointArtifactExceptionValidationError } from './errors';
import { ENTRY_VALUE_MAX_LENGTH } from './constants';

// Error constants following the established pattern
const TRUSTED_DEVICE_EMPTY_VALUE_ERROR = 'Field value cannot be empty';
const TRUSTED_DEVICE_DUPLICATE_FIELD_ERROR = 'Duplicate field entries are not allowed';
const TRUSTED_DEVICE_DUPLICATE_OS_ERROR = 'Duplicate OS entries are not allowed';
const TRUSTED_DEVICE_USERNAME_OS_ERROR =
  'Username field is only supported for Windows OS exclusively. Please select Windows OS only or choose a different field.';

const TrustedDeviceFieldSchema = schema.oneOf([
  schema.literal(TrustedDeviceConditionEntryField.DEVICE_ID),
  schema.literal(TrustedDeviceConditionEntryField.DEVICE_TYPE),
  schema.literal(TrustedDeviceConditionEntryField.HOST),
  schema.literal(TrustedDeviceConditionEntryField.MANUFACTURER),
  schema.literal(TrustedDeviceConditionEntryField.MANUFACTURER_ID),
  schema.literal(TrustedDeviceConditionEntryField.PRODUCT_ID),
  schema.literal(TrustedDeviceConditionEntryField.PRODUCT_NAME),
  schema.literal(TrustedDeviceConditionEntryField.USERNAME),
]);

const TrustedDeviceEntrySchema = schema.object({
  field: TrustedDeviceFieldSchema,
  type: schema.oneOf([
    schema.literal('match'),
    schema.literal('wildcard'),
    schema.literal('match_any'),
  ]),
  operator: schema.literal('included'),
  value: schema.oneOf([
    schema.string({
      maxLength: ENTRY_VALUE_MAX_LENGTH,
      validate: (value: string) =>
        value.trim().length > 0 ? undefined : TRUSTED_DEVICE_EMPTY_VALUE_ERROR,
    }),
    schema.arrayOf(
      schema.string({
        maxLength: ENTRY_VALUE_MAX_LENGTH,
        validate: (value: string) =>
          value.trim().length > 0 ? undefined : TRUSTED_DEVICE_EMPTY_VALUE_ERROR,
      }),
      { minSize: 1, maxSize: 2000 }
    ),
  ]),
});

const TrustedDeviceEntriesSchema = schema.arrayOf(TrustedDeviceEntrySchema, {
  minSize: 1,
  maxSize: 250,
  validate(
    entries: Array<{ field: string; type: string; operator: string; value: string | string[] }>
  ) {
    const fields = entries.map((entry) => entry.field);
    const duplicateFields = fields.filter((field, index) => fields.indexOf(field) !== index);
    return duplicateFields.length > 0
      ? `${TRUSTED_DEVICE_DUPLICATE_FIELD_ERROR}: ${duplicateFields.join(', ')}`
      : undefined;
  },
});

const TrustedDeviceBasicDataSchema = BasicEndpointExceptionDataSchema.extends({
  osTypes: schema.arrayOf(
    schema.oneOf([schema.literal(OperatingSystem.WINDOWS), schema.literal(OperatingSystem.MAC)]),
    {
      minSize: 1,
      maxSize: 2,
      validate: (osTypes: string[]) => {
        const duplicateOs = osTypes.filter((os, index) => osTypes.indexOf(os) !== index);
        if (duplicateOs.length > 0) {
          return `${TRUSTED_DEVICE_DUPLICATE_OS_ERROR}: ${duplicateOs.join(', ')}`;
        }
        return undefined;
      },
    }
  ),
});

const TrustedDeviceDataSchema = schema.object(
  {
    entries: TrustedDeviceEntriesSchema,
  },
  // Because we are only validating some fields from the Exception Item, we set `unknowns` to `ignore` here
  { unknowns: 'ignore' }
);

export class TrustedDeviceValidator extends BaseValidator {
  static isTrustedDevice(item: { listId: string }): boolean {
    return item.listId === ENDPOINT_ARTIFACT_LISTS.trustedDevices.id;
  }

  protected async validateHasWritePrivilege(): Promise<void> {
    return super.validateHasPrivilege('canWriteTrustedDevices');
  }

  protected async validateHasReadPrivilege(): Promise<void> {
    return super.validateHasPrivilege('canReadTrustedDevices');
  }

  private async validateTrustedDevicesFeatureEnabled(): Promise<void> {
    if (!this.endpointAppContext.experimentalFeatures.trustedDevices) {
      throw new EndpointArtifactExceptionValidationError('Trusted devices feature is not enabled');
    }
  }

  async validatePreImport(items: PromiseFromStreams): Promise<void> {
    await this.validateTrustedDevicesFeatureEnabled();
    await this.validateHasWritePrivilege();

    await this.validatePreImportItems(items, async (item) => {
      // import specific validations
      await this.validateImportOwnerSpaceIds(item); // instead of validateCreateOwnerSpaceIds
      await this.validateCanImportGlobalArtifacts(item); // instead of validateCanCreateGlobalArtifacts
      await this.removeInvalidPolicyIds(item); // instead of validateByPolicyItem

      // usual validators from pre-create
      await this.validateTrustedDeviceData(item);
      await this.validateCanCreateByPolicyArtifacts(item);
    });
  }

  async validatePreCreateItem(
    item: CreateExceptionListItemOptions
  ): Promise<CreateExceptionListItemOptions> {
    await this.validateTrustedDevicesFeatureEnabled();
    await this.validateHasWritePrivilege();
    await this.validateTrustedDeviceData(item);
    await this.validateCanCreateByPolicyArtifacts(item);
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

    await this.validateTrustedDevicesFeatureEnabled();
    await this.validateHasWritePrivilege();
    await this.validateTrustedDeviceData(updatedItem);

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

  async validatePreDeleteItem(currentItem: ExceptionListItemSchema): Promise<void> {
    await this.validateTrustedDevicesFeatureEnabled();
    await this.validateHasWritePrivilege();
    await this.validateCanDeleteItemInActiveSpace(currentItem);
  }

  async validatePreGetOneItem(currentItem: ExceptionListItemSchema): Promise<void> {
    await this.validateTrustedDevicesFeatureEnabled();
    await this.validateHasReadPrivilege();
    await this.validateCanReadItemInActiveSpace(currentItem);
  }

  async validatePreMultiListFind(): Promise<void> {
    await this.validateTrustedDevicesFeatureEnabled();
    await this.validateHasReadPrivilege();
  }

  async validatePreExport(): Promise<void> {
    await this.validateTrustedDevicesFeatureEnabled();
    await this.validateHasReadPrivilege();
  }

  async validatePreSingleListFind(): Promise<void> {
    await this.validateTrustedDevicesFeatureEnabled();
    await this.validateHasReadPrivilege();
  }

  async validatePreGetListSummary(): Promise<void> {
    await this.validateTrustedDevicesFeatureEnabled();
    await this.validateHasReadPrivilege();
  }

  private async validateTrustedDeviceData(item: ExceptionItemLikeOptions): Promise<void> {
    this.validateEntryValueCharacters(item);

    try {
      TrustedDeviceBasicDataSchema.validate(item);
    } catch (error) {
      throw new EndpointArtifactExceptionValidationError(error.message);
    }

    try {
      TrustedDeviceDataSchema.validate(item);
    } catch (error) {
      throw new EndpointArtifactExceptionValidationError(error.message);
    }

    this.validateOsSpecificFields(item);
  }

  private validateOsSpecificFields(item: ExceptionItemLikeOptions): void {
    const osTypes = item.osTypes || [];
    const entries = item.entries || [];

    const hasUsernameField = entries.some(
      (entry) => entry.field === TrustedDeviceConditionEntryField.USERNAME
    );

    if (hasUsernameField) {
      // USERNAME field is only allowed for Windows OS exclusively
      if (!isTrustedDeviceFieldAvailableForOs(TrustedDeviceConditionEntryField.USERNAME, osTypes)) {
        throw new EndpointArtifactExceptionValidationError(TRUSTED_DEVICE_USERNAME_OS_ERROR);
      }
    }
  }
}
