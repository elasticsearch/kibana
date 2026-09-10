/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { isAllowedBuiltinSkill } from '@kbn/agent-builder-server/allow_lists';
import { contextEngineAiIndexTools } from '@kbn/agent-builder-common/tools';
import { contextEngineSkillAvailability } from '../context_engine_skill_availability';
import { kiRetrievalSkill } from './ki_retrieval_skill';

describe('kiRetrievalSkill', () => {
  it('registers with stable id, name, and context-engine base path', () => {
    expect(kiRetrievalSkill.id).toBe('ki-retrieval');
    expect(kiRetrievalSkill.name).toBe('ki-retrieval');
    expect(kiRetrievalSkill.basePath).toBe('skills/platform/context-engine');
  });

  it('is present in the built-in skills allow list', () => {
    expect(isAllowedBuiltinSkill(kiRetrievalSkill.id)).toBe(true);
  });

  it('is gated behind experimental features and Context Engine availability', () => {
    expect(kiRetrievalSkill.experimental).toBe(true);
    expect(kiRetrievalSkill.availability).toBe(contextEngineSkillAvailability);
  });

  it('ships non-empty markdown content', () => {
    expect(typeof kiRetrievalSkill.content).toBe('string');
    expect(kiRetrievalSkill.content.length).toBeGreaterThan(0);
  });

  it('references the correct AI index pattern in content', () => {
    expect(kiRetrievalSkill.content).toContain('ai-index-*');
    expect(kiRetrievalSkill.content).not.toContain('ai-index-idx-*');
    expect(kiRetrievalSkill.content).not.toContain('ai-index-ds-*');
  });

  it('routes discovery, orientation and querying through the AI-index tools', () => {
    const { content } = kiRetrievalSkill;

    expect(content).toContain('`list_ai_indices`');
    expect(content).toContain('`describe_ai_index`');
    expect(content).toContain('`query_ai_indices`');
    expect(content).toContain('Do not use `execute_esql` or `list_indices` on AI indices');
    expect(content).not.toContain('platform.core.list_indices');
  });

  it('describes describe_ai_index as a context block to read and copy ES|QL from', () => {
    expect(kiRetrievalSkill.content).toContain('context block you can read and copy');
    expect(kiRetrievalSkill.content).not.toContain('suggested_queries');
    expect(kiRetrievalSkill.content).not.toContain('query_templates');
  });

  it('prefers the example queries from describe and keeps one canonical fallback', () => {
    const { content } = kiRetrievalSkill;

    expect(content).toContain(
      'Start from the example queries in the `describe_ai_index` context block'
    );
    expect(content.match(/\| FORK/g)).toHaveLength(1);
  });

  it('leaves space scoping to the tool and never teaches a spaces field or filter', () => {
    const { content } = kiRetrievalSkill;

    expect(content).toMatch(/applies that\s+scoping server-side/);
    expect(content).toMatch(/never\s+write a space condition in ES\|QL/i);
    expect(content).toContain('does not replace the server');
    expect(content).not.toMatch(/`spaces`/);
    expect(content).not.toContain('"filter"');
    expect(content).not.toContain('verbatim');
  });

  it('has no referencedContent', () => {
    expect(kiRetrievalSkill.referencedContent).toHaveLength(0);
  });

  it('binds exactly the three AI-index tools', async () => {
    const toolIds = (await kiRetrievalSkill.getRegistryTools?.()) ?? [];

    expect(toolIds).toEqual(Object.values(contextEngineAiIndexTools));
  });
});
