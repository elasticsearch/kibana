/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Pre-processing service for `PUT /api/synthetics/monitors/_bulk_update`.
 *
 * Per id, mirrors the single-PUT pipeline so one bad monitor doesn't fail
 * the whole batch. Returns `{ survivors, perIdErrors }` for `syncEditedMonitorBulk`.
 */

import type { SavedObjectsFindResult } from '@kbn/core-saved-objects-api-server';
import { i18n } from '@kbn/i18n';
import { getSavedObjectKqlFilter } from '../../common';
import type { MonitorConfigUpdate } from '../bulk_cruds/edit_monitor_bulk';
import { mergeSourceMonitor } from '../formatters/saved_object_to_monitor';
import {
  assertCanUpdateMonitorInAllSpaces,
  validateMonitorPrivateLocationSpaces,
} from '../monitor_locations_utils';
import { normalizeAPIConfig, validateMonitor } from '../monitor_validation';
import { AddEditMonitorAPI, type CreateMonitorPayLoad } from '../add_monitor/add_monitor_api';
import { validateLocationPermissions } from '../edit_monitor';
import { ELASTIC_MANAGED_LOCATIONS_DISABLED } from '../project_monitor/add_monitor_project';
import type { RouteContext } from '../../types';
import {
  ConfigKey,
  type EncryptedSyntheticsMonitor,
  type MonitorFields,
  type SyntheticsMonitor,
  type SyntheticsMonitorWithSecretsAttributes,
  type SyntheticsPrivateLocations,
} from '../../../../common/runtime_types';
import { formatSecrets, normalizeSecrets } from '../../../synthetics_service/utils/secrets';

export type UpdateMonitorErrorCode =
  | 'not_found'
  | 'invalid_origin'
  | 'validation_failed'
  | 'forbidden';

export interface UpdateMonitorPerIdError {
  code: UpdateMonitorErrorCode;
  message: string;
  details?: string;
}

export interface UpdateMonitorPreprocessResult {
  survivors: MonitorConfigUpdate[];
  perIdErrors: Record<string, UpdateMonitorPerIdError>;
}

/** A single entry of the bulk update request: which monitor, and its patch. */
export interface MonitorBulkUpdate {
  id: string;
  attributes: Partial<EncryptedSyntheticsMonitor>;
}

interface ExecuteParams {
  updates: MonitorBulkUpdate[];
}

export class UpdateMonitorAPI {
  routeContext: RouteContext;
  result: UpdateMonitorPreprocessResult = { survivors: [], perIdErrors: {} };
  private namePatchErrors = new Map<string, string>();

  /*
   * Request-scoped permission caches. A new instance is created per request,
   * so these turn the previous per-monitor permission round-trips into a
   * single resolution (capabilities) / one-per-distinct-space-set (privileges).
   */
  private locationPermissionsPromise?: ReturnType<typeof validateLocationPermissions>;
  private readonly spacePermissionCache = new Map<
    string,
    ReturnType<typeof assertCanUpdateMonitorInAllSpaces>
  >();

  constructor(routeContext: RouteContext) {
    this.routeContext = routeContext;
  }

  async execute({ updates }: ExecuteParams): Promise<UpdateMonitorPreprocessResult> {
    const ids = updates.map((update) => update.id);
    const patchById = new Map<string, Partial<EncryptedSyntheticsMonitor>>(
      updates.map((update) => [update.id, update.attributes])
    );
    this.namePatchErrors = this.checkDuplicateNamesWithinBatch(updates);

    const decryptedMonitors = await this.findDecryptedMonitors(ids);
    this.markNotFound(ids, decryptedMonitors);

    for (const decryptedMonitor of decryptedMonitors) {
      const patch = patchById.get(decryptedMonitor.id) ?? {};
      await this.processMonitor(decryptedMonitor, patch);
    }

    await this.rejectNameConflictsWithExistingMonitors(updates);

    return this.result;
  }

  // Single round-trip via CONFIG_ID KQL filter instead of per-id fetches.
  private async findDecryptedMonitors(
    ids: string[]
  ): Promise<Array<SavedObjectsFindResult<SyntheticsMonitorWithSecretsAttributes>>> {
    const { monitorConfigRepository, spaceId } = this.routeContext;
    const filter = getSavedObjectKqlFilter({
      field: ConfigKey.CONFIG_ID,
      values: ids,
    });
    return monitorConfigRepository.findDecryptedMonitors({ spaceId, filter });
  }

