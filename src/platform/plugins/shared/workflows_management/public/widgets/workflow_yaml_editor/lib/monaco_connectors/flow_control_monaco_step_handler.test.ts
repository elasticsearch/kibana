/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { FlowControlMonacoStepHandler } from './flow_control_monaco_step_handler';
import { createMockHoverContext, createMockStepContext } from './test_utils/mock_factories';
import { setMockStabilityBadgeThemeForTests } from '../stability/set_mock_stability_badge_theme_for_tests';

jest.mock('@kbn/workflows', () => {
  const actual = jest.requireActual('@kbn/workflows');
  return {
    ...actual,
    getBuiltInStepStability: jest.fn().mockReturnValue(undefined),
  };
});

describe('FlowControlMonacoStepHandler', () => {
  let handler: FlowControlMonacoStepHandler;

  beforeEach(() => {
    jest.clearAllMocks();
    setMockStabilityBadgeThemeForTests();
    handler = new FlowControlMonacoStepHandler();
  });

  describe('canHandle', () => {
    it('should handle wait, waitForInput, and waitForApproval', () => {
      expect(handler.canHandle('wait')).toBe(true);
      expect(handler.canHandle('waitForInput')).toBe(true);
      expect(handler.canHandle('waitForApproval')).toBe(true);
    });

    it('should not handle other step types', () => {
      expect(handler.canHandle('slack')).toBe(false);
      expect(handler.canHandle('http')).toBe(false);
      expect(handler.canHandle('workflow.execute')).toBe(false);
    });
  });

  describe('generateHoverContent', () => {
    it('should return null when there is no step context', async () => {
      const context = createMockHoverContext('wait');
      const result = await handler.generateHoverContent(context);
      expect(result).toBeNull();
    });

    it('should return hover content for wait', async () => {
      const stepContext = createMockStepContext({ stepType: 'wait' });
      const context = createMockHoverContext('wait', stepContext);
      const result = await handler.generateHoverContent(context);

      expect(result).not.toBeNull();
      expect(result?.value).toContain('**Step**: `wait`');
      expect(result?.value).toContain('Pause execution for a specified duration');
      expect(result?.value).toContain('duration');
      expect(result?.value).not.toMatch(/connector/i);
    });

    it('should return hover content for waitForInput', async () => {
      const stepContext = createMockStepContext({ stepType: 'waitForInput' });
      const context = createMockHoverContext('waitForInput', stepContext);
      const result = await handler.generateHoverContent(context);

      expect(result).not.toBeNull();
      expect(result?.value).toContain('**Step**: `waitForInput`');
      expect(result?.value).toContain(
        'Pause execution until external input is provided (human-in-the-loop)'
      );
      expect(result?.value).toContain('message');
      expect(result?.value).not.toMatch(/connector/i);
    });
  });

  describe('getExamples', () => {
    it('should return examples for wait', () => {
      const result = handler.getExamples('wait');
      expect(result?.snippet).toContain('type: wait');
      expect(result?.snippet).toContain('duration: "30s"');
    });

    it('should return examples for waitForInput', () => {
      const result = handler.getExamples('waitForInput');
      expect(result?.snippet).toContain('type: waitForInput');
      expect(result?.snippet).toContain('message: "Please approve before continuing"');
    });

    it('should return examples for waitForApproval', () => {
      const result = handler.getExamples('waitForApproval');
      expect(result?.snippet).toContain('type: waitForApproval');
      expect(result?.snippet).toContain('approveLabel: Approve');
    });
  });
});
