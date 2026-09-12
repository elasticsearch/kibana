/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { KibanaRequest, Logger } from '@kbn/core/server';
import { schema } from '@kbn/config-schema';
import { isEqual } from 'lodash/fp';
import type { ExceptionListItemSchema } from '@kbn/securitysolution-io-ts-list-types';
import {
  OperatingSystem,
  hasControlCharacters,
  trimInputValues,
} from '@kbn/securitysolution-utils';

import { i18n } from '@kbn/i18n';
import {} from '@kbn/lists-plugin/server/services/exception_lists/exception_list_client_types';
import { groupBy } from 'lodash';
import type { PackagePolicy } from '@kbn/fleet-plugin/common';
import type { PromiseFromStreams } from '@kbn/lists-plugin/server/services/exception_lists/import_exception_list_and_items';
import { ExceptionItemImportError } from '@kbn/lists-plugin/server/exception_item_import_error';
import { stringify } from '../../../endpoint/utils/stringify';
import { ENDPOINT_AUTHZ_ERROR_MESSAGE } from '../../../endpoint/errors';
import {
  buildPerPolicyTag,
  getArtifactOwnerSpaceIds,
  isArtifactGlobal,
} from '../../../../common/endpoint/service/artifacts/utils';
import type { FeatureKeys } from '../../../endpoint/services';
import type { EndpointAuthz } from '../../../../common/endpoint/types/authz';
import type { EndpointAppContextService } from '../../../endpoint/endpoint_app_context_services';
import type { ExceptionItemLikeOptions } from '../types';
import { getEndpointAuthzInitialState } from '../../../../common/endpoint/service/authz';
import {
  getPolicyIdsFromArtifact,
  isArtifactByPolicy,
} from '../../../../common/endpoint/service/artifacts';
import { EndpointArtifactExceptionValidationError } from './errors';

const OWNER_SPACE_ID_TAG_MANAGEMENT_NOT_ALLOWED_MESSAGE = i18n.translate(
  'xpack.securitySolution.baseValidator.noGlobalArtifactAuthzApiMessage',
  {
    defaultMessage:
      'Management of "ownerSpaceId" tag requires global artifact management privilege',
  }
);

const IMPORTING_TO_OTHER_SPACE_NOT_ALLOWED_MESSAGE = i18n.translate(
  'xpack.securitySolution.baseValidator.importingToOtherSpaceNotAllowedMessage',
  {
    defaultMessage:
      "This artifact can't be imported because you don't have permission to manage artifacts in other spaces. Contact your administrator for access.",
  }
);

const GLOBAL_ARTIFACT_IMPORT_NOT_ALLOWED_MESSAGE = i18n.translate(
  'xpack.securitySolution.baseValidator.noGlobalArtifactImportMessage',
  {
    defaultMessage:
      "This artifact can't be imported because you don't have permission to manage global artifacts. Contact your administrator for access.",
  }
);

export const GLOBAL_ARTIFACT_MANAGEMENT_NOT_ALLOWED_MESSAGE = i18n.translate(
  'xpack.securitySolution.baseValidator.noGlobalArtifactManagementMessage',
  {
    defaultMessage:
      'Management of global artifacts requires additional privilege (global artifact management)',
  }
);

const IMPORTING_ARTIFACT_NOT_VISIBLE_IN_CURRENT_SPACE_NOT_ALLOWED_MESSAGE = i18n.translate(
  'xpack.securitySolution.baseValidator.importingArtifactNotVisibleInCurrentSpace',
  {
    defaultMessage:
      "This artifact can't be imported because it isn't visible in the current space. Try importing it from a matching space or a space with access to the related policy.",
  }
);

const IMPORTING_ARTIFACT_WITH_INVALID_OWNER_SPACE_ID = i18n.translate(
  'xpack.securitySolution.baseValidator.invalidOwnerSpaceId',
  {
    defaultMessage:
      "This artifact can't be imported because it belongs to a space you don't have access to. Update the artifact in its original space and try again.",
  }
);