  private markNotFound(
    ids: string[],
    decryptedMonitors: Array<SavedObjectsFindResult<SyntheticsMonitorWithSecretsAttributes>>
  ) {
    const foundIds = new Set(decryptedMonitors.map((m) => m.id));
    for (const id of ids) {
      if (!foundIds.has(id)) {
        this.result.perIdErrors[id] = {
          code: 'not_found',
          message: notFoundMessage(id),
        };
      }
    }
  }

  private async processMonitor(
    decryptedMonitor: SavedObjectsFindResult<SyntheticsMonitorWithSecretsAttributes>,
    patch: Partial<EncryptedSyntheticsMonitor>
  ) {
    const monitorId = decryptedMonitor.id;

    if (this.shouldRejectProjectMonitor(decryptedMonitor.attributes)) {
      this.result.perIdErrors[monitorId] = {
        code: 'invalid_origin',
        message: invalidOriginMessage(decryptedMonitor.attributes[ConfigKey.MONITOR_SOURCE_TYPE]),
      };
      return;
    }

    const { prevAttrs, merged } = this.mergePatch(decryptedMonitor, patch);

    const nameError = this.namePatchErrors.get(monitorId);
    if (nameError) {
      this.result.perIdErrors[monitorId] = {
        code: 'validation_failed',
        message: nameError,
      };
      return;
    }

    // Reject unknown/unsupported keys, matching the single-monitor PUT
    // (`editSyntheticsMonitorRoute`). Without this, io-ts `t.exact` in
    // `validateMonitor` would silently strip them instead of failing.
    const { errorMessage: unsupportedKeysError, formattedConfig } = normalizeAPIConfig(
      merged as CreateMonitorPayLoad
    );
    if (unsupportedKeysError) {
      this.result.perIdErrors[monitorId] = {
        code: 'validation_failed',
        message: unsupportedKeysError,
      };
      return;
    }

    const editMonitorAPI = new AddEditMonitorAPI(this.routeContext);
    let normalizedMonitor: MonitorFields;
    try {
      editMonitorAPI.validateMonitorType(merged as MonitorFields, prevAttrs as MonitorFields);
      normalizedMonitor = await editMonitorAPI.normalizeMonitor(
        (formattedConfig ?? merged) as CreateMonitorPayLoad,
        patch as CreateMonitorPayLoad,
        (prevAttrs as MonitorFields)[ConfigKey.LOCATIONS]
      );
    } catch (error) {
      this.result.perIdErrors[monitorId] = {
        code: 'validation_failed',
        message: getErrorMessage(error),
      };
      return;
    }

    const validation = validateMonitor(normalizedMonitor, this.routeContext.spaceId);
    if (!validation.valid || !validation.decodedMonitor) {
      this.result.perIdErrors[monitorId] = {
        code: 'validation_failed',
        message: validation.reason,
        details: validation.details,
      };
      return;
    }
    const decodedMonitor = validation.decodedMonitor;

    const forbidden = await this.checkPermissions(decodedMonitor, decryptedMonitor.type);
    if (forbidden) {
      this.result.perIdErrors[monitorId] = forbidden;
      return;
    }

    /*
     * `normalizeMonitor` already resolved (and cached on `editMonitorAPI`) the
     * private locations covering this monitor's spaces — same fetch the
     * single-monitor PUT relies on. A public-only monitor leaves it `[]`, which
     * `checkPrivateLocationSpaces` short-circuits.
     */
    const plSpaceError = this.checkPrivateLocationSpaces(
      decodedMonitor,
      editMonitorAPI.allPrivateLocations ?? []
    );
    if (plSpaceError) {
      this.result.perIdErrors[monitorId] = plSpaceError;
      return;
    }

    this.result.survivors.push(this.buildSurvivor(decryptedMonitor, decodedMonitor, prevAttrs));
  }

  // Rejects non-ui-origin monitors (project, terraform) — same policy as the single PUT.
  // To allow patches on project monitors in future, this is the seam to extend.
  private shouldRejectProjectMonitor(prevAttrs: SyntheticsMonitorWithSecretsAttributes): boolean {
    return prevAttrs[ConfigKey.MONITOR_SOURCE_TYPE] !== 'ui';
  }

  // Validation runs on the decrypted shape; `formatSecrets` is deferred to
  // `buildSurvivor` so it runs once, only for survivors.
  private mergePatch(
    decryptedMonitor: SavedObjectsFindResult<SyntheticsMonitorWithSecretsAttributes>,
    patch: Partial<EncryptedSyntheticsMonitor>
  ): { prevAttrs: SyntheticsMonitor; merged: EncryptedSyntheticsMonitor } {
    const { attributes: prevAttrs } = normalizeSecrets(decryptedMonitor);
    const { [ConfigKey.REVISION]: _, ...prevAttrsForMerge } = prevAttrs;
    const merged = mergeSourceMonitor(
      prevAttrsForMerge as EncryptedSyntheticsMonitor,
      patch as EncryptedSyntheticsMonitor
    );
    return { prevAttrs, merged };
  }

