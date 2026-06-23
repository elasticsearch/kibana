/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import expect from 'expect';
import { OTEL_KUBE_STACK_VERSION, OTEL_STACK_NAMESPACE } from './constants';
import { buildInstallStackCommand } from './build_install_stack_command';
import { buildValuesFileUrl } from './build_values_file_url';

const TEST_ONBOARDING_ID = 'test-onboarding-id';

const defaultArgs = {
  isMetricsOnboardingEnabled: true,
  isManagedOtlpServiceAvailable: false,
  managedOtlpEndpointUrl: 'https://example.com/otlp',
  elasticsearchUrl: 'https://example.com/elasticsearch',
  apiKeyEncoded: 'encoded_api_key',
  agentVersion: '9.4.2',
  onboardingId: TEST_ONBOARDING_ID,
} as const;

describe('buildInstallStackCommand()', () => {
  it('builds command with Elasticsearch endpoint when OTLP service is not available', () => {
    const { elasticsearchUrl, apiKeyEncoded, agentVersion } = defaultArgs;
    const otelKubeStackValuesFileUrl = buildValuesFileUrl({
      isMetricsOnboardingEnabled: true,
      isManagedOtlpServiceAvailable: false,
      agentVersion,
    });
    const command = buildInstallStackCommand(defaultArgs);

    expect(command).toEqual(`kubectl create namespace ${OTEL_STACK_NAMESPACE}
kubectl create secret generic elastic-secret-otel \\
  --namespace ${OTEL_STACK_NAMESPACE} \\
  --from-literal=elastic_endpoint='${elasticsearchUrl}' \\
  --from-literal=elastic_api_key='${apiKeyEncoded}'
helm upgrade --install opentelemetry-kube-stack open-telemetry/opentelemetry-kube-stack \\
  --namespace ${OTEL_STACK_NAMESPACE} \\
  --values '${otelKubeStackValuesFileUrl}' \\
  --version '${OTEL_KUBE_STACK_VERSION}' \\
  --set 'collectors.daemon.config.processors.resource\\/onboarding_id.attributes[0].action=upsert' \\
  --set 'collectors.daemon.config.processors.resource\\/onboarding_id.attributes[0].key=onboarding.id' \\
  --set 'collectors.daemon.config.processors.resource\\/onboarding_id.attributes[0].value=${TEST_ONBOARDING_ID}' \\
  --set 'collectors.daemon.config.service.pipelines.logs\\/node.processors[9]=resource/onboarding_id' \\
  --set 'collectors.daemon.config.service.pipelines.metrics\\/node\\/otel.processors[9]=resource/onboarding_id'`);
  });

  it('builds managed OTLP command with onboarding_id at processor index 9', () => {
    const { managedOtlpEndpointUrl, apiKeyEncoded } = defaultArgs;
    const { agentVersion } = defaultArgs;
    const otelKubeStackValuesFileUrl = buildValuesFileUrl({
      isMetricsOnboardingEnabled: true,
      isManagedOtlpServiceAvailable: true,
      agentVersion,
    });
    const command = buildInstallStackCommand({
      ...defaultArgs,
      agentVersion,
      isManagedOtlpServiceAvailable: true,
    });

    expect(command).toEqual(`kubectl create namespace ${OTEL_STACK_NAMESPACE}
kubectl create secret generic elastic-secret-otel \\
  --namespace ${OTEL_STACK_NAMESPACE} \\
  --from-literal=elastic_otlp_endpoint='${managedOtlpEndpointUrl}' \\
  --from-literal=elastic_api_key='${apiKeyEncoded}'
helm upgrade --install opentelemetry-kube-stack open-telemetry/opentelemetry-kube-stack \\
  --namespace ${OTEL_STACK_NAMESPACE} \\
  --values '${otelKubeStackValuesFileUrl}' \\
  --version '${OTEL_KUBE_STACK_VERSION}' \\
  --set 'collectors.daemon.config.processors.resource\\/onboarding_id.attributes[0].action=upsert' \\
  --set 'collectors.daemon.config.processors.resource\\/onboarding_id.attributes[0].key=onboarding.id' \\
  --set 'collectors.daemon.config.processors.resource\\/onboarding_id.attributes[0].value=${TEST_ONBOARDING_ID}' \\
  --set 'collectors.daemon.config.service.pipelines.logs\\/node.processors[9]=resource/onboarding_id' \\
  --set 'collectors.daemon.config.service.pipelines.metrics\\/node\\/otel.processors[9]=resource/onboarding_id'`);
  });

  it('builds managed OTLP logs-only command with onboarding_id at processor index 9', () => {
    const command = buildInstallStackCommand({
      ...defaultArgs,
      isManagedOtlpServiceAvailable: true,
      isMetricsOnboardingEnabled: false,
    });

    expect(command).toContain(
      'collectors.daemon.config.service.pipelines.logs\\/node.processors[9]=resource/onboarding_id'
    );
    expect(command).not.toContain('logs\\/node.processors[8]=resource/onboarding_id');
    expect(command).not.toContain('metrics\\/node\\/otel');
  });

  describe('onboarding_id processor', () => {
    it('injects resource/onboarding_id into direct logs-only pipeline', () => {
      const command = buildInstallStackCommand({
        ...defaultArgs,
        isMetricsOnboardingEnabled: false,
      });

      expect(command).toContain('resource\\/onboarding_id');
      expect(command).toContain(`onboarding_id.attributes[0].value=${TEST_ONBOARDING_ID}`);
      expect(command).toContain(
        'collectors.daemon.config.service.pipelines.logs\\/node.processors[9]=resource/onboarding_id'
      );
    });

    it('injects resource/onboarding_id into metrics pipeline when metrics enabled', () => {
      const command = buildInstallStackCommand(defaultArgs);

      expect(command).toContain(
        'collectors.daemon.config.service.pipelines.metrics\\/node\\/otel.processors[9]=resource/onboarding_id'
      );
    });

    it('uses the current daemon processor index regardless of agentVersion', () => {
      const command = buildInstallStackCommand({
        ...defaultArgs,
        agentVersion: '9.4.1',
      });

      expect(command).toContain('logs\\/node.processors[9]=resource/onboarding_id');
      expect(command).not.toContain('logs\\/node.processors[8]=resource/onboarding_id');
    });

    it('does not inject resource/onboarding_id into metrics pipeline when metrics disabled', () => {
      const command = buildInstallStackCommand({
        ...defaultArgs,
        isMetricsOnboardingEnabled: false,
      });

      expect(command).not.toContain('metrics\\/node\\/otel');
    });
  });

  describe('wired streams', () => {
    it('does not include wired streams config when useWiredStreams is false', () => {
      const command = buildInstallStackCommand({
        ...defaultArgs,
        useWiredStreams: false,
      });

      expect(command).not.toContain('resource\\/wired_streams');
      expect(command).not.toContain('elasticsearch.index');
    });

    it('routes daemon logs to wired streams when useWiredStreams is true', () => {
      const command = buildInstallStackCommand({
        ...defaultArgs,
        useWiredStreams: true,
      });

      expect(command).toContain('collectors.daemon.config.processors.resource\\/wired_streams');
      expect(command).toContain('elasticsearch.index');
      expect(command).toContain(
        'collectors.daemon.config.service.pipelines.logs\\/node.processors[10]=resource/wired_streams'
      );
    });

    it('routes daemon logs to wired streams when useWiredStreams is true (managed OTLP)', () => {
      const command = buildInstallStackCommand({
        ...defaultArgs,
        isManagedOtlpServiceAvailable: true,
        useWiredStreams: true,
      });

      expect(command).toContain('collectors.daemon.config.processors.resource\\/wired_streams');
      expect(command).toContain('elasticsearch.index');
      expect(command).toContain(
        'collectors.daemon.config.service.pipelines.logs\\/node.processors[9]=resource/onboarding_id'
      );
      expect(command).toContain(
        'collectors.daemon.config.service.pipelines.logs\\/node.processors[10]=resource/wired_streams'
      );
      expect(command).not.toContain('logs\\/node.processors[8]=resource/onboarding_id');
      expect(command).not.toContain('logs\\/node.processors[8]=resource/wired_streams');
      expect(command).not.toContain('logs\\/apm');
    });

    it('excludes APM logs from wired streams regardless of metrics onboarding setting', () => {
      const withMetrics = buildInstallStackCommand({
        ...defaultArgs,
        isMetricsOnboardingEnabled: true,
        isManagedOtlpServiceAvailable: true,
        useWiredStreams: true,
      });

      const withoutMetrics = buildInstallStackCommand({
        ...defaultArgs,
        isMetricsOnboardingEnabled: false,
        isManagedOtlpServiceAvailable: true,
        useWiredStreams: true,
      });

      expect(withMetrics).not.toContain('logs\\/apm');
      expect(withoutMetrics).not.toContain('logs\\/apm');
    });

    it('does not modify gateway config when useWiredStreams is true', () => {
      const command = buildInstallStackCommand({
        ...defaultArgs,
        useWiredStreams: true,
      });

      expect(command).not.toContain('collectors.gateway.config');
      expect(command).not.toContain('logs_index=logs');
    });

    it('assigns custom log processors after the base daemon processors', () => {
      const command = buildInstallStackCommand({
        ...defaultArgs,
        isManagedOtlpServiceAvailable: true,
        useWiredStreams: true,
      });

      expect(command).not.toContain('logs\\/node.processors[8]=resource/onboarding_id');
      expect(command).not.toContain('logs\\/node.processors[8]=resource/wired_streams');
      expect(command).toContain('logs\\/node.processors[9]=resource/onboarding_id');
      expect(command).toContain('logs\\/node.processors[10]=resource/wired_streams');

      const onboardingIdPipelineIndex = command.indexOf(
        'logs\\/node.processors[9]=resource/onboarding_id'
      );
      const wiredStreamsPipelineIndex = command.indexOf(
        'logs\\/node.processors[10]=resource/wired_streams'
      );
      expect(onboardingIdPipelineIndex).toBeGreaterThan(-1);
      expect(wiredStreamsPipelineIndex).toBeGreaterThan(-1);
      expect(onboardingIdPipelineIndex).toBeLessThan(wiredStreamsPipelineIndex);
    });
  });
});
