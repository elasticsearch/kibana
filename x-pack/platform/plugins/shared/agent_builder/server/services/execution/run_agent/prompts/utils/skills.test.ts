/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { InternalSkillDefinition } from '@kbn/agent-builder-server/skills';
import { getSkillsInstructions } from './skills';

const skill = (overrides: Partial<InternalSkillDefinition>): InternalSkillDefinition =>
  ({
    id: 'platform.core.test-skill',
    name: 'test-skill',
    description: 'A test skill',
    basePath: 'skills/platform/core',
    referencedContent: [],
    ...overrides,
  } as unknown as InternalSkillDefinition);

describe('getSkillsInstructions', () => {
  describe('when no skills are available', () => {
    it('returns the no-skills marker', () => {
      const result = getSkillsInstructions({ skills: [] });
      expect(result).toContain('## SKILLS');
      expect(result).toContain('No skills are currently available');
      expect(result).toContain('Load a skill to get detailed instructions');
    });
  });

  describe('when skills are available', () => {
    it('renders one line per skill in markdown list format', () => {
      const result = getSkillsInstructions({
        skills: [
          skill({
            id: 'platform.core.alpha',
            name: 'alpha',
            description: 'Alpha skill',
          }),
        ],
      });
      expect(result).toContain('## SKILLS');
      expect(result).toMatch(/- alpha \(.+SKILL\.md\): Alpha skill/);
    });

    it('sorts skills by name', () => {
      const result = getSkillsInstructions({
        skills: [
          skill({ id: 'a.z', name: 'z-skill' }),
          skill({ id: 'a.a', name: 'a-skill' }),
          skill({ id: 'a.m', name: 'm-skill' }),
        ],
      });
      const aIdx = result.indexOf('a-skill');
      const mIdx = result.indexOf('m-skill');
      const zIdx = result.indexOf('z-skill');
      expect(aIdx).toBeLessThan(mIdx);
      expect(mIdx).toBeLessThan(zIdx);
    });

    it('includes guidance for loading skills', () => {
      const result = getSkillsInstructions({
        skills: [skill({})],
      });
      expect(result).toContain(
        'Always check the skill list above before acting on a user request.'
      );
    });

    it('renders the empty-description case without choking', () => {
      const result = getSkillsInstructions({
        skills: [skill({ description: '' })],
      });
      expect(result).toMatch(/- test-skill \(.+SKILL\.md\): /);
    });
  });
});
