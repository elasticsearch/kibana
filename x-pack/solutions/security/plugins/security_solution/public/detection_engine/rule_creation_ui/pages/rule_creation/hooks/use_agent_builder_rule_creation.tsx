/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { useEffect, useCallback, useMemo, useRef, useState } from 'react';
import { i18n } from '@kbn/i18n';
import type { AttachmentInput } from '@kbn/agent-builder-common/attachments';
import { getLatestVersion } from '@kbn/agent-builder-common/attachments';
import { isRoundCompleteEvent } from '@kbn/agent-builder-common/chat/events';
import { isToolCallStep } from '@kbn/agent-builder-common/chat/conversation';
import type { ActionTypeRegistryContract } from '@kbn/triggers-actions-ui-plugin/public';
import { useKibana } from '../../../../../common/lib/kibana';
import { useAppToasts } from '../../../../../common/hooks/use_app_toasts';
import type {
  RuleResponse,
  RuleCreateProps,
} from '../../../../../../common/api/detection_engine/model/rule_schema';
import { getStepsData } from '../../../../common/helpers';
import { RuleCreationEventTypes } from '../../../../../common/lib/telemetry/types';
import type { FormHook } from '../../../../../shared_imports';
import type {
  DefineStepRule,
  AboutStepRule,
  ScheduleStepRule,
  ActionsStepRule,
} from '../../../../common/types';
import {
  SecurityAgentBuilderAttachments,
  SECURITY_RULE_ATTACHMENT_ID,
} from '../../../../../../common/constants';
import { formatRule } from '../helpers';
import {
  getRuleIdFromAttachment,
  getRuleAttachmentIntent,
} from '../../../../../agent_builder/attachment_types/rule/helpers';

const ruleDefaultMetadataFields = {
  references: [],
  severity_mapping: [],
  risk_score_mapping: [],
  related_integrations: [],
  required_fields: [],
  actions: [],
  exceptions_list: [],
  false_positives: [],
  author: [],
  setup: '',
};

const SYNC_DEBOUNCE_MS = 500;

// Must match server-side tool registrations (create_detection_rule_tool.ts + platform builtin).
const RULE_CREATE_TOOL_ID = 'security.create_detection_rule';
const ATTACHMENT_UPDATE_TOOL_ID = 'attachments.update';

// Adapts a `VersionedAttachment` (data lives under `versions[]`) to the `{ data }` shape the rule
// helpers read.
const versionedAttachmentView = (attachment: { versions?: unknown; origin?: string }) => ({
  data: getLatestVersion(attachment as never)?.data,
  origin: attachment.origin,
});

interface UseAgentBuilderRuleCreationParams {
  defineStepForm: FormHook<DefineStepRule, DefineStepRule>;
  aboutStepForm: FormHook<AboutStepRule, AboutStepRule>;
  scheduleStepForm: FormHook<ScheduleStepRule, ScheduleStepRule>;
  actionsStepForm: FormHook<ActionsStepRule, ActionsStepRule>;
  defineStepData?: DefineStepRule;
  aboutStepData?: AboutStepRule;
  scheduleStepData?: ScheduleStepRule;
  actionsStepData?: ActionsStepRule;
  actionTypeRegistry?: ActionTypeRegistryContract;
  /** Existing rule id — present on rule edit pages; absent on the create page. */
  existingRuleId?: string;
}

interface UseAgentBuilderRuleCreationResult {
  isAiRuleUpdateRef: React.MutableRefObject<boolean>;
}