const ITEM_CANNOT_BE_MANAGED_IN_CURRENT_SPACE_MESSAGE = (spaceIds: string[]): string =>
  i18n.translate('xpack.securitySolution.baseValidator.cannotManageItemInCurrentSpace', {
    defaultMessage: `Updates to this shared item can only be done from the following space {numberOfSpaces, plural, one {ID} other {IDs} }: {itemOwnerSpaces} (or by someone having global artifact management privilege)`,
    values: {
      numberOfSpaces: spaceIds.length,
      itemOwnerSpaces: spaceIds.join(', '),
    },
  });

interface EndpointArtifactEntryValue {
  field: string;
  type: string;
  value?: string | string[];
  entries?: EndpointArtifactEntryValue[];
}

export const BasicEndpointExceptionDataSchema = schema.object(
  {
    // must have a name
    name: schema.string({ minLength: 1, maxLength: 256 }),

    description: schema.maybe(schema.string({ minLength: 0, maxLength: 256, defaultValue: '' })),

    // We only support agnostic entries
    namespaceType: schema.literal('agnostic'),

    // only one OS per entry
    osTypes: schema.arrayOf(
      schema.oneOf([
        schema.literal(OperatingSystem.WINDOWS),
        schema.literal(OperatingSystem.LINUX),
        schema.literal(OperatingSystem.MAC),
      ]),
      { minSize: 1, maxSize: 1 }
    ),
  },
  // Because we are only validating some fields from the Exception Item, we set `unknowns` to `ignore` here
  { unknowns: 'ignore' }
);

/**
 * Provides base methods for doing validation that apply across endpoint exception entries
 */
export class BaseValidator {
  private readonly endpointAuthzPromise: ReturnType<EndpointAppContextService['getEndpointAuthz']>;
  protected readonly logger: Logger;

  constructor(
    protected readonly endpointAppContext: EndpointAppContextService,
    /**
     * Request is optional only because it needs to be optional in the Lists ExceptionListClient
     */
    private readonly request?: KibanaRequest
  ) {
    this.logger = endpointAppContext.createLogger(this.constructor.name ?? 'artifactBaseValidator');

    if (this.request) {
      this.endpointAuthzPromise = this.endpointAppContext.getEndpointAuthz(this.request);
    } else {
      this.endpointAuthzPromise = Promise.resolve(getEndpointAuthzInitialState());
    }
  }

  public notifyFeatureUsage(item: ExceptionItemLikeOptions, featureKey: FeatureKeys): void {
    if (
      (this.isItemByPolicy(item) && featureKey.endsWith('_BY_POLICY')) ||
      (!this.isItemByPolicy(item) && !featureKey.endsWith('_BY_POLICY'))
    ) {
      this.endpointAppContext.getFeatureUsageService().notifyUsage(featureKey);
    }
  }

  protected async validateHasPrivilege(privilege: keyof EndpointAuthz): Promise<void> {
    if (!(await this.endpointAuthzPromise)[privilege]) {
      throw new EndpointArtifactExceptionValidationError(ENDPOINT_AUTHZ_ERROR_MESSAGE, 403);
    }
  }

  protected isItemByPolicy(item: Partial<Pick<ExceptionListItemSchema, 'tags'>>): boolean {
    return isArtifactByPolicy(item as Pick<ExceptionListItemSchema, 'tags'>);
  }

  protected async isAllowedToCreateArtifactsByPolicy(): Promise<boolean> {
    return (await this.endpointAuthzPromise).canCreateArtifactsByPolicy;
  }

  protected async validateCanManageEndpointArtifacts(): Promise<void> {
    if (!(await this.endpointAuthzPromise).canAccessEndpointManagement) {
      throw new EndpointArtifactExceptionValidationError(ENDPOINT_AUTHZ_ERROR_MESSAGE, 403);
    }
  }

