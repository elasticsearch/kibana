/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { platformCoreTools } from '@kbn/agent-builder-common';
import { validateSkillDefinition } from '@kbn/agent-builder-server/skills/type_definition';
import { createMockEndpointAppContext } from '../../endpoint/mocks';
import { threatHuntingSkill } from './threat_hunting';
import { alertAnalysisSkill } from './alert_analysis';
import { alertTriageSkill, ALERT_TRIAGE_TOOL_ID } from './alert_triage';
import {
  automaticMigrationRulesStartMigrationSkill,
  automaticMigrationRulesSummarizeSkill,
  automaticMigrationRulesStopMigrationSkill,
  automaticMigrationRulesUpdateMigrationSkill,
  automaticMigrationRulesDeleteMigrationSkill,
} from './siem_migration';
import { createElasticDefendPolicyManagementSkill } from './elastic_defend_policy_management';

const endpointAppContextService = createMockEndpointAppContext().service;
const getStartServices = jest.fn();
const elasticDefendPolicyManagementSkill = createElasticDefendPolicyManagementSkill({
  endpointAppContextService,
  getStartServices,
});

const ALL_SKILLS = [
  threatHuntingSkill,
  alertAnalysisSkill,
  alertTriageSkill,
  automaticMigrationRulesSummarizeSkill,
  automaticMigrationRulesStartMigrationSkill,
  automaticMigrationRulesStopMigrationSkill,
  automaticMigrationRulesUpdateMigrationSkill,
  automaticMigrationRulesDeleteMigrationSkill,
  elasticDefendPolicyManagementSkill,
];