export const useAgentBuilderRuleCreation = ({
  defineStepForm,
  aboutStepForm,
  scheduleStepForm,
  actionsStepForm,
  defineStepData,
  aboutStepData,
  scheduleStepData,
  actionsStepData,
  actionTypeRegistry,
  existingRuleId,
}: UseAgentBuilderRuleCreationParams): UseAgentBuilderRuleCreationResult => {
  const { services } = useKibana();
  const { agentBuilder, aiRuleCreation, telemetry } = services;
  const { addSuccess } = useAppToasts();
  const isAiRuleUpdateRef = useRef(false);
  const [isSyncActive, setIsSyncActive] = useState(false);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout>>();
  // Rule id for form→agent syncs: page-lifetime on edit pages, cleared on conversation switch.
  const syncRuleIdRef = useRef<string | undefined>(existingRuleId);
  const existingRuleIdRef = useRef(existingRuleId);
  existingRuleIdRef.current = existingRuleId;
  // Frozen intent — never recomputed from page state to prevent flipping.
  const intentRef = useRef<'create' | 'update'>(existingRuleId ? 'update' : 'create');

  const getRuleIdForSync = useCallback((): string | undefined => {
    // Create-intent chat on a rule edit page must not inherit the page's rule id.
    if (intentRef.current === 'create') {
      return syncRuleIdRef.current;
    }
    return syncRuleIdRef.current ?? existingRuleIdRef.current ?? undefined;
  }, []);

  // Activate form→chat sync while the rule form is open, and reset it on close. Scoping activation
  // to the page lifetime (rather than to a button click) means nothing leaks if the user never
  // reaches the form, and writes no-op until a chat sidebar is actually open.
  useEffect(() => {
    const subscription = aiRuleCreation.formSyncActive$.subscribe(setIsSyncActive);
    aiRuleCreation.activateFormSync();
    return () => {
      subscription.unsubscribe();
      aiRuleCreation.deactivateFormSync();
      aiRuleCreation.releaseBind();
    };
  }, [aiRuleCreation]);

  // Edit pages have no telemetry-hook session cleanup (the create page does), so release any AI
  // session when the edit form closes — otherwise it bleeds its id/start time into the next one.
  useEffect(() => {
    if (!existingRuleId) {
      return;
    }
    return () => {
      if (aiRuleCreation.getSession()) {
        aiRuleCreation.clearSession();
      }
    };
  }, [existingRuleId, aiRuleCreation]);

  useEffect(() => {
    if (!agentBuilder?.events?.ui?.activeConversation$) {
      return;
    }
    const subscription = agentBuilder.events.ui.activeConversation$.subscribe((change) => {
      const attachments = change?.conversation?.attachments ?? [];
      const boundId = aiRuleCreation.getBoundAttachmentId();
      const ruleAttachment =
        (boundId
          ? attachments.find(
              (a) => a.id === boundId && a.type === SecurityAgentBuilderAttachments.rule
            )
          : undefined) ?? attachments.find((a) => a.type === SecurityAgentBuilderAttachments.rule);

      if (!ruleAttachment) {
        syncRuleIdRef.current = undefined;
        intentRef.current = existingRuleIdRef.current ? 'update' : 'create';
        return;
      }
      const attachmentView = versionedAttachmentView(ruleAttachment as never);
      intentRef.current = getRuleAttachmentIntent(attachmentView as never);
      const ruleId = getRuleIdFromAttachment(attachmentView as never);
      if (intentRef.current === 'create') {
        syncRuleIdRef.current = ruleId;
        return;
      }
      syncRuleIdRef.current = ruleId ?? existingRuleIdRef.current;

      // Keep the form→chat bind aligned with the rule being edited.
      const matchesThisRule = ruleId === existingRuleIdRef.current;
      if (existingRuleIdRef.current && !matchesThisRule) {
        // Different rule's attachment — don't sync this form into it.
        aiRuleCreation.deactivateFormSync();
        aiRuleCreation.releaseBind();
      } else if (existingRuleIdRef.current && matchesThisRule && boundId === null) {
        // This rule's card, not yet bound (e.g. reached the form without going through the card).
        aiRuleCreation.setBoundAttachment(ruleAttachment.id);
        aiRuleCreation.activateFormSync();
      }
    });
    return () => subscription.unsubscribe();
  }, [agentBuilder, aiRuleCreation]);

  const addRuleAttachment = useCallback(
    (ruleData: unknown, label: string, savedRuleId?: string) => {
      if (!agentBuilder?.addAttachment) {
        return;
      }
      const intent = intentRef.current;
      // The saved-rule id lives in the attachment's top-level `origin` (the source of truth for the
      // "Update" button); include it on the push so syncing form edits never drops the link.
      const ruleId = intent === 'update' ? savedRuleId ?? getRuleIdForSync() : undefined;
      const targetId = aiRuleCreation.getBoundAttachmentId() ?? SECURITY_RULE_ATTACHMENT_ID;
      const attachment: AttachmentInput = {
        id: targetId,
        type: SecurityAgentBuilderAttachments.rule,
        // Guard against empty string — server treats "" as valid and would overwrite a prior label.
        ...(label ? { description: label } : {}),
        ...(ruleId ? { origin: ruleId } : {}),
        data: {
          text: JSON.stringify(ruleData),
          attachmentLabel: label,
        },
      };
      agentBuilder.addAttachment(attachment);
    },
    [agentBuilder, getRuleIdForSync, aiRuleCreation]
  );

  const updateFormFromChat = useCallback(
    (rule: RuleResponse, { silent = false }: { silent?: boolean } = {}) => {
      const stepsData = getStepsData({ rule: { ...ruleDefaultMetadataFields, ...rule } });

      const session = aiRuleCreation.getSession() ?? aiRuleCreation.startSession();
      aiRuleCreation.incrementApplyCount();
      telemetry.reportEvent(RuleCreationEventTypes.AiAppliedToForm, {
        creationSource: existingRuleId ? 'ai_edit' : 'ai',
        ruleType: rule.type,
        sessionId: session.sessionId,
        durationSinceSessionStartMs: Date.now() - session.startTimestamp,
      });

      const ruleIdForSync =
        intentRef.current === 'update' ? rule.id ?? getRuleIdForSync() : undefined;
      if (ruleIdForSync) {
        syncRuleIdRef.current = ruleIdForSync;
      }

      isAiRuleUpdateRef.current = true;
      aiRuleCreation.activateFormSync();
      defineStepForm.updateFieldValues(stepsData.defineRuleData);
      aboutStepForm.updateFieldValues(stepsData.aboutRuleData);
      scheduleStepForm.updateFieldValues(stepsData.scheduleRuleData);
      actionsStepForm.updateFieldValues(stepsData.ruleActionsData);

      // Push directly to the attachment — the form sync effect may not re-run if isSyncActive is
      // already true or the ES|QL editor ignores updateFieldValues (uncontrolled input).
      addRuleAttachment(rule, rule.name || '', ruleIdForSync);

      if (!silent) {
        addSuccess({
          title: i18n.translate(
            'xpack.securitySolution.detectionEngine.ruleCreation.agentBuilder.formUpdatedTitle',
            { defaultMessage: 'Rule form updated' }
          ),
          text: i18n.translate(
            'xpack.securitySolution.detectionEngine.ruleCreation.agentBuilder.formUpdatedText',
            { defaultMessage: 'The form has been updated with the AI-generated rule.' }
          ),
        });
      }
    },
    [
      defineStepForm,
      aboutStepForm,
      scheduleStepForm,
      actionsStepForm,
      addSuccess,
      addRuleAttachment,
      aiRuleCreation,
      existingRuleId,
      getRuleIdForSync,
      telemetry,
    ]
  );

  const updateFormFromChatRef = useRef(updateFormFromChat);
  updateFormFromChatRef.current = updateFormFromChat;
  const addRuleAttachmentRef = useRef(addRuleAttachment);
  addRuleAttachmentRef.current = addRuleAttachment;

  useEffect(() => {
    const subscription = aiRuleCreation.aiCreatedRule$.subscribe((rule) => {
      if (rule) {
        updateFormFromChatRef.current(rule);
        aiRuleCreation.clearAiCreatedRule();
      }
    });
    return () => subscription.unsubscribe();
  }, [aiRuleCreation]);

  // CHAT -> FORM
  useEffect(() => {
    if (!agentBuilder?.events?.chat$) return;
    const subscription = agentBuilder.events.chat$.subscribe((event) => {
      if (!isRoundCompleteEvent(event)) return;

      const steps = event.data.round?.steps ?? [];
      let touchedAttachmentId: string | undefined;
      let touchedIsNewCard = false;

      for (const step of steps) {
        if (isToolCallStep(step)) {
          const toolId = step.tool_id;
          if (toolId === RULE_CREATE_TOOL_ID || toolId === ATTACHMENT_UPDATE_TOOL_ID) {
            for (const result of step.results) {
              const resultData = result.data as Record<string, unknown> | undefined;
              if (resultData) {
                // create_detection_rule returns `attachmentId`; attachment_update returns `attachment_id`.
                const candidateId =
                  (resultData.attachmentId as string | undefined) ??
                  (resultData.attachment_id as string | undefined);
                if (candidateId) {
                  touchedAttachmentId = candidateId;
                  touchedIsNewCard =
                    toolId === RULE_CREATE_TOOL_ID ? Boolean(resultData.isNewCard) : false;
                }
              }
            }
          }
        }
      }

      if (touchedIsNewCard) {
        aiRuleCreation.releaseBind();
        return;
      }

      // Priority: touched attachment this round → bound attachment → first-of-type in event.
      const attachments = event.data.attachments ?? [];
      const resolvedId = touchedAttachmentId ?? aiRuleCreation.getBoundAttachmentId() ?? undefined;
      const ruleAttachment = resolvedId
        ? attachments.find(
            (a) => a.id === resolvedId && a.type === SecurityAgentBuilderAttachments.rule
          )
        : attachments.find((a) => a.type === SecurityAgentBuilderAttachments.rule);

      if (!ruleAttachment) return;

      if (ruleAttachment.id !== aiRuleCreation.getBoundAttachmentId()) {
        aiRuleCreation.setBoundAttachment(ruleAttachment.id);
      }

      const latestVersion = getLatestVersion(ruleAttachment);
      if (!latestVersion) return;
      let parsed: RuleResponse | undefined;
      try {
        const text = (latestVersion.data as { text?: string })?.text;
        if (!text) return;
        const result = JSON.parse(text);
        if (!result || typeof result !== 'object' || Array.isArray(result)) return;
        parsed = result as RuleResponse;
      } catch {
        return;
      }
      const versionedView = versionedAttachmentView(ruleAttachment as never);
      intentRef.current = getRuleAttachmentIntent(versionedView as never);
      const savedRuleId = getRuleIdFromAttachment(versionedView as never) ?? undefined;
      const ruleToApply =
        intentRef.current === 'update' && savedRuleId ? { ...parsed, id: savedRuleId } : parsed;
      updateFormFromChatRef.current(ruleToApply, { silent: true });
    });
    return () => subscription.unsubscribe();
  }, [agentBuilder, aiRuleCreation]);

  // Latest form inputs, read inside the debounce so the effect doesn't need them as deps.
  const formInputsRef = useRef({
    defineStepData,
    aboutStepData,
    scheduleStepData,
    actionsStepData,
  });
  formInputsRef.current = { defineStepData, aboutStepData, scheduleStepData, actionsStepData };

  // Value-stable signature so the debounce re-arms on content change, not on every render
  // (step-data objects get a fresh identity each render and would otherwise starve the timer).
  const formSignature = useMemo(
    () => JSON.stringify({ defineStepData, aboutStepData, scheduleStepData, actionsStepData }),
    [defineStepData, aboutStepData, scheduleStepData, actionsStepData]
  );

  // FORM -> CHAT
  useEffect(() => {
    const {
      defineStepData: define,
      aboutStepData: about,
      scheduleStepData: schedule,
      actionsStepData: actions,
    } = formInputsRef.current;
    if (
      !isSyncActive ||
      !agentBuilder?.addAttachment ||
      !define ||
      !about ||
      !schedule ||
      !actions ||
      !actionTypeRegistry
    ) {
      return;
    }

    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    debounceTimerRef.current = setTimeout(() => {
      try {
        const formattedRule = formatRule<RuleCreateProps>(
          define,
          about,
          schedule,
          actions,
          actionTypeRegistry
        );
        const isUpdateIntent = intentRef.current === 'update';
        const ruleIdForSync = isUpdateIntent ? getRuleIdForSync() : undefined;
        const ruleToSync = ruleIdForSync ? { ...formattedRule, id: ruleIdForSync } : formattedRule;
        addRuleAttachment(
          ruleToSync,
          ruleToSync.name ||
            (isUpdateIntent && ruleIdForSync
              ? i18n.translate(
                  'xpack.securitySolution.detectionEngine.createRule.aiRuleCreationAttachmentLabelExisting',
                  { defaultMessage: 'Rule' }
                )
              : i18n.translate(
                  'xpack.securitySolution.detectionEngine.createRule.aiRuleCreationAttachmentLabel',
                  { defaultMessage: 'New Rule' }
                )),
          ruleIdForSync
        );
      } catch {
        // ignored
      }
    }, SYNC_DEBOUNCE_MS);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [
    isSyncActive,
    agentBuilder,
    formSignature,
    actionTypeRegistry,
    addRuleAttachment,
    getRuleIdForSync,
  ]);

  return { isAiRuleUpdateRef };
};
