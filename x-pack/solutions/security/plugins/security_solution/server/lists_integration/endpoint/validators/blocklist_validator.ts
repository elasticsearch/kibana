/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { cloneDeep, uniq } from 'lodash';
import type { Type, TypeOf } from '@kbn/config-schema';
import { schema } from '@kbn/config-schema';
import type { ExceptionListItemSchema } from '@kbn/securitysolution-io-ts-list-types';
import { OperatingSystem } from '@kbn/securitysolution-utils';
import type {
  CreateExceptionListItemOptions,
  UpdateExceptionListItemOptions,
} from '@kbn/lists-plugin/server';
import { ENDPOINT_ARTIFACT_LISTS } from '@kbn/securitysolution-list-constants';
import type { PromiseFromStreams } from '@kbn/lists-plugin/server/services/exception_lists/import_exception_list_and_items';
import { BaseValidator } from './base_validator';
import type { ExceptionItemLikeOptions } from '../types';
import { isValidHash } from '../../../../common/endpoint/service/artifacts/validations';
import { EndpointArtifactExceptionValidationError } from './errors';
import { ENTRY_VALUE_MAX_LENGTH } from './constants';

const allowedHashes: Readonly<string[]> = ['file.hash.md5', 'file.hash.sha1', 'file.hash.sha256'];
const allowedFilePaths: Readonly<string[]> = ['file.path', 'file.path.caseless'];

const FileHashField = schema.oneOf(
  allowedHashes.map((hash) => schema.literal(hash)) as [Type<string>]
);

const FilePath = schema.oneOf(
  allowedFilePaths.map((path) => schema.literal(path)) as [Type<string>]
);

const FileCodeSigner = schema.literal('file.Ext.code_signature');

const ConditionEntryTypeSchema = schema.literal('match_any');
const ConditionEntryOperatorSchema = schema.literal('included');

type ConditionEntryFieldAllowedType =
  | TypeOf<typeof FileHashField>
  | TypeOf<typeof FilePath>
  | TypeOf<typeof FileCodeSigner>;

type BlocklistConditionEntry =
  | {
      field: ConditionEntryFieldAllowedType;
      type: 'match_any' | 'match';
      operator: 'included';
      value: string[] | string;
    }
  | TypeOf<typeof WindowsSignerEntrySchema>;

/*
 * A generic Entry schema to be used for a specific entry schema depending on the OS
 */
const CommonEntrySchema = {
  field: schema.oneOf([FileHashField, FilePath]),
  type: ConditionEntryTypeSchema,
  operator: ConditionEntryOperatorSchema,
  // If field === HASH then validate hash with custom method, else validate string with minLength = 1
  value: schema.conditional(
    schema.siblingRef('field'),
    FileHashField,
    schema.arrayOf(
      schema.string({
        maxLength: ENTRY_VALUE_MAX_LENGTH,
        validate: (hash: string) =>
          isValidHash(hash) ? undefined : `invalid hash value [${hash}]`,
      }),
      { minSize: 1, maxSize: 2000 }
    ),
    schema.conditional(
      schema.siblingRef('field'),
      FilePath,
      schema.arrayOf(
        schema.string({
          maxLength: ENTRY_VALUE_MAX_LENGTH,
          validate: (pathValue: string) =>
            pathValue.length > 0 ? undefined : `invalid path value [${pathValue}]`,
        }),
        { minSize: 1, maxSize: 2000 }
      ),
      schema.arrayOf(
        schema.string({
          maxLength: ENTRY_VALUE_MAX_LENGTH,
          validate: (signerValue: string) =>
            signerValue.length > 0 ? undefined : `invalid signer value [${signerValue}]`,
        }),
        { minSize: 1, maxSize: 2000 }
      )
    )
  ),
};

// Windows Signer entries use a Nested field that checks to ensure
// that the certificate is trusted
const WindowsSignerEntrySchema = schema.object({
  type: schema.literal('nested'),
  field: FileCodeSigner,
  entries: schema.arrayOf(
    schema.object({
      field: schema.literal('subject_name'),
      value: schema.conditional(
        schema.siblingRef('type'),
        schema.literal('match'),
        schema.string({ minLength: 1, maxLength: ENTRY_VALUE_MAX_LENGTH }),
        schema.arrayOf(schema.string({ minLength: 1, maxLength: ENTRY_VALUE_MAX_LENGTH }), {
          maxSize: 2000,
        })
      ),
      type: schema.oneOf([schema.literal('match'), schema.literal('match_any')]),
      operator: schema.literal('included'),
    }),
    { minSize: 1, maxSize: 250 }
  ),
});

const WindowsEntrySchema = schema.oneOf([
  WindowsSignerEntrySchema,
  schema.object({
    ...CommonEntrySchema,
    field: schema.oneOf([FileHashField, FilePath]),
  }),
]);

const LinuxEntrySchema = schema.object({
  ...CommonEntrySchema,
});

const MacEntrySchema = schema.object({
  ...CommonEntrySchema,
});

// Hash entries validator method.
const hashEntriesValidation = (entries: BlocklistConditionEntry[]) => {
  const currentHashes = entries.map((entry) => entry.field);
  // If there are more hashes than allowed (three) then return an error
  if (currentHashes.length > allowedHashes.length) {
    const allowedHashesMessage = allowedHashes
      .map((hash) => hash.replace('file.hash.', ''))
      .join(',');
    return `There are more hash types than allowed [${allowedHashesMessage}]`;
  }

  const hashesCount: { [key: string]: boolean } = {};
  const invalidHash: string[] = [];

  // Check hash entries individually
  currentHashes.forEach((hash) => {
    if (!allowedHashes.includes(hash)) invalidHash.push(hash);
    hashesCount[hash] = true;
  });

  // There is an entry with an invalid hash type
  if (invalidHash.length) {
    return `There are some invalid fields for hash type: ${invalidHash.join(',')}`;
  }
};