  // Two ids requesting the same new name is always invalid, regardless of outcome.
  private checkDuplicateNamesWithinBatch(updates: MonitorBulkUpdate[]): Map<string, string> {
    const errors = new Map<string, string>();
    const idsByName = new Map<string, string[]>();
    for (const { id, attributes } of updates) {
      const nextName = attributes[ConfigKey.NAME];
      if (typeof nextName === 'string') {
        const ids = idsByName.get(nextName);
        if (ids) {
          ids.push(id);
        } else {
          idsByName.set(nextName, [id]);
        }
      }
    }

    for (const [name, ids] of idsByName) {
      if (ids.length > 1) {
        ids.forEach((id) => errors.set(id, duplicateNamePatchMessage(name)));
      }
    }
    return errors;
  }

  // Runs after processing: a rename is only exempt from an on-disk name
  // conflict if its current holder is renamed away in this same batch AND
  // that rename survives. Loops to a fixed point for multi-way swap chains.
  private async rejectNameConflictsWithExistingMonitors(updates: MonitorBulkUpdate[]) {
    const patchedNameById = new Map<string, string>();
    for (const { id, attributes } of updates) {
      const nextName = attributes[ConfigKey.NAME];
      if (typeof nextName === 'string') {
        patchedNameById.set(id, nextName);
      }
    }

    const renamedSurvivorNames = new Set<string>();
    for (const survivor of this.result.survivors) {
      const newName = patchedNameById.get(survivor.decryptedPreviousMonitor.id);
      if (newName !== undefined) {
        renamedSurvivorNames.add(newName);
      }
    }
    if (renamedSurvivorNames.size === 0) {
      return;
    }

    const { monitorConfigRepository } = this.routeContext;
    const filter = getSavedObjectKqlFilter({
      field: 'name.keyword',
      values: [...renamedSurvivorNames],
    });
    const { saved_objects: existingMonitors = [] } = await monitorConfigRepository.find({
      perPage: 500,
      filter,
    });
    const holderIdByName = new Map<string, string>();
    for (const monitor of existingMonitors) {
      const attributes = monitor.attributes as Partial<MonitorFields>;
      const name = attributes[ConfigKey.NAME];
      const holderId = attributes[ConfigKey.CONFIG_ID] ?? monitor.id;
      if (typeof name === 'string' && typeof holderId === 'string') {
        holderIdByName.set(name, holderId);
      }
    }

    let rejectedSomething = true;
    while (rejectedSomething) {
      rejectedSomething = false;
      const survivorIds = new Set(
        this.result.survivors.map((survivor) => survivor.decryptedPreviousMonitor.id)
      );

      for (const survivor of this.result.survivors.slice()) {
        const id = survivor.decryptedPreviousMonitor.id;
        const newName = patchedNameById.get(id);
        if (newName === undefined) {
          continue;
        }
        const holderId = holderIdByName.get(newName);
        if (!holderId || holderId === id) {
          continue;
        }

        const holderRenamedAway =
          survivorIds.has(holderId) &&
          patchedNameById.get(holderId) !== undefined &&
          patchedNameById.get(holderId) !== newName;
        if (holderRenamedAway) {
          continue;
        }

        this.result.survivors = this.result.survivors.filter((s) => s !== survivor);
        this.result.perIdErrors[id] = {
          code: 'validation_failed',
          message: monitorNameExistsMessage(newName),
        };
        rejectedSomething = true;
      }
    }
  }

