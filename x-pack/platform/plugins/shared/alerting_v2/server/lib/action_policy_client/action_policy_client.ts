/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import Boom from '@hapi/boom';
import type {
  ActionPolicyBulkAction,
  ActionPolicyResponse,
  CreateActionPolicyDataInput,
  MatchedActionPolicy,
  MatcherContext,
} from '@kbn/alerting-v2-schemas';
import {
  createActionPolicyDataSchema,
  updateActionPolicyDataSchema,
} from '@kbn/alerting-v2-schemas';
import { SavedObjectsErrorHelpers } from '@kbn/core-saved-objects-server';
import type { EncryptedSavedObjectsClient } from '@kbn/encrypted-saved-objects-plugin/server';
import type { KueryNode } from '@kbn/es-query';
import { nodeBuilder } from '@kbn/es-query';
import { evaluateKql } from '@kbn/eval-kql';
import { stringifyZodError } from '@kbn/zod-helpers/v4';
import { treeifyError, type z } from '@kbn/zod/v4';
import { inject, injectable } from 'inversify';
import { partition } from 'lodash';
import {
  ACTION_POLICY_SAVED_OBJECT_TYPE,
  type ActionPolicySavedObjectAttributes,
} from '../../saved_objects';
import { ALERTING_V2_ERROR_CODES } from '../errors/error_codes';
import { EncryptedSavedObjectsClientToken } from '../dispatcher/steps/dispatch_step_tokens';
import { ActionPolicySavedObjectServiceScopedToken } from '../services/action_policy_saved_object_service/tokens';
import type { ActionPolicySavedObjectServiceContract } from '../services/action_policy_saved_object_service/types';
import type { ApiKeyServiceContract } from '../services/api_key_service/api_key_service';
import { ApiKeyService } from '../services/api_key_service/api_key_service';
import {
  LoggerServiceToken,
  type LoggerServiceContract,
} from '../services/logger_service/logger_service';
import { buildSoSearch } from '../build_so_search';
import type { RulesSavedObjectServiceContract } from '../services/rules_saved_object_service/rules_saved_object_service';
import { RulesSavedObjectServiceScopedToken } from '../services/rules_saved_object_service/tokens';
import type { UserServiceContract } from '../services/user_service/user_service';
import { UserService } from '../services/user_service/user_service';
import { ActionPolicyNamespaceToken } from './tokens';
import type {
  BulkActionActionPoliciesParams,
  BulkActionActionPoliciesResponse,
  CreateActionPolicyParams,
  FindActionPoliciesParams,
  FindActionPoliciesResponse,
  MatchActionPoliciesForRuleParams,
  MatchActionPoliciesForRuleResponse,
  SnoozeActionPolicyParams,
  UpdateActionPolicyApiKeyParams,
  UpdateActionPolicyParams,
} from './types';
import {
  buildCreateActionPolicyAttributes,
  buildUpdateActionPolicyAttributes,
  transformActionPolicySoAttributesToApiResponse,
  validateDateString,
} from './utils';

const resolveActionAttrs = (
  action: Exclude<ActionPolicyBulkAction, { action: 'delete' } | { action: 'update_api_key' }>
): Partial<ActionPolicySavedObjectAttributes> => {
  switch (action.action) {
    case 'enable':
      return { enabled: true };
    case 'disable':
      return { enabled: false };
    case 'snooze':
      return { snoozedUntil: action.snoozedUntil };
    case 'unsnooze':
      return { snoozedUntil: null };
  }
};

const DEFAULT_PAGE = 1;
const DEFAULT_PER_PAGE = 20;

@injectable()
export class ActionPolicyClient {
  constructor(
    @inject(ActionPolicySavedObjectServiceScopedToken)
    private readonly actionPolicySavedObjectService: ActionPolicySavedObjectServiceContract,
    @inject(RulesSavedObjectServiceScopedToken)
    private readonly rulesSavedObjectService: RulesSavedObjectServiceContract,
    @inject(UserService) private readonly userService: UserServiceContract,
    @inject(ApiKeyService) private readonly apiKeyService: ApiKeyServiceContract,
    @inject(EncryptedSavedObjectsClientToken)
    private readonly esoClient: EncryptedSavedObjectsClient,
    @inject(ActionPolicyNamespaceToken)
    private readonly namespace: string | undefined,
    @inject(LoggerServiceToken)
    private readonly logger: LoggerServiceContract
  ) {}