  protected async validateCanIsolateHosts(): Promise<void> {
    if (!(await this.endpointAuthzPromise).canIsolateHost) {
      throw new EndpointArtifactExceptionValidationError(ENDPOINT_AUTHZ_ERROR_MESSAGE, 403);
    }
  }

  /**
   * validates some basic common data that can be found across all endpoint exceptions
   * @param item
   * @protected
   */
  protected async validateBasicData(item: ExceptionItemLikeOptions) {
    try {
      BasicEndpointExceptionDataSchema.validate(item);
    } catch (error) {
      throw new EndpointArtifactExceptionValidationError(error.message);
    }
  }

  /**
   * Trims edge whitespace from `match`/`match_any`/`wildcard` entry values in place (the Endpoint
   * matches these literally) and rejects values that still contain control characters.
   */
  protected validateEntryValueCharacters(item: ExceptionItemLikeOptions): void {
    const controlCharacterFields = new Set<string>();

    const inspectEntries = (entries: EndpointArtifactEntryValue[]): void => {
      entries.forEach((entry) => {
        if (entry.type === 'nested') {
          inspectEntries(entry.entries ?? []);
          return;
        }

        if (!['match', 'match_any', 'wildcard'].includes(entry.type) || entry.value === undefined) {
          return;
        }

        entry.value = trimInputValues(entry.value);

        if (hasControlCharacters(entry.value)) {
          controlCharacterFields.add(entry.field);
        }
      });
    };

    inspectEntries(item.entries as EndpointArtifactEntryValue[]);

    if (controlCharacterFields.size) {
      throw new EndpointArtifactExceptionValidationError(
        i18n.translate(
          'xpack.securitySolution.endpointArtifactValidation.invalidEntryValuesErrorMessage',
          {
            defaultMessage: 'Invalid entry values: control characters in fields: {fields}',
            values: { fields: i18n.formatList('unit', [...controlCharacterFields]) },
          }
        )
      );
    }
  }

  protected async validateCanCreateByPolicyArtifacts(
    item: ExceptionItemLikeOptions
  ): Promise<void> {
    if (this.isItemByPolicy(item) && !(await this.isAllowedToCreateArtifactsByPolicy())) {
      throw new EndpointArtifactExceptionValidationError(
        'Your license level does not allow create/update of by policy artifacts',
        403
      );
    }
  }

  /**
   * Validates that by-policy artifacts is permitted and that each policy referenced in the item is valid
   * @protected
   */
  protected async validateByPolicyItem(
    item: ExceptionItemLikeOptions,
    /** Should be provided when an existing item is being updated. Will `undefined` on create flows */
    currentItem?: ExceptionListItemSchema
  ): Promise<void> {
    if (this.isItemByPolicy(item)) {
      const spaceId = this.getActiveSpaceId();
      const { packagePolicy, savedObjects } =
        this.endpointAppContext.getInternalFleetServices(spaceId);
      const policyIds = getPolicyIdsFromArtifact(item);
      const soClient = savedObjects.createInternalScopedSoClient({ spaceId });

      if (policyIds.length === 0) {
        return;
      }

      const policiesFromFleet: PackagePolicy[] =
        (await packagePolicy.getByIDs(soClient, policyIds, {
          ignoreMissing: true,
        })) ?? [];

      this.logger.debug(
        () =>
          `Lookup of policy ids:\n[${policyIds.join(
            ' | '
          )}] for space [${spaceId}] returned:\n${stringify(
            policiesFromFleet.map((policy) => ({
              id: policy.id,
              name: policy.name,
              spaceIds: policy.spaceIds,
            }))
          )}`
      );

      let invalidPolicyIds: string[] = policyIds.filter(
        (policyId) => !policiesFromFleet.some((policy) => policyId === policy.id)
      );

      if (invalidPolicyIds.length > 0 && currentItem) {
        const currentItemPolicyIds = getPolicyIdsFromArtifact(currentItem);

        // Check to see if the invalid policy IDs are ones that the current item (pre-update) already has,
        // which implies that they are valid, but not visible in the active space.
        invalidPolicyIds = invalidPolicyIds.filter((id) => !currentItemPolicyIds.includes(id));
      }

      if (invalidPolicyIds.length) {
        throw new EndpointArtifactExceptionValidationError(
          `invalid policy ids: ${invalidPolicyIds.join(', ')}`
        );
      }
    }
  }

