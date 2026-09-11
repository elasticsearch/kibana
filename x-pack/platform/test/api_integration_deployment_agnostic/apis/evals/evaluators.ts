/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from '@kbn/expect';
import {
  EVALS_EVALUATORS_URL,
  EVALS_EVALUATOR_URL,
  EVALS_TRACE_EVIDENCE_URL,
  EVALS_VALIDATE_URL,
  type CreateEvaluatorResponse,
  type DeleteEvaluatorResponse,
  type GetEvaluatorResponse,
  type GetTraceEvidenceResponse,
  type ListEvaluatorsResponse,
  type LlmJudgeConfig,
  type UpdateEvaluatorResponse,
} from '@kbn/evals-common';
import type { DeploymentAgnosticFtrProviderContext } from '../../ftr_provider_context';
import type { SupertestWithRoleScopeType } from '../../services';
import { getEvalsApiClientForRole } from './helpers/api_client';
import { seedTrace, uniqueSuffix, uniqueTraceId } from './helpers/fixtures';

export default function ({ getService }: DeploymentAgnosticFtrProviderContext) {
  const roleScopedSupertest = getService('roleScopedSupertest');
  const es = getService('es');
  const spaces = getService('spaces');

  let adminClient: SupertestWithRoleScopeType;
  let viewerClient: SupertestWithRoleScopeType;

  const evaluatorPath = (name: string) =>
    EVALS_EVALUATOR_URL.replace('{name}', encodeURIComponent(name));
  const traceEvidencePath = (traceId: string) =>
    EVALS_TRACE_EVIDENCE_URL.replace('{traceId}', encodeURIComponent(traceId));

  const judge: LlmJudgeConfig = {
    prompt: 'Response: {{{agent_response}}}\nRate its professional tone.',
    system_prompt: 'Judge the response according to the supplied criteria.',
    evidence: ['response'],
    output: { scores: [{ name: 'tone', type: 'number' }] },
  };

  describe('Evals - Evaluators', function () {
    const suffix = uniqueSuffix();

    before(async () => {
      adminClient = await getEvalsApiClientForRole(roleScopedSupertest, 'admin');
      viewerClient = await getEvalsApiClientForRole(roleScopedSupertest, 'viewer');
    });

    after(async () => {
      await adminClient.destroy();
      await viewerClient.destroy();
    });

    it('lists the registered evaluators with read_evals (admin)', async () => {
      const { body } = await adminClient.get(EVALS_EVALUATORS_URL).expect(200);

      const response = body as ListEvaluatorsResponse;
      expect(response.evaluators.length).to.be.greaterThan(0);
      expect(response.evaluators.every((evaluator) => typeof evaluator.name === 'string')).to.be(
        true
      );
    });

    it('allows listing evaluators with read_evals (viewer)', async () => {
      await viewerClient.get(EVALS_EVALUATORS_URL).expect(200);
    });

    describe('trace evidence', () => {
      const traceId = uniqueTraceId();
      const traceIndex = `traces-evals-evidence-ftr-${suffix}`;

      before(async () => {
        await seedTrace(es, traceIndex, traceId, [
          {
            spanId: 'span-1',
            name: 'root span',
            timestamp: '2024-01-01T00:00:00.000Z',
            durationNanos: 5_000_000,
            attributes: {
              'elastic.inference.span.kind': 'LLM',
              'gen_ai.input.messages': JSON.stringify([
                {
                  role: 'user',
                  parts: [{ type: 'text', content: 'What is the service status?' }],
                },
              ]),
              'gen_ai.output.messages': JSON.stringify([
                {
                  role: 'assistant',
                  parts: [{ type: 'text', content: 'The service is healthy.' }],
                },
              ]),
            },
          },
          {
            spanId: 'span-2',
            parentSpanId: 'span-1',
            name: 'tool span',
            timestamp: '2024-01-01T00:00:00.002Z',
            durationNanos: 1_000_000,
            attributes: {
              'elastic.inference.span.kind': 'TOOL',
              'gen_ai.tool.call.id': 'call-1',
              'gen_ai.tool.name': 'health_check',
              'gen_ai.tool.call.arguments': '{"service":"evals-ftr"}',
              'gen_ai.tool.call.result': '{"status":"healthy"}',
            },
          },
        ]);
      });

      after(async () => {
        await es.indices.delete({ index: traceIndex }).catch(() => {
          // best-effort cleanup
        });
      });

      it('returns normalized evidence using automatic profile detection', async () => {
        const { body } = await adminClient.get(traceEvidencePath(traceId)).expect(200);

        const result = body as GetTraceEvidenceResponse;
        expect(result.status).to.be('resolved');
        if (result.status !== 'resolved') {
          throw new Error(`Expected resolved evidence, received ${result.status}`);
        }

        expect(result.readiness).to.be('immediate');
        expect(result.profile_selection).to.be('auto');
        expect(result.profile).to.be('elastic-inference');
        expect(result.evidence).to.eql({
          input: { message: 'What is the service status?' },
          response: { message: 'The service is healthy.' },
          steps: [
            {
              tool_call_id: 'call-1',
              tool_id: 'health_check',
              arguments: { service: 'evals-ftr' },
              result: { status: 'healthy' },
            },
          ],
        });
      });

      it('allows a viewer to wait for complete normalized evidence', async () => {
        const { body } = await viewerClient
          .get(traceEvidencePath(traceId))
          .query({ profile: 'elastic-inference', wait: 'complete' })
          .expect(200);

        const result = body as GetTraceEvidenceResponse;
        expect(result.status).to.be('resolved');
        if (result.status !== 'resolved') {
          throw new Error(`Expected resolved evidence, received ${result.status}`);
        }

        expect(result.readiness).to.be('complete');
        expect(result.profile_selection).to.be('explicit');
        expect(result.profile).to.be('elastic-inference');
      });
    });

    describe('CRUD', () => {
      const name = `ftr-tone-${suffix}`;
      let exists = false;

      after(async () => {
        if (exists) {
          await adminClient.delete(evaluatorPath(name)).catch(() => {
            // best-effort cleanup
          });
        }
      });

      it('rejects a definition without a system prompt', async () => {
        const { system_prompt: _systemPrompt, ...judgeWithoutSystemPrompt } = judge;

        await adminClient
          .post(EVALS_EVALUATORS_URL)
          .send({
            name: `missing-system-${suffix}`,
            description: 'Invalid evaluator',
            judge: judgeWithoutSystemPrompt,
          })
          .expect(400);
      });

      it('rejects a prompt that references undeclared data', async () => {
        await adminClient
          .post(EVALS_EVALUATORS_URL)
          .send({
            name: `invalid-prompt-${suffix}`,
            description: 'Invalid evaluator',
            judge: { ...judge, prompt: '{{{undeclared_reference}}}' },
          })
          .expect(400);
      });

      it('rejects an invalid evaluator name', async () => {
        await adminClient
          .post(EVALS_EVALUATORS_URL)
          .send({
            name: `Invalid-Name-${suffix}`,
            description: 'Invalid evaluator',
            judge,
          })
          .expect(400);
      });

      it('rejects changes to built-in evaluators', async () => {
        await adminClient
          .put(evaluatorPath('correctness'))
          .send({ description: 'Changed' })
          .expect(400);
        await adminClient.delete(evaluatorPath('correctness')).expect(400);
      });

      it('creates a user-defined evaluator with manage_evals', async () => {
        const { body } = await adminClient
          .post(EVALS_EVALUATORS_URL)
          .send({ name, description: 'Initial tone evaluator', judge })
          .expect(200);

        const created = body as CreateEvaluatorResponse;
        exists = true;
        expect(created.evaluator.name).to.eql(name);
        expect(created.evaluator.version).to.eql('1.0.0');
        expect(created.evaluator.origin).to.eql('user_defined');
        expect(created.evaluator.judge).to.eql(judge);
      });

      it('rejects evaluator creation without manage_evals', async () => {
        await viewerClient
          .post(EVALS_EVALUATORS_URL)
          .send({ name: `viewer-${suffix}`, description: 'Not allowed', judge })
          .expect(403);
      });

      it('rejects duplicate and built-in names', async () => {
        await adminClient
          .post(EVALS_EVALUATORS_URL)
          .send({ name, description: 'Duplicate', judge })
          .expect(409);
        await adminClient
          .post(EVALS_EVALUATORS_URL)
          .send({ name: 'correctness', description: 'Replacement', judge })
          .expect(409);
      });

      it('gets the latest definition and its version history', async () => {
        const { body } = await adminClient.get(evaluatorPath(name)).expect(200);
        const response = body as GetEvaluatorResponse;

        expect(response.evaluator.name).to.eql(name);
        expect(response.evaluator.version).to.eql('1.0.0');
        expect(response.evaluator.versions).to.eql(['1.0.0']);
      });

      it('allows a viewer to read a persisted evaluator', async () => {
        await viewerClient.get(evaluatorPath(name)).expect(200);
      });

      it('validates a persisted evaluator definition', async () => {
        const { body } = await adminClient
          .post(EVALS_VALIDATE_URL)
          .send({
            subject: { traces: [{ trace_id: '1234567890abcdef1234567890abcdef' }] },
            evaluators: [{ name }],
          })
          .expect(200);

        expect(body.evaluators).to.eql([
          {
            name,
            version: '1.0.0',
            ready: false,
            unmet: ['response.message'],
            remediation: 'enable includeLlmResponses',
          },
        ]);
      });

      it('writes a new minor version without replacing the old one', async () => {
        const { body } = await adminClient
          .put(evaluatorPath(name))
          .send({ description: 'Updated tone evaluator' })
          .expect(200);
        const updated = body as UpdateEvaluatorResponse;

        expect(updated.evaluator.version).to.eql('1.1.0');
        expect(updated.evaluator.description).to.eql('Updated tone evaluator');

        const { body: oldBody } = await adminClient
          .get(evaluatorPath(name))
          .query({ version: '1.0.0' })
          .expect(200);
        const oldVersion = oldBody as GetEvaluatorResponse;
        expect(oldVersion.evaluator.description).to.eql('Initial tone evaluator');
        expect(oldVersion.evaluator.versions).to.eql(['1.1.0', '1.0.0']);
      });

      it('rejects an update with no changes', async () => {
        await adminClient.put(evaluatorPath(name)).send({}).expect(400);
      });

      it('lists the latest persisted version alongside built-ins', async () => {
        const { body } = await adminClient.get(EVALS_EVALUATORS_URL).expect(200);
        const response = body as ListEvaluatorsResponse;
        const found = response.evaluators.find((evaluator) => evaluator.name === name);

        expect(found?.version).to.eql('1.1.0');
        expect(found?.origin).to.eql('user_defined');
      });

      it('rejects update and delete without manage_evals', async () => {
        await viewerClient
          .put(evaluatorPath(name))
          .send({ description: 'Not allowed' })
          .expect(403);
        await viewerClient.delete(evaluatorPath(name)).expect(403);
      });

      it('deletes one pinned version while preserving the definition', async () => {
        const { body } = await adminClient
          .delete(evaluatorPath(name))
          .query({ version: '1.0.0' })
          .expect(200);
        expect((body as DeleteEvaluatorResponse).deleted).to.eql(1);

        await adminClient.get(evaluatorPath(name)).query({ version: '1.0.0' }).expect(404);
        const { body: latestBody } = await adminClient.get(evaluatorPath(name)).expect(200);
        expect((latestBody as GetEvaluatorResponse).evaluator.version).to.eql('1.1.0');
      });

      it('deletes every remaining version', async () => {
        const { body } = await adminClient.delete(evaluatorPath(name)).expect(200);
        expect((body as DeleteEvaluatorResponse).deleted).to.eql(1);
        await adminClient.get(evaluatorPath(name)).expect(404);
        exists = false;
      });
    });

    describe('spaces', () => {
      const spaceId = `evals-evaluators-${suffix}`;
      const inSpace = (path: string) => `/s/${spaceId}${path}`;
      const name = `ftr-space-tone-${suffix}`;
      let defaultExists = false;
      let spaceExists = false;

      before(async () => {
        await spaces.create({ id: spaceId, name: 'Evals Evaluators Space', disabledFeatures: [] });
      });

      after(async () => {
        if (defaultExists) {
          await adminClient.delete(evaluatorPath(name)).catch(() => {
            // best-effort cleanup
          });
        }
        if (spaceExists) {
          await adminClient.delete(inSpace(evaluatorPath(name))).catch(() => {
            // best-effort cleanup
          });
        }
        await spaces.delete(spaceId);
      });

      it('keeps evaluator definitions isolated by space', async () => {
        await adminClient
          .post(inSpace(EVALS_EVALUATORS_URL))
          .send({ name, description: 'Space evaluator', judge })
          .expect(200);
        spaceExists = true;

        await adminClient.get(inSpace(evaluatorPath(name))).expect(200);
        await adminClient.get(evaluatorPath(name)).expect(404);
      });

      it('allows the same evaluator name to exist independently in another space', async () => {
        await adminClient
          .post(EVALS_EVALUATORS_URL)
          .send({ name, description: 'Default evaluator', judge })
          .expect(200);
        defaultExists = true;

        const { body: defaultBody } = await adminClient.get(evaluatorPath(name)).expect(200);
        const { body: spaceBody } = await adminClient.get(inSpace(evaluatorPath(name))).expect(200);

        expect((defaultBody as GetEvaluatorResponse).evaluator.description).to.eql(
          'Default evaluator'
        );
        expect((spaceBody as GetEvaluatorResponse).evaluator.description).to.eql('Space evaluator');
      });
    });
  });
}
