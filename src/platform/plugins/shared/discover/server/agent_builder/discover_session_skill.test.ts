/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { platformCoreTools } from '@kbn/agent-builder-common';
import { validateSkillDefinition } from '@kbn/agent-builder-server/skills/type_definition';
import { isAllowedBuiltinSkill } from '@kbn/agent-builder-server/allow_lists';
import { DISCOVER_SESSION_SKILL_ID } from '../../common/agent_builder';
import { discoverSessionSkill } from './discover_session_skill';

describe('discoverSessionSkill', () => {
  it('has the expected identity and base path', () => {
    expect(discoverSessionSkill.id).toBe(DISCOVER_SESSION_SKILL_ID);
    expect(discoverSessionSkill.name).toBe('discover-session');
    expect(discoverSessionSkill.basePath).toBe('skills/platform/discover');
  });

  it('is registered in the agent-builder built-in skills allowlist', () => {
    expect(isAllowedBuiltinSkill(discoverSessionSkill.id)).toBe(true);
  });

  it('passes the agent-builder skill-definition schema', async () => {
    await expect(validateSkillDefinition(discoverSessionSkill)).resolves.toBeDefined();
  });

  it('exposes generateEsql and createDiscoverSession only', () => {
    expect(discoverSessionSkill.getRegistryTools?.()).toEqual([
      platformCoreTools.generateEsql,
      platformCoreTools.createDiscoverSession,
    ]);
  });

  it('does not register inline tools', () => {
    expect(discoverSessionSkill.getInlineTools).toBeUndefined();
  });

  it('tells the agent how to create or update a Discover session', () => {
    expect(discoverSessionSkill.content).toContain('attachment_id');
    expect(discoverSessionSkill.content).toContain('<render_attachment');
    expect(discoverSessionSkill.content).toContain('Do **not** create a second session');
    expect(discoverSessionSkill.content).toContain('screen-context');
    expect(discoverSessionSkill.content).toContain('The skill name');
    expect(discoverSessionSkill.content).toContain(
      'Omit `columns` unless the user named specific fields'
    );
  });
});