  /**
   * If the item being updated is `by policy`, method validates if anything was changes in regard to
   * the effected scope of the by policy settings.
   *
   * @param updatedItem
   * @param currentItem
   * @protected
   */
  protected wasByPolicyEffectScopeChanged(
    updatedItem: ExceptionItemLikeOptions,
    currentItem: Pick<ExceptionListItemSchema, 'tags'>
  ): boolean {
    // if global, then return. Nothing to validate and setting the trusted app to global is allowed
    if (!this.isItemByPolicy(updatedItem)) {
      return false;
    }

    if (updatedItem.tags) {
      return !isEqual(
        getPolicyIdsFromArtifact({ tags: updatedItem.tags }),
        getPolicyIdsFromArtifact(currentItem)
      );
    }

    return false;
  }

  protected async validateUpdateOwnerSpaceIds(
    updatedItem: Partial<Pick<ExceptionListItemSchema, 'tags'>>,
    currentItem: Pick<ExceptionListItemSchema, 'tags'>
  ): Promise<void> {
    if (
      this.wasOwnerSpaceIdTagsChanged(updatedItem, currentItem) &&
      !(await this.endpointAuthzPromise).canManageGlobalArtifacts
    ) {
      throw new EndpointArtifactExceptionValidationError(
        `${ENDPOINT_AUTHZ_ERROR_MESSAGE}. ${OWNER_SPACE_ID_TAG_MANAGEMENT_NOT_ALLOWED_MESSAGE}`,
        403
      );
    }
  }

  protected async validateCreateOwnerSpaceIds(item: ExceptionItemLikeOptions): Promise<void> {
    if (item.tags && item.tags.length > 0) {
      if ((await this.endpointAuthzPromise).canManageGlobalArtifacts) {
        return;
      }

      const ownerSpaceIds = getArtifactOwnerSpaceIds(item);
      const activeSpaceId = this.getActiveSpaceId();

      if (ownerSpaceIds.some((spaceId) => spaceId !== activeSpaceId)) {
        throw new EndpointArtifactExceptionValidationError(
          `${ENDPOINT_AUTHZ_ERROR_MESSAGE}. ${OWNER_SPACE_ID_TAG_MANAGEMENT_NOT_ALLOWED_MESSAGE}`,
          403
        );
      }
    }
  }

  protected async validateImportOwnerSpaceIds(item: ExceptionItemLikeOptions): Promise<void> {
    if (item.tags && item.tags.length > 0) {
      const ownerSpaceIds = getArtifactOwnerSpaceIds(item);
      const activeSpaceId = this.getActiveSpaceId();

      if ((await this.endpointAuthzPromise).canManageGlobalArtifacts) {
        await this.validateSpacesAreAccessible(ownerSpaceIds);

        if (!(await this.isArtifactVisibleInCurrentSpace(ownerSpaceIds, activeSpaceId, item))) {
          throw new EndpointArtifactExceptionValidationError(
            `${ENDPOINT_AUTHZ_ERROR_MESSAGE}. ${IMPORTING_ARTIFACT_NOT_VISIBLE_IN_CURRENT_SPACE_NOT_ALLOWED_MESSAGE}`,
            403
          );
        }

        return;
      }

      if (ownerSpaceIds.some((spaceId) => spaceId !== activeSpaceId)) {
        throw new EndpointArtifactExceptionValidationError(
          `${ENDPOINT_AUTHZ_ERROR_MESSAGE}. ${IMPORTING_TO_OTHER_SPACE_NOT_ALLOWED_MESSAGE}`,
          403
        );
      }
    }
  }

