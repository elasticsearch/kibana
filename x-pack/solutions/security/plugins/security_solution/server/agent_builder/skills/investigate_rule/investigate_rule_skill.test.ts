/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ToolResultType } from '@kbn/agent-builder-common/tools/tool_result';
import { ATTACHMENT_REF_ACTOR } from '@kbn/agent-builder-common/attachments';
import type { BuiltinSkillBoundedTool } from '@kbn/agent-builder-server/skills/tools';
import type { ToolHandlerStandardReturn } from '@kbn/agent-builder-server/tools';
import { createToolHandlerContext, createToolTestMocks } from '../../__mocks__/test_helpers';
import { createInvestigateRuleSkill } from './investigate_rule_skill';
import { SECURITY_ALERTS_TOOL_ID } from '../../tools';

const investigateRuleSkill = createInvestigateRuleSkill();

describe('investigateRuleSkill', () => {
  describe('skill definition', () => {
    it('has correct id and name', () => {
      expect(investigateRuleSkill.id).toBe('investigate-rule');
      expect(investigateRuleSkill.name).toBe('investigate-rule');
    });

    it('has correct basePath', () => {
      expect(investigateRuleSkill.basePath).toBe('skills/security/rules');
    });

    it('has a non-empty description', () => {
      expect(investigateRuleSkill.description).toBeTruthy();
      expect(investigateRuleSkill.description.length).toBeGreaterThan(0);
    });

    it('has non-empty content', () => {
      expect(investigateRuleSkill.content).toBeTruthy();
      expect(investigateRuleSkill.content.length).toBeGreaterThan(0);
    });

    it('routes plural noisy-rule list requests away from this skill', () => {
      expect(investigateRuleSkill.content).toContain('**specific** detection rule');
      expect(investigateRuleSkill.content).toContain('plural list/rank/count requests');
      expect(investigateRuleSkill.content).toContain('find-security-rules');
      expect(investigateRuleSkill.description).toContain('Single-rule noise');
    });

    it('returns the expected registry tool IDs', () => {
      const tools = investigateRuleSkill.getRegistryTools?.();
      expect(tools).toBeDefined();
      expect(tools).toEqual([SECURITY_ALERTS_TOOL_ID]);
    });

    it('returns the expected inline tools', async () => {
      const inlineTools = await investigateRuleSkill.getInlineTools?.();
      expect(inlineTools).toBeDefined();
      expect(inlineTools).toHaveLength(1);
      expect(inlineTools![0].id).toBe('investigate-rule.resolve_rule_attachment');
    });
  });

  // ── resolve_rule_attachment ─────────────────────────────────────────────────
  //
  // The skill itself does NO fetching: it adds a security.rule attachment by
  // reference (origin = rule UUID) and the attachment type's resolve() hook
  // fetches the rule snapshot. These tests verify the by-reference wiring
  // and error mapping; rule fetching is covered in the rule attachment type's
  // own test (../../attachments/rule.test.ts).

  describe('resolve_rule_attachment inline tool', () => {
    const { mockEsClient, mockRequest, mockLogger } = createToolTestMocks();
    let tool: BuiltinSkillBoundedTool;

    beforeEach(async () => {
      jest.clearAllMocks();
      const inlineTools = await investigateRuleSkill.getInlineTools?.();
      tool = inlineTools![0] as BuiltinSkillBoundedTool;
    });

    interface AttachmentResultData {
      message?: string;
      attachmentId?: string;
      version?: number;
    }

    const makeCtx = () => createToolHandlerContext(mockRequest, mockEsClient, mockLogger);

    it('adds the attachment by reference and returns its ID on happy path', async () => {
      const ctx = makeCtx();
      (ctx.attachments.get as jest.Mock).mockReturnValueOnce(undefined);
      (ctx.attachments.add as jest.Mock).mockResolvedValueOnce({
        id: 'rule-investigate-rule-uuid-1',
        current_version: 1,
        type: 'security.rule',
        versions: [{ version: 1, data: { attachmentLabel: 'My Detection Rule' } }],
        active: true,
      });

      const result = (await tool.handler(
        { rule_id: 'rule-uuid-1' },
        ctx
      )) as ToolHandlerStandardReturn;

      expect(result.results[0].type).toBe(ToolResultType.other);
      const data = result.results[0].data as AttachmentResultData;
      expect(data.attachmentId).toBe('rule-investigate-rule-uuid-1');
      expect(data.version).toBe(1);

      // By-reference: origin (not data) + a resolve context built from the tool context.
      const [input, actor, resolveContext] = (ctx.attachments.add as jest.Mock).mock.calls[0];
      expect(input).toEqual(
        expect.objectContaining({
          id: 'rule-investigate-rule-uuid-1',
          type: 'security.rule',
          origin: 'rule-uuid-1',
        })
      );
      expect(input.data).toBeUndefined();
      expect(actor).toBe(ATTACHMENT_REF_ACTOR.agent);
      expect(resolveContext).toEqual(
        expect.objectContaining({
          request: ctx.request,
          spaceId: ctx.spaceId,
          savedObjectsClient: ctx.savedObjectsClient,
        })
      );
    });

    it('returns existing attachment ID when already resolved', async () => {
      const ctx = makeCtx();
      (ctx.attachments.get as jest.Mock).mockReturnValueOnce({
        id: 'rule-investigate-rule-uuid-1',
        version: 2,
        type: 'security.rule',
        data: {},
      });

      const result = (await tool.handler(
        { rule_id: 'rule-uuid-1' },
        ctx
      )) as ToolHandlerStandardReturn;

      expect(result.results[0].type).toBe(ToolResultType.other);
      const data = result.results[0].data as AttachmentResultData;
      expect(data.attachmentId).toBe('rule-investigate-rule-uuid-1');
      expect(data.version).toBe(2);
      expect(ctx.attachments.add).not.toHaveBeenCalled();
    });

    it('returns an error result when resolution throws', async () => {
      const ctx = makeCtx();
      (ctx.attachments.get as jest.Mock).mockReturnValueOnce(undefined);
      (ctx.attachments.add as jest.Mock).mockRejectedValueOnce(
        new Error('Rules service unavailable')
      );

      const result = (await tool.handler({ rule_id: 'rule-1' }, ctx)) as ToolHandlerStandardReturn;

      expect(result.results[0].type).toBe(ToolResultType.error);
      expect((result.results[0].data as { message: string }).message).toContain('unavailable');
    });
  });
});
