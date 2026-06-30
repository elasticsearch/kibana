/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

/**
 * Integration tests for OTel routing behaviour in Fleet-generated agent policies.
 *
 * These tests cover the acceptance criteria from elastic/ingest-dev#7132:
 * - Packages with dynamic_signal_types: true (OTLP-style) emit routing transforms
 *   that set `data_stream.dataset` from the package default (e.g. `generic`) unless
 *   the user overrides the `data_stream.dataset` stream var (see "custom dataset var").
 * - Receiver-specific packages (e.g. mysql_input_otel) without dynamic_signal_types
 *   set `data_stream.dataset` in routing transforms from the stream definition.
 * Further routing inside the Elasticsearch exporter at runtime is out of scope here.
 *
 * Dataset override via stream var `data_stream.dataset` (package-spec / ingest parity):
 * - Dynamic OTLP-style package: see "custom dataset var" test below.
 * - Receiver-specific input package: see "receiver-specific" override test below.
 * For non-OTel logfile full-policy dataset assertions, see agent_policy_input_logfile_dataset.ts.
 */

import expect from '@kbn/expect';
import { v4 as uuidv4 } from 'uuid';
import type { FtrProviderContext } from '../../../api_integration/ftr_provider_context';
import { skipIfNoDockerRegistry } from '../../helpers';

const DYNAMIC_PKG = 'test_otel_dynamic';
const DYNAMIC_PKG_VERSION = '1.0.0';

const RECEIVER_PKG = 'test_otel_receiver';
const RECEIVER_PKG_VERSION = '1.0.0';

/** Collect every OTTL statement string from all *_statements arrays in a processor object. */
function collectStatements(processor: Record<string, any>): string[] {
  const statementKeys = [
    'log_statements',
    'metric_statements',
    'trace_statements',
    'profile_statements',
  ];
  return statementKeys.flatMap((key) =>
    (processor[key] ?? []).flatMap((block: { statements: string[] }) => block.statements ?? [])
  );
}

/** Return all routing-transform processors from a full agent policy's processors map. */
function getRoutingProcessors(
  processors: Record<string, Record<string, any>> | undefined
): Array<[string, Record<string, any>]> {
  if (!processors) return [];
  return Object.entries(processors).filter(
    ([key]) => key.endsWith('-routing') && key.includes('otelcol-')
  );
}

/** Exact OTTL emitted by Fleet for data_stream.dataset (see otel_collector buildDataStreamStatements). */
function expectedDatasetOttlStatement(dataset: string): string {
  return `set(attributes["data_stream.dataset"], "${dataset}") where attributes["data_stream.dataset"] == nil`;
}

/** Exact OTTL emitted by Fleet for data_stream.namespace (see otel_collector buildDataStreamStatements). */
function expectedNamespaceOttlStatement(namespace: string): string {
  return `set(attributes["data_stream.namespace"], "${namespace}") where attributes["data_stream.namespace"] == nil`;
}

