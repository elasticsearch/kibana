/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type {
  ElasticsearchServiceStart,
  Logger,
  SavedObjectsServiceStart,
  UiSettingsServiceStart,
} from '@kbn/core/server';
import type { KibanaRequest } from '@kbn/core-http-server';
import type { SpacesPluginStart } from '@kbn/spaces-plugin/server';
import type { SkillDefinition } from '@kbn/agent-builder-server/skills';
import { validateSkillDefinition } from '@kbn/agent-builder-server/skills';
import { isAllowedBuiltinSkill } from '@kbn/agent-builder-server/allow_lists';
import type { ToolRegistry } from '@kbn/agent-builder-server';
import { AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID } from '@kbn/management-settings-ids';
import { getCurrentSpaceId } from '../../utils/spaces';
import { getSkillEntryPath } from '../execution/runner/store/volumes/skills/utils';
import { createSkillRegistry } from './skill_registry';
import type { SkillRegistry } from './skill_registry';
import { createBuiltinSkillProvider } from './builtin';
import { createPersistedSkillProvider } from './persisted';

export interface SkillServiceSetup {
  registerSkill(skill: SkillDefinition): void;
}

export interface SkillServiceStart {
  /**
   * Create a skill registry scoped to the current user and context.
   *
   * Each call snapshots the currently registered builtin skills, so
   * dynamic registrations or unregistrations that happen after the
   * registry is created do not affect that registry instance.
   */
  getRegistry(opts: { request: KibanaRequest }): Promise<SkillRegistry>;

  /**
   * Register a skill dynamically after plugin start.
   *
   * The operation is serialized internally so concurrent calls are safe.
   * Only affects future `getRegistry()` calls -- existing registry
   * instances hold an immutable snapshot of the builtin skills that
   * existed at creation time.
   */
  registerSkill(skill: SkillDefinition): Promise<void>;
}

export interface SkillService {
  setup: () => SkillServiceSetup;
  start: (deps: SkillServiceStartDeps) => SkillServiceStart;
}

export interface SkillServiceStartDeps {
  elasticsearch: ElasticsearchServiceStart;
  spaces?: SpacesPluginStart;
  logger: Logger;
  getToolRegistry: (opts: { request: KibanaRequest }) => Promise<ToolRegistry>;
  uiSettings: UiSettingsServiceStart;
  savedObjects: SavedObjectsServiceStart;
}

export const createSkillService = (): SkillService => {
  return new SkillServiceImpl();
};

class SkillServiceImpl implements SkillService {
  private readonly skills: Map<string, SkillDefinition> = new Map();
  private readonly skillFullPaths: Set<string> = new Set();

  /**
   * Promise chain used to serialize dynamic registration so that the async
   * validate-then-mutate sequence is atomic.
   */
  private mutationQueue: Promise<unknown> = Promise.resolve();

  setup(): SkillServiceSetup {
    return {
      registerSkill: (skill) => {
        if (!isAllowedBuiltinSkill(skill.id)) {
          throw new Error(
            `Built-in skill with id "${skill.id}" is not in the list of allowed built-in skills.
             Please add it to the list of allowed built-in skills in the "@kbn/agent-builder-server/allow_lists.ts" file.`
          );
        }
        if (this.skills.has(skill.id)) {
          throw new Error(`Skill type with id ${skill.id} already registered`);
        }

        const fullPath = getSkillEntryPath({ skill });
        if (this.skillFullPaths.has(fullPath)) {
          throw new Error(
            `Skill with path ${skill.basePath} and name ${skill.name} already registered`
          );
        }
        this.skillFullPaths.add(fullPath);
        this.skills.set(skill.id, skill);
      },
    };
  }

  start({
    elasticsearch,
    spaces,
    logger,
    getToolRegistry,
    uiSettings,
    savedObjects,
  }: SkillServiceStartDeps): SkillServiceStart {
    const validated = Promise.all(
      [...this.skills.values()].map((skill) => validateSkillDefinition(skill))
    );

    return {
      getRegistry: async ({ request }) => {
        await this.mutationQueue;
        await validated;
        const space = getCurrentSpaceId({ request, spaces });
        const builtinProvider = createBuiltinSkillProvider([...this.skills.values()]);
        const persistedProvider = createPersistedSkillProvider({
          space,
          esClient: elasticsearch.client.asInternalUser,
          logger,
        });
        const toolRegistry = await getToolRegistry({ request });
        const soClient = savedObjects.getScopedClient(request);
        const uiSettingsClient = uiSettings.asScopedToClient(soClient);
        const uiSettingKeys = [
          ...new Set(
            [...this.skills.values()]
              .filter((skill) => skill.uiSettingRequired)
              .map((skill) =>
                typeof skill.uiSettingRequired === 'string'
                  ? skill.uiSettingRequired
                  : skill.uiSettingRequired!.key
              )
          ),
        ];
        const [experimentalFeaturesEnabled, ...uiSettingValuesList] = await Promise.all([
          uiSettingsClient.get<boolean>(AGENT_BUILDER_EXPERIMENTAL_FEATURES_SETTING_ID),
          ...uiSettingKeys.map((key) => uiSettingsClient.get(key)),
        ]);
        const uiSettingValues = new Map(
          uiSettingKeys.map((key, index) => [key, uiSettingValuesList[index]])
        );

        return createSkillRegistry({
          builtinProvider,
          persistedProvider,
          toolRegistry,
          experimentalFeaturesEnabled,
          uiSettingValues,
        });
      },
      registerSkill: (skill) => {
        const op = this.mutationQueue.then(async () => {
          await validateSkillDefinition(skill);

          if (this.skills.has(skill.id)) {
            throw new Error(`Skill type with id ${skill.id} already registered`);
          }

          const fullPath = getSkillEntryPath({ skill });
          if (this.skillFullPaths.has(fullPath)) {
            throw new Error(
              `Skill with path ${skill.basePath} and name ${skill.name} already registered`
            );
          }
          this.skillFullPaths.add(fullPath);
          this.skills.set(skill.id, skill);
        });
        this.mutationQueue = op.catch(() => {});
        return op;
      },
    };
  }
}
