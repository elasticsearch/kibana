/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ApplicationStart } from '@kbn/core-application-browser';
import type { IUiSettingsClient } from '@kbn/core-ui-settings-browser';
import type { AttachmentServiceStartContract } from '@kbn/agent-builder-browser/attachments';
import { ENABLE_ESQL } from '@kbn/esql-utils';
import { RULES_FEATURE_LATEST } from '@kbn/security-solution-features/constants';
import { AiRuleCreationService } from '../../../detection_engine/common/ai_rule_creation_store';
import type { RuleResponse } from '../../../../common/api/detection_engine/model/rule_schema';
import {
  createRuleAttachmentDefinition,
  getRuleIdFromEditFormPath,
  isAttachmentRuleOpenOnFormPage,
  isOnRuleFormPage,
  registerRuleAttachment,
  shouldShowViewRuleButton,
} from './rule_attachment';
import { buildRuleActionButtons } from './rule_action_buttons';
import { SecurityAgentBuilderAttachments } from '../../../../common/constants';

const validRule = {
  name: 'Test Rule',
  type: 'query',
  description: 'A test rule',
  severity: 'high',
  risk_score: 73,
};

const makeAttachment = (ruleJson: string, label?: string) => ({
  id: 'test-attachment',
  type: 'security.rule',
  data: { text: ruleJson, ...(label ? { attachmentLabel: label } : {}) },
});
const mockAddAttachmentType = jest.fn();
const mockAttachments: AttachmentServiceStartContract = {
  addAttachmentType: mockAddAttachmentType,
} as unknown as AttachmentServiceStartContract;

const makeApplication = (canEdit: boolean) =>
  ({
    capabilities: {
      [RULES_FEATURE_LATEST]: { edit_rules: canEdit },
    },
    navigateToApp: jest.fn(),
  } as unknown as ApplicationStart);

const makeUiSettings = (esqlEnabled = true) =>
  ({
    get: jest.fn((key: string) => {
      if (key === ENABLE_ESQL) return esqlEnabled;
      return undefined;
    }),
  } as unknown as IUiSettingsClient);

describe('isOnRuleFormPage', () => {
  it('returns true for rule creation path', () => {
    expect(isOnRuleFormPage('/app/security/rules/create')).toBe(true);
  });

  it('returns true for rule edit path', () => {
    expect(isOnRuleFormPage('/app/security/rules/id/edit')).toBe(true);
  });

  it('returns false for rules listing page', () => {
    expect(isOnRuleFormPage('/app/security/rules')).toBe(false);
  });

  it('returns false for unrelated paths', () => {
    expect(isOnRuleFormPage('/app/security/dashboards')).toBe(false);
  });

  it('returns false for paths containing create but not rules', () => {
    expect(isOnRuleFormPage('/app/security/other/create')).toBe(false);
  });
});

describe('getRuleIdFromEditFormPath', () => {
  it('extracts the rule id from an edit URL', () => {
    expect(getRuleIdFromEditFormPath('/app/security/rules/id/my-rule-id/edit')).toBe('my-rule-id');
  });

  it('returns undefined when not on an edit URL', () => {
    expect(getRuleIdFromEditFormPath('/app/security/rules/create')).toBeUndefined();
  });
});

describe('shouldShowViewRuleButton', () => {
  it('is false without an attachment rule id', () => {
    expect(shouldShowViewRuleButton(undefined, '/app/security/rules')).toBe(false);
  });

  it('is true on the rules list', () => {
    expect(shouldShowViewRuleButton('rule-b', '/app/security/rules')).toBe(true);
  });

  it('is true when the edit form is open for the same rule (edit form != details page)', () => {
    expect(shouldShowViewRuleButton('rule-a', '/app/security/rules/id/rule-a/edit')).toBe(true);
  });

  it('is true when the edit form is open for a different rule', () => {
    expect(shouldShowViewRuleButton('rule-b', '/app/security/rules/id/rule-a/edit')).toBe(true);
  });

  it('is false when on the rule details page for the same rule', () => {
    expect(shouldShowViewRuleButton('rule-a', '/app/security/rules/id/rule-a')).toBe(false);
  });

  it('is true on the create form (attachment targets another saved rule)', () => {
    expect(shouldShowViewRuleButton('rule-b', '/app/security/rules/create')).toBe(true);
  });
});

describe('isAttachmentRuleOpenOnFormPage', () => {
  it('is true only when pathname and attachment rule id match on edit', () => {
    expect(isAttachmentRuleOpenOnFormPage('rule-a', '/app/security/rules/id/rule-a/edit')).toBe(
      true
    );
    expect(isAttachmentRuleOpenOnFormPage('rule-b', '/app/security/rules/id/rule-a/edit')).toBe(
      false
    );
  });
});

