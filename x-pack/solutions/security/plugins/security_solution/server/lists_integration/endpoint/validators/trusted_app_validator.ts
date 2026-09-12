/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ENDPOINT_ARTIFACT_LISTS } from '@kbn/securitysolution-list-constants';
import type { TypeOf } from '@kbn/config-schema';
import { schema } from '@kbn/config-schema';
import type { ExceptionListItemSchema } from '@kbn/securitysolution-io-ts-list-types';
import type { TrustedAppEntryTypes } from '@kbn/securitysolution-utils';
import { OperatingSystem } from '@kbn/securitysolution-utils';
import type {
  CreateExceptionListItemOptions,
  UpdateExceptionListItemOptions,
} from '@kbn/lists-plugin/server';
import type { PromiseFromStreams } from '@kbn/lists-plugin/server/services/exception_lists/import_exception_list_and_items';
import { TRUSTED_PROCESS_DESCENDANTS_TAG } from '../../../../common/endpoint/service/artifacts/constants';
import { BaseValidator } from './base_validator';
import type { ExceptionItemLikeOptions } from '../types';
import type { TrustedAppConditionEntry as ConditionEntry } from '../../../../common/endpoint/types';
import {
  getDuplicateFields,
  isValidHash,
} from '../../../../common/endpoint/service/artifacts/validations';
import { EndpointArtifactExceptionValidationError } from './errors';
import { ENTRY_FIELD_MAX_LENGTH, ENTRY_VALUE_MAX_LENGTH } from './constants';

const ProcessHashField = schema.oneOf([
  schema.literal('process.hash.md5'),
  schema.literal('process.hash.sha1'),
  schema.literal('process.hash.sha256'),
]);
const ProcessExecutablePath = schema.literal('process.executable.caseless');
const ProcessWindowsCodeSigner = schema.literal('process.Ext.code_signature');
const ProcessMacCodeSigner = schema.literal('process.code_signature');

const ConditionEntryTypeSchema = schema.conditional(
  schema.siblingRef('field'),
  ProcessExecutablePath,
  schema.oneOf([schema.literal('match'), schema.literal('wildcard')]),
  schema.literal('match')
);
const ConditionEntryOperatorSchema = schema.literal('included');

type ConditionEntryFieldAllowedType =
  | TypeOf<typeof ProcessHashField>
  | TypeOf<typeof ProcessExecutablePath>
  | TypeOf<typeof ProcessWindowsCodeSigner>
  | TypeOf<typeof ProcessMacCodeSigner>;

type TrustedAppConditionEntry<
  T extends ConditionEntryFieldAllowedType = ConditionEntryFieldAllowedType
> =
  | {
      field: T;
      type: TrustedAppEntryTypes;
      operator: 'included';
      value: string;
    }
  | TypeOf<typeof SignerWindowsEntrySchema>
  | TypeOf<typeof SignerMacEntrySchema>;

/*
 * A generic Entry schema to be used for a specific entry schema depending on the OS
 */
const CommonEntrySchema = {
  field: schema.oneOf([ProcessHashField, ProcessExecutablePath]),
  type: ConditionEntryTypeSchema,
  operator: ConditionEntryOperatorSchema,
  // If field === HASH then validate hash with custom method, else validate string with minLength = 1
  value: schema.conditional(
    schema.siblingRef('field'),
    ProcessHashField,
    schema.string({
      maxLength: ENTRY_VALUE_MAX_LENGTH,
      validate: (hash: string) => (isValidHash(hash) ? undefined : `invalid hash value [${hash}]`),
    }),
    schema.conditional(
      schema.siblingRef('field'),
      ProcessExecutablePath,
      schema.string({
        maxLength: ENTRY_VALUE_MAX_LENGTH,
        validate: (pathValue: string) =>
          pathValue.length > 0 ? undefined : `invalid path value [${pathValue}]`,
      }),
      schema.string({
        maxLength: ENTRY_VALUE_MAX_LENGTH,
        validate: (signerValue: string) =>
          signerValue.length > 0 ? undefined : `invalid signer value [${signerValue}]`,
      })
    )
  ),
};

// Windows/MacOS Signer entries use a Nested field that checks to ensure
// that the certificate is trusted
const SignerEntrySchema = {
  type: schema.literal('nested'),
  entries: schema.arrayOf(
    schema.oneOf([
      schema.object({
        field: schema.literal('trusted'),
        value: schema.literal('true'),
        type: schema.literal('match'),
        operator: schema.literal('included'),
      }),
      schema.object({
        field: schema.literal('subject_name'),
        value: schema.string({ minLength: 1, maxLength: ENTRY_VALUE_MAX_LENGTH }),
        type: schema.literal('match'),
        operator: schema.literal('included'),
      }),
    ]),
    { minSize: 2, maxSize: 2 }
  ),
};

const SignerWindowsEntrySchema = schema.object({
  ...SignerEntrySchema,
  field: ProcessWindowsCodeSigner,
});

