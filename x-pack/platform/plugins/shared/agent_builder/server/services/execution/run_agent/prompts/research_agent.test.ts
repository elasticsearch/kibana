/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { createAttachmentStateManager } from '@kbn/agent-builder-server/attachments';
import { getResearchAgentPrompt } from './research_agent';
import { prepareMessages } from '../utils/to_langchain_messages';

jest.mock('../utils/to_langchain_messages', () => ({
  prepareMessages: jest.fn().mockResolvedValue([['human', 'history']]),
}));

// Unique marker present only in the injected notification, not in the static pointer prose.
const NOTICE_MARKER = 'The following skills appear relevant';

describe('getResearchAgentPrompt', () => {
  const now = new Date().toISOString();

  const makeParams = (overrides: Record<string, any> = {}) =>
    ({
      conversationTimestamp: now,
      processedConversation: {
        timeline: [],
        nextInput: { message: '', attachments: [] },
        attachments: [],
        attachmentTypes: [],
        attachmentStateManager: createAttachmentStateManager([], {
          getTypeDefinition: (type: string) =>
            ({
              id: type,
              validate: (input: unknown) => ({ valid: true, data: input }),
              format: () => ({ getRepresentation: () => ({ type: 'text', value: '' }) }),
            } as any),
        }),
      },
      configuration: { instructions: '', aiIndices: [] },
      spaceId: 'default',
      skills: [],
      actions: [],
      cycleLimit: 1,
      experimentalFeatures: { aiIndices: false, bash: false, skills: false },
      relevantSkillsEnabled: false,
      toolManager: {} as any,
      resultTransformer: jest.fn(),
      renderers: [],
      ...overrides,
    } as any);

  const asText = (m: any): string =>
    Array.isArray(m) ? String(m[1]) : typeof m?.content === 'string' ? m.content : '';

  const alphaSkill = {
    id: 'a.alpha',
    name: 'alpha',
    description: 'Alpha skill',
    basePath: 'skills/a',
    referencedContent: [],
  };

  it('does not render the current date in the system message and forwards conversationTimestamp', async () => {
    const messages = await getResearchAgentPrompt(makeParams());

    const systemMessage = (messages[0] as ['system', string])[1];
    expect(systemMessage).not.toContain('Current date');
    expect(prepareMessages).toHaveBeenCalledWith(
      expect.objectContaining({ conversationTimestamp: now })
    );
  });

  it('renders the full skill list when skills is on and relevant-skills is off', async () => {
    const messages = await getResearchAgentPrompt(
      makeParams({
        experimentalFeatures: { bash: false, skills: true },
        relevantSkillsEnabled: false,
        skills: [alphaSkill],
      })
    );
    const system = asText(messages[0]);
    expect(system).toContain('### Available skills');
    expect(system).toMatch(/- alpha \(.+SKILL\.md\): Alpha skill/);
    expect(system).not.toContain('search_relevant_skills');
  });

  it('renders the static pointer with no per-skill lines when relevant-skills is on', async () => {
    const messages = await getResearchAgentPrompt(
      makeParams({
        experimentalFeatures: { bash: false, skills: true },
        relevantSkillsEnabled: true,
        skills: [alphaSkill],
      })
    );
    const system = asText(messages[0]);
    expect(system).toContain('## SKILLS');
    expect(system).toContain('search_relevant_skills');
    expect(system).not.toContain('### Available skills');
    expect(system).not.toMatch(/- alpha \(.+SKILL\.md\)/);
  });

  it('injects the <relevant_skills> notice after previous rounds when a selection is provided', async () => {
    const messages = await getResearchAgentPrompt(
      makeParams({
        experimentalFeatures: { bash: false, skills: true },
        relevantSkillsEnabled: true,
        relevantSkills: {
          skills: [
            {
              id: 'a.alpha',
              name: 'alpha',
              path: '/p/SKILL.md',
              description: 'Alpha skill',
              relevance_note: 'fits the request',
            },
          ],
        },
      })
    );
    const texts = messages.map(asText);
    const noticeIdx = texts.findIndex((t) => t.includes(NOTICE_MARKER));
    const historyIdx = texts.findIndex((t) => t.includes('history'));
    expect(noticeIdx).toBeGreaterThan(-1);
    expect(noticeIdx).toBeGreaterThan(historyIdx); // after the (mocked) previous rounds
    expect(texts[noticeIdx]).toContain('- alpha (/p/SKILL.md): Alpha skill');
    expect(texts[noticeIdx]).toContain('fits the request');
  });

  it('injects no notice when relevant-skills is disabled even if a selection is present', async () => {
    const messages = await getResearchAgentPrompt(
      makeParams({
        experimentalFeatures: { bash: false, skills: true },
        relevantSkillsEnabled: false,
        relevantSkills: { skills: [{ id: 'a', name: 'a', path: '/p', description: 'd' }] },
      })
    );
    expect(messages.map(asText).some((t) => t.includes(NOTICE_MARKER))).toBe(false);
  });

  it('injects no notice when the selection is empty', async () => {
    const messages = await getResearchAgentPrompt(
      makeParams({
        experimentalFeatures: { bash: false, skills: true },
        relevantSkillsEnabled: true,
        relevantSkills: { skills: [] },
      })
    );
    expect(messages.map(asText).some((t) => t.includes(NOTICE_MARKER))).toBe(false);
  });

  it('omits the AI indices section when the agent declares no AI indices', async () => {
    const messages = await getResearchAgentPrompt(
      makeParams({
        experimentalFeatures: { aiIndices: true, bash: false, skills: false },
      })
    );

    expect(asText(messages[0])).not.toContain('## AI INDICES');
  });

  it('omits the AI indices section when AI index instructions are disabled', async () => {
    const messages = await getResearchAgentPrompt(
      makeParams({
        configuration: {
          instructions: '',
          aiIndices: ['elastic'],
          aiIndexCatalog: [
            { id: 'elastic', esqlTarget: 'sml-main', description: 'Kibana resources' },
          ],
        },
        experimentalFeatures: { aiIndices: false, bash: false, skills: false },
      })
    );

    expect(asText(messages[0])).not.toContain('## AI INDICES');
  });

  it('renders the AI indices section with the running space when the agent declares one', async () => {
    const messages = await getResearchAgentPrompt(
      makeParams({
        configuration: {
          instructions: '',
          aiIndices: ['elastic'],
          aiIndexCatalog: [
            { id: 'elastic', esqlTarget: 'sml-main', description: 'Kibana resources' },
          ],
        },
        experimentalFeatures: { aiIndices: true, bash: false, skills: false },
        spaceId: 'marketing',
      })
    );
    const system = asText(messages[0]);

    expect(system).toContain('## AI INDICES');
    expect(system).toContain('`sml-main`');
    expect(system).toContain('This conversation runs in the space `marketing`');
    expect(system.indexOf('## AI INDICES')).toBeLessThan(system.indexOf('## INSTRUCTIONS'));
  });

  it('renders every catalog entry, including custom AI indices', async () => {
    const messages = await getResearchAgentPrompt(
      makeParams({
        configuration: {
          instructions: '',
          aiIndices: ['elastic', 'my-custom'],
          aiIndexCatalog: [
            { id: 'elastic', esqlTarget: 'sml-main', description: 'Kibana resources' },
            { id: 'my-custom', esqlTarget: 'ai-index-idx-custom', description: 'Support tickets' },
          ],
        },
        experimentalFeatures: { aiIndices: true, bash: false, skills: false },
      })
    );
    const system = asText(messages[0]);

    expect(system).toContain('`sml-main`');
    expect(system).toContain('`ai-index-idx-custom` — Support tickets');
  });

  it('points connector discovery at list_connectors/get_connector, not sml_search/sml_attach', async () => {
    const messages = await getResearchAgentPrompt(makeParams());
    const system = asText(messages[0]);

    expect(system).toContain('## CONNECTOR DISCOVERY');
    expect(system).toContain('list_connectors');
    expect(system).toContain('get_connector');
    expect(system).not.toContain('sml_search` with');
    expect(system).toContain('Do not rely on `sml_search`/`sml_attach` to find connectors.');
  });

  it('includes the static attachment tools guidance but no dynamic (conversation-specific) attachment content', async () => {
    const params = {
      conversationTimestamp: now,
      processedConversation: {
        timeline: [],
        nextInput: { message: '', attachments: [] },
        attachments: [],
        attachmentTypes: [],
        attachmentStateManager: createAttachmentStateManager([], {
          getTypeDefinition: (type: string) =>
            ({
              id: type,
              validate: (input: unknown) => ({ valid: true, data: input }),
              format: () => ({ getRepresentation: () => ({ type: 'text', value: '' }) }),
            } as any),
        }),
      },
      configuration: {
        instructions: '',
        aiIndices: [],
      },
      spaceId: 'default',
      skills: [],
      actions: [],
      cycleLimit: 1,
      experimentalFeatures: { aiIndices: false, bash: false, skills: false },
      toolManager: {} as any,
      resultTransformer: jest.fn(),
    } as any;

    const messages = await getResearchAgentPrompt(params);
    const systemMessage = (messages[0] as ['system', string])[1];

    // Static guidance stays in the system prompt.
    expect(systemMessage).toContain('MUST use the attachment tools');
    expect(systemMessage).toContain('attachment_read');
    expect(systemMessage).toContain('INLINE ATTACHMENT RENDERING');

    // Dynamic, conversation-specific content must never be in the system prompt —
    // it's rendered inline in the per-round messages instead (see to_langchain_messages.ts).
    expect(systemMessage).not.toContain('## ATTACHMENT TYPES');
    expect(systemMessage).not.toContain('## Conversation Attachments');
    expect(systemMessage).not.toMatch(/attachment_id="/);
  });
});