describe('Security Skills', () => {
  describe('threat-hunting skill', () => {
    it('validates successfully via validateSkillDefinition', async () => {
      await expect(validateSkillDefinition(threatHuntingSkill)).resolves.toBeDefined();
    });

    it('has non-empty content', () => {
      expect(threatHuntingSkill.content.length).toBeGreaterThan(100);
    });

    it('has description under 1024 characters', () => {
      expect(threatHuntingSkill.description.length).toBeLessThanOrEqual(1024);
    });

    it('returns 6 registry tools (under 7 limit)', () => {
      const tools = threatHuntingSkill.getRegistryTools!();
      expect(tools).toHaveLength(6);
    });

    it('includes platformCoreTools.cases for escalation', () => {
      const tools = threatHuntingSkill.getRegistryTools!();
      expect(tools).toContain(platformCoreTools.cases);
    });

    it('content mentions case creation for confirmed findings', () => {
      expect(threatHuntingSkill.content).toContain('platform.core.cases');
    });

    it('content references alert-analysis skill', () => {
      expect(threatHuntingSkill.content).toContain('alert-analysis');
    });

    it('has no inline tools', () => {
      expect(threatHuntingSkill.getInlineTools).toBeUndefined();
    });

    it('has referenced content for query templates', () => {
      expect(threatHuntingSkill.referencedContent).toBeDefined();
      expect(threatHuntingSkill.referencedContent!.length).toBe(4);
      const names = threatHuntingSkill.referencedContent!.map((rc) => rc.name);
      expect(names).toEqual(
        expect.arrayContaining([
          'lateral-movement',
          'c2-beaconing',
          'brute-force',
          'rare-process-execution',
        ])
      );
    });
  });

  describe('alert-analysis skill', () => {
    it('validates successfully via validateSkillDefinition', async () => {
      await expect(validateSkillDefinition(alertAnalysisSkill)).resolves.toBeDefined();
    });

    it('has non-empty content', () => {
      expect(alertAnalysisSkill.content.length).toBeGreaterThan(100);
    });

    it('has description under 1024 characters', () => {
      expect(alertAnalysisSkill.description.length).toBeLessThanOrEqual(1024);
    });

    it('returns 3 registry tools', () => {
      const tools = alertAnalysisSkill.getRegistryTools!();
      expect(tools).toHaveLength(3);
    });

    it('returns 1 inline tool (get-related-alerts)', async () => {
      const inlineTools = await alertAnalysisSkill.getInlineTools!();
      expect(inlineTools).toHaveLength(1);
      expect(inlineTools[0].id).toBe('security.alert-analysis.get-related-alerts');
    });

    it('has total tool count under 7 limit (3 registry + 1 inline = 4)', async () => {
      const registryTools = await alertAnalysisSkill.getRegistryTools!();
      const inlineTools = await alertAnalysisSkill.getInlineTools!();
      expect(registryTools.length + inlineTools.length).toBeLessThanOrEqual(7);
    });

    it('content references entity-analytics skill for deeper profiling', () => {
      expect(alertAnalysisSkill.content).toContain('entity-analytics');
    });
  });

  describe('alert-triage skill', () => {
    it('validates successfully via validateSkillDefinition', async () => {
      await expect(validateSkillDefinition(alertTriageSkill)).resolves.toBeDefined();
    });

    it('has non-empty content', () => {
      expect(alertTriageSkill.content.length).toBeGreaterThan(100);
    });

    it('has description under 1024 characters', () => {
      expect(alertTriageSkill.description.length).toBeLessThanOrEqual(1024);
    });

    it('returns 0 registry tools (all access is via the inline tool)', async () => {
      const tools = await alertTriageSkill.getRegistryTools!();
      expect(tools).toHaveLength(0);
    });

    it('returns 1 inline tool (alert-triage)', async () => {
      const inlineTools = await alertTriageSkill.getInlineTools!();
      expect(inlineTools).toHaveLength(1);
      expect(inlineTools[0].id).toBe(ALERT_TRIAGE_TOOL_ID);
    });

    it('has total tool count within limits (0 registry + 1 inline = 1)', async () => {
      const registryTools = await alertTriageSkill.getRegistryTools!();
      const inlineTools = await alertTriageSkill.getInlineTools!();
      expect(registryTools.length + inlineTools.length).toBeLessThanOrEqual(7);
    });

    it('content references alert-analysis for investigation', () => {
      expect(alertTriageSkill.content).toContain('alert-analysis');
    });
  });

  describe('automatic-migration-rules-summarize skill', () => {
    it('validates successfully via validateSkillDefinition', async () => {
      await expect(
        validateSkillDefinition(automaticMigrationRulesSummarizeSkill)
      ).resolves.toBeDefined();
    });

    it('has non-empty content', () => {
      expect(automaticMigrationRulesSummarizeSkill.content.length).toBeGreaterThan(100);
    });

    it('has description under 1024 characters', () => {
      expect(automaticMigrationRulesSummarizeSkill.description.length).toBeLessThanOrEqual(1024);
    });

    it('returns 4 registry tools (under 25 limit)', () => {
      const tools = automaticMigrationRulesSummarizeSkill.getRegistryTools!();
      expect(tools).toHaveLength(4);
      expect((tools as string[]).length).toBeLessThanOrEqual(25);
    });

    it('has no inline tools', () => {
      expect(automaticMigrationRulesSummarizeSkill.getInlineTools).toBeUndefined();
    });

    it('content includes the Automatic Migration capabilities block', () => {
      expect(automaticMigrationRulesSummarizeSkill.content).toContain(
        'Automatic Rule Migration Capabilities'
      );
    });

    it('content includes the name-never-id resolution policy', () => {
      expect(automaticMigrationRulesSummarizeSkill.content).toContain('Name, Never Ask for an ID');
    });

    it('uses user-facing "Automatic Migration" naming, not "SIEM migration"', () => {
      expect(automaticMigrationRulesSummarizeSkill.description).toContain('Automatic Migration');
      expect(automaticMigrationRulesSummarizeSkill.description).not.toContain('SIEM migration');
    });
  });

  describe('automatic-migration-rules-start-migration skill', () => {
    it('validates successfully via validateSkillDefinition', async () => {
      await expect(
        validateSkillDefinition(automaticMigrationRulesStartMigrationSkill)
      ).resolves.toBeDefined();
    });

    it('has non-empty content', () => {
      expect(automaticMigrationRulesStartMigrationSkill.content.length).toBeGreaterThan(100);
    });

    it('has description under 1024 characters', () => {
      expect(automaticMigrationRulesStartMigrationSkill.description.length).toBeLessThanOrEqual(
        1024
      );
    });

    it('returns 7 registry tools (under 25 limit)', () => {
      const tools = automaticMigrationRulesStartMigrationSkill.getRegistryTools!();
      expect(tools).toHaveLength(7);
      expect((tools as string[]).length).toBeLessThanOrEqual(25);
    });

    it('includes the start_rule_migration tool', () => {
      const tools = automaticMigrationRulesStartMigrationSkill.getRegistryTools!();
      expect(tools).toContain('security.siem_migration.start_rule_migration');
    });

    it('includes get_missing_rule_migration_resources for the pre-flight check', () => {
      const tools = automaticMigrationRulesStartMigrationSkill.getRegistryTools!();
      expect(tools).toContain('security.siem_migration.get_missing_rule_migration_resources');
    });

    it('content includes the Pre-flight missing resources section', () => {
      expect(automaticMigrationRulesStartMigrationSkill.content).toContain(
        'Pre-flight: Missing Resources'
      );
    });

    it('includes list_ai_connectors for connector resolution', () => {
      const tools = automaticMigrationRulesStartMigrationSkill.getRegistryTools!();
      expect(tools).toContain(platformCoreTools.listInferenceEndpoints);
    });

    it('has no inline tools', () => {
      expect(automaticMigrationRulesStartMigrationSkill.getInlineTools).toBeUndefined();
    });

    it('content includes the START vs REPROCESS vs RESUME decision matrix', () => {
      expect(automaticMigrationRulesStartMigrationSkill.content).toContain(
        'START vs REPROCESS vs RESUME'
      );
      expect(automaticMigrationRulesStartMigrationSkill.content).toContain('RESUME');
    });

    it('content mandates user confirmation before mutating', () => {
      expect(automaticMigrationRulesStartMigrationSkill.content).toContain('confirm');
      expect(automaticMigrationRulesStartMigrationSkill.content).toContain('Confirm');
    });

    it('uses user-facing "Automatic Rule Migration" naming, not "SIEM migration"', () => {
      expect(automaticMigrationRulesStartMigrationSkill.description).toContain(
        'Automatic Rule Migration'
      );
      expect(automaticMigrationRulesStartMigrationSkill.description).not.toContain(
        'SIEM migration'
      );
    });
  });

  describe('automatic-migration-rules-stop-migration skill', () => {
    it('validates successfully via validateSkillDefinition', async () => {
      await expect(
        validateSkillDefinition(automaticMigrationRulesStopMigrationSkill)
      ).resolves.toBeDefined();
    });

    it('has non-empty content', () => {
      expect(automaticMigrationRulesStopMigrationSkill.content.length).toBeGreaterThan(100);
    });

    it('has description under 1024 characters', () => {
      expect(automaticMigrationRulesStopMigrationSkill.description.length).toBeLessThanOrEqual(
        1024
      );
    });

    it('returns 3 registry tools (under 25 limit)', () => {
      const tools = automaticMigrationRulesStopMigrationSkill.getRegistryTools!();
      expect(tools).toHaveLength(3);
      expect((tools as string[]).length).toBeLessThanOrEqual(25);
    });

    it('includes the stop_rule_migration tool', () => {
      const tools = automaticMigrationRulesStopMigrationSkill.getRegistryTools!();
      expect(tools).toContain('security.siem_migration.stop_rule_migration');
    });

    it('has no inline tools', () => {
      expect(automaticMigrationRulesStopMigrationSkill.getInlineTools).toBeUndefined();
    });

    it('content includes the Automatic Migration capabilities block', () => {
      expect(automaticMigrationRulesStopMigrationSkill.content).toContain(
        'Automatic Rule Migration Capabilities'
      );
    });

    it('content includes the name-never-id resolution policy', () => {
      expect(automaticMigrationRulesStopMigrationSkill.content).toContain(
        'Name, Never Ask for an ID'
      );
    });

    it('uses user-facing "Automatic Migration" naming, not "SIEM migration"', () => {
      expect(automaticMigrationRulesStopMigrationSkill.description).toContain(
        'Automatic Rule Migration'
      );
      expect(automaticMigrationRulesStopMigrationSkill.description).not.toContain('SIEM migration');
    });
  });

  describe('automatic-migration-rules-update-migration skill', () => {
    it('validates successfully via validateSkillDefinition', async () => {
      await expect(
        validateSkillDefinition(automaticMigrationRulesUpdateMigrationSkill)
      ).resolves.toBeDefined();
    });

    it('has non-empty content', () => {
      expect(automaticMigrationRulesUpdateMigrationSkill.content.length).toBeGreaterThan(100);
    });

    it('has description under 1024 characters', () => {
      expect(automaticMigrationRulesUpdateMigrationSkill.description.length).toBeLessThanOrEqual(
        1024
      );
    });

    it('returns 3 registry tools (under 25 limit)', () => {
      const tools = automaticMigrationRulesUpdateMigrationSkill.getRegistryTools!();
      expect(tools).toHaveLength(3);
      expect((tools as string[]).length).toBeLessThanOrEqual(25);
    });

    it('includes the update_rule_migration tool', () => {
      const tools = automaticMigrationRulesUpdateMigrationSkill.getRegistryTools!();
      expect(tools).toContain('security.siem_migration.update_rule_migration');
    });

    it('has no inline tools', () => {
      expect(automaticMigrationRulesUpdateMigrationSkill.getInlineTools).toBeUndefined();
    });

    it('content includes the Automatic Migration capabilities block', () => {
      expect(automaticMigrationRulesUpdateMigrationSkill.content).toContain(
        'Automatic Rule Migration Capabilities'
      );
    });

    it('content includes the name-never-id resolution policy', () => {
      expect(automaticMigrationRulesUpdateMigrationSkill.content).toContain(
        'Name, Never Ask for an ID'
      );
    });

    it('uses user-facing "Automatic Migration" naming, not "SIEM migration"', () => {
      expect(automaticMigrationRulesUpdateMigrationSkill.description).toContain(
        'Automatic Rule Migration'
      );
      expect(automaticMigrationRulesUpdateMigrationSkill.description).not.toContain(
        'SIEM migration'
      );
    });
  });

  describe('automatic-migration-rules-delete-migration skill', () => {
    it('validates successfully via validateSkillDefinition', async () => {
      await expect(
        validateSkillDefinition(automaticMigrationRulesDeleteMigrationSkill)
      ).resolves.toBeDefined();
    });

    it('has non-empty content', () => {
      expect(automaticMigrationRulesDeleteMigrationSkill.content.length).toBeGreaterThan(100);
    });

    it('has description under 1024 characters', () => {
      expect(automaticMigrationRulesDeleteMigrationSkill.description.length).toBeLessThanOrEqual(
        1024
      );
    });

    it('returns 4 registry tools (under 25 limit)', () => {
      const tools = automaticMigrationRulesDeleteMigrationSkill.getRegistryTools!();
      expect(tools).toHaveLength(4);
      expect((tools as string[]).length).toBeLessThanOrEqual(25);
    });

    it('includes the delete_rule_migration tool', () => {
      const tools = automaticMigrationRulesDeleteMigrationSkill.getRegistryTools!();
      expect(tools).toContain('security.siem_migration.delete_rule_migration');
    });

    it('has no inline tools', () => {
      expect(automaticMigrationRulesDeleteMigrationSkill.getInlineTools).toBeUndefined();
    });

    it('content includes the Automatic Migration capabilities block', () => {
      expect(automaticMigrationRulesDeleteMigrationSkill.content).toContain(
        'Automatic Rule Migration Capabilities'
      );
    });

    it('content includes the name-never-id resolution policy', () => {
      expect(automaticMigrationRulesDeleteMigrationSkill.content).toContain(
        'Name, Never Ask for an ID'
      );
    });

    it('content warns about irreversibility', () => {
      expect(automaticMigrationRulesDeleteMigrationSkill.content).toContain('irreversible');
    });

    it('uses user-facing "Automatic Migration" naming, not "SIEM migration"', () => {
      expect(automaticMigrationRulesDeleteMigrationSkill.description).toContain(
        'Automatic Rule Migration'
      );
      expect(automaticMigrationRulesDeleteMigrationSkill.description).not.toContain(
        'SIEM migration'
      );
    });
  });

  describe('cross-skill validation', () => {
    it('has no duplicate skill IDs', () => {
      const ids = ALL_SKILLS.map((s) => s.id);
      expect(new Set(ids).size).toBe(ids.length);
    });

    it('has no duplicate skill paths', () => {
      const paths = ALL_SKILLS.map((s) => `${s.basePath}/${s.name}`);
      expect(new Set(paths).size).toBe(paths.length);
    });

    it('has distinct descriptions', () => {
      const descriptions = ALL_SKILLS.map((s) => s.description);
      expect(new Set(descriptions).size).toBe(descriptions.length);
    });

    it('all referenced content has valid relative paths', () => {
      for (const skill of ALL_SKILLS) {
        for (const ref of skill.referencedContent ?? []) {
          expect(ref.relativePath).toMatch(/^(?:\.|\.\/[a-z0-9-_]+)$/);
          expect(ref.name).toMatch(/^[a-z0-9-_]+$/);
          expect(ref.content.length).toBeGreaterThan(0);
        }
      }
    });

    it('AUTOMATIC_RULE_MIGRATION_CAPABILITIES_BLOCK does not reference the dropped resources skill', () => {
      // automatic-migration-rules-get-resources was dropped; the capability map must not list it.
      for (const skill of ALL_SKILLS) {
        expect(skill.content).not.toContain('automatic-migration-rules-get-resources');
      }
    });
  });
});