export default function (providerContext: FtrProviderContext) {
  const { getService } = providerContext;
  const supertest = getService('supertest');
  const esArchiver = getService('esArchiver');
  const fleetAndAgents = getService('fleetAndAgents');

  describe('OTel routing transforms in full agent policy', () => {
    skipIfNoDockerRegistry(providerContext);

    before(async () => {
      await esArchiver.load('x-pack/platform/test/fixtures/es_archives/fleet/empty_fleet_server');
      await fleetAndAgents.setup();

      // Install both test packages once for the whole describe block.
      await supertest
        .post(`/api/fleet/epm/packages/${DYNAMIC_PKG}/${DYNAMIC_PKG_VERSION}`)
        .set('kbn-xsrf', 'xxxx')
        .send({ force: true })
        .expect(200);

      await supertest
        .post(`/api/fleet/epm/packages/${RECEIVER_PKG}/${RECEIVER_PKG_VERSION}`)
        .set('kbn-xsrf', 'xxxx')
        .send({ force: true })
        .expect(200);
    });

    after(async () => {
      await supertest
        .delete(`/api/fleet/epm/packages/${DYNAMIC_PKG}/${DYNAMIC_PKG_VERSION}`)
        .set('kbn-xsrf', 'xxxx')
        .send({ force: true });

      await supertest
        .delete(`/api/fleet/epm/packages/${RECEIVER_PKG}/${RECEIVER_PKG_VERSION}`)
        .set('kbn-xsrf', 'xxxx')
        .send({ force: true });

      await esArchiver.unload('x-pack/platform/test/fixtures/es_archives/fleet/empty_fleet_server');
    });

    // -------------------------------------------------------------------------
    // Helper: create a minimal agent policy and return its id.
    // -------------------------------------------------------------------------
    async function createAgentPolicy(name?: string): Promise<string> {
      const {
        body: {
          item: { id },
        },
      } = await supertest
        .post('/api/fleet/agent_policies')
        .set('kbn-xsrf', 'xxxx')
        .send({ name: name ?? `otel-routing-test-${uuidv4()}`, namespace: 'default' })
        .expect(200);
      return id;
    }

    async function deleteAgentPolicy(agentPolicyId: string) {
      await supertest
        .post('/api/fleet/agent_policies/delete')
        .set('kbn-xsrf', 'xxxx')
        .send({ agentPolicyId });
    }

    // -------------------------------------------------------------------------
    // Helper: get the full agent policy item from the API.
    // -------------------------------------------------------------------------
    async function getFullAgentPolicy(agentPolicyId: string): Promise<Record<string, any>> {
      const { body } = await supertest
        .get(`/api/fleet/agent_policies/${agentPolicyId}/full`)
        .set('kbn-xsrf', 'xxxx')
        .expect(200);
      return body.item;
    }

    // -------------------------------------------------------------------------
    // Test 1 (OTLP scenario): dynamic_signal_types: true → dataset set from package default
    // -------------------------------------------------------------------------
    it('sets data_stream.dataset to the package default (generic) in routing transforms for dynamic_signal_types packages (OTLP scenario)', async () => {
      const agentPolicyId = await createAgentPolicy();

      try {
        // Create a package policy using the dynamic OTel package.
        // Input key: {policyTemplateName}-{inputType} = otlpreceiver-otelcol
        // Stream key: dataset = generic (declared as default in the package manifest var)
        await supertest
          .post('/api/fleet/package_policies')
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: `otlp-routing-${uuidv4()}`,
            namespace: 'default',
            policy_id: agentPolicyId,
            package: { name: DYNAMIC_PKG, version: DYNAMIC_PKG_VERSION },
            inputs: {
              'otlpreceiver-otelcol': {
                enabled: true,
                streams: {
                  'test_otel_dynamic.otlpreceiver': { enabled: true, vars: {} },
                },
              },
            },
          })
          .expect(200);

        const fullPolicy = await getFullAgentPolicy(agentPolicyId);
        const routingProcessors = getRoutingProcessors(fullPolicy.processors);

        // There must be at least one routing processor generated from the OTel template.
        expect(routingProcessors.length).to.be.greaterThan(0);

        for (const [_, processor] of routingProcessors) {
          const statements = collectStatements(processor);

          // Must set signal type, dataset, and namespace in routing transforms.
          expect(statements.some((s) => s.includes('data_stream.type'))).to.be(true);
          expect(statements.some((s) => s === expectedNamespaceOttlStatement('default'))).to.be(
            true
          );
          // dataset is now set from the package manifest default (generic).
          expect(statements.some((s) => s === expectedDatasetOttlStatement('generic'))).to.be(true);
        }
      } finally {
        await deleteAgentPolicy(agentPolicyId);
      }
    });

    // -------------------------------------------------------------------------
    // Test 2: explicit data_stream.dataset var on dynamic package → dataset IS set
    //
    // When the user overrides data_stream.dataset via the package policy variable,
    // Fleet must embed that value in the OTTL routing transform so data is routed
    // to the user-specified dataset instead of the package default.
    // -------------------------------------------------------------------------
    it('sets data_stream.dataset in routing transforms when the user provides a custom dataset var', async () => {
      const agentPolicyId = await createAgentPolicy();

      try {
        await supertest
          .post('/api/fleet/package_policies')
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: `otlp-custom-dataset-${uuidv4()}`,
            namespace: 'default',
            policy_id: agentPolicyId,
            package: { name: DYNAMIC_PKG, version: DYNAMIC_PKG_VERSION },
            inputs: {
              'otlpreceiver-otelcol': {
                enabled: true,
                streams: {
                  'test_otel_dynamic.otlpreceiver': {
                    enabled: true,
                    vars: { 'data_stream.dataset': 'custom.dataset' },
                  },
                },
              },
            },
          })
          .expect(200);

        const fullPolicy = await getFullAgentPolicy(agentPolicyId);
        const routingProcessors = getRoutingProcessors(fullPolicy.processors);

        expect(routingProcessors.length).to.be.greaterThan(0);

        for (const [, processor] of routingProcessors) {
          const statements = collectStatements(processor);
          expect(
            statements.some((s) => s === expectedDatasetOttlStatement('custom.dataset'))
          ).to.be(true);
        }
      } finally {
        await deleteAgentPolicy(agentPolicyId);
      }
    });

    // -------------------------------------------------------------------------
    // Test 3: receiver-specific package (no dynamic_signal_types) → dataset IS set
    //
    // Technology-specific OTel packages (e.g. mysql_input_otel) must continue to
    // use policy_template-based routing so data lands in the receiver-named data stream.
    // -------------------------------------------------------------------------
    it('sets data_stream.dataset in routing transforms for receiver-specific packages without dynamic_signal_types', async () => {
      const agentPolicyId = await createAgentPolicy();

      try {
        // Stream key: dataset = test_otel_receiver.mysqld_exporter (policy-template name based)
        await supertest
          .post('/api/fleet/package_policies')
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: `receiver-routing-${uuidv4()}`,
            namespace: 'default',
            policy_id: agentPolicyId,
            package: { name: RECEIVER_PKG, version: RECEIVER_PKG_VERSION },
            inputs: {
              'mysqld_exporter-otelcol': {
                enabled: true,
                streams: {
                  'test_otel_receiver.mysqld_exporter': { enabled: true, vars: {} },
                },
              },
            },
          })
          .expect(200);

        const fullPolicy = await getFullAgentPolicy(agentPolicyId);
        const routingProcessors = getRoutingProcessors(fullPolicy.processors);

        expect(routingProcessors.length).to.be.greaterThan(0);

        for (const [, processor] of routingProcessors) {
          const statements = collectStatements(processor);

          expect(statements.some((s) => s.includes('data_stream.type'))).to.be(true);
          expect(statements.some((s) => s === expectedNamespaceOttlStatement('default'))).to.be(
            true
          );
          // Receiver-specific packages must retain the policy_template-based dataset.
          expect(
            statements.some((s) => s === expectedDatasetOttlStatement('mysqld_exporter'))
          ).to.be(true);
        }
      } finally {
        await deleteAgentPolicy(agentPolicyId);
      }
    });

    // -------------------------------------------------------------------------
    // Test 4: receiver-specific package + explicit data_stream.dataset override
    //
    // Same code path as Test 3, but the user-supplied dataset var must appear in OTTL
    // (mirrors package-spec input OTel override for non-dynamic packages).
    // -------------------------------------------------------------------------
    it('sets overridden data_stream.dataset in routing transforms for receiver-specific OTel packages', async () => {
      const agentPolicyId = await createAgentPolicy();
      const overrideDataset = 'custom.receiver_dataset';

      try {
        await supertest
          .post('/api/fleet/package_policies')
          .set('kbn-xsrf', 'xxxx')
          .send({
            name: `receiver-custom-dataset-${uuidv4()}`,
            namespace: 'default',
            policy_id: agentPolicyId,
            package: { name: RECEIVER_PKG, version: RECEIVER_PKG_VERSION },
            inputs: {
              'mysqld_exporter-otelcol': {
                enabled: true,
                streams: {
                  'test_otel_receiver.mysqld_exporter': {
                    enabled: true,
                    vars: { 'data_stream.dataset': overrideDataset },
                  },
                },
              },
            },
          })
          .expect(200);

        const fullPolicy = await getFullAgentPolicy(agentPolicyId);
        const routingProcessors = getRoutingProcessors(fullPolicy.processors);

        expect(routingProcessors.length).to.be.greaterThan(0);

        for (const [, processor] of routingProcessors) {
          const statements = collectStatements(processor);

          expect(statements.some((s) => s.includes('data_stream.type'))).to.be(true);
          expect(statements.some((s) => s === expectedNamespaceOttlStatement('default'))).to.be(
            true
          );
          expect(statements.some((s) => s === expectedDatasetOttlStatement(overrideDataset))).to.be(
            true
          );
        }
      } finally {
        await deleteAgentPolicy(agentPolicyId);
      }
    });
  });
}