  /**
   * Validates a request body with a Zod schema and produces a uniform
   * `Boom.badRequest` error message on failure. Centralised so every public
   * method (create / update / upsert) reports validation issues identically.
   */
  private parseActionPolicyData<T>(
    schema: z.ZodType<T>,
    data: unknown,
    context: 'create' | 'update' | 'upsert'
  ): T {
    const parsed = schema.safeParse(data);
    if (!parsed.success) {
      throw Boom.badRequest(
        `Error validating ${context} action policy data - ${stringifyZodError(parsed.error)}`,
        {
          code: ALERTING_V2_ERROR_CODES.INVALID_ACTION_POLICY_DATA,
          details: { context, errors: treeifyError(parsed.error) },
        }
      );
    }
    return parsed.data;
  }

  /**
   * Loads the existing action policy SO and translates `not found` into a
   * `Boom.notFound` error with the canonical message used everywhere else.
   * Other SO errors propagate so callers can map them as needed.
   */
  private async getExistingActionPolicy(
    id: string
  ): Promise<{ attrs: ActionPolicySavedObjectAttributes; version: string | undefined }> {
    try {
      const doc = await this.actionPolicySavedObjectService.get(id);
      return { attrs: doc.attributes, version: doc.version };
    } catch (e) {
      if (SavedObjectsErrorHelpers.isNotFoundError(e)) {
        throw Boom.notFound(`Action policy with id "${id}" not found`, {
          code: ALERTING_V2_ERROR_CODES.ACTION_POLICY_NOT_FOUND,
          details: { action_policy_id: id },
        });
      }
      throw e;
    }
  }

  /**
   * Persists the next attributes for an existing action policy and translates
   * SO `version conflict` errors into a `Boom.conflict` with the canonical
   * "...has already been updated by another user" message. Callers that need
   * to do additional bookkeeping on conflict (e.g. invalidating a freshly
   * minted API key) should wrap this call in their own try/catch.
   */
  private async writeActionPolicyAttrs({
    id,
    attrs,
    version,
  }: {
    id: string;
    attrs: Partial<ActionPolicySavedObjectAttributes>;
    version?: string;
  }): Promise<{ id: string; version?: string }> {
    try {
      return await this.actionPolicySavedObjectService.update({ id, attrs, version });
    } catch (e) {
      if (SavedObjectsErrorHelpers.isConflictError(e)) {
        throw Boom.conflict(
          `Action policy with id "${id}" has already been updated by another user`,
          {
            code: ALERTING_V2_ERROR_CODES.ACTION_POLICY_VERSION_CONFLICT,
            details: { action_policy_id: id },
          }
        );
      }
      throw e;
    }
  }

  public async createActionPolicy(params: CreateActionPolicyParams): Promise<ActionPolicyResponse> {
    const parsed = this.parseActionPolicyData(createActionPolicyDataSchema, params.data, 'create');

    const userProfileUid = await this.userService.getCurrentUserProfileUid();
    const now = new Date().toISOString();

    const apiKeyAttrs = await this.apiKeyService.create(`Action Policy: ${parsed.name}`);

    const attributes = buildCreateActionPolicyAttributes({
      data: parsed,
      auth: apiKeyAttrs,
      createdBy: userProfileUid,
      createdAt: now,
      updatedBy: userProfileUid,
      updatedAt: now,
    });

    try {
      const { id, version } = await this.actionPolicySavedObjectService.create({
        attrs: attributes,
        id: params.options?.id,
      });

      return transformActionPolicySoAttributesToApiResponse({
        id,
        version,
        attributes,
      });
    } catch (e) {
      this.markApiKeysForInvalidation(attributes.auth?.apiKey, false);
      if (SavedObjectsErrorHelpers.isConflictError(e)) {
        const conflictId = params.options?.id ?? 'unknown';
        throw Boom.conflict(`Action policy with id "${conflictId}" already exists`, {
          code: ALERTING_V2_ERROR_CODES.ACTION_POLICY_ALREADY_EXISTS,
          details: { action_policy_id: conflictId },
        });
      }
      throw e;
    }
  }

