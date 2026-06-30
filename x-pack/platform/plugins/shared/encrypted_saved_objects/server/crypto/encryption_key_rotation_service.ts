/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  ISavedObjectTypeRegistry,
  KibanaRequest,
  Logger,
  SavedObject,
  SavedObjectsBulkUpdateObject,
  StartServicesAccessor,
} from '@kbn/core/server';
import { ENCRYPTION_EXTENSION_ID, isSavedObjectErrorResult } from '@kbn/core-saved-objects-server';
import { ALL_NAMESPACES_STRING } from '@kbn/core-saved-objects-utils-server';
import type { AuthenticatedUser } from '@kbn/core-security-common';
import type { PublicMethodsOf } from '@kbn/utility-types';

import type { EncryptedSavedObjectsService } from './encrypted_saved_objects_service';
import { EncryptionError } from './encryption_error';
import { getDescriptorNamespace } from '../saved_objects/get_descriptor_namespace';

interface EncryptionKeyRotationServiceOptions {
  logger: Logger;
  service: PublicMethodsOf<EncryptedSavedObjectsService>;
  getStartServices: StartServicesAccessor;
}

interface EncryptionKeyRotationParams {
  /**
   * The maximum number of the objects we fetch and process in one iteration.
   */
  batchSize: number;

  /**
   * Optionally allows to limit key rotation to only specified Saved Object type.
   */
  type?: string;
}

interface EncryptionKeyRotationResult {
  /**
   * The total number of the Saved Objects encrypted by the Encrypted Saved Objects plugin.
   */
  total: number;

  /**
   * The number of the Saved Objects that were still encrypted with one of the secondary encryption
   * keys and were successfully re-encrypted with the primary key.
   */
  successful: number;

  /**
   * The number of the Saved Objects that were still encrypted with one of the secondary encryption
   * keys that we failed to re-encrypt with the primary key.
   */
  failed: number;
}

/**
 * Service that deals with encryption key rotation matters.
 */
export class EncryptionKeyRotationService {
  constructor(private readonly options: EncryptionKeyRotationServiceOptions) {}

  public async rotate(
    request: KibanaRequest,
    { batchSize, type }: EncryptionKeyRotationParams
  ): Promise<EncryptionKeyRotationResult> {
    const [{ security, savedObjects }] = await this.options.getStartServices();
    const typeRegistry = savedObjects.getTypeRegistry();

    // We need to retrieve all SavedObject types which have encrypted attributes, specifically
    // collecting those that are hidden as they are ignored by the Saved Objects client by default.
    this.options.logger.debug('Retrieving Saved Object types that require encryption.');
    const registeredSavedObjectTypes = [];
    const registeredHiddenSavedObjectTypes = [];
    for (const knownType of typeRegistry.getAllTypes()) {
      if (this.options.service.isRegistered(knownType.name) && (!type || knownType.name === type)) {
        registeredSavedObjectTypes.push(knownType.name);

        if (knownType.hidden) {
          registeredHiddenSavedObjectTypes.push(knownType.name);
        }
      }
    }

    const result = { total: 0, successful: 0, failed: 0 };
    if (registeredSavedObjectTypes.length === 0) {
      this.options.logger.info(
        type
          ? `Saved Object type "${type}" is not registered, encryption key rotation is not needed.`
          : 'There are no registered Saved Object types that can have encrypted attributes, encryption key rotation is not needed.'
      );
      return result;
    }

    this.options.logger.info(
      `Saved Objects with the following types [${registeredSavedObjectTypes}] will be processed.`
    );

    // We need two separate Saved Objects clients for the retrieval and update. For retrieval we
    // don't want to have Encrypted Saved Objects wrapper so that it doesn't strip encrypted
    // attributes. But for the update we want to have it so that it automatically re-encrypts
    // attributes with the new primary encryption key.
    const user = security.authc.getCurrentUser(request) ?? undefined;
    const retrieveClient = savedObjects.getScopedClient(request, {
      includedHiddenTypes: registeredHiddenSavedObjectTypes,
      excludedExtensions: [ENCRYPTION_EXTENSION_ID],
    });
    const updateClient = savedObjects.getScopedClient(request, {
      includedHiddenTypes: registeredHiddenSavedObjectTypes,
    });

    // Keeps track of object IDs that have been processed already.
    const processedObjectIDs = new Set<string>();

    // Until we get scroll/search_after support in Saved Objects client we have to retrieve as much objects as allowed
    // by the `batchSize` parameter. Instead of using paging functionality (size/from  or page/perPage parameters) that
    // has certain performance issues and is also limited by the maximum result window setting on .kibana index
    // (10,000 by default) we always fetch the first page of the results sorted by the `updated_at` field. This way we
    // can prioritize "old" objects that have a higher chance to have been encrypted with the old encryption keys, since
    // all newly created or updated objects are always encrypted with the current primary key. Re-encryption of the
    // "old" objects with the primary key implicitly bumps up their `updated_at` field so that these objects won't be
    // included into the first page of the results during next iteration. Additionally we track IDs of all processed
    // objects so that eventually we can detect that first page consists of only objects encrypted with the current
    // primary key and stop iterating.
    //
    // LIMITATION: if we have a lot of "old" objects encrypted with the _unknown_ encryption key it may either
    // significantly slow down rotation or prevent it from happening completely since such objects will be included into
    // every batch we fetch and if their number is equal to or greater than `batchSize` we won't be able to process any
    // object. Another and more complex case when we can be hit by this limitation is when users have multiple Kibana
    // instances configured with different primary encryption keys, these time even "new" objects may require rotation,
    // but they may be included into 2+ page of the results. We can potentially detect such cases and issue a warning,
    // but it's not an easy task: if we detect a case when none of the objects from the very first batch cannot be
    // decrypted with the decryption only keys we'll need to check how many of them can be decrypted at all using all
    // available keys including the current primary one.
    //
    // Also theoretically if `batchSize` is less than `index.max_result_window` we could try to rely on the paging
    // functionality and switch to the second page, but the issue here is that objects can be deleted in the meantime
    // so that unprocessed objects may get into the first page and we'll miss them. We can of course oscillate between
    // the first and the second pages or do multiple rotation passes, but it'd complicate code significantly.
    let batch = 0;
    let maxBatches = 0;
    while (true) {
      this.options.logger.debug(`Fetching ${batchSize} objects (batch #${batch}).`);
      const savedObjectsToDecrypt = await retrieveClient.find({
        type: registeredSavedObjectTypes,
        perPage: batchSize,
        namespaces: ['*'],
        sortField: 'updated_at',
        sortOrder: 'asc',
      });

      // We use `total` only from the first batch just as an approximate indicator for the consumer since total number
      // can change from batch to batch, but it won't affect the actual processing logic.
      if (batch === 0) {
        this.options.logger.debug(`Found ${savedObjectsToDecrypt.total} objects.`);
        result.total = savedObjectsToDecrypt.total;
        // Since we process live data there is a theoretical chance that we may be getting new
        // objects in every batch effectively making this loop infinite. To prevent this we want to
        // limit a number of batches we process during single rotation request giving enough room
        // for the Saved Objects occasionally created during rotation.
        maxBatches = Math.ceil((savedObjectsToDecrypt.total * 2) / batchSize);
      }

      this.options.logger.debug(
        `Decrypting ${savedObjectsToDecrypt.saved_objects.length} objects (batch #${batch}).`
      );
      const savedObjectsToEncrypt = await this.getSavedObjectsToReEncrypt(
        savedObjectsToDecrypt.saved_objects,
        processedObjectIDs,
        typeRegistry,
        user
      );
      if (savedObjectsToEncrypt.length === 0) {
        break;
      }

      this.options.logger.debug(
        `Re-encrypting ${savedObjectsToEncrypt.length} objects (batch #${batch}).`
      );
      try {
        const succeeded = (
          await updateClient.bulkUpdate(savedObjectsToEncrypt)
        ).saved_objects.filter((savedObject) => !isSavedObjectErrorResult(savedObject)).length;

        this.options.logger.debug(
          `Successfully re-encrypted ${succeeded} out of ${savedObjectsToEncrypt.length} objects (batch #${batch}).`
        );

        result.successful += succeeded;
        result.failed += savedObjectsToEncrypt.length - succeeded;
      } catch (err) {
        this.options.logger.error(
          `Failed to re-encrypt saved objects (batch #${batch}): ${err.message}`
        );
        result.failed += savedObjectsToEncrypt.length;
      }

      if (savedObjectsToDecrypt.total <= batchSize || ++batch >= maxBatches) {
        break;
      }
    }

    this.options.logger.info(
      `Encryption key rotation is completed. ${result.successful} objects out of ${result.total} were successfully re-encrypted with the primary encryption key and ${result.failed} objects failed.`
    );

    return result;
  }