  private async validateSpacesAreAccessible(ownerSpaceIds: string[]) {
    const accessibleSpacesIds = new Set(await this.getAccessibleSpaceIds());
    const invalidSpaceIds = ownerSpaceIds.filter((spaceId) => !accessibleSpacesIds.has(spaceId));

    if (invalidSpaceIds.length > 0) {
      throw new EndpointArtifactExceptionValidationError(
        IMPORTING_ARTIFACT_WITH_INVALID_OWNER_SPACE_ID,
        403
      );
    }
  }

  protected async isArtifactVisibleInCurrentSpace(
    ownerSpaceIds: string[],
    activeSpaceId: string,
    item: ExceptionItemLikeOptions
  ): Promise<boolean> {
    if (ownerSpaceIds.includes(activeSpaceId) || isArtifactGlobal(item)) {
      return true;
    }

    const assignedPolicyIds = getPolicyIdsFromArtifact(item);
    if (assignedPolicyIds.length === 0) {
      // not assigned to any policy while existing in another space, so not visible in current space
      return false;
    }

    const { packagePolicy, savedObjects } =
      this.endpointAppContext.getInternalFleetServices(activeSpaceId);

    const soClient = savedObjects.createInternalScopedSoClient({ spaceId: activeSpaceId });

    const assignedPackagePoliciesVisibleInCurrentSpace = await packagePolicy.getByIDs(
      soClient,
      assignedPolicyIds,
      { ignoreMissing: true }
    );

    if (assignedPackagePoliciesVisibleInCurrentSpace.length > 0) {
      // assigned to at least one policy visible in current space
      return true;
    }

    return false;
  }

  protected wasOwnerSpaceIdTagsChanged(
    updatedItem: Partial<Pick<ExceptionListItemSchema, 'tags'>>,
    currentItem: Pick<ExceptionListItemSchema, 'tags'>
  ): boolean {
    return !isEqual(getArtifactOwnerSpaceIds(updatedItem), getArtifactOwnerSpaceIds(currentItem));
  }

  protected getActiveSpaceId(): string {
    if (!this.request) {
      throw new EndpointArtifactExceptionValidationError(
        'Unable to determine space id. Missing HTTP Request object',
        500
      );
    }

    return this.endpointAppContext.getActiveSpaceId(this.request);
  }

  protected async getAccessibleSpaceIds(): Promise<string[]> {
    if (!this.request) {
      throw new EndpointArtifactExceptionValidationError(
        'Unable to determine space id. Missing HTTP Request object',
        500
      );
    }

    const accessibleSpaces = await this.endpointAppContext.getAccessibleSpaces(this.request);

    return accessibleSpaces.map((space) => space.id);
  }

  protected async validateCanCreateGlobalArtifacts(item: ExceptionItemLikeOptions): Promise<void> {
    if (!this.isItemByPolicy(item) && !(await this.endpointAuthzPromise).canManageGlobalArtifacts) {
      throw new EndpointArtifactExceptionValidationError(
        `${ENDPOINT_AUTHZ_ERROR_MESSAGE}. ${GLOBAL_ARTIFACT_MANAGEMENT_NOT_ALLOWED_MESSAGE}`,
        403
      );
    }
  }

  protected async validateCanImportGlobalArtifacts(item: ExceptionItemLikeOptions): Promise<void> {
    if (!this.isItemByPolicy(item) && !(await this.endpointAuthzPromise).canManageGlobalArtifacts) {
      throw new EndpointArtifactExceptionValidationError(
        `${ENDPOINT_AUTHZ_ERROR_MESSAGE}. ${GLOBAL_ARTIFACT_IMPORT_NOT_ALLOWED_MESSAGE}`,
        403
      );
    }
  }