  public async getActionPolicy({ id }: { id: string }): Promise<ActionPolicyResponse> {
    const { attrs, version } = await this.getExistingActionPolicy(id);
    return transformActionPolicySoAttributesToApiResponse({
      id,
      version,
      attributes: attrs,
    });
  }

  public async actionPolicyExists({ id }: { id: string }): Promise<boolean> {
    try {
      await this.getExistingActionPolicy(id);
      return true;
    } catch (e) {
      if (Boom.isBoom(e) && e.output.statusCode === 404) {
        return false;
      }
      throw e;
    }
  }

  public async getActionPolicies({ ids }: { ids: string[] }): Promise<ActionPolicyResponse[]> {
    if (ids.length === 0) {
      return [];
    }

    const docs = await this.actionPolicySavedObjectService.bulkGetByIds(ids);

    return docs.flatMap((doc) => {
      if ('error' in doc) {
        return [];
      }

      return [
        transformActionPolicySoAttributesToApiResponse({
          id: doc.id,
          version: doc.version,
          attributes: doc.attributes,
        }),
      ];
    });
  }

  public async updateActionPolicy(params: UpdateActionPolicyParams): Promise<ActionPolicyResponse> {
    const parsed = this.parseActionPolicyData(updateActionPolicyDataSchema, params.data, 'update');

    const userProfileUid = await this.userService.getCurrentUserProfileUid();
    const now = new Date().toISOString();

    const { attrs: existingPolicy } = await this.getExistingActionPolicy(params.options.id);

    const oldAuth = await this.getDecryptedAuth(params.options.id);

    const policyName = parsed.name ?? existingPolicy.name;
    const apiKeyAttrs = await this.apiKeyService.create(`Action Policy: ${policyName}`);

    const nextAttrs = buildUpdateActionPolicyAttributes({
      existing: existingPolicy,
      update: parsed,
      auth: apiKeyAttrs,
      updatedBy: userProfileUid,
      updatedAt: now,
    });

    let updated: { id: string; version?: string };
    try {
      updated = await this.writeActionPolicyAttrs({
        id: params.options.id,
        attrs: nextAttrs,
        version: params.options.version,
      });
    } catch (e) {
      this.markApiKeysForInvalidation(apiKeyAttrs.apiKey, false);
      throw e;
    }

    this.markApiKeysForInvalidation(oldAuth?.apiKey, oldAuth?.createdByUser);

    return transformActionPolicySoAttributesToApiResponse({
      id: params.options.id,
      version: updated.version,
      attributes: nextAttrs,
    });
  }

  public async findActionPolicies(
    params: FindActionPoliciesParams = {}
  ): Promise<FindActionPoliciesResponse> {
    const page = params.page ?? DEFAULT_PAGE;
    const perPage = params.perPage ?? DEFAULT_PER_PAGE;

    const filter = this.buildFindFilter(params);
    const sortField = this.mapSortField(params.sortField);

    const search = buildSoSearch(params.search);

    const res = await this.actionPolicySavedObjectService.find({
      page,
      perPage,
      search,
      filter,
      sortField,
      sortOrder: params.sortOrder,
    });

    return {
      items: res.saved_objects.map((so) =>
        transformActionPolicySoAttributesToApiResponse({
          id: so.id,
          version: so.version,
          attributes: so.attributes,
        })
      ),
      total: res.total,
      page,
      perPage,
    };
  }

