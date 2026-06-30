/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { stringify } from 'yaml';
import type { DemoManifestGenerator, ManifestOptions } from '../../types';

import { HTTP_OTLP_SERVICES, getFlagdConfig } from './config';

/**
 * Creates common Kubernetes resources needed by all demos
 */
function createCommonManifests(options: ManifestOptions): object[] {
  const manifests: object[] = [];
  const namespace = options.config.namespace;

  // Namespace
  manifests.push({
    apiVersion: 'v1',
    kind: 'Namespace',
    metadata: {
      name: namespace,
      labels: {
        'app.kubernetes.io/name': options.config.id,
      },
    },
  });

  // OTel Collector ConfigMap
  manifests.push({
    apiVersion: 'v1',
    kind: 'ConfigMap',
    metadata: {
      name: 'otel-collector-config',
      namespace,
    },
    data: {
      'otel-collector-config.yaml': options.collectorConfigYaml,
    },
  });

  // OTel Collector ServiceAccount (needed for k8sattributes)
  manifests.push({
    apiVersion: 'v1',
    kind: 'ServiceAccount',
    metadata: {
      name: 'otel-collector',
      namespace,
    },
  });

  // ClusterRole for k8sattributes, k8s_cluster, kubeletstats, and k8s_events receivers
  manifests.push({
    apiVersion: 'rbac.authorization.k8s.io/v1',
    kind: 'ClusterRole',
    metadata: {
      name: `otel-collector-${namespace}`,
    },
    rules: [
      {
        apiGroups: [''],
        resources: [
          'pods',
          'namespaces',
          'nodes',
          'nodes/stats',
          'nodes/proxy',
          'services',
          'events',
          'replicationcontrollers',
          'resourcequotas',
        ],
        verbs: ['get', 'watch', 'list'],
      },
      {
        apiGroups: ['apps'],
        resources: ['replicasets', 'deployments', 'daemonsets', 'statefulsets'],
        verbs: ['get', 'watch', 'list'],
      },
      {
        apiGroups: ['batch'],
        resources: ['jobs', 'cronjobs'],
        verbs: ['get', 'watch', 'list'],
      },
      {
        apiGroups: ['autoscaling'],
        resources: ['horizontalpodautoscalers'],
        verbs: ['get', 'watch', 'list'],
      },
      {
        apiGroups: ['events.k8s.io'],
        resources: ['events'],
        verbs: ['get', 'watch', 'list'],
      },
    ],
  });

  // ClusterRoleBinding
  manifests.push({
    apiVersion: 'rbac.authorization.k8s.io/v1',
    kind: 'ClusterRoleBinding',
    metadata: {
      name: `otel-collector-${namespace}`,
    },
    subjects: [
      {
        kind: 'ServiceAccount',
        name: 'otel-collector',
        namespace,
      },
    ],
    roleRef: {
      kind: 'ClusterRole',
      name: `otel-collector-${namespace}`,
      apiGroup: 'rbac.authorization.k8s.io',
    },
  });

  // OTel Collector Deployment
  manifests.push({
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: 'otel-collector',
      namespace,
      labels: {
        app: 'otel-collector',
      },
    },
    spec: {
      replicas: 1,
      selector: {
        matchLabels: {
          app: 'otel-collector',
        },
      },
      template: {
        metadata: {
          labels: {
            app: 'otel-collector',
          },
        },
        spec: {
          serviceAccountName: 'otel-collector',
          ...(options.hostAliases ? { hostAliases: options.hostAliases } : {}),
          containers: [
            {
              name: 'otel-collector',
              image: options.collectorImage || 'otel/opentelemetry-collector-contrib:0.115.1',
              args: ['--config=/etc/otel-collector-config.yaml'],
              ports: [
                { containerPort: 4317, name: 'otlp-grpc' },
                { containerPort: 4318, name: 'otlp-http' },
                { containerPort: 13133, name: 'health' },
              ],
              securityContext: {
                runAsUser: 0,
                runAsGroup: 0,
                privileged: true,
                readOnlyRootFilesystem: false,
              },
              env: [
                {
                  name: 'K8S_NODE_NAME',
                  valueFrom: { fieldRef: { fieldPath: 'spec.nodeName' } },
                },
                {
                  name: 'OTEL_K8S_NODE_NAME',
                  valueFrom: { fieldRef: { fieldPath: 'spec.nodeName' } },
                },
                {
                  name: 'K8S_POD_NAME',
                  valueFrom: { fieldRef: { fieldPath: 'metadata.name' } },
                },
                {
                  name: 'K8S_POD_NAMESPACE',
                  valueFrom: { fieldRef: { fieldPath: 'metadata.namespace' } },
                },
                {
                  name: 'K8S_POD_IP',
                  valueFrom: { fieldRef: { fieldPath: 'status.podIP' } },
                },
              ],
              volumeMounts: [
                {
                  name: 'config',
                  mountPath: '/etc/otel-collector-config.yaml',
                  subPath: 'otel-collector-config.yaml',
                },
                { name: 'varlogpods', mountPath: '/var/log/pods', readOnly: true },
                { name: 'varlogcontainers', mountPath: '/var/log/containers', readOnly: true },
                {
                  name: 'varlibdockercontainers',
                  mountPath: '/var/lib/docker/containers',
                  readOnly: true,
                },
                {
                  name: 'hostfs',
                  mountPath: '/hostfs',
                  readOnly: true,
                  mountPropagation: 'HostToContainer',
                },
              ],
              livenessProbe: {
                httpGet: { path: '/', port: 13133 },
                initialDelaySeconds: 10,
              },
              readinessProbe: {
                httpGet: { path: '/', port: 13133 },
                initialDelaySeconds: 5,
              },
            },
          ],
          volumes: [
            {
              name: 'config',
              configMap: {
                name: 'otel-collector-config',
              },
            },
            {
              name: 'varlogpods',
              hostPath: {
                path: '/var/log/pods',
              },
            },
            {
              name: 'varlogcontainers',
              hostPath: {
                path: '/var/log/containers',
              },
            },
            {
              name: 'varlibdockercontainers',
              hostPath: {
                path: '/var/lib/docker/containers',
              },
            },
            {
              name: 'hostfs',
              hostPath: {
                path: '/',
              },
            },
          ],
        },
      },
    },
  });

  // OTel Collector Service
  manifests.push({
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name: 'otel-collector',
      namespace,
    },
    spec: {
      selector: {
        app: 'otel-collector',
      },
      ports: [
        { port: 4317, targetPort: 4317, name: 'otlp-grpc' },
        { port: 4318, targetPort: 4318, name: 'otlp-http' },
      ],
    },
  });

  return manifests;
}

