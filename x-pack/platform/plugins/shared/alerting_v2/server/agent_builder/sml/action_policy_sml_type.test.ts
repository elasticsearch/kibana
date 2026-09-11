/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { loggingSystemMock } from '@kbn/core/server/mocks';
import { savedObjectsClientMock } from '@kbn/core-saved-objects-api-server-mocks';
import type { ElasticsearchClient } from '@kbn/core-elasticsearch-server';
import type { SavedObjectsClientContract } from '@kbn/core-saved-objects-api-server';
import type { KibanaRequest } from '@kbn/core-http-server';
import { ACTION_POLICY_ATTACHMENT_TYPE } from '@kbn/alerting-v2-schemas';
import { ACTION_POLICY_KI_TYPE } from '@kbn/agent-builder-elastic-ai-index-ki-types';
import type { ActionPolicyClient } from '../../lib/action_policy_client';
import {
  ACTION_POLICY_SAVED_OBJECT_TYPE,
  type ActionPolicySavedObjectAttributes,
} from '../../saved_objects';
import { createActionPolicySmlType } from './action_policy_sml_type';

const baseActionPolicyAttrs: ActionPolicySavedObjectAttributes = {
  name: 'Critical alerts → Slack',
  description: 'Route every critical-priority alert to #oncall',
  enabled: true,
  destinations: [{ type: 'workflow', id: 'wf-critical-route' }],
  matcher: 'alert.severity = "critical"',
  groupingMode: 'per_episode',
  tags: ['oncall', 'critical'],
  apiKeyOwner: 'elastic',
  apiKeyCreatedByUser: true,
  createdBy: 'elastic',
  updatedBy: 'elastic',
  createdAt: '2026-04-01T00:00:00.000Z',
  updatedAt: '2026-04-10T00:00:00.000Z',
} as ActionPolicySavedObjectAttributes;

const buildToAttachmentContext = () => ({
  request: {} as KibanaRequest,
  savedObjectsClient: {} as SavedObjectsClientContract,
  spaceId: 'default',
});