  // Location capability resolves once per request; space privilege once per
  // distinct space set — both cached to avoid O(N) round-trips.
  private async checkPermissions(
    decodedMonitor: SyntheticsMonitor,
    savedObjectType: string
  ): Promise<UpdateMonitorPerIdError | undefined> {
    const hasPublicLocations = (decodedMonitor.locations ?? []).some((loc) => loc.isServiceManaged);
    if (hasPublicLocations) {
      const { elasticManagedLocationsEnabled } = await this.getLocationPermissions();
      if (!elasticManagedLocationsEnabled) {
        return { code: 'forbidden', message: ELASTIC_MANAGED_LOCATIONS_DISABLED };
      }
    }

    const editedMonitorSpaces = (decodedMonitor as MonitorFields)[ConfigKey.KIBANA_SPACES] ?? [];
    if (editedMonitorSpaces.length === 0) {
      return undefined;
    }

    /*
     * `assertCanUpdateMonitorInAllSpaces` returns a Kibana response object on
     * failure (designed for single-PUT early-return). We can't put that in a
     * per-id slot, so collapse to a generic forbidden message. The privilege
     * was already audit-logged by core.
     */
    const spaceAuthError = await this.assertCanUpdateInSpaces(editedMonitorSpaces, savedObjectType);
    if (spaceAuthError) {
      return { code: 'forbidden', message: insufficientSpacePermissionsMessage() };
    }
    return undefined;
  }

  private getLocationPermissions(): ReturnType<typeof validateLocationPermissions> {
    if (!this.locationPermissionsPromise) {
      this.locationPermissionsPromise = validateLocationPermissions(this.routeContext);
    }
    return this.locationPermissionsPromise;
  }

  private assertCanUpdateInSpaces(
    spaceIds: string[],
    savedObjectType: string
  ): ReturnType<typeof assertCanUpdateMonitorInAllSpaces> {
    const key = `${savedObjectType}::${[...new Set(spaceIds)].sort().join(',')}`;
    let cached = this.spacePermissionCache.get(key);
    if (!cached) {
      cached = assertCanUpdateMonitorInAllSpaces(this.routeContext, spaceIds, savedObjectType);
      this.spacePermissionCache.set(key, cached);
    }
    return cached;
  }

  private checkPrivateLocationSpaces(
    decodedMonitor: SyntheticsMonitor,
    allPrivateLocations: SyntheticsPrivateLocations
  ): UpdateMonitorPerIdError | undefined {
    if (allPrivateLocations.length === 0) {
      return undefined;
    }

    const monitorPrivateLocations = (decodedMonitor.locations ?? []).filter(
      (loc) => !loc.isServiceManaged
    );
    if (monitorPrivateLocations.length === 0) {
      return undefined;
    }

    const plSpaceError = validateMonitorPrivateLocationSpaces(
      decodedMonitor as MonitorFields,
      allPrivateLocations
    );
    if (!plSpaceError) {
      return undefined;
    }
    return { code: 'forbidden', message: plSpaceError.message };
  }

  // CONFIG_HASH reset to '' so the next CLI push re-evaluates the AAD set;
  // formatSecrets wraps secrets back into the encrypted-attribute envelope.
  private buildSurvivor(
    decryptedMonitor: SavedObjectsFindResult<SyntheticsMonitorWithSecretsAttributes>,
    decodedMonitor: SyntheticsMonitor,
    prevAttrs: SyntheticsMonitor
  ): MonitorConfigUpdate {
    const monitorWithRevision = formatSecrets({
      ...decodedMonitor,
      [ConfigKey.CONFIG_HASH]: '',
      [ConfigKey.REVISION]: (prevAttrs[ConfigKey.REVISION] || 0) + 1,
    });

    return {
      normalizedMonitor: decodedMonitor,
      monitorWithRevision,
      decryptedPreviousMonitor: decryptedMonitor,
    };
  }
}

const notFoundMessage = (id: string) =>
  i18n.translate('xpack.synthetics.server.bulkUpdate.notFound', {
    defaultMessage: 'Monitor id {id} not found!',
    values: { id },
  });

const invalidOriginMessage = (origin: string | undefined) =>
  i18n.translate('xpack.synthetics.server.bulkUpdate.invalidOrigin', {
    defaultMessage:
      'Monitors of origin "{origin}" cannot be edited via the bulk update API. Use the dedicated workflow for that origin instead.',
    values: { origin: origin ?? 'unknown' },
  });

const insufficientSpacePermissionsMessage = () =>
  i18n.translate('xpack.synthetics.server.bulkUpdate.forbiddenSpacePermissions', {
    defaultMessage:
      'Insufficient permissions to update this monitor in all spaces it is shared to.',
  });

const duplicateNamePatchMessage = (name: string) =>
  i18n.translate('xpack.synthetics.server.bulkUpdate.duplicateNamePatch', {
    defaultMessage:
      'Duplicate monitor name "{name}" in updates; each monitor name may appear at most once.',
    values: { name },
  });

const monitorNameExistsMessage = (name: string) =>
  i18n.translate('xpack.synthetics.server.bulkUpdate.uniqueName', {
    defaultMessage: 'Monitor name must be unique, "{name}" already exists.',
    values: { name },
  });

const getErrorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
};
