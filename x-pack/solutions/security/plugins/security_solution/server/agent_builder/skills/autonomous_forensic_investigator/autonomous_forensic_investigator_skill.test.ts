/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { platformCoreTools } from '@kbn/agent-builder-common';
import { isAllowedBuiltinSkill } from '@kbn/agent-builder-server/allow_lists';
import {
  AUTONOMOUS_FORENSIC_INVESTIGATOR_SKILL_ID,
  autonomousForensicInvestigatorSkill,
} from './autonomous_forensic_investigator_skill';

describe('autonomousForensicInvestigatorSkill', () => {
  it('uses an allow-listed built-in skill id', () => {
    expect(isAllowedBuiltinSkill(AUTONOMOUS_FORENSIC_INVESTIGATOR_SKILL_ID)).toBe(true);
  });

  it('exposes ES|QL and index discovery platform registry tools only (read-only scope)', () => {
    const registryTools = autonomousForensicInvestigatorSkill.getRegistryTools?.() ?? [];
    expect(registryTools).toEqual([
      platformCoreTools.listIndices,
      platformCoreTools.getIndexMapping,
      platformCoreTools.generateEsql,
      platformCoreTools.executeEsql,
    ]);
  });

  it('does not define any inline tools', async () => {
    const inlineTools = await autonomousForensicInvestigatorSkill.getInlineTools?.();
    expect(inlineTools ?? []).toHaveLength(0);
  });

  it('has the correct skill id', () => {
    expect(autonomousForensicInvestigatorSkill.id).toBe(AUTONOMOUS_FORENSIC_INVESTIGATOR_SKILL_ID);
    expect(AUTONOMOUS_FORENSIC_INVESTIGATOR_SKILL_ID).toBe('autonomous-forensic-investigator');
  });

  it('has a non-empty description that distinguishes from endpoint-forensic-analysis', () => {
    expect(autonomousForensicInvestigatorSkill.description.length).toBeGreaterThan(50);
    expect(autonomousForensicInvestigatorSkill.description.toLowerCase()).toContain('autonomous');
  });

  it('has a multi-phase investigation prompt (Phases 1 through 6)', () => {
    const content = autonomousForensicInvestigatorSkill.content;
    expect(content).toContain('Phase 1');
    expect(content).toContain('Phase 6');
  });

  it('includes pivot logic (findings in one phase trigger additional checks)', () => {
    expect(autonomousForensicInvestigatorSkill.content.toLowerCase()).toContain('pivot');
  });

  it('includes cross-endpoint expansion (proactive peer endpoint checking)', () => {
    expect(autonomousForensicInvestigatorSkill.content.toLowerCase()).toContain('peer endpoint');
  });

  it('includes structured final report with required sections', () => {
    const content = autonomousForensicInvestigatorSkill.content.toLowerCase();
    expect(content).toContain('final report');
    expect(content).toContain('patient zero');
    expect(content).toContain('attack timeline');
    expect(content).toContain('lateral movement');
    expect(content).toContain('persistence');
    expect(content).toContain('blast radius');
    expect(content).toContain('recommended next steps');
  });

  it('declares read-only scope (no response actions)', () => {
    const content = autonomousForensicInvestigatorSkill.content.toLowerCase();
    expect(content).toContain('read-only');
    expect(content).toContain('must not invoke response actions');
  });

  it('includes interim summaries after each phase', () => {
    expect(autonomousForensicInvestigatorSkill.content.toLowerCase()).toContain('interim');
  });

  it('includes plan presentation before execution', () => {
    const content = autonomousForensicInvestigatorSkill.content.toLowerCase();
    expect(content).toContain('plan');
    expect(content).toContain('present');
  });
});