/**
 * Creates a Kubernetes Deployment
 */
function createDeployment(opts: {
  name: string;
  namespace: string;
  demoId: string;
  image: string;
  imagePullPolicy?: string;
  resources?: {
    requests?: { memory?: string; cpu?: string };
    limits?: { memory?: string; cpu?: string };
  };
  ports?: number[];
  env?: Record<string, string>;
  args?: string[];
  volumeMounts?: Array<{ name: string; mountPath: string }>;
  volumes?: Array<{ name: string; configMap?: { name: string } }>;
}): object {
  const envList = opts.env
    ? Object.entries(opts.env).map(([name, value]) => ({ name, value }))
    : [];

  return {
    apiVersion: 'apps/v1',
    kind: 'Deployment',
    metadata: {
      name: opts.name,
      namespace: opts.namespace,
      labels: {
        app: opts.name,
        'app.kubernetes.io/name': opts.name,
        'app.kubernetes.io/part-of': opts.demoId,
      },
    },
    spec: {
      replicas: 1,
      selector: {
        matchLabels: {
          app: opts.name,
        },
      },
      template: {
        metadata: {
          labels: {
            app: opts.name,
            'app.kubernetes.io/name': opts.name,
            'app.kubernetes.io/part-of': opts.demoId,
          },
        },
        spec: {
          containers: [
            {
              name: opts.name,
              image: opts.image,
              ...(opts.imagePullPolicy && { imagePullPolicy: opts.imagePullPolicy }),
              ...(opts.resources && { resources: opts.resources }),
              ...(opts.args && { args: opts.args }),
              ...(opts.ports && { ports: opts.ports.map((p) => ({ containerPort: p })) }),
              ...(envList.length > 0 && { env: envList }),
              ...(opts.volumeMounts && { volumeMounts: opts.volumeMounts }),
            },
          ],
          ...(opts.volumes && { volumes: opts.volumes }),
        },
      },
    },
  };
}