describe('createRuleAttachmentDefinition', () => {
  let aiRuleCreation: AiRuleCreationService;

  beforeEach(() => {
    aiRuleCreation = new AiRuleCreationService();
    jest.spyOn(aiRuleCreation, 'requestSaveRule');
    jest.spyOn(aiRuleCreation, 'setAiCreatedRule');
  });

  describe('definition shape', () => {
    it('exposes a static getActionButtons so buttons render on every attachment version', () => {
      const application = makeApplication(true);
      const definition = createRuleAttachmentDefinition({
        application,
        aiRuleCreation,
        uiSettings: makeUiSettings(),
      });
      expect(definition.getActionButtons).toEqual(expect.any(Function));
    });
  });

  describe('getActionButtons (intent wiring)', () => {
    const buildButtons = (
      attachmentData: Record<string, unknown>,
      { canEdit = true, origin }: { canEdit?: boolean; origin?: string } = {}
    ) => {
      const definition = createRuleAttachmentDefinition({
        application: makeApplication(canEdit),
        aiRuleCreation,
        uiSettings: makeUiSettings(),
      });
      return definition.getActionButtons!({
        attachment: {
          id: 'a',
          type: SecurityAgentBuilderAttachments.rule,
          data: attachmentData,
          ...(origin ? { origin } : {}),
        },
        isSidebar: false,
        isCanvas: false,
        updateOrigin: jest.fn(),
      } as never);
    };
    const primaryLabel = (buttons: ReturnType<typeof buildButtons>) =>
      buttons.find((b) => b.type === 'primary')?.label;

    beforeEach(() => {
      window.history.pushState({}, '', '/');
    });

    it('labels an unsaved attachment "Create rule" (no ruleId, no origin)', () => {
      expect(primaryLabel(buildButtons({ text: JSON.stringify(validRule) }))).toBe('Create rule');
    });

    it('labels an attachment with `origin` set "Update rule"', () => {
      // `origin` is the persisted, reload-safe link to the saved rule and is the source of truth
      // for the button: once a card is linked to a saved rule it is an update target.
      expect(
        primaryLabel(buildButtons({ text: JSON.stringify(validRule) }, { origin: 'rule-1' }))
      ).toBe('Update rule');
    });

    it('returns no buttons when the user cannot edit rules', () => {
      expect(buildButtons({ text: JSON.stringify(validRule) }, { canEdit: false })).toEqual([]);
    });
  });

  describe('registerRuleAttachment', () => {
    it('registers only the rule attachment type', () => {
      const application = makeApplication(true);
      registerRuleAttachment({
        attachments: mockAttachments,
        application,
        aiRuleCreation,
        uiSettings: makeUiSettings(),
      });

      expect(mockAddAttachmentType).toHaveBeenCalledTimes(1);
      expect(mockAddAttachmentType).toHaveBeenCalledWith(
        SecurityAgentBuilderAttachments.rule,
        expect.any(Object)
      );
    });

    it('registers rule attachment type with correct config', () => {
      const application = makeApplication(true);
      registerRuleAttachment({
        attachments: mockAttachments,
        application,
        aiRuleCreation,
        uiSettings: makeUiSettings(),
      });

      const ruleCall = mockAddAttachmentType.mock.calls.find(
        (call: unknown[]) => call[0] === SecurityAgentBuilderAttachments.rule
      );
      expect(ruleCall).toBeDefined();

      const config = ruleCall![1];
      expect(config.getIcon()).toBe('securityApp');
      expect(config.getLabel({ id: 'test', type: 'test', data: {} })).toBe('Security Rule');
    });

    it('returns attachmentLabel when provided in alert attachment data', () => {
      const application = makeApplication(true);
      registerRuleAttachment({
        attachments: mockAttachments,
        application,
        aiRuleCreation,
        uiSettings: makeUiSettings(),
      });

      const ruleCall = mockAddAttachmentType.mock.calls.find(
        (call: unknown[]) => call[0] === SecurityAgentBuilderAttachments.rule
      );
      const config = ruleCall![1];

      const attachment = {
        id: 'test',
        type: SecurityAgentBuilderAttachments.rule,
        data: { text: '{}', attachmentLabel: 'My Test Security Rule' },
      };
      expect(config.getLabel(attachment)).toBe('My Test Security Rule');
    });
  });

  describe('getLabel', () => {
    it('returns attachmentLabel when provided', () => {
      const application = makeApplication(true);
      const definition = createRuleAttachmentDefinition({
        application,
        aiRuleCreation,
        uiSettings: makeUiSettings(),
      });
      const label = definition.getLabel(
        makeAttachment(JSON.stringify(validRule), 'My Rule') as never
      );
      expect(label).toBe('My Rule');
    });

    it('falls back to parsed rule name when no attachmentLabel', () => {
      const application = makeApplication(true);
      const definition = createRuleAttachmentDefinition({
        application,
        aiRuleCreation,
        uiSettings: makeUiSettings(),
      });
      const label = definition.getLabel(makeAttachment(JSON.stringify(validRule)) as never);
      expect(label).toBe('Test Rule');
    });

    it('returns default label when rule is not parseable', () => {
      const application = makeApplication(true);
      const definition = createRuleAttachmentDefinition({
        application,
        aiRuleCreation,
        uiSettings: makeUiSettings(),
      });
      const label = definition.getLabel(makeAttachment('invalid') as never);
      expect(label).toBe('Security Rule');
    });
  });
});