describe('createActionPolicySmlType', () => {
  let getActionPolicy: jest.Mock;
  let getIsAlertingV2Enabled: jest.Mock;
  let soClient: ReturnType<typeof savedObjectsClientMock.create>;
  let actionPolicyClient: ActionPolicyClient;

  const buildSmlContext = (logger = loggingSystemMock.createLogger()) => ({
    esClient: {} as ElasticsearchClient,
    savedObjectsClient: soClient,
    logger,
  });

  const stubFinder = (find: () => AsyncGenerator<unknown>) => {
    const close = jest.fn().mockResolvedValue(undefined);
    soClient.createPointInTimeFinder.mockReturnValue({ find, close } as unknown as ReturnType<
      typeof soClient.createPointInTimeFinder
    >);
    return close;
  };

  beforeEach(() => {
    getActionPolicy = jest.fn();
    getIsAlertingV2Enabled = jest.fn().mockResolvedValue(true);
    soClient = savedObjectsClientMock.create();
    actionPolicyClient = { getActionPolicy } as unknown as ActionPolicyClient;
  });

  const buildDefinition = () =>
    createActionPolicySmlType({
      getScopedActionPolicyClient: () => actionPolicyClient,
      getIsAlertingV2Enabled: () => getIsAlertingV2Enabled(),
    });

  describe('id and fetchFrequency', () => {
    it('uses the shared ACTION_POLICY_KI_TYPE constant', () => {
      expect(buildDefinition().id).toBe(ACTION_POLICY_KI_TYPE);
    });

    it('returns "1m" as fetch frequency', () => {
      // Pinned to '1m' to match rule_sml_type — bumping should be a deliberate decision.
      expect(buildDefinition().fetchFrequency!()).toBe('1m');
    });
  });

  describe('list', () => {
    const drainList = async () => {
      const items = [];
      const def = buildDefinition();
      for await (const page of def.list(buildSmlContext())) {
        items.push(...page);
      }
      return items;
    };

    it('yields items from the saved objects finder and closes it when done', async () => {
      const close = stubFinder(async function* () {
        yield {
          saved_objects: [
            {
              id: 'policy-1',
              updated_at: '2026-04-10T00:00:00.000Z',
              namespaces: ['default', 'space-a'],
            },
            {
              id: 'policy-2',
              updated_at: '2026-04-11T00:00:00.000Z',
              namespaces: ['default'],
            },
          ],
        };
      });

      const items = await drainList();

      expect(items).toEqual([
        {
          id: 'policy-1',
          updatedAt: '2026-04-10T00:00:00.000Z',
          spaces: ['default', 'space-a'],
        },
        { id: 'policy-2', updatedAt: '2026-04-11T00:00:00.000Z', spaces: ['default'] },
      ]);
      expect(soClient.createPointInTimeFinder).toHaveBeenCalledWith(
        expect.objectContaining({
          type: ACTION_POLICY_SAVED_OBJECT_TYPE,
          namespaces: ['*'],
          fields: [],
        })
      );
      expect(close).toHaveBeenCalledTimes(1);
    });

    it('falls back to "default" namespace and a fresh timestamp when missing', async () => {
      // Some legacy saved objects pre-date the cross-space update —
      // `namespaces` and `updated_at` can both be absent. The crawler
      // must not crash on those: we substitute safe defaults instead.
      stubFinder(async function* () {
        yield {
          saved_objects: [{ id: 'policy-no-meta' }],
        };
      });

      const items = await drainList();

      expect(items).toHaveLength(1);
      expect(items[0]).toEqual({
        id: 'policy-no-meta',
        spaces: ['default'],
        updatedAt: expect.any(String),
      });
      expect(() => new Date(items[0].updatedAt).toISOString()).not.toThrow();
    });

    it('closes the finder even if iteration throws', async () => {
      // PIT-based finders must release the PIT regardless of how the
      // generator unwinds — verifying the `finally` block.
      const close = stubFinder(async function* () {
        yield { saved_objects: [{ id: 'policy-1' }] };
        throw new Error('boom');
      });

      await expect(drainList()).rejects.toThrow('boom');
      expect(close).toHaveBeenCalledTimes(1);
    });

    it('yields nothing and never opens a PIT finder when alerting v2 is disabled', async () => {
      getIsAlertingV2Enabled.mockResolvedValue(false);

      const items = await drainList();

      expect(items).toEqual([]);
      expect(soClient.createPointInTimeFinder).not.toHaveBeenCalled();
    });
  });

  describe('getSmlEntry', () => {
    it('returns a single entry built from action policy metadata', async () => {
      // Title is the policy name; content is the searchable corpus an
      // agent reasons over (name + description + matcher + grouping +
      // destinations + tags). The fields are pinned so a refactor
      // that quietly drops one (and silently degrades search recall)
      // shows up as a diff.
      soClient.get.mockResolvedValueOnce({
        id: 'policy-1',
        type: ACTION_POLICY_SAVED_OBJECT_TYPE,
        references: [],
        attributes: baseActionPolicyAttrs,
      });

      const result = await buildDefinition().getSmlEntry('policy-1', buildSmlContext());

      expect(soClient.get).toHaveBeenCalledWith(ACTION_POLICY_SAVED_OBJECT_TYPE, 'policy-1');
      expect(result).toEqual({
        type: ACTION_POLICY_KI_TYPE,
        title: 'Critical alerts → Slack',
        content: [
          'Critical alerts → Slack',
          'Route every critical-priority alert to #oncall',
          'alert.severity = "critical"',
          'per_episode',
          'workflow:wf-critical-route',
          'oncall, critical',
        ].join('\n'),
      });
    });

    it('falls back to originId for title when attributes.name is missing', async () => {
      soClient.get.mockResolvedValueOnce({
        id: 'policy-bare',
        type: ACTION_POLICY_SAVED_OBJECT_TYPE,
        references: [],
        attributes: undefined as unknown as ActionPolicySavedObjectAttributes,
      });

      const result = await buildDefinition().getSmlEntry('policy-bare', buildSmlContext());

      expect(result?.title).toBe('policy-bare');
    });

    it('returns undefined and logs a warning when the saved object lookup throws', async () => {
      // getSmlEntry is called by the crawler per-origin — a single
      // missing SO must NOT abort the whole crawl. We swallow the
      // error and log it so other origins can still be indexed.
      soClient.get.mockRejectedValueOnce(new Error('not found'));
      const logger = loggingSystemMock.createLogger();

      const result = await buildDefinition().getSmlEntry('policy-missing', buildSmlContext(logger));

      expect(result).toBeUndefined();
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining("SML action policy: failed to get data for 'policy-missing'")
      );
    });

    it('returns undefined without reading the saved object when alerting v2 is disabled', async () => {
      getIsAlertingV2Enabled.mockResolvedValue(false);

      const result = await buildDefinition().getSmlEntry('policy-1', buildSmlContext());

      expect(result).toBeUndefined();
      expect(soClient.get).not.toHaveBeenCalled();
    });
  });

  describe('getPermissions', () => {
    it('returns the registered ai_index read action for action policies', () => {
      // This is the security-critical assertion the original review
      // flagged as missing. The action policies API gates reads on
      // `ai_index:<kiType>/read` (via ALERTING_V2_API_PRIVILEGES);
      // the SML entry MUST stamp the same privilege so a user without
      // it cannot see policy entries in agent context.
      //
      // Regression history: prior iterations of analogous SML types
      // shipped with hand-rolled privilege strings that didn't map to
      // any registered Kibana privilege — entries were silently
      // invisible to every caller (including superusers) because
      // `checkPrivilegesDynamicallyWithRequest` reported "unknown".
      // Pinning the privilege resolution against
      // `ALERTING_V2_API_PRIVILEGES.actionPolicies.read` ensures the
      // gate stays in lock-step with the rest of the plugin.
      const permissions = buildDefinition().getPermissions!('policy-1', buildSmlContext());
      expect(permissions).toEqual({
        kibana: {
          privileges: { name: [`ai_index:${ACTION_POLICY_KI_TYPE}/read`] },
        },
      });
    });
  });

  describe('toAttachment', () => {
    const buildSmlDocument = (overrides: Partial<{ origin_id: string }> = {}) => {
      const originId = overrides.origin_id ?? 'policy-1';
      return {
        type: ACTION_POLICY_KI_TYPE,
        title: 'Critical alerts → Slack',
        content: '',
        permissions: { kibana: { privileges: [] } },
        attributes: {
          id: 'sml-1',
          origin: { uri: `${ACTION_POLICY_KI_TYPE}://${originId}` },
          created_at: '2026-04-10T00:00:00.000Z',
          updated_at: '2026-04-10T00:00:00.000Z',
          ingestion_method: 'crawled' as const,
        },
      };
    };

    it('returns an attachment input wrapping the parsed action policy', async () => {
      // `toAttachment` is the bridge from indexed entry -> agent
      // builder attachment payload. It MUST use the scoped client
      // (carries the caller's request) — not the internal repository
      // — so the read goes through the user's authorization context.
      getActionPolicy.mockResolvedValueOnce({
        ...baseActionPolicyAttrs,
        id: 'policy-1',
      });

      const result = await buildDefinition().toAttachment(
        buildSmlDocument(),
        buildToAttachmentContext()
      );

      expect(getActionPolicy).toHaveBeenCalledWith({ id: 'policy-1' });
      expect(result?.type).toBe(ACTION_POLICY_ATTACHMENT_TYPE);
      expect(result?.data).toEqual(expect.objectContaining({ name: baseActionPolicyAttrs.name }));
    });

    it('returns undefined when getActionPolicy throws', async () => {
      // The entry surfaces in search results but the policy itself
      // was deleted between index time and read time — surface this
      // as "no attachment" rather than 500-ing the whole reply.
      // `actionPolicyAttachmentDataSchema` is `.partial()`, so the
      // schema-parsing path can't fail short of a non-object response;
      // the lookup-throws path is the realistic failure mode and the
      // only one this branch needs to cover.
      getActionPolicy.mockRejectedValueOnce(new Error('not found'));

      const result = await buildDefinition().toAttachment(
        buildSmlDocument({ origin_id: 'policy-missing' }),
        buildToAttachmentContext()
      );

      expect(result).toBeUndefined();
    });

    it('uses an empty string when the origin uri carries no id', async () => {
      // Defensive contract: the origin id is parsed out of `attributes.origin.uri`. A malformed
      // uri must thread an empty string down to `getActionPolicy` rather than crash the call.
      getActionPolicy.mockResolvedValueOnce({ ...baseActionPolicyAttrs, id: '' });

      const document = buildSmlDocument();
      document.attributes.origin.uri = `${ACTION_POLICY_KI_TYPE}://`;

      await buildDefinition().toAttachment(document, buildToAttachmentContext());

      expect(getActionPolicy).toHaveBeenCalledWith({ id: '' });
    });

    it('returns undefined without calling the action policy client when alerting v2 is disabled', async () => {
      getIsAlertingV2Enabled.mockResolvedValue(false);

      const result = await buildDefinition().toAttachment(
        buildSmlDocument(),
        buildToAttachmentContext()
      );

      expect(result).toBeUndefined();
      expect(getActionPolicy).not.toHaveBeenCalled();
    });
  });
});