// Validate there is only one entry when signer or path and the allowed entries for hashes
const entriesSchemaOptions = {
  minSize: 1,
  maxSize: 250,
  validate(entries: BlocklistConditionEntry[]) {
    if (allowedHashes.includes(entries[0].field)) {
      return hashEntriesValidation(entries);
    } else {
      if (entries.length > 1) {
        return 'Only one entry is allowed when not using hash field type';
      }
    }
  },
};

/*
 * Entities array schema depending on Os type using schema.conditional.
 * If OS === WINDOWS then use Windows schema,
 * else if OS === LINUX then use Linux schema,
 * else use Mac schema
 *
 * The validate function checks there is only one item for entries excepts for hash
 */
const EntriesSchema = schema.conditional(
  schema.contextRef('os'),
  OperatingSystem.WINDOWS,
  schema.arrayOf(WindowsEntrySchema, entriesSchemaOptions),
  schema.conditional(
    schema.contextRef('os'),
    OperatingSystem.LINUX,
    schema.arrayOf(LinuxEntrySchema, entriesSchemaOptions),
    schema.arrayOf(MacEntrySchema, entriesSchemaOptions)
  )
);

/**
 * Schema to validate Blocklist data for create and update.
 * When called, it must be given an `context` with a `os` property set
 *
 * @example
 *
 * BlocklistDataSchema.validate(item, { os: 'windows' });
 */
const BlocklistDataSchema = schema.object(
  {
    entries: EntriesSchema,
  },

  // Because we are only validating some fields from the Exception Item, we set `unknowns` to `ignore` here
  { unknowns: 'ignore' }
);

function removeDuplicateEntryValues(entries: BlocklistConditionEntry[]): BlocklistConditionEntry[] {
  return entries.map((entry) => {
    const nextEntry = cloneDeep(entry);

    if (nextEntry.type === 'match_any') {
      nextEntry.value = uniq(nextEntry.value);
    } else if (nextEntry.type === 'nested') {
      removeDuplicateEntryValues(nextEntry.entries);
    }

    return nextEntry;
  });
}

export class BlocklistValidator extends BaseValidator {
  static isBlocklist(item: { listId: string }): boolean {
    return item.listId === ENDPOINT_ARTIFACT_LISTS.blocklists.id;
  }

  protected async validateHasWritePrivilege(): Promise<void> {
    return super.validateHasPrivilege('canWriteBlocklist');
  }

  protected async validateHasReadPrivilege(): Promise<void> {
    return super.validateHasPrivilege('canReadBlocklist');
  }

  async validatePreImport(items: PromiseFromStreams): Promise<void> {
    await this.validateHasWritePrivilege();

    await this.validatePreImportItems(items, async (item) => {
      // import specific validations
      await this.validateImportOwnerSpaceIds(item); // instead of validateCreateOwnerSpaceIds
      await this.validateCanImportGlobalArtifacts(item); // instead of validateCanCreateGlobalArtifacts
      await this.removeInvalidPolicyIds(item); // instead of validateByPolicyItem

      // usual validators from pre-create
      this.validateEntryValueCharacters(item); // trims first, so dedup sees normalized values
      (item.entries as BlocklistConditionEntry[]) = removeDuplicateEntryValues(
        item.entries as BlocklistConditionEntry[]
      );
      await this.validateBlocklistData(item);
      await this.validateCanCreateByPolicyArtifacts(item);
    });
  }

  async validatePreCreateItem(
    item: CreateExceptionListItemOptions
  ): Promise<CreateExceptionListItemOptions> {
    await this.validateHasWritePrivilege();

    this.validateEntryValueCharacters(item); // trims first, so dedup sees normalized values
    (item.entries as BlocklistConditionEntry[]) = removeDuplicateEntryValues(
      item.entries as BlocklistConditionEntry[]
    );

    await this.validateBlocklistData(item);
    await this.validateCanCreateByPolicyArtifacts(item);
    await this.validateByPolicyItem(item);
    await this.validateCanCreateGlobalArtifacts(item);
    await this.validateCreateOwnerSpaceIds(item);

    return item;
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

  async validatePreUpdateItem(
    _updatedItem: UpdateExceptionListItemOptions,
    currentItem: ExceptionListItemSchema
  ): Promise<UpdateExceptionListItemOptions> {
    const updatedItem = _updatedItem as ExceptionItemLikeOptions;

    await this.validateHasWritePrivilege();

    this.validateEntryValueCharacters(updatedItem); // trims first, so dedup sees normalized values
    (_updatedItem.entries as BlocklistConditionEntry[]) = removeDuplicateEntryValues(
      _updatedItem.entries as BlocklistConditionEntry[]
    );

    await this.validateBlocklistData(updatedItem);

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
    await this.validateUpdateOwnerSpaceIds(updatedItem, currentItem);
    await this.validateCanUpdateItemInActiveSpace(_updatedItem, currentItem);

    return _updatedItem;
  }

  private async validateBlocklistData(item: ExceptionItemLikeOptions): Promise<void> {
    await this.validateBasicData(item);

    try {
      BlocklistDataSchema.validate(item, { os: item.osTypes[0] });
    } catch (error) {
      throw new EndpointArtifactExceptionValidationError(error.message);
    }
  }
}