  /**
   * Takes a list of Saved Objects and tries to decrypt their attributes with the secondary encryption
   * keys, silently skipping those that cannot be decrypted. The objects that were decrypted with the
   * decryption-only keys will be returned and grouped by the namespace.
   * @param savedObjects Saved Objects to decrypt attributes for.
   * @param processedObjectIDs Set of Saved Object IDs that were already processed.
   * @param typeRegistry Saved Objects type registry.
   * @param user The user that initiated decryption.
   */
  private async getSavedObjectsToReEncrypt(
    savedObjects: SavedObject[],
    processedObjectIDs: Set<string>,
    typeRegistry: ISavedObjectTypeRegistry,
    user?: AuthenticatedUser
  ) {
    const decryptedSavedObjects: SavedObjectsBulkUpdateObject[] = [];
    for (const savedObject of savedObjects) {
      // We shouldn't process objects that we already processed during previous iterations.
      if (processedObjectIDs.has(savedObject.id)) {
        continue;
      } else {
        processedObjectIDs.add(savedObject.id);
      }

      let decryptedAttributes;
      try {
        decryptedAttributes = await this.options.service.decryptAttributes(
          {
            type: savedObject.type,
            id: savedObject.id,
            namespace: getDescriptorNamespace(
              typeRegistry,
              savedObject.type,
              savedObject.namespaces
            ),
          },
          savedObject.attributes as Record<string, unknown>,
          { omitPrimaryEncryptionKey: true, user }
        );
      } catch (err) {
        if (!(err instanceof EncryptionError)) {
          throw err;
        }

        continue;
      }

      const firstNamespace = savedObject.namespaces?.[0];

      decryptedSavedObjects.push({
        ...savedObject,
        attributes: decryptedAttributes,
        // The optional object namespace for `bulkUpdate` is used to affect objects outside of the current space
        // '*' is an invalid option, and if the object exists in all spaces, we don't need to set the namespace
        namespace: firstNamespace !== ALL_NAMESPACES_STRING ? firstNamespace : undefined,
      });
    }

    return decryptedSavedObjects;
  }
}