describe('buildRuleActionButtons', () => {
  let aiRuleCreation: AiRuleCreationService;
  let baseProps: Parameters<typeof buildRuleActionButtons>[0];

  const primaryButton = (buttons: ReturnType<typeof buildRuleActionButtons>) =>
    buttons.find((b) => b.type === 'primary');
  const labels = (buttons: ReturnType<typeof buildRuleActionButtons>) =>
    buttons.map((b) => b.label);

  beforeEach(() => {
    aiRuleCreation = new AiRuleCreationService();
    jest.spyOn(aiRuleCreation, 'requestSaveRule');
    jest.spyOn(aiRuleCreation, 'setAiCreatedRule');
    window.history.pushState({}, '', '/');
    baseProps = {
      rule: { name: 'Test Rule', type: 'query' } as unknown as RuleResponse,
      aiRuleCreation,
      application: makeApplication(true),
      uiSettings: makeUiSettings(),
      intent: 'create',
      ruleId: undefined,
      attachmentId: 'air:testcard',
      showViewRule: false,
      updateOrigin: jest.fn().mockResolvedValue(undefined),
    };
  });

  afterEach(() => jest.clearAllMocks());

  it('returns no buttons when the user lacks RULES_UI_EDIT_PRIVILEGE', () => {
    expect(buildRuleActionButtons({ ...baseProps, application: makeApplication(false) })).toEqual(
      []
    );
  });

  it('returns no buttons for an ES|QL rule when ENABLE_ESQL is disabled', () => {
    expect(
      buildRuleActionButtons({
        ...baseProps,
        rule: { ...baseProps.rule!, type: 'esql' } as unknown as RuleResponse,
        uiSettings: makeUiSettings(false),
      })
    ).toEqual([]);
  });

  it('returns a "Create rule" primary action for a create-intent attachment', () => {
    const buttons = buildRuleActionButtons(baseProps);
    expect(primaryButton(buttons)?.label).toBe('Create rule');
    expect(primaryButton(buttons)?.icon).toBe('plusInCircle');
  });

  it('returns an "Update rule" primary action for an update-intent attachment', () => {
    const buttons = buildRuleActionButtons({ ...baseProps, intent: 'update', ruleId: 'rule-123' });
    expect(primaryButton(buttons)?.label).toBe('Update rule');
    expect(primaryButton(buttons)?.icon).toBe('save');
  });

  it('requests a save with the ruleId injected for an update-intent attachment', () => {
    const buttons = buildRuleActionButtons({ ...baseProps, intent: 'update', ruleId: 'rule-123' });
    primaryButton(buttons)!.handler();
    expect(aiRuleCreation.requestSaveRule).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'rule-123' }),
      expect.objectContaining({ attachmentId: 'air:testcard' })
    );
  });

  it('requests a save with the attachmentId for a create-intent attachment', () => {
    const buttons = buildRuleActionButtons({ ...baseProps });
    primaryButton(buttons)!.handler();
    expect(aiRuleCreation.requestSaveRule).toHaveBeenCalledWith(
      expect.not.objectContaining({ id: expect.anything() }),
      expect.objectContaining({ attachmentId: 'air:testcard' })
    );
  });

  it('"Preview before saving" calls setAiCreatedRule with the rule and attachmentId', () => {
    const buttons = buildRuleActionButtons(baseProps);
    buttons.find((b) => b.label === 'Preview before saving')!.handler();
    expect(aiRuleCreation.setAiCreatedRule).toHaveBeenCalledWith(baseProps.rule, 'air:testcard');
  });

  it('guards against a double-submit while a save is already in flight', () => {
    aiRuleCreation.requestSaveRule({ name: 'in flight' } as unknown as RuleResponse);
    (aiRuleCreation.requestSaveRule as jest.Mock).mockClear();
    expect(aiRuleCreation.getIsSaving()).toBe(true);

    primaryButton(buildRuleActionButtons(baseProps))!.handler();
    expect(aiRuleCreation.requestSaveRule).not.toHaveBeenCalled();
  });

  it('omits View rule from action buttons when showViewRule is false', () => {
    expect(labels(buildRuleActionButtons({ ...baseProps, ruleId: 'rule-123' }))).not.toContain(
      'View rule'
    );
  });

  it('navigates to create path for create intent even when a ruleId is present', () => {
    const application = makeApplication(true);
    const buttons = buildRuleActionButtons({
      ...baseProps,
      application,
      ruleId: 'rule-123',
    });
    buttons.find((b) => b.label === 'Preview before saving')!.handler();
    expect(application.navigateToApp).toHaveBeenCalledWith('securitySolutionUI', {
      path: expect.stringContaining('/create'),
    });
  });

  it('omits View rule from action buttons when showViewRule is false even for update intent', () => {
    expect(
      labels(buildRuleActionButtons({ ...baseProps, intent: 'update', ruleId: 'rule-123' }))
    ).not.toContain('View rule');
  });

  it('includes View rule in action buttons when showViewRule is true and ruleId is set', () => {
    expect(
      labels(
        buildRuleActionButtons({
          ...baseProps,
          intent: 'update',
          ruleId: 'rule-123',
          showViewRule: true,
        })
      )
    ).toContain('View rule');
  });
});
