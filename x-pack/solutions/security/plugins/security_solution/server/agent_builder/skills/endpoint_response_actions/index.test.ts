/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EndpointAppContextService } from '../../../endpoint/endpoint_app_context_services';
import { createMockEndpointAppContext } from '../../../endpoint/mocks';
import { validateSkillDefinition } from '@kbn/agent-builder-server/skills/type_definition';
import {
  createEndpointResponseActionsSkill,
  ISOLATE_TOOL_ID,
  UNISOLATE_TOOL_ID,
  GET_ENDPOINT_STATUS_TOOL_ID,
  LIST_ENDPOINTS_TOOL_ID,
} from '.';

describe('createEndpointResponseActionsSkill', () => {
  let mockEndpointAppContextService: EndpointAppContextService;

  beforeEach(() => {
    mockEndpointAppContextService = createMockEndpointAppContext().service;
  });

  describe('skill definition', () => {
    it('returns a valid skill definition', () => {
      const skill = createEndpointResponseActionsSkill(mockEndpointAppContextService);

      expect(skill).toBeDefined();
      expect(skill.id).toBe('endpoint-response-actions');
      expect(skill.name).toBe('endpoint-response-actions');
      expect(skill.basePath).toBe('skills/security/endpoint');
      expect(skill.description).toContain('endpoint response actions');
      expect(skill.content).toContain('Endpoint Response Actions Skill');
    });

    it('includes system instructions in content', () => {
      const skill = createEndpointResponseActionsSkill(mockEndpointAppContextService);

      expect(skill.content).toContain('Endpoint Response Actions Skill');
      expect(skill.content).toContain('When to Use This Skill');
      expect(skill.content).toContain('Conversation Flow');
      expect(skill.content).toContain('Error Handling');
    });
  });

  describe('getInlineTools', () => {
    it('returns exactly 4 inline tools (list_endpoints, isolate_host, unisolate_host, get_endpoint_status)', async () => {
      const skill = createEndpointResponseActionsSkill(mockEndpointAppContextService);
      const inlineTools = await skill.getInlineTools?.();
      expect(inlineTools).toHaveLength(4);
      const toolIds = (inlineTools ?? []).map((t) => t.id);
      expect(toolIds).toContain(LIST_ENDPOINTS_TOOL_ID);
      expect(toolIds).toContain(ISOLATE_TOOL_ID);
      expect(toolIds).toContain(UNISOLATE_TOOL_ID);
      expect(toolIds).toContain(GET_ENDPOINT_STATUS_TOOL_ID);
    });

    it('satisfies the 7-tool hard cap enforced by validateSkillDefinition', async () => {
      const skill = createEndpointResponseActionsSkill(mockEndpointAppContextService);
      await expect(validateSkillDefinition(skill)).resolves.toBeDefined();
    });

    it('includes isolate_host tool', async () => {
      const skill = createEndpointResponseActionsSkill(mockEndpointAppContextService);

      const inlineTools = await skill.getInlineTools?.();

      const isolateTool = inlineTools?.find((tool) => tool.id === ISOLATE_TOOL_ID);

      expect(isolateTool).toBeDefined();
      expect(isolateTool?.description).toContain('Isolates a host');
    });

    it('includes unisolate_host tool', async () => {
      const skill = createEndpointResponseActionsSkill(mockEndpointAppContextService);

      const inlineTools = await skill.getInlineTools?.();

      const unisolateTool = inlineTools?.find((tool) => tool.id === UNISOLATE_TOOL_ID);

      expect(unisolateTool).toBeDefined();
      expect(unisolateTool?.description).toContain('Un-isolates a host');
    });

    it('includes get_endpoint_status tool', async () => {
      const skill = createEndpointResponseActionsSkill(mockEndpointAppContextService);

      const inlineTools = await skill.getInlineTools?.();

      const statusTool = inlineTools?.find((tool) => tool.id === GET_ENDPOINT_STATUS_TOOL_ID);

      expect(statusTool).toBeDefined();
      expect(statusTool?.description).toContain('Retrieves the current status');
    });
  });
});
