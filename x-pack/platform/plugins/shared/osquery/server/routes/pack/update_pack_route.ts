/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import moment from 'moment-timezone';
import { v4 as uuidv4 } from 'uuid';
import { set } from '@kbn/safer-lodash-set';
import { unset, has, get, filter, map, mapKeys, mapValues, some, isEmpty, keyBy } from 'lodash';
import { produce } from 'immer-v9';
import type { PackagePolicy } from '@kbn/fleet-plugin/common';
import { LEGACY_AGENT_POLICY_SAVED_OBJECT_TYPE } from '@kbn/fleet-plugin/common';
import type { SavedObjectReference } from '@kbn/core/server';
import { type IRouter, SavedObjectsErrorHelpers } from '@kbn/core/server';

import { DEFAULT_SPACE_ID } from '@kbn/core-spaces-common';
import { createInternalSavedObjectsClientForSpaceId } from '../../utils/get_internal_saved_object_client';
import type {
  UpdatePacksRequestParamsSchema,
  UpdatePacksRequestBodySchema,
} from '../../../common/api';
import { buildRouteValidation } from '../../utils/build_validation/route_validation';
import { API_VERSIONS } from '../../../common/constants';
import type { RRuleScheduleConfig } from '../../../common';
import { packSavedObjectType } from '../../../common/types';
import type { OsqueryAppContext } from '../../lib/osquery_app_context_services';
import type { StartPlugins } from '../../types';
import { PLUGIN_ID } from '../../../common';
import {
  convertSOQueriesToPack,
  convertPackQueriesToSO,
  convertSOQueriesToPackConfig,
  fetchAllPackagePolicies,
  getInitialPolicies,
  findMatchingShards,
  groupAgentPolicyIdsByPackagePolicy,
  policyHasPack,
  removePackFromPolicy,
  makePackKey,
  buildTargetingWarning,
  resolvePackTargetScope,
  resolveSharedPackagePolicyShard,
  validatePackScheduleFields,
  resolvePackScheduleForUpdate,
  buildScheduleResponseSlice,
  stripPerQueryRruleFields,
  stripPriorModePerQueryFields,
  resolvePreservedQueries,
  convergePerQueryIntervals,
} from './utils';

import { convertShardsToArray, convertShardsToObject } from '../utils';
import type { PackSavedObject } from '../../common/types';
import type { PackResponseData, TargetingWarning } from './types';
import type { PackagePolicyScopeResult, PackQueryInput, PreservableQueryFields } from './utils';
import { updatePacksRequestBodySchema, updatePacksRequestParamsSchema } from '../../../common/api';
import { getUserInfo } from '../../lib/get_user_info';
import { escapeFilterValue } from '../utils/generate_copy_name';
import { updatePackResponseSchema } from './response_schemas';