const SignerMacEntrySchema = schema.object({
  ...SignerEntrySchema,
  field: ProcessMacCodeSigner,
});

const WindowsEntrySchema = schema.oneOf([
  SignerWindowsEntrySchema,
  schema.object({
    ...CommonEntrySchema,
    field: schema.oneOf([ProcessHashField, ProcessExecutablePath]),
  }),
]);

const MacEntrySchema = schema.oneOf([
  SignerMacEntrySchema,
  schema.object({
    ...CommonEntrySchema,
    field: schema.oneOf([ProcessHashField, ProcessExecutablePath]),
  }),
]);

const LinuxEntrySchema = schema.object({
  ...CommonEntrySchema,
});

const entriesSchemaOptions = {
  minSize: 1,
  maxSize: 250,
  validate(entries: TrustedAppConditionEntry[]) {
    const dups = getDuplicateFields(entries as ConditionEntry[]);
    return dups.map((field) => `Duplicated entry: ${field}`).join(', ') || undefined;
  },
};

/*
 * Entities array schema depending on Os type using schema.conditional.
 * If OS === WINDOWS then use Windows schema,
 * else if OS === LINUX then use Linux schema,
 * else use Mac schema
 *
 * The validate function checks there is no duplicated entry inside the array
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
 * Schema to validate Trusted Apps data for create and update.
 * When called, it must be given an `context` with a `os` property set
 *
 * @example
 *
 * TrustedAppDataSchema.validate(item, { os: 'windows' });
 */
const TrustedAppDataSchema = schema.object(
  {
    entries: EntriesSchema,
  },

  // Because we are only validating some fields from the Exception Item, we set `unknowns` to `ignore` here
  { unknowns: 'ignore' }
);

/**
 * Schema to validate Trusted Apps in Advanced mode
 */
const TrustedAppAdvancedModeDataSchema = schema.object(
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

export class TrustedAppValidator extends BaseValidator {
  static isTrustedApp(item: { listId: string }): boolean {
    return item.listId === ENDPOINT_ARTIFACT_LISTS.trustedApps.id;
  }

  protected async validateHasWritePrivilege(): Promise<void> {
    return super.validateHasPrivilege('canWriteTrustedApplications');
  }

  protected async validateHasReadPrivilege(): Promise<void> {
    return super.validateHasPrivilege('canReadTrustedApplications');
  }

  async validatePreImport(items: PromiseFromStreams): Promise<void> {
    await this.validateHasWritePrivilege();

    await this.validatePreImportItems(items, async (item) => {
      // import specific validations
      await this.validateImportOwnerSpaceIds(item); // instead of validateCreateOwnerSpaceIds
      await this.validateCanImportGlobalArtifacts(item); // instead of validateCanCreateGlobalArtifacts
      await this.removeInvalidPolicyIds(item); // instead of validateByPolicyItem

      // usual validators from pre-create
      await this.validateTrustedAppData(item);
      await this.validateCanCreateByPolicyArtifacts(item);
    });
  }

  async validatePreCreateItem(
    item: CreateExceptionListItemOptions
  ): Promise<CreateExceptionListItemOptions> {
    await this.validateHasWritePrivilege();
    await this.validateTrustedAppData(item);
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
    await this.validateTrustedAppData(updatedItem);

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

  private async validateTrustedAppData(item: ExceptionItemLikeOptions): Promise<void> {
    this.validateEntryValueCharacters(item);
    await this.validateBasicData(item);

    try {
      const isTAAdvancedModeFeatureFlagEnabled =
        this.endpointAppContext.experimentalFeatures.trustedAppsAdvancedMode;
      const isTAProcessDescendantsFeatureFlagEnabled =
        this.endpointAppContext.experimentalFeatures.filterProcessDescendantsForTrustedAppsEnabled;
      const isAdvancedMode = item.tags.includes('form_mode:advanced');
      const hasProcessDescendants = item.tags.includes(TRUSTED_PROCESS_DESCENDANTS_TAG);

      // Validate that the feature flags are enabled if the related features are used
      if (!isTAAdvancedModeFeatureFlagEnabled && isAdvancedMode) {
        throw new Error('Trusted apps advanced mode feature is not enabled');
      }
      if (!isTAProcessDescendantsFeatureFlagEnabled && hasProcessDescendants) {
        throw new Error('Trusted apps process descendants feature is not enabled');
      }
      // Validate that process descendants is only used in advanced mode
      if (!isAdvancedMode && hasProcessDescendants) {
        throw new Error('Process descendants feature is only allowed on advanced mode');
      }

      // Validate with the correct schema depending on the mode
      if (isTAAdvancedModeFeatureFlagEnabled && isAdvancedMode) {
        TrustedAppAdvancedModeDataSchema.validate(item);
      } else {
        TrustedAppDataSchema.validate(item, { os: item.osTypes[0] });
      }
    } catch (error) {
      throw new EndpointArtifactExceptionValidationError(error.message);
    }
  }
}