  public async matchActionPoliciesForRule(
    params: MatchActionPoliciesForRuleParams
  ): Promise<MatchActionPoliciesForRuleResponse> {
    const { ruleId, ruleName, ruleTags } = params;

    let resolvedName = ruleName ?? '';
    let resolvedTags = ruleTags ?? [];

    // If ruleId is provided but not name or tags, fetch the rule from the DB to get the current name and tags
    if (ruleId && (ruleName === undefined || ruleTags === undefined)) {
      try {
        const rule = await this.rulesSavedObjectService.get(ruleId);
        resolvedName = ruleName ?? rule.attributes.metadata.name;
        resolvedTags = ruleTags ?? rule.attributes.metadata.tags ?? [];
      } catch (e) {
        if (SavedObjectsErrorHelpers.isNotFoundError(e)) {
          return { items: [] };
        }
        throw e;
      }
    }

    const context: MatcherContext = {
      last_event_timestamp: '',
      group_hash: '',
      episode_id: '',
      episode_status: 'active',
      rule: {
        id: ruleId ?? '',
        name: resolvedName,
        tags: resolvedTags,
      },
    };

    const items: MatchedActionPolicy[] = [];

    const allPolicies = await this.findActionPolicies({ perPage: 100 });
    for (const actionPolicy of allPolicies.items) {
      if (!actionPolicy.matcher || actionPolicy.matcher.trim() === '') {
        items.push({ actionPolicy, category: 'global' });
        continue;
      }

      let isMatch = false;
      try {
        isMatch = evaluateKql(actionPolicy.matcher, context);
      } catch (err) {
        this.logger.warn({
          message: () =>
            `Failed to evaluate KQL matcher for action policy "${
              actionPolicy.id
            }" during pre-matching: ${
              err instanceof Error ? err.message : String(err)
            }. Treating as no-match.`,
        });
        continue;
      }

      if (isMatch) {
        items.push({ actionPolicy, category: 'global-filtered' });
      }
    }

    return { items };
  }

  public async enableActionPolicy({ id }: { id: string }): Promise<ActionPolicyResponse> {
    return this.updatePolicyState(id, { enabled: true });
  }

  public async disableActionPolicy({ id }: { id: string }): Promise<ActionPolicyResponse> {
    return this.updatePolicyState(id, { enabled: false });
  }

  public async snoozeActionPolicy({
    id,
    snoozedUntil,
  }: SnoozeActionPolicyParams): Promise<ActionPolicyResponse> {
    return this.updatePolicyState(id, { snoozedUntil });
  }

  public async unsnoozeActionPolicy({ id }: { id: string }): Promise<ActionPolicyResponse> {
    return this.updatePolicyState(id, { snoozedUntil: null });
  }

  public async updateActionPolicyApiKey({ id }: UpdateActionPolicyApiKeyParams): Promise<void> {
    const { attrs: existingPolicy } = await this.getExistingActionPolicy(id);

    const oldAuth = await this.getDecryptedAuth(id);
    const userProfileUid = await this.userService.getCurrentUserProfileUid();
    const now = new Date().toISOString();
    const apiKeyAttrs = await this.apiKeyService.create(`Action Policy: ${existingPolicy.name}`);

    try {
      await this.writeActionPolicyAttrs({
        id,
        attrs: {
          auth: apiKeyAttrs,
          updatedBy: userProfileUid,
          updatedAt: now,
        },
      });
    } catch (e) {
      this.markApiKeysForInvalidation(apiKeyAttrs.apiKey, false);
      throw e;
    }

    this.markApiKeysForInvalidation(oldAuth?.apiKey, oldAuth?.createdByUser);
  }

  public async bulkActionActionPolicies({
    actions,
  }: BulkActionActionPoliciesParams): Promise<BulkActionActionPoliciesResponse> {
    const [deleteActions, remainingActions] = partition(actions, (a) => a.action === 'delete');
    const [updateApiKeyActions, updateActions] = partition(
      remainingActions,
      (a) => a.action === 'update_api_key'
    );

    const errors: Array<{ id: string; message: string }> = [];
    let processed = 0;

    if (updateActions.length > 0) {
      const userProfileUid = await this.userService.getCurrentUserProfileUid();
      const now = new Date().toISOString();

      const objects = updateActions.map((action) => ({
        id: action.id,
        attrs: {
          ...resolveActionAttrs(action),
          updatedBy: userProfileUid,
          updatedAt: now,
        },
      }));

      const updateResults = await this.actionPolicySavedObjectService.bulkUpdate({
        objects,
      });

      for (const result of updateResults) {
        if ('error' in result) {
          errors.push({ id: result.id, message: result.error.message });
        } else {
          processed++;
        }
      }
    }

    for (const action of updateApiKeyActions) {
      try {
        await this.updateActionPolicyApiKey({ id: action.id });
        processed++;
      } catch (e) {
        errors.push({ id: action.id, message: e.message });
      }
    }

    if (deleteActions.length > 0) {
      const deleteIds = deleteActions.map((a) => a.id);
      const authMap = await this.getBulkDecryptedAuth(deleteIds);

      const deleteResults = await this.actionPolicySavedObjectService.bulkDelete({
        ids: deleteIds,
      });

      for (const result of deleteResults) {
        if ('error' in result) {
          errors.push({ id: result.id, message: result.error.message });
        } else {
          processed++;
          const auth = authMap.get(result.id);
          this.markApiKeysForInvalidation(auth?.apiKey, auth?.createdByUser);
        }
      }
    }

    return { processed, total: actions.length, errors };
  }

