/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * End-to-end integration test for the PII anonymization workflow.
 *
 * Runs the real execution engine with real step handlers (ai.pii, call_site.proceed,
 * transform.pii_restore) and controlled capability mocks. No existing test covers all
 * three steps together through the real engine — this closes that gap.
 *
 * The central claim under test: PII in the prompt never reaches the LLM. The external
 * model sees only opaque tokens; the caller sees original values restored.
 */

import { ExecutionStatus } from '@kbn/workflows';

import { WorkflowRunFixture } from '@kbn/workflows-execution-engine/integration_tests/workflow_run_fixture';

import { aiPiiStepDefinition } from '../server/workflow_anonymization/ai_pii_step';
import { callSiteProceedStepDefinition } from '../server/workflow_anonymization/call_site_proceed_step';
import { piiRestoreStepDefinition } from '../server/workflow_anonymization/pii_restore_step';
import {
  AI_PII_STEP_ID,
  CALL_SITE_PROCEED_STEP_ID,
  TRANSFORM_PII_RESTORE_STEP_ID,
} from '../common/workflow_anonymization';
import {
  PII_TOKENIZATION_CAPABILITY_ID,
  INFERENCE_PROCEED_CAPABILITY_ID,
  createPiiTokenizationCapabilityValue,
  createInferenceProceedCapabilityValue,
  type PiiTokenizationContext,
  type InferenceProceedCapability,
  type DetectedPiiEntity,
} from '@kbn/inference-plugin/server/workflow_anonymization_capabilities';

// ─── Test fixtures ────────────────────────────────────────────────────────────

const TEST_EMAIL = 'john@acme.com';
const TEST_IP = '10.0.5.42';
const EMAIL_TOKEN = 'EMAIL_REDACTED';
const IP_TOKEN = 'IP_REDACTED';

/** The managed YAML shipped in the codebase — used verbatim so the test covers the real definition. */
const ANONYMIZATION_WORKFLOW_YAML = `
name: "Protect sensitive inference data"
enabled: false
description: "Protects common identifiers around inference completion calls."
version: "1"
tags:
  - inference
  - anonymization

triggers:
  - type: inference.aroundCompletion

outputs:
  - name: content
    type: string
    required: true

steps:
  - name: anonymize_completion
    type: ai.pii
    with:
      system: "\${{ event.system }}"
      messages: "\${{ event.messages }}"
      rules:
        - type: RegExp
          enabled: true
          entityClass: EMAIL
          pattern: '([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,})'
        - type: RegExp
          enabled: true
          entityClass: IP
          pattern: '\\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\\b'

  - name: invoke_inference
    type: call_site.proceed
    with:
      system: "\${{ steps.anonymize_completion.output.system }}"
      messages: "\${{ steps.anonymize_completion.output.messages }}"
      tokenMap: "\${{ steps.anonymize_completion.output.tokenMap }}"

  - name: restore_completion
    type: transform.pii_restore
    with:
      rawContent: "\${{ steps.invoke_inference.output.rawContent }}"
      tokenMap: "\${{ steps.anonymize_completion.output.tokenMap }}"

  - name: emit_restored_completion
    type: workflow.output
    with:
      content: "\${{ steps.restore_completion.output.content }}"
`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Builds a PiiTokenizationContext that finds TEST_EMAIL and TEST_IP by direct string search. */
const buildPiiContext = (): PiiTokenizationContext => ({
  detectEntities: jest.fn().mockImplementation(async ({ records }) => {
    const entities: DetectedPiiEntity[] = [];
    for (const record of records) {
      const emailIdx = record.text.indexOf(TEST_EMAIL);
      if (emailIdx >= 0) {
        entities.push({
          recordId: record.id,
          start: emailIdx,
          end: emailIdx + TEST_EMAIL.length,
          value: TEST_EMAIL,
          entityClass: 'EMAIL',
        });
      }
      const ipIdx = record.text.indexOf(TEST_IP);
      if (ipIdx >= 0) {
        entities.push({
          recordId: record.id,
          start: ipIdx,
          end: ipIdx + TEST_IP.length,
          value: TEST_IP,
          entityClass: 'IP',
        });
      }
    }
    return entities;
  }),
  tokenize: jest.fn().mockImplementation((entityClass: string) => `${entityClass}_REDACTED`),
});

