/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { buildHelmCommand } from './build_helm_command';

describe('buildHelmCommand', () => {
  const baseParams = {
    encodedApiKey: 'dGVzdC1hcGkta2V5',
    onboardingId: 'test-onboarding-id',
    elasticsearchUrl: 'https://elasticsearch.example.com:9200',
    metricsEnabled: true,
    elasticAgentVersionInfo: {
      agentBaseVersion: '9.1.0',
      agentVersion: '9.1.0',
      agentDockerImageVersion: '9.1.0',
    },
  };

  it('generates basic helm command without wired streams', () => {
    const command = buildHelmCommand(baseParams);

    expect(command).toContain('helm repo add elastic https://helm.elastic.co/');
    expect(command).toContain('helm repo update elastic');
    expect(command).toContain('helm install elastic-agent elastic/elastic-agent');
    expect(command).toContain('--version 9.1.0');
    expect(command).toContain(
      '--set outputs.default.url=https:\\/\\/elasticsearch.example.com:9200'
    );
    expect(command).toContain('--set kubernetes.onboardingID=test-onboarding-id');
    expect(command).toContain('--set kubernetes.enabled=true');
    expect(command).toContain('--set outputs.default.type=ESPlainAuthAPI');
    expect(command).not.toContain('_write_to_logs_streams');
  });

  it('formats the command as the existing copyable one-line command', () => {
    const command = buildHelmCommand(baseParams);

    expect(command).not.toContain('\n');
    expect(command).toContain('helm repo add elastic https://helm.elastic.co/ &&');
    expect(command).toContain('helm repo update elastic &&');
  });

  it('does not include wired streams config when useWiredStreams is false', () => {
    const command = buildHelmCommand({
      ...baseParams,
      useWiredStreams: false,
    });

    expect(command).not.toContain('_write_to_logs_streams');
  });

  it('does not include wired streams config when useWiredStreams is undefined', () => {
    const command = buildHelmCommand({
      ...baseParams,
      useWiredStreams: undefined,
    });

    expect(command).not.toContain('_write_to_logs_streams');
  });

  it('includes wired streams config when useWiredStreams is true', () => {
    const command = buildHelmCommand({
      ...baseParams,
      useWiredStreams: true,
    });

    expect(command).toContain("--set 'outputs.default._write_to_logs_streams=true'");
  });

  it('disables metrics when metricsEnabled is false', () => {
    const command = buildHelmCommand({
      ...baseParams,
      metricsEnabled: false,
    });

    expect(command).toContain('--set kubernetes.state.enabled=false');
    expect(command).toContain('--set kubernetes.metrics.enabled=false');
    expect(command).toContain('--set kubernetes.apiserver.enabled=false');
  });

  it('combines wired streams and disabled metrics correctly', () => {
    const command = buildHelmCommand({
      ...baseParams,
      metricsEnabled: false,
      useWiredStreams: true,
    });

    expect(command).toContain('--set kubernetes.state.enabled=false');
    expect(command).toContain('--set kubernetes.metrics.enabled=false');
    expect(command).toContain('--set kubernetes.apiserver.enabled=false');
    expect(command).toContain("--set 'outputs.default._write_to_logs_streams=true'");
  });

  it('escapes forward slashes in elasticsearch URL', () => {
    const command = buildHelmCommand({
      ...baseParams,
      elasticsearchUrl: 'https://my-cluster.elasticsearch.com:9200/path',
    });

    expect(command).toContain(
      '--set outputs.default.url=https:\\/\\/my-cluster.elasticsearch.com:9200\\/path'
    );
  });
});