  protected async validateCanUpdateItemInActiveSpace(
    updatedItem: Partial<Pick<ExceptionListItemSchema, 'tags'>>,
    currentSavedItem: ExceptionListItemSchema
  ): Promise<void> {
    // Those with global artifact management privilege can do it all
    if ((await this.endpointAuthzPromise).canManageGlobalArtifacts) {
      return;
    }

    // If either the updated item or the saved item is a global artifact, then
    // error out - user needs global artifact management privilege
    if (!this.isItemByPolicy(updatedItem) || !this.isItemByPolicy(currentSavedItem)) {
      throw new EndpointArtifactExceptionValidationError(
        `${ENDPOINT_AUTHZ_ERROR_MESSAGE}. ${GLOBAL_ARTIFACT_MANAGEMENT_NOT_ALLOWED_MESSAGE}`,
        403
      );
    }

    const itemOwnerSpaces = getArtifactOwnerSpaceIds(currentSavedItem);

    // Per-space items can only be managed from one of the `ownerSpaceId`'s
    if (!itemOwnerSpaces.includes(this.getActiveSpaceId())) {
      throw new EndpointArtifactExceptionValidationError(
        ITEM_CANNOT_BE_MANAGED_IN_CURRENT_SPACE_MESSAGE(itemOwnerSpaces),
        403
      );
    }
  }

  protected async validateCanDeleteItemInActiveSpace(
    currentSavedItem: ExceptionListItemSchema
  ): Promise<void> {
    // Those with global artifact management privilege can do it all
    if ((await this.endpointAuthzPromise).canManageGlobalArtifacts) {
      return;
    }

    // If item is a global artifact then error - user must have global artifact management privilege
    if (!this.isItemByPolicy(currentSavedItem)) {
      throw new EndpointArtifactExceptionValidationError(
        `${ENDPOINT_AUTHZ_ERROR_MESSAGE}. ${GLOBAL_ARTIFACT_MANAGEMENT_NOT_ALLOWED_MESSAGE}`,
        403
      );
    }

    const itemOwnerSpaces = getArtifactOwnerSpaceIds(currentSavedItem);

    // Per-space items can only be deleted from one of the `ownerSpaceId`'s
    if (!itemOwnerSpaces.includes(this.getActiveSpaceId())) {
      throw new EndpointArtifactExceptionValidationError(
        ITEM_CANNOT_BE_MANAGED_IN_CURRENT_SPACE_MESSAGE(itemOwnerSpaces),
        403
      );
    }
  }

  protected async validateCanReadItemInActiveSpace(
    currentSavedItem: ExceptionListItemSchema
  ): Promise<void> {
    this.logger.debug(() => `Validating if can read single item:\n${stringify(currentSavedItem)}`);

    // Everyone can read global artifacts and those with global artifact management privilege can do it all
    if (
      isArtifactGlobal(currentSavedItem) ||
      (await this.endpointAuthzPromise).canManageGlobalArtifacts
    ) {
      return;
    }

    const activeSpaceId = this.getActiveSpaceId();
    const ownerSpaceIds = getArtifactOwnerSpaceIds(currentSavedItem);
    const policyIds = getPolicyIdsFromArtifact(currentSavedItem);

    // If per-policy item is not assigned to any policy (dangling artifact) and this artifact
    // is owned by the active space, then allow read.
    if (policyIds.length === 0 && ownerSpaceIds.includes(activeSpaceId)) {
      return;
    }

    // if at least one policy is visible in active space, then allow read
    if (policyIds.length > 0) {
      const { packagePolicy, savedObjects } =
        this.endpointAppContext.getInternalFleetServices(activeSpaceId);
      const soClient = savedObjects.createInternalScopedSoClient({ spaceId: activeSpaceId });
      const policiesFromFleet = await packagePolicy
        .getByIDs(soClient, policyIds, {
          ignoreMissing: true,
        })
        .then((packagePolicies) => {
          this.logger.debug(
            () =>
              `Lookup of policy ids:[${policyIds.join(
                ' | '
              )}]\nvia fleet for space ID [${activeSpaceId}] returned:\n${stringify(
                (packagePolicies ?? []).map((policy) => ({
                  id: policy.id,
                  name: policy.name,
                  spaceIds: policy.spaceIds,
                }))
              )}`
          );

          return groupBy(packagePolicies ?? [], 'id');
        });

      if (policyIds.some((policyId) => Boolean(policiesFromFleet[policyId]))) {
        return;
      }
    }

    this.logger.debug(
      () => `item can not be read from space [${activeSpaceId}]:\n${stringify(currentSavedItem)}`
    );

    throw new EndpointArtifactExceptionValidationError(
      `Item not found in space [${activeSpaceId}]`,
      404
    );
  }