/** Wires step definitions and capabilities into the fixture. */
const setupFixture = (
  fixture: WorkflowRunFixture,
  proceedCapability: InferenceProceedCapability
) => {
  const piiContext = buildPiiContext();

  const stepMap: Record<string, unknown> = {
    [AI_PII_STEP_ID]: aiPiiStepDefinition,
    [CALL_SITE_PROCEED_STEP_ID]: callSiteProceedStepDefinition,
    [TRANSFORM_PII_RESTORE_STEP_ID]: piiRestoreStepDefinition,
  };

  fixture.dependencies.workflowsExtensions.hasStepDefinition.mockImplementation(
    (id) => id in stepMap
  );
  fixture.dependencies.workflowsExtensions.getStepDefinition.mockImplementation(
    (id) => stepMap[id]
  );

  fixture.dependencies.capabilities = [
    { id: PII_TOKENIZATION_CAPABILITY_ID, value: createPiiTokenizationCapabilityValue(piiContext) },
    {
      id: INFERENCE_PROCEED_CAPABILITY_ID,
      value: createInferenceProceedCapabilityValue(proceedCapability),
    },
  ];

  return { piiContext };
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PII anonymization workflow — end-to-end', () => {
  let fixture: WorkflowRunFixture;
  let mockProceed: InferenceProceedCapability;

  beforeEach(() => {
    fixture = new WorkflowRunFixture();
    mockProceed = {
      invoke: jest
        .fn()
        .mockResolvedValue({ rawContent: `I can help ${EMAIL_TOKEN} at ${IP_TOKEN}.` }),
    };
    setupFixture(fixture, mockProceed);
  });

  describe('PII never reaches the LLM', () => {
    it('sends only tokens to proceed.invoke — no raw PII in messages', async () => {
      await fixture.runWorkflow({
        workflowYaml: ANONYMIZATION_WORKFLOW_YAML,
        event: {
          system: 'You are a helpful assistant.',
          messages: [
            { role: 'user', content: `Please help with user ${TEST_EMAIL} at IP ${TEST_IP}.` },
          ],
        },
      });

      expect(mockProceed.invoke).toHaveBeenCalledTimes(1);
      const calledWith = (mockProceed.invoke as jest.Mock).mock.calls[0][0];
      const serializedMessages = JSON.stringify(calledWith.messages);

      expect(serializedMessages).not.toContain(TEST_EMAIL);
      expect(serializedMessages).not.toContain(TEST_IP);
      expect(serializedMessages).toContain(EMAIL_TOKEN);
      expect(serializedMessages).toContain(IP_TOKEN);
    });

    it('sends only tokens in the system prompt — no raw PII', async () => {
      await fixture.runWorkflow({
        workflowYaml: ANONYMIZATION_WORKFLOW_YAML,
        event: {
          system: `System context includes ${TEST_EMAIL}.`,
          messages: [{ role: 'user', content: 'Hello.' }],
        },
      });

      const calledWith = (mockProceed.invoke as jest.Mock).mock.calls[0][0];

      expect(calledWith.system).not.toContain(TEST_EMAIL);
      expect(calledWith.system).toContain(EMAIL_TOKEN);
    });
  });

  describe('PII is restored in the workflow output', () => {
    it('restores tokens back to original values in content', async () => {
      await fixture.runWorkflow({
        workflowYaml: ANONYMIZATION_WORKFLOW_YAML,
        event: {
          system: 'You are a helpful assistant.',
          messages: [
            { role: 'user', content: `Please help with user ${TEST_EMAIL} at IP ${TEST_IP}.` },
          ],
        },
      });

      const execution = fixture.workflowExecutionRepositoryMock.workflowExecutions.get(
        'fake_workflow_execution_id'
      );

      expect(execution?.status).toBe(ExecutionStatus.COMPLETED);

      const content = execution?.context?.output?.content as string;
      expect(content).toContain(TEST_EMAIL);
      expect(content).toContain(TEST_IP);
      expect(content).not.toContain(EMAIL_TOKEN);
      expect(content).not.toContain(IP_TOKEN);
    });
  });

  describe('token map isolation between calls', () => {
    it('does not bleed token maps across independent workflow executions', async () => {
      const event = {
        system: 'You are a helpful assistant.',
        messages: [{ role: 'user', content: `Contact ${TEST_EMAIL}.` }],
      };

      await fixture.runWorkflow({ workflowYaml: ANONYMIZATION_WORKFLOW_YAML, event });
      const firstProceedCall = (mockProceed.invoke as jest.Mock).mock.calls[0][0];

      // Second run on a fresh fixture — different token map
      const fixture2 = new WorkflowRunFixture();
      const proceed2: InferenceProceedCapability = {
        invoke: jest.fn().mockResolvedValue({ rawContent: `Response about ${EMAIL_TOKEN}.` }),
      };
      setupFixture(fixture2, proceed2);
      await fixture2.runWorkflow({ workflowYaml: ANONYMIZATION_WORKFLOW_YAML, event });
      const secondProceedCall = (proceed2.invoke as jest.Mock).mock.calls[0][0];

      // Both runs tokenized independently — same token name for the same value is fine,
      // but the tokenMap objects must be distinct instances
      expect(firstProceedCall.tokenMap).not.toBe(secondProceedCall.tokenMap);
    });
  });

  describe('workflow completes successfully', () => {
    it('reaches COMPLETED status with no error', async () => {
      await fixture.runWorkflow({
        workflowYaml: ANONYMIZATION_WORKFLOW_YAML,
        event: {
          system: 'You are a helpful assistant.',
          messages: [{ role: 'user', content: `Email ${TEST_EMAIL}, IP ${TEST_IP}.` }],
        },
      });

      const execution = fixture.workflowExecutionRepositoryMock.workflowExecutions.get(
        'fake_workflow_execution_id'
      );

      expect(execution?.status).toBe(ExecutionStatus.COMPLETED);
      expect(execution?.error).toBeUndefined();
    });

    it('calls proceed.invoke exactly once per workflow execution', async () => {
      await fixture.runWorkflow({
        workflowYaml: ANONYMIZATION_WORKFLOW_YAML,
        event: {
          system: '',
          messages: [{ role: 'user', content: `Email ${TEST_EMAIL}.` }],
        },
      });

      expect(mockProceed.invoke).toHaveBeenCalledTimes(1);
    });
  });
});