  private buildFindFilter(params: FindActionPoliciesParams): KueryNode | undefined {
    const conditions: KueryNode[] = [];
    const attrPrefix = `${ACTION_POLICY_SAVED_OBJECT_TYPE}.attributes`;

    if (params.enabled !== undefined) {
      conditions.push(nodeBuilder.is(`${attrPrefix}.enabled`, params.enabled ? 'true' : 'false'));
    }

    if (params.tags && params.tags.length > 0) {
      const tagConditions = params.tags.map((tag) => nodeBuilder.is(`${attrPrefix}.tags`, tag));
      conditions.push(
        tagConditions.length === 1 ? tagConditions[0] : nodeBuilder.or(tagConditions)
      );
    }

    if (conditions.length === 0) {
      return undefined;
    }

    return conditions.length === 1 ? conditions[0] : nodeBuilder.and(conditions);
  }

  private mapSortField(sortField?: string): string | undefined {
    if (!sortField) {
      return undefined;
    }

    const sortFieldMap: Record<string, string> = {
      name: 'name.keyword',
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    };

    return sortFieldMap[sortField];
  }

  public async getAllTags(params?: { search?: string }): Promise<string[]> {
    return this.actionPolicySavedObjectService.getDistinctTags({
      search: params?.search,
    });
  }

  public async deleteActionPolicy({ id }: { id: string }): Promise<void> {
    if (!(await this.actionPolicyExists({ id }))) {
      throw Boom.notFound(`Action policy with id "${id}" not found`, {
        code: ALERTING_V2_ERROR_CODES.ACTION_POLICY_NOT_FOUND,
        details: { action_policy_id: id },
      });
    }
    const auth = await this.getDecryptedAuth(id);
    await this.actionPolicySavedObjectService.delete({ id });
    this.markApiKeysForInvalidation(auth?.apiKey, auth?.createdByUser);
  }

  private markApiKeysForInvalidation(apiKey?: string, createdByUser?: boolean): void {
    if (!apiKey || createdByUser) {
      return;
    }

    this.apiKeyService.markApiKeysForInvalidation([apiKey]).catch(() => {});
  }

  private async getDecryptedAuth(
    id: string
  ): Promise<{ apiKey: string; createdByUser: boolean } | null> {
    try {
      const doc =
        await this.esoClient.getDecryptedAsInternalUser<ActionPolicySavedObjectAttributes>(
          ACTION_POLICY_SAVED_OBJECT_TYPE,
          id,
          this.namespace ? { namespace: this.namespace } : undefined
        );
      const auth = doc.attributes?.auth;
      if (!auth?.apiKey) return null;

      return {
        apiKey: auth.apiKey,
        createdByUser: auth.createdByUser,
      };
    } catch {
      return null;
    }
  }