  protected async validatePreImportItems(
    items: PromiseFromStreams,
    validator: (item: ExceptionItemLikeOptions) => Promise<void>
  ): Promise<void> {
    const validatedItems: PromiseFromStreams['items'] = [];

    for (const _item of items.items) {
      if (_item instanceof Error) {
        validatedItems.push(_item);
      } else {
        const item: ExceptionItemLikeOptions = {
          name: _item.name,
          description: _item.description,
          entries: _item.entries,
          osTypes: _item.os_types,
          tags: _item.tags,
          namespaceType: _item.namespace_type,
          comments: _item.comments,
          listId: _item.list_id,
        };

        try {
          await validator(item);

          validatedItems.push({
            ..._item,

            name: item.name,
            description: item.description,
            entries: item.entries,
            os_types: item.osTypes,
            tags: item.tags,
            namespace_type: item.namespaceType,
            comments: item.comments,
            list_id: item.listId ?? _item.list_id,
          });
        } catch (error) {
          validatedItems.push(new ExceptionItemImportError(error, _item.list_id, _item.item_id));
        }
      }
    }

    items.items = validatedItems;
  }

  protected async removeInvalidPolicyIds(item: ExceptionItemLikeOptions): Promise<void> {
    if (this.isItemByPolicy(item)) {
      const { packagePolicy, savedObjects } = this.endpointAppContext.getInternalFleetServices();
      const policyIdsInArtifact = getPolicyIdsFromArtifact(item);
      const soClient = savedObjects.createInternalUnscopedSoClient();

      if (policyIdsInArtifact.length === 0) {
        return;
      }

      const matchingPoliciesFromAllSpaces: PackagePolicy[] =
        (await packagePolicy.getByIDs(soClient, policyIdsInArtifact, {
          ignoreMissing: true,
          spaceIds: ['*'],
        })) ?? [];

      const matchingPolicyIdsFromAllSpaces = new Set<string>();
      matchingPoliciesFromAllSpaces.forEach(({ id }) => matchingPolicyIdsFromAllSpaces.add(id));

      const invalidPolicyIds: string[] = policyIdsInArtifact.filter(
        (policyId) => !matchingPolicyIdsFromAllSpaces.has(policyId)
      );

      const invalidPolicyIdTags = new Set<string>();
      invalidPolicyIds.forEach((invalidPolicyId) =>
        invalidPolicyIdTags.add(buildPerPolicyTag(invalidPolicyId))
      );

      if (invalidPolicyIdTags.size > 0) {
        item.tags = item.tags.filter((tag) => !invalidPolicyIdTags.has(tag));

        item.comments = [
          ...(item.comments ?? []),
          {
            comment: `Please check policy assignment. The following policy IDs have been removed from artifact during import:\n${invalidPolicyIds
              .map((id) => `- "${id}"`)
              .join('\n')}`,
          },
        ];
      }
    }
  }
}
