/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { platformCoreTools } from '@kbn/agent-builder-common';
import { validateSkillDefinition } from '@kbn/agent-builder-server/skills/type_definition';
import { threatHuntingSkill } from './threat_hunting';
import { alertAnalysisSkill } from './alert_analysis';
import { alertTriageSkill } from './alert_triage';

const ALL_SKILLS = [threatHuntingSkill, alertAnalysisSkill, alertTriageSkill];

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

    it('returns 1 inline tool (prioritize-alerts)', async () => {
      const inlineTools = await alertTriageSkill.getInlineTools!();
      expect(inlineTools).toHaveLength(1);
      expect(inlineTools[0].id).toBe('security.alert-triage.prioritize-alerts');
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
  });
});