export const updatePackRoute = (router: IRouter, osqueryContext: OsqueryAppContext) => {
  router.versioned
    .put({
      access: 'public',
      path: '/api/osquery/packs/{id}',
      security: {
        authz: {
          requiredPrivileges: [`${PLUGIN_ID}-writePacks`],
        },
      },
    })
    .addVersion(
      {
        version: API_VERSIONS.public.v1,
        validate: {
          request: {
            params: buildRouteValidation<
              typeof updatePacksRequestParamsSchema,
              UpdatePacksRequestParamsSchema
            >(updatePacksRequestParamsSchema),
            body: buildRouteValidation<
              typeof updatePacksRequestBodySchema,
              UpdatePacksRequestBodySchema
            >(updatePacksRequestBodySchema),
          },
          response: {
            200: {
              body: () => updatePackResponseSchema,
            },
          },
        },
      },
      async (context, request, response) => {
        const coreContext = await context.core;
        const esClient = coreContext.elasticsearch.client.asCurrentUser;

        const spaceScopedClient = await createInternalSavedObjectsClientForSpaceId(
          osqueryContext,
          request
        );

        const spaceId = osqueryContext?.service?.getActiveSpace
          ? (await osqueryContext.service.getActiveSpace(request))?.id || DEFAULT_SPACE_ID
          : DEFAULT_SPACE_ID;

        const agentPolicyService = osqueryContext.service.getAgentPolicyService();
        const packagePolicyService = osqueryContext.service.getPackagePolicyService();

        const logger = osqueryContext.logFactory.get('pack');
        const [, startPlugins] = await osqueryContext.getStartServices();
        const currentUser = await getUserInfo({
          request,
          security: (startPlugins as StartPlugins).security,
          logger,
        });
        const username = currentUser?.username ?? undefined;
        const profileUid = currentUser?.profile_uid ?? undefined;

        const isRruleFeatureEnabled = osqueryContext.experimentalFeatures.rruleScheduling;

        const {
          name,
          description,
          queries: rawQueries,
          enabled,
          policy_ids,
          shards = {},
          schedule_type: rawScheduleType,
          interval: rawInterval,
          rrule_schedule: rawRruleSchedule,
        } = request.body;

        // Request-boundary feature-flag gate. Any RRULE-shaped field on the
        // body is considered "present" only when the flag is on; the wire-
        // boundary gate handles the read/Fleet-push side independently.
        const scheduleTypePresent = isRruleFeatureEnabled && rawScheduleType !== undefined;
        const intervalPresent = isRruleFeatureEnabled && rawInterval !== undefined;
        const rruleSchedulePresent = isRruleFeatureEnabled && rawRruleSchedule !== undefined;

        const gatedQueries: Record<string, PackQueryInput> | undefined = isRruleFeatureEnabled
          ? (rawQueries as Record<string, PackQueryInput> | undefined)
          : rawQueries
          ? (mapValues(rawQueries, (rawQuery) => {
              const {
                schedule_type: _scheduleType,
                rrule_schedule: _rruleSchedule,
                ...rest
              } = rawQuery as PackQueryInput;

              return rest;
            }) as Record<string, PackQueryInput>)
          : undefined;

        let currentPackSO;
        try {
          currentPackSO = await spaceScopedClient.get<PackSavedObject>(
            packSavedObjectType,
            request.params.id
          );
        } catch (err) {
          if (SavedObjectsErrorHelpers.isNotFoundError(err)) {
            return response.notFound({
              body: { message: `Pack ${request.params.id} not found` },
            });
          }

          throw err;
        }

        // Index of current SO queries by id, carrying schedule_id/start_date
        // to preserve across edit-save.
        const existingQueriesById = keyBy(currentPackSO.attributes.queries ?? [], 'id') as Record<
          string,
          PreservableQueryFields
        >;

        const resolved = resolvePackScheduleForUpdate({
          current: {
            schedule_type: currentPackSO.attributes.schedule_type,
            interval: currentPackSO.attributes.interval,
            rrule_schedule: currentPackSO.attributes.rrule_schedule,
          },
          request: {
            schedule_type: rawScheduleType,
            interval: rawInterval,
            rrule_schedule: rawRruleSchedule,
            scheduleTypePresent,
            intervalPresent,
            rruleSchedulePresent,
          },
          isRruleFeatureEnabled,
        });

        const now = moment().toISOString();

        // On a mode transition, hydrate queries from the SO when the request
        // omits them, then strip prior-mode fields — otherwise stale
        // cross-mode state leaks via GET.
        const baseQueries =
          gatedQueries ??
          (resolved.transitioned
            ? (convertSOQueriesToPack(currentPackSO.attributes.queries ?? []) as Record<
                string,
                PackQueryInput
              >)
            : undefined);

        // Map each outgoing query to the stored row it preserves schedule_id from.
        const resolvedExistingByKey = baseQueries
          ? resolvePreservedQueries(baseQueries, existingQueriesById)
          : {};

        const queries = baseQueries
          ? (mapValues(baseQueries, (queryData, queryId) => {
              const existing = resolvedExistingByKey[queryId];
              const carried = resolved.transitioned
                ? stripPriorModePerQueryFields(queryData, resolved.scheduleType)
                : queryData;

              const existingRrule = existing?.rrule_schedule;
              const merged =
                !resolved.transitioned &&
                resolved.scheduleType === 'rrule' &&
                carried.schedule_type === 'rrule' &&
                carried.rrule_schedule &&
                existingRrule
                  ? {
                      ...carried,
                      rrule_schedule: { ...existingRrule, ...carried.rrule_schedule },
                    }
                  : carried;

              return {
                ...merged,
                schedule_id: existing?.schedule_id ?? uuidv4(),
                start_date: existing?.start_date ?? now,
              };
            }) as Record<string, PackQueryInput>)
          : undefined;

        const convergedQueries = queries
          ? convergePerQueryIntervals(queries, resolved.scheduleType)
          : queries;

        const scheduleErr = validatePackScheduleFields({
          packScheduleType: resolved.scheduleType ?? undefined,
          packInterval: resolved.interval ?? undefined,
          packRrule: resolved.rrule_schedule ?? undefined,
          queries: convergedQueries as Record<string, PackQueryInput> | undefined,
        });
        if (scheduleErr) {
          return response.badRequest({ body: { message: scheduleErr } });
        }

        if (name) {
          const conflictingEntries = await spaceScopedClient.find<PackSavedObject>({
            type: packSavedObjectType,
            filter: `${packSavedObjectType}.attributes.name: "${escapeFilterValue(name)}"`,
          });

          if (
            some(
              filter(conflictingEntries.saved_objects, (packSO) => packSO.id !== currentPackSO.id),
              ['attributes.name', name]
            )
          ) {
            return response.conflict({ body: `Pack with name "${name}" already exists.` });
          }
        }

        // Drain ALL policies via keyset `fetchAllItems`; an offset-capped
        // `list({ perPage: 1000 })` would drop the pack from policies past 1000.
        const packagePolicies = await fetchAllPackagePolicies(
          packagePolicyService,
          spaceScopedClient
        );

        const currentPackagePolicies = filter(packagePolicies, (packagePolicy) =>
          policyHasPack(packagePolicy, currentPackSO.attributes.name, spaceId)
        );

        // Preserve existing policy attachments when policy_ids is omitted, so
        // an unrelated PUT doesn't strip the pack from every policy.
        const currentAgentPolicyIds = map(
          filter(currentPackSO.references, ['type', LEGACY_AGENT_POLICY_SAVED_OBJECT_TYPE]),
          'id'
        );
        const effectivePolicyIds = policy_ids ?? currentAgentPolicyIds;

        // Same preserve rule for shards: an omitted `shards` must not clear the
        // stored shard map, or a global (`*`) pack silently stops resolving to
        // any policy and the wire detach below strips it from every agent.
        // An explicit `{}` still clears.
        const effectiveShards =
          request.body.shards === undefined
            ? convertShardsToObject(currentPackSO.attributes.shards ?? [])
            : shards;

        // A PUT that mentions neither `policy_ids` nor `shards` is not asking to
        // retarget the pack, so both the SO references and the wire attachments
        // must survive it. Drives the references guard and the wire detach from
        // one predicate so the two can't disagree and leave the pack scheduled
        // on agents it is no longer referenced by (or vice versa).
        const targetingChangeRequested = Boolean(policy_ids) || !isEmpty(shards);

        const { policiesList, invalidPolicies } = getInitialPolicies(
          packagePolicies,
          effectivePolicyIds,
          effectiveShards
        );

        if (invalidPolicies?.length) {
          return response.badRequest({
            body: `The following policy ids are invalid: ${invalidPolicies.join(', ')}`,
          });
        }

        const agentPolicies = await agentPolicyService?.getByIds(spaceScopedClient, policiesList);

        const policyShards = findMatchingShards(agentPolicies, effectiveShards);

        const agentPoliciesIdMap = mapKeys(agentPolicies, 'id');

        const nonAgentPolicyReferences = filter(
          currentPackSO.references,
          (reference) => reference.type !== LEGACY_AGENT_POLICY_SAVED_OBJECT_TYPE
        );
        const getUpdatedReferences = () => {
          if (!targetingChangeRequested) {
            return currentPackSO.references;
          }

          return [
            ...nonAgentPolicyReferences,
            ...policiesList.map((id) => ({
              id,
              name: agentPoliciesIdMap[id]?.name,
              type: LEGACY_AGENT_POLICY_SAVED_OBJECT_TYPE,
            })),
          ];
        };

        const references = getUpdatedReferences();

        const scheduleSoPatch: Partial<
          Pick<PackSavedObject, 'schedule_type' | 'interval' | 'rrule_schedule'>
        > = {};
        if (isRruleFeatureEnabled) {
          if (scheduleTypePresent) {
            scheduleSoPatch.schedule_type = resolved.scheduleType ?? null;
          }

          if (resolved.transitioned || intervalPresent) {
            scheduleSoPatch.interval = resolved.interval ?? null;
          }

          if (resolved.transitioned || rruleSchedulePresent) {
            // validatePackScheduleFields has already rejected any non-strict merged shape by this point.
            scheduleSoPatch.rrule_schedule = (resolved.rrule_schedule ??
              null) as RRuleScheduleConfig | null;
          }
        }

        await spaceScopedClient.update<PackSavedObject>(
          packSavedObjectType,
          request.params.id,
          {
            enabled,
            name,
            description: description || '',
            queries: convergedQueries && convertPackQueriesToSO(convergedQueries),
            updated_at: moment().toISOString(),
            updated_by: username,
            updated_by_profile_uid: profileUid,
            shards: convertShardsToArray(effectiveShards),
            ...scheduleSoPatch,
          },
          {
            refresh: 'wait_for',
            references,
          }
        );

        const updatedPackSO = await spaceScopedClient.get<PackSavedObject>(
          packSavedObjectType,
          request.params.id
        );

        const convertedQueries = stripPerQueryRruleFields(
          convertSOQueriesToPack(updatedPackSO.attributes.queries),
          isRruleFeatureEnabled
        );

        // `agentPolicyIds` carries every agent policy that resolved to the
        // package policy being written; a shared one needs a deterministic
        // shard. `wireShard` (the shard already on the block) is preserved when
        // there are no shard-bearing targets, rather than resetting to 100%.
        const buildFleetPackBlock = (agentPolicyIds: string[], wireShard?: number) => {
          const { queries: builtQueries, ...packDefaults } = convertSOQueriesToPackConfig(
            convertedQueries,
            {
              spaceId,
              packSchedule: {
                schedule_type: updatedPackSO.attributes.schedule_type,
                interval: updatedPackSO.attributes.interval,
                rrule_schedule: updatedPackSO.attributes.rrule_schedule,
              },
              isRruleFeatureEnabled,
              fallbackStartDate: updatedPackSO.attributes.created_at,
            }
          );

          return {
            shard:
              agentPolicyIds.length === 0 && wireShard !== undefined
                ? wireShard
                : resolveSharedPackagePolicyShard(agentPolicyIds, policyShards),
            pack_id: updatedPackSO.id,
            pack_name: updatedPackSO.attributes.name,
            ...packDefaults,
            queries: builtQueries,
          };
        };

        // Set by the edit-only reference heal below, which runs AFTER
        // `updatedPackSO` was read — otherwise the 200 body would be built from
        // pre-heal references and contradict an immediately following GET.
        let healedAgentPolicyReferences: SavedObjectReference[] | undefined;

        const buildResponseData = (): PackResponseData => {
          const { attributes: attrs } = updatedPackSO;
          // policy_ids and shards must mirror the GET contract: policy attachments
          // live on `references`, not `attributes`, and the public shards shape is
          // an object map (read_pack_route uses convertShardsToObject).
          const policyIds = map(
            filter(healedAgentPolicyReferences ?? updatedPackSO.references, [
              'type',
              LEGACY_AGENT_POLICY_SAVED_OBJECT_TYPE,
            ]),
            'id'
          );

          return {
            name: attrs.name,
            description: attrs.description,
            queries: convertedQueries as unknown as PackResponseData['queries'],
            version: attrs.version,
            enabled: attrs.enabled,
            created_at: attrs.created_at,
            created_by: attrs.created_by,
            created_by_profile_uid: attrs.created_by_profile_uid,
            updated_at: attrs.updated_at,
            updated_by: attrs.updated_by,
            updated_by_profile_uid: attrs.updated_by_profile_uid,
            policy_ids: policyIds,
            // TODO: PackResponseData.shards should be the public object-map
            // shape; array form here is a leak of internal SO storage.
            shards: convertShardsToObject(attrs.shards) as unknown as PackResponseData['shards'],
            saved_object_id: updatedPackSO.id,
            ...buildScheduleResponseSlice(attrs, isRruleFeatureEnabled),
          };
        };

        if (enabled == null && !currentPackSO.attributes.enabled) {
          return response.ok({ body: { data: buildResponseData() } });
        }

        // Scope results from whichever write branch ran. The targeting warning is
        // built from these rather than recomputed, so it always describes the set
        // actually written — including edit-branch wire-scan-only package policies,
        // which a recompute from `policiesList` alone cannot surface.
        let writtenScopeResults: PackagePolicyScopeResult[] | undefined;

        // The pack SO (source of truth) is already committed. These Fleet writes
        // only project it onto the wire, so a concurrent-write 409 → response.conflict
        // (client retries; reconciler also repairs). Other errors propagate.
        try {
          if (enabled != null && enabled !== currentPackSO.attributes.enabled) {
            if (enabled) {
              const enablePolicyIds =
                policy_ids || !isEmpty(effectiveShards) ? policiesList : currentAgentPolicyIds;
              // Dedup by resolved package-policy id before writing: a
              // shared package policy must be written exactly once.
              const packagePolicyWriteTargets = groupAgentPolicyIdsByPackagePolicy(
                enablePolicyIds,
                packagePolicies
              );
              const enableScopeResults = resolvePackTargetScope(
                packagePolicyWriteTargets,
                Boolean(effectiveShards?.['*'])
              );
              writtenScopeResults = enableScopeResults;

              const pk = makePackKey(updatedPackSO.attributes.name, spaceId);

              // Over-broad package policies are written as-is: Fleet forbids a
              // second osquery package policy on an agent policy that already
              // has one, so narrowing is impossible here. `targeting_warning`
              // reports the untargeted agent policies instead. See #285994.
              await Promise.all(
                enableScopeResults.map(({ packagePolicy, agentPolicyIds }) =>
                  packagePolicyService?.update(
                    spaceScopedClient,
                    esClient,
                    packagePolicy.id,
                    produce<PackagePolicy>(packagePolicy, (draft) => {
                      unset(draft, 'id');
                      if (!has(draft, 'inputs[0].streams')) {
                        set(draft, 'inputs[0].streams', []);
                      }

                      removePackFromPolicy(draft, updatedPackSO.attributes.name, spaceId);
                      set(
                        draft,
                        `inputs[0].config.osquery.value.packs.${pk}`,
                        buildFleetPackBlock(agentPolicyIds)
                      );

                      return draft;
                    })
                  )
                )
              );
            } else {
              // Remove the pack from EVERY package policy that carries it on
              // the wire (the `policyHasPack` scan in `currentPackagePolicies`),
              // not just the ones reachable through the pack SO's agent-policy
              // references. Post-upgrade (9.4.3 → 9.5.0) the wire attachments and
              // the SO references can diverge; matching by references left the
              // pack block on the wire, so agents kept running the schedule while
              // the SO read `enabled: false`. This mirrors delete_pack_route.
              await Promise.all(
                currentPackagePolicies.map((packagePolicy) =>
                  packagePolicyService?.update(
                    spaceScopedClient,
                    esClient,
                    packagePolicy.id,
                    produce<PackagePolicy>(packagePolicy, (draft) => {
                      unset(draft, 'id');
                      removePackFromPolicy(draft, currentPackSO.attributes.name, spaceId);

                      return draft;
                    })
                  )
                )
              );
            }
          } else if (targetingChangeRequested) {
            // Retarget. Detach is driven off the wire, not SO references, so it
            // stays correct when the two have diverged (#279224).
            const retargetWriteTargets = groupAgentPolicyIdsByPackagePolicy(
              policiesList,
              packagePolicies
            );
            const retargetScopeResults = resolvePackTargetScope(
              retargetWriteTargets,
              Boolean(effectiveShards?.['*'])
            );
            writtenScopeResults = retargetScopeResults;
            const writeTargetIds = new Set(
              retargetScopeResults.map(({ packagePolicy }) => packagePolicy.id)
            );

            // Detach: strip the pack from any package policy that is no longer a
            // write target (wire-scan driven, so it also repairs drifted blocks).
            await Promise.all(
              currentPackagePolicies
                .filter((packagePolicy) => !writeTargetIds.has(packagePolicy.id))
                .map((packagePolicy) =>
                  packagePolicyService?.update(
                    spaceScopedClient,
                    esClient,
                    packagePolicy.id,
                    produce<PackagePolicy>(packagePolicy, (draft) => {
                      unset(draft, 'id');
                      removePackFromPolicy(draft, currentPackSO.attributes.name, spaceId);

                      return draft;
                    })
                  )
                )
            );

            const retargetPk = makePackKey(updatedPackSO.attributes.name, spaceId);

            // Over-broad policies are written as-is — see the enable branch.
            await Promise.all(
              retargetScopeResults.map(({ packagePolicy, agentPolicyIds }) =>
                packagePolicyService?.update(
                  spaceScopedClient,
                  esClient,
                  packagePolicy.id,
                  produce<PackagePolicy>(packagePolicy, (draft) => {
                    unset(draft, 'id');
                    if (!has(draft, 'inputs[0].streams')) {
                      set(draft, 'inputs[0].streams', []);
                    }

                    // Rename cleanup: drop the pack under its previous name so a
                    // renamed pack doesn't linger under both keys.
                    if (updatedPackSO.attributes.name !== currentPackSO.attributes.name) {
                      removePackFromPolicy(draft, currentPackSO.attributes.name, spaceId);
                    }

                    removePackFromPolicy(draft, updatedPackSO.attributes.name, spaceId);
                    set(
                      draft,
                      `inputs[0].config.osquery.value.packs.${retargetPk}`,
                      buildFleetPackBlock(agentPolicyIds)
                    );

                    return draft;
                  })
                )
              )
            );
          } else {
            // Edit-only. Write targets are the UNION of the wire scan (repairs
            // blocks whose SO references drifted) and the reference-resolved
            // policies (attach-on-edit). Wire-only would 200 while advertising
            // `policy_ids: [P]` and writing nothing to P.
            const editRawTargets = new Map<string, PackagePolicy>();
            for (const packagePolicy of currentPackagePolicies) {
              editRawTargets.set(packagePolicy.id, packagePolicy);
            }

            for (const { packagePolicy } of groupAgentPolicyIdsByPackagePolicy(
              policiesList,
              packagePolicies
            ).values()) {
              editRawTargets.set(packagePolicy.id, packagePolicy);
            }

            // Build a map that mirrors groupAgentPolicyIdsByPackagePolicy shape
            // so resolvePackTargetScope can classify each write target.
            const editWriteTargetsForScope = new Map<
              string,
              { packagePolicy: PackagePolicy; agentPolicyIds: string[] }
            >();
            for (const [ppId, packagePolicy] of editRawTargets.entries()) {
              const agentPolicyIds = (packagePolicy.policy_ids ?? []).filter((id) =>
                policiesList.includes(id)
              );
              editWriteTargetsForScope.set(ppId, { packagePolicy, agentPolicyIds });
            }

            const editScopeResults = resolvePackTargetScope(
              editWriteTargetsForScope,
              Boolean(effectiveShards?.['*'])
            );
            writtenScopeResults = editScopeResults;

            const editPk = makePackKey(updatedPackSO.attributes.name, spaceId);

            // Over-broad policies are written as-is — see the enable branch.
            await Promise.all(
              editScopeResults.map(({ packagePolicy, agentPolicyIds }) => {
                // Wire-scan-only entries (drift repair) legitimately resolve to an
                // empty id list; the pack block is still rewritten so the drifted
                // block is healed, and `existingShard` below preserves its shard.
                const effectiveIds = agentPolicyIds;

                return packagePolicyService?.update(
                  spaceScopedClient,
                  esClient,
                  packagePolicy.id,
                  produce<PackagePolicy>(packagePolicy, (draft) => {
                    unset(draft, 'id');
                    if (!has(draft, 'inputs[0].streams')) {
                      set(draft, 'inputs[0].streams', []);
                    }

                    if (updatedPackSO.attributes.name !== currentPackSO.attributes.name) {
                      removePackFromPolicy(draft, currentPackSO.attributes.name, spaceId);
                    }

                    // Read the LEGACY bare key too: `policyHasPack` matches it,
                    // which is how a pre-space-key block enters this write set in
                    // the first place. Canonical-only would leave `existingShard`
                    // undefined and let an empty target intersection fall through
                    // to DEFAULT_PACK_SHARD, resetting a deliberate 25 to 100 —
                    // the exact drift this branch exists to repair.
                    const existingShard = (get(
                      draft,
                      `inputs[0].config.osquery.value.packs.${editPk}.shard`
                    ) ??
                      get(
                        draft,
                        `inputs[0].config.osquery.value.packs.${updatedPackSO.attributes.name}.shard`
                      )) as number | undefined;
                    removePackFromPolicy(draft, updatedPackSO.attributes.name, spaceId);
                    set(
                      draft,
                      `inputs[0].config.osquery.value.packs.${editPk}`,
                      buildFleetPackBlock(effectiveIds, existingShard)
                    );

                    return draft;
                  })
                );
              })
            );

            // Heal references to match the wire. Best-effort: the save already
            // committed, so a heal failure must not fail the response.
            // Only heal ids this pack demonstrably targets: a flatMap of every
            // `policy_ids` can't tell "reference drifted" from "shares a package
            // policy", and the edit form prefills `policy_ids` from this
            // response, so an invented id becomes an explicit retarget on the
            // next save. A shard entry proves intent; otherwise require the
            // package policy to be unshared.
            const shardTargetedIds = new Set(Object.keys(effectiveShards ?? {}));
            const wiredPolicyIds = new Set(
              currentPackagePolicies.flatMap((pp) => {
                const policyIds = pp.policy_ids ?? [];
                if (policyIds.length <= 1) return policyIds;

                return policyIds.filter((id) => shardTargetedIds.has(id));
              })
            );
            const soRefPolicyIds = new Set(currentAgentPolicyIds);
            const missingFromRefs = [...wiredPolicyIds].filter((id) => !soRefPolicyIds.has(id));
            if (missingFromRefs.length) {
              // Everything below stays inside the try: the save already
              // committed, so no heal-path error may surface as a route error.
              try {
                // `agentPoliciesIdMap` is keyed off `policiesList`, empty in the
                // very drift state we're healing — resolve names for the added
                // ids. `ignoreMissing`: a wire policy_id may point at a deleted
                // agent policy; that id is dropped from the heal, not thrown on.
                const healedAgentPolicies = await agentPolicyService?.getByIds(
                  spaceScopedClient,
                  missingFromRefs,
                  { ignoreMissing: true }
                );
                const healedNameById = mapKeys(healedAgentPolicies, 'id');
                const addedRefs = missingFromRefs
                  .filter((id) => healedNameById[id])
                  .map((id) => ({
                    id,
                    name: healedNameById[id].name,
                    type: LEGACY_AGENT_POLICY_SAVED_OBJECT_TYPE,
                  }));

                if (addedRefs.length) {
                  // Union, not replacement — existing references (agent-policy
                  // and otherwise) survive healing byte-identical.
                  const existingAgentPolicyReferences = filter(currentPackSO.references, [
                    'type',
                    LEGACY_AGENT_POLICY_SAVED_OBJECT_TYPE,
                  ]);
                  const healedReferences = [
                    ...nonAgentPolicyReferences,
                    ...existingAgentPolicyReferences,
                    ...addedRefs,
                  ];
                  await spaceScopedClient.update<PackSavedObject>(
                    packSavedObjectType,
                    request.params.id,
                    {},
                    { references: healedReferences }
                  );
                  // Only after the write commits, so a failed heal reports
                  // what is actually persisted.
                  healedAgentPolicyReferences = healedReferences;
                }
              } catch (healErr) {
                logger.warn(
                  `update_pack_route: reference healing failed for pack ${request.params.id}: ${
                    (healErr as Error).message
                  }`
                );
              }
            }
          }
        } catch (err) {
          const conflictStatus =
            (err as { output?: { statusCode?: number } }).output?.statusCode === 409 ||
            SavedObjectsErrorHelpers.isConflictError(err);
          if (conflictStatus) {
            return response.conflict({
              body: {
                message:
                  'The pack was saved, but its Fleet package policy was modified concurrently and could not be updated. Please retry the request.',
              },
            });
          }

          throw err;
        }

        // Detect over-broad package policies and build a targeting warning. Only
        // meaningful while the pack is enabled: a disabled pack is stripped from
        // every package policy above, so it reaches no agent policy at all and
        // warning about over-reach would be misleading.
        const isPackEnabled = enabled ?? currentPackSO.attributes.enabled;
        let targetingWarning: TargetingWarning | undefined;
        if (isPackEnabled && writtenScopeResults?.length) {
          // Advisory only, and the pack SO plus every Fleet write are already
          // committed — a failed name lookup must not turn a successful save into
          // an error response. Same best-effort contract as the reference heal.
          try {
            targetingWarning = await buildTargetingWarning(
              writtenScopeResults,
              agentPolicyService,
              spaceScopedClient
            );
          } catch (err) {
            logger.warn(
              `Failed to build targeting warning for pack ${request.params.id}: ${err.message}`
            );
          }
        }

        const responseData = buildResponseData();

        return response.ok({
          body: {
            data: targetingWarning
              ? { ...responseData, targeting_warning: targetingWarning }
              : responseData,
          },
        });
      }
    );
};
