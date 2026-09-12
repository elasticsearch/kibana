/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ExceptionListItemSchema } from '@kbn/securitysolution-io-ts-list-types';
import { listMock } from '@kbn/lists-plugin/server/mocks';
import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import type { PromiseFromStreams } from '@kbn/lists-plugin/server/services/exception_lists/import_exception_list_and_items';
import { buildSpaceOwnerIdTag } from '../../../../common/endpoint/service/artifacts/utils';
import { BaseValidator } from './base_validator';
import type { ExceptionItemLikeOptions } from '../types';
import {
  BY_POLICY_ARTIFACT_TAG_PREFIX,
  GLOBAL_ARTIFACT_TAG,
} from '../../../../common/endpoint/service/artifacts';

/**
 * Exposes all `protected` methods of `BaseValidator` by prefixing them with an underscore.
 */
export class BaseValidatorMock extends BaseValidator {
  _isItemByPolicy(item: ExceptionItemLikeOptions): boolean {
    return this.isItemByPolicy(item);
  }

  async _isAllowedToCreateArtifactsByPolicy(): Promise<boolean> {
    return this.isAllowedToCreateArtifactsByPolicy();
  }

  async _validateCanManageEndpointArtifacts(): Promise<void> {
    return this.validateCanManageEndpointArtifacts();
  }

  async _validateBasicData(item: ExceptionItemLikeOptions) {
    return this.validateBasicData(item);
  }

  _validateEntryValueCharacters(item: ExceptionItemLikeOptions): void {
    return this.validateEntryValueCharacters(item);
  }

  async _validateCanCreateByPolicyArtifacts(item: ExceptionItemLikeOptions): Promise<void> {
    return this.validateCanCreateByPolicyArtifacts(item);
  }

  async _validateByPolicyItem(
    item: ExceptionItemLikeOptions,
    currentItem?: ExceptionListItemSchema
  ): Promise<void> {
    return this.validateByPolicyItem(item, currentItem);
  }

  _wasByPolicyEffectScopeChanged(
    updatedItem: ExceptionItemLikeOptions,
    currentItem: Pick<ExceptionListItemSchema, 'tags'>
  ): boolean {
    return this.wasByPolicyEffectScopeChanged(updatedItem, currentItem);
  }

  _validateCreateOwnerSpaceIds(item: ExceptionItemLikeOptions): Promise<void> {
    return this.validateCreateOwnerSpaceIds(item);
  }

  _validateUpdateOwnerSpaceIds(
    updatedItem: Partial<Pick<ExceptionListItemSchema, 'tags'>>,
    currentItem: Pick<ExceptionListItemSchema, 'tags'>
  ): Promise<void> {
    return this.validateUpdateOwnerSpaceIds(updatedItem, currentItem);
  }

  _validateCanCreateGlobalArtifacts(item: ExceptionItemLikeOptions): Promise<void> {
    return this.validateCanCreateGlobalArtifacts(item);
  }

  _validateCanImportGlobalArtifacts(item: ExceptionItemLikeOptions): Promise<void> {
    return this.validateCanImportGlobalArtifacts(item);
  }

  _validateCanUpdateItemInActiveSpace(
    updatedItem: Partial<Pick<ExceptionListItemSchema, 'tags'>>,
    currentSavedItem: ExceptionListItemSchema
  ): Promise<void> {
    return this.validateCanUpdateItemInActiveSpace(updatedItem, currentSavedItem);
  }

  _validateCanDeleteItemInActiveSpace(currentSavedItem: ExceptionListItemSchema): Promise<void> {
    return this.validateCanDeleteItemInActiveSpace(currentSavedItem);
  }

  _validateCanReadItemInActiveSpace(currentSavedItem: ExceptionListItemSchema): Promise<void> {
    return this.validateCanReadItemInActiveSpace(currentSavedItem);
  }

  _validatePreImportItems(
    items: PromiseFromStreams,
    validator: (item: ExceptionItemLikeOptions) => Promise<void>
  ): Promise<void> {
    return this.validatePreImportItems(items, validator);
  }

  _validateImportOwnerSpaceIds(item: ExceptionItemLikeOptions): Promise<void> {
    return this.validateImportOwnerSpaceIds(item);
  }

  _isArtifactVisibleInCurrentSpace(
    ownerSpaceIds: string[],
    activeSpaceId: string,
    item: ExceptionItemLikeOptions
  ): Promise<boolean> {
    return this.isArtifactVisibleInCurrentSpace(ownerSpaceIds, activeSpaceId, item);
  }

  _removeInvalidPolicyIds(item: ExceptionItemLikeOptions): Promise<void> {
    return this.removeInvalidPolicyIds(item);
  }
}

export const createExceptionItemLikeOptionsMock = (
  overrides: Partial<ExceptionItemLikeOptions> = {}
): ExceptionItemLikeOptions => {
  return {
    ...listMock.getCreateExceptionListItemOptionsMock(),
    namespaceType: 'agnostic',
    osTypes: ['windows'],
    tags: [`${BY_POLICY_ARTIFACT_TAG_PREFIX}123`],
    ...overrides,
  };
};

export const createExceptionListItemMock = (
  overrides: Partial<ExceptionListItemSchema> = {}
): ExceptionListItemSchema => {
  return listMock.getExceptionListItemSchemaMock({
    namespace_type: 'agnostic',
    os_types: ['windows'],
    tags: [GLOBAL_ARTIFACT_TAG, buildSpaceOwnerIdTag(DEFAULT_SPACE_ID)],
    ...overrides,
  });
};
