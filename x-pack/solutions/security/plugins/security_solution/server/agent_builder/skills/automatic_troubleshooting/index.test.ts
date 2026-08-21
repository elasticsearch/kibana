/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { platformCoreTools } from '@kbn/agent-builder-common';

import type { EndpointAppContextService } from '../../../endpoint/endpoint_app_context_services';
import { createMockEndpointAppContext } from '../../../endpoint/mocks';
import { createAutomaticTroubleshootingSkill } from '.';

describe('createAutomaticTroubleshootingSkill', () => {
  let mockEndpointAppContextService: EndpointAppContextService;

  beforeEach(() => {
    mockEndpointAppContextService = createMockEndpointAppContext().service;
  });

  describe('skill definition', () => {
    it('returns a valid skill definition', () => {
      const skill = createAutomaticTroubleshootingSkill(mockEndpointAppContextService);

      expect(skill).toBeDefined();
      expect(skill.id).toBe('automatic_troubleshooting');
      expect(skill.name).toBe('elastic-defend-configuration-troubleshooting');
      expect(skill.basePath).toBe('skills/security/endpoint');
      expect(skill.description).toContain(
        'observed Elastic Defend endpoint behavior and operational outcomes'
      );
      expect(skill.content).toContain('Elastic Defend Configuration Troubleshooting');
    });

    it('includes available indices in referenced content', () => {
      const skill = createAutomaticTroubleshootingSkill(mockEndpointAppContextService);

      expect(skill.referencedContent).toBeDefined();
      expect(skill.referencedContent).toHaveLength(1);
      expect(skill.referencedContent![0].name).toBe('available_indices');
      expect(skill.referencedContent![0].relativePath).toBe('.');
      expect(skill.referencedContent![0].content).toContain('metrics-endpoint.metadata');
    });

    it('includes system instructions in content', () => {
      const skill = createAutomaticTroubleshootingSkill(mockEndpointAppContextService);

      expect(skill.content).toContain('Elastic Defend Configuration Troubleshooting');
      expect(skill.content).toContain('When to use this skill');
      expect(skill.content).toContain('Available Indices');
      expect(skill.content).toContain('Troubleshooting Tools');
      expect(skill.content).toContain('Troubleshooting Approach');
      expect(skill.content).toContain('Scoped investigation framework');
      expect(skill.content).toContain('Example integration knowledge queries');
      expect(skill.content).toContain('Constraints');
    });

    it('documents every scoped-investigation classification the framework branches on', () => {
      const skill = createAutomaticTroubleshootingSkill(mockEndpointAppContextService);

      expect(skill.content).toContain('CURRENTLY_HEALTHY');
      expect(skill.content).toContain('CURRENT_POLICY_FAILURE');
      expect(skill.content).toContain('RECOVERED_POLICY_FAILURE');
      expect(skill.content).toContain('NON_POLICY_HEALTH_FAILURE');
      expect(skill.content).toContain('OTHER_CURRENT_ISSUE');
    });
  });

  describe('getRegistryTools', () => {
    it('returns the correct platform core tools', () => {
      const skill = createAutomaticTroubleshootingSkill(mockEndpointAppContextService);

      const allowedTools = skill.getRegistryTools?.();

      expect(allowedTools).toBeDefined();
      expect(allowedTools).toHaveLength(3);
      expect(allowedTools).toContain(platformCoreTools.search);
      expect(allowedTools).toContain(platformCoreTools.getDocumentById);
      expect(allowedTools).toContain(platformCoreTools.integrationKnowledge);
    });
  });

  describe('getInlineTools', () => {
    it('returns four inline tools', () => {
      const skill = createAutomaticTroubleshootingSkill(mockEndpointAppContextService);

      const inlineTools = skill.getInlineTools?.();

      expect(inlineTools).toBeDefined();
      expect(inlineTools).toHaveLength(4);
    });

    it('includes get_package_configurations tool', async () => {
      const skill = createAutomaticTroubleshootingSkill(mockEndpointAppContextService);

      const inlineTools = await skill.getInlineTools?.();

      const getPackageConfigTool = inlineTools?.find((tool) =>
        tool.id.includes('get_package_configurations')
      );

      expect(getPackageConfigTool).toBeDefined();
      expect(getPackageConfigTool?.description).toContain('Fetches Elastic Defend package');
    });

    it('includes generate_insight tool', async () => {
      const skill = createAutomaticTroubleshootingSkill(mockEndpointAppContextService);

      const inlineTools = await skill.getInlineTools?.();

      const generateInsightTool = inlineTools?.find((tool) => tool.id.includes('generate_insight'));

      expect(generateInsightTool).toBeDefined();
      expect(generateInsightTool?.description).toContain('Generate and store structured');
    });
  });
});