/**
 * Creates a Kubernetes Service
 */
function createService(name: string, namespace: string, ports: number[]): object {
  return {
    apiVersion: 'v1',
    kind: 'Service',
    metadata: {
      name,
      namespace,
    },
    spec: {
      selector: {
        app: name,
      },
      ports: ports.map((p) => ({ port: p, targetPort: p })),
    },
  };
}

/**
 * Manifest generator for OpenTelemetry Demo
 */
export const otelDemoManifests: DemoManifestGenerator = {
  generate(options: ManifestOptions): string {
    const manifests: object[] = [];
    const namespace = options.config.namespace;
    const demoId = options.config.id;
    const envOverrides = options.envOverrides || {};
    const imageOverrides = options.imageOverrides || {};
    const resourceOverrides = options.resourceOverrides || {};

    // Add common manifests (namespace, collector, etc.)
    manifests.push(...createCommonManifests(options));

    // Flagd ConfigMap
    manifests.push({
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name: 'flagd-config',
        namespace,
      },
      data: {
        'demo.flagd.json': JSON.stringify(getFlagdConfig(), null, 2),
      },
    });

    // Get all services for this demo
    const services = options.config.getServices(options.version);

    // Deploy each service
    for (const svc of services) {
      // Special handling for flagd (needs config volume)
      if (svc.name === 'flagd') {
        manifests.push(
          createDeployment({
            name: svc.name,
            namespace,
            demoId,
            image: svc.image,
            ports: svc.port ? [svc.port] : [],
            args: ['start', '--uri', 'file:/etc/flagd/demo.flagd.json', '--port', '8013'],
            volumeMounts: [{ name: 'config', mountPath: '/etc/flagd' }],
            volumes: [{ name: 'config', configMap: { name: 'flagd-config' } }],
          })
        );
        manifests.push(createService(svc.name, namespace, svc.port ? [svc.port] : []));
        continue;
      }

      // For demo services (not valkey, flagd), add OTLP configuration
      const isInfraService = ['valkey', 'redis-cart'].includes(svc.name);

      let finalEnv = { ...svc.env };

      if (!isInfraService) {
        // Use HTTP port (4318) for services that don't support gRPC, gRPC port (4317) for others
        const otlpPort = HTTP_OTLP_SERVICES.has(svc.name) ? '4318' : '4317';

        finalEnv = {
          ...finalEnv,
          OTEL_EXPORTER_OTLP_ENDPOINT: `http://otel-collector:${otlpPort}`,
          OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE: 'cumulative',
          OTEL_RESOURCE_ATTRIBUTES: `service.namespace=${demoId},deployment.environment.name=${demoId}`,
          OTEL_SERVICE_NAME: svc.name,
        };
      }

      // Apply scenario overrides (take precedence)
      const serviceEnvOverrides = envOverrides[svc.name] || {};
      finalEnv = { ...finalEnv, ...serviceEnvOverrides };

      const imageOverride = imageOverrides[svc.name];

      manifests.push(
        createDeployment({
          name: svc.name,
          namespace,
          demoId,
          image: imageOverride || svc.image,
          ...(imageOverride ? { imagePullPolicy: 'Never' } : {}),
          resources: resourceOverrides[svc.name] || svc.resources,
          ports: svc.port ? [svc.port] : [],
          env: finalEnv,
        })
      );

      if (svc.port) {
        manifests.push(createService(svc.name, namespace, [svc.port]));
      }
    }

    // Frontend NodePort for external access
    if (options.config.frontendService) {
      manifests.push({
        apiVersion: 'v1',
        kind: 'Service',
        metadata: {
          name: `${options.config.frontendService.name}-external`,
          namespace,
        },
        spec: {
          type: 'NodePort',
          selector: {
            app: options.config.frontendService.name,
          },
          ports: [
            {
              port: 8080,
              targetPort: 8080,
              nodePort: options.config.frontendService.nodePort,
            },
          ],
        },
      });
    }

    return manifests.map((m) => stringify(m)).join('---\n');
  },
};
