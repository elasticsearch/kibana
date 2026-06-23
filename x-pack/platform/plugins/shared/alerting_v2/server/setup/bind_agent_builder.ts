/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { AttachmentTypeDefinition } from '@kbn/agent-builder-server/attachments';
import { Logger, OnSetup, OnStart, PluginSetup } from '@kbn/core-di';
import { CoreStart } from '@kbn/core-di-server';
import type { Container, ContainerModuleLoadOptions } from 'inversify';
import { createActionPolicyAttachmentType } from '../agent_builder/attachments/action_policy_attachment_type';
import { createRuleAttachmentType } from '../agent_builder/attachments/rule_attachment_type';
import { resolveRequestScoped } from '../agent_builder/resolve_request_scoped';
import { registerSkills } from '../agent_builder/skills/register_skills';
import { SchemaTranslationError } from '../agent_builder/skills/schema_to_skill_docs';
import { createActionPolicySmlType } from '../agent_builder/sml/action_policy_sml_type';
import { createRuleSmlType } from '../agent_builder/sml/rule_sml_type';
import { AttachmentTypeToken } from '../agent_builder/tokens';
import { ActionPolicyClient } from '../lib/action_policy_client';
import { WorkflowsManagementApiToken } from '../lib/dispatcher/steps/dispatch_step_tokens';
import { RulesClient } from '../lib/rules_client';
import { ACTION_POLICY_SAVED_OBJECT_TYPE, RULE_SAVED_OBJECT_TYPE } from '../saved_objects';
import type { AlertingServerSetupDependencies } from '../types';

type AgentBuilderSetup = NonNullable<AlertingServerSetupDependencies['agentBuilder']>;

/**
 * Returns the Agent Builder setup contract, or `undefined` when the optional
 * `agentBuilder` plugin is not available.
 */
function getAgentBuilder(container: Container): AgentBuilderSetup | undefined {
  const token = PluginSetup<AgentBuilderSetup>('agentBuilder');
  return container.isBound(token) ? container.get(token) : undefined;
}

/**
 * Wiring for the Agent Builder integration. No-op when the optional
 * `agentBuilder` plugin is not available.
 *
 * - SML types are registered during setup (synchronously) so the agent context
 *   layer can schedule their crawler tasks during its own start phase. Gated on
 *   the optional `agentContextLayer` plugin.
 * - Attachment types are bound to {@link AttachmentTypeToken} (deps resolved via
 *   DI) and registered during start. Skills are registered alongside them.
 *
 * Both resolve request-scoped clients on demand via {@link resolveRequestScoped},
 * since they run outside the HTTP route scope.
 */
export function bindAgentBuilder({ bind }: ContainerModuleLoadOptions) {
  bind(AttachmentTypeToken).toResolvedValue(
    (logger, injection) =>
      createRuleAttachmentType({
        logger,
        getRulesClient: (context) => resolveRequestScoped(injection, context.request, RulesClient),
      }) as AttachmentTypeDefinition,
    [Logger, CoreStart('injection')]
  );
  bind(AttachmentTypeToken).toResolvedValue(
    (logger, injection) =>
      createActionPolicyAttachmentType({
        logger,
        getActionPolicyClient: (context) =>
          resolveRequestScoped(injection, context.request, ActionPolicyClient),
      }) as AttachmentTypeDefinition,
    [Logger, CoreStart('injection')]
  );

  bind(OnSetup).toConstantValue((container) => {
    if (!getAgentBuilder(container)) {
      return;
    }

    const agentContextLayerToken =
      PluginSetup<NonNullable<AlertingServerSetupDependencies['agentContextLayer']>>(
        'agentContextLayer'
      );
    if (!container.isBound(agentContextLayerToken)) {
      return;
    }

    const agentContextLayer = container.get(agentContextLayerToken);

    // SML types are registered inline (not via a token registry like attachments):
    // registration happens at setup, but their clients/repositories must be
    // resolved lazily at crawl time (start phase), so deps cannot be eagerly
    // injected at bind/resolution time.
    agentContextLayer.registerType(
      createRuleSmlType({
        getScopedRulesClient: (request) =>
          resolveRequestScoped(container.get(CoreStart('injection')), request, RulesClient),
        getInternalRepository: () =>
          container
            .get(CoreStart('savedObjects'))
            .createInternalRepository([RULE_SAVED_OBJECT_TYPE]),
      })
    );
    agentContextLayer.registerType(
      createActionPolicySmlType({
        getScopedActionPolicyClient: (request) =>
          resolveRequestScoped(container.get(CoreStart('injection')), request, ActionPolicyClient),
        getInternalRepository: () =>
          container
            .get(CoreStart('savedObjects'))
            .createInternalRepository([ACTION_POLICY_SAVED_OBJECT_TYPE]),
      })
    );
  });

  bind(OnStart).toConstantValue(async (container) => {
    const agentBuilder = getAgentBuilder(container);
    if (!agentBuilder) {
      return;
    }

    for (const attachmentType of container.getAll(AttachmentTypeToken)) {
      agentBuilder.attachments.registerType(attachmentType);
    }

    const workflowsManagementApi = container.get(WorkflowsManagementApiToken);
    try {
      registerSkills(agentBuilder, {
        getWorkflow: (id, sid) => workflowsManagementApi.getWorkflow(id, sid),
        getAvailableConnectors: (sid, req) =>
          workflowsManagementApi.getAvailableConnectors(sid, req),
      });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (e instanceof SchemaTranslationError) {
        container
          .get(Logger)
          .warn(`Rule management skill registered with empty schema docs: ${message}`);
      } else {
        container.get(Logger).warn(`Failed to register rule management skill: ${message}`);
      }
    }

    container.get(Logger).debug('Rule management skill and attachments registered');
  });
}