  private async getBulkDecryptedAuth(
    ids: string[]
  ): Promise<Map<string, { apiKey: string; createdByUser: boolean }>> {
    const targetIds = new Set(ids);
    const authMap = new Map<string, { apiKey: string; createdByUser: boolean }>();

    try {
      const finder =
        await this.esoClient.createPointInTimeFinderDecryptedAsInternalUser<ActionPolicySavedObjectAttributes>(
          {
            type: ACTION_POLICY_SAVED_OBJECT_TYPE,
            perPage: Math.min(ids.length, 1000),
            ...(this.namespace ? { namespaces: [this.namespace] } : {}),
          }
        );

      for await (const response of finder.find()) {
        for (const so of response.saved_objects) {
          if (targetIds.has(so.id) && so.attributes.auth?.apiKey) {
            authMap.set(so.id, {
              apiKey: so.attributes.auth.apiKey,
              createdByUser: so.attributes.auth.createdByUser,
            });
          }
        }
        if (authMap.size >= targetIds.size) {
          finder.close().catch(() => {});
          break;
        }
      }
    } catch {
      // best-effort — same as getDecryptedAuth returning null on failure
    }

    return authMap;
  }

  private async updatePolicyState(
    id: string,
    stateUpdate: { enabled?: boolean; snoozedUntil?: string | null }
  ): Promise<ActionPolicyResponse> {
    if (stateUpdate.snoozedUntil) {
      validateDateString(stateUpdate.snoozedUntil);
    }

    const userProfileUid = await this.userService.getCurrentUserProfileUid();
    const now = new Date().toISOString();

    try {
      await this.writeActionPolicyAttrs({
        id,
        attrs: {
          ...stateUpdate,
          updatedBy: userProfileUid,
          updatedAt: now,
        },
      });
    } catch (e) {
      if (SavedObjectsErrorHelpers.isNotFoundError(e)) {
        throw Boom.notFound(`Action policy with id "${id}" not found`, {
          code: ALERTING_V2_ERROR_CODES.ACTION_POLICY_NOT_FOUND,
          details: { action_policy_id: id },
        });
      }
      throw e;
    }

    return this.getActionPolicy({ id });
  }

  public async upsertActionPolicy({
    id,
    data,
  }: {
    id: string;
    data: CreateActionPolicyDataInput;
  }): Promise<{ policy: ActionPolicyResponse; created: boolean }> {
    // Validate up front so a bad body never spends an API key allocation or
    // even consults the SO store.
    const parsed = this.parseActionPolicyData(createActionPolicyDataSchema, data, 'upsert');

    const exists = await this.actionPolicyExists({ id });

    if (!exists) {
      const policy = await this.createActionPolicy({ data, options: { id } });
      return { policy, created: true };
    }

    const userProfileUid = await this.userService.getCurrentUserProfileUid();
    const now = new Date().toISOString();

    const { attrs: existingAttrs, version: existingVersion } = await this.getExistingActionPolicy(
      id
    );

    // The API key is rotated on every replace; the old key is invalidated
    // only after the SO write succeeds, so a failed replace doesn't leave
    // the policy with a key that has already been invalidated.
    const oldAuth = await this.getDecryptedAuth(id);
    const apiKeyAttrs = await this.apiKeyService.create(`Action Policy: ${parsed.name}`);

    // PUT replaces every field accepted by createActionPolicyDataSchema. Audit
    // metadata (createdBy/createdAt) and operational state (enabled,
    // snoozedUntil) are not part of the create schema and are preserved here.
    const replacementAttrs: ActionPolicySavedObjectAttributes = {
      ...buildCreateActionPolicyAttributes({
        data: parsed,
        auth: apiKeyAttrs,
        createdBy: existingAttrs.createdBy,
        createdAt: existingAttrs.createdAt,
        updatedBy: userProfileUid,
        updatedAt: now,
      }),
      enabled: existingAttrs.enabled,
      snoozedUntil: existingAttrs.snoozedUntil,
    };

    let updated: { id: string; version?: string };
    try {
      updated = await this.writeActionPolicyAttrs({
        id,
        attrs: replacementAttrs,
        version: existingVersion,
      });
    } catch (e) {
      this.markApiKeysForInvalidation(apiKeyAttrs.apiKey, false);
      throw e;
    }

    this.markApiKeysForInvalidation(oldAuth?.apiKey, oldAuth?.createdByUser);

    return {
      policy: transformActionPolicySoAttributesToApiResponse({
        id,
        version: updated.version,
        attributes: replacementAttrs,
      }),
      created: false,
    };
  }
}
