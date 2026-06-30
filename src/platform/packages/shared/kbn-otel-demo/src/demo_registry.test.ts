/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { DemoType, FailureScenario, DemoConfig } from './types';
import {
  DEMO_CONFIGS,
  DEMO_MANIFESTS,
  DEMO_SCENARIOS,
  DEMO_CODE_SCENARIOS,
  DEMO_SERVICE_DEFAULTS,
  getDemoConfig,
  getDemoManifests,
  getDemoScenarios,
  getDemoCodeScenarios,
  getDemoServiceDefaults,
  getScenarioById,
  getCodeScenarioById,
  getScenariosByCategory,
  listAvailableDemos,
  listScenarioIds,
} from './demo_registry';

describe('demo_registry', () => {
  const ALL_DEMO_TYPES: DemoType[] = [
    'otel-demo',
    'online-boutique',
    'bank-of-anthos',
    'quarkus-super-heroes',
    'aws-retail-store',
    'rust-k8s-demo',
  ];

  describe('registry completeness', () => {
    it('should have configs for all demo types', () => {
      for (const demoType of ALL_DEMO_TYPES) {
        expect(DEMO_CONFIGS[demoType]).toBeDefined();
      }
    });

    it('should have manifests for all demo types', () => {
      for (const demoType of ALL_DEMO_TYPES) {
        expect(DEMO_MANIFESTS[demoType]).toBeDefined();
        expect(typeof DEMO_MANIFESTS[demoType].generate).toBe('function');
      }
    });

    it('should have scenarios for all demo types', () => {
      for (const demoType of ALL_DEMO_TYPES) {
        expect(Array.isArray(DEMO_SCENARIOS[demoType])).toBe(true);
      }
    });

    it('should have service defaults for all demo types', () => {
      for (const demoType of ALL_DEMO_TYPES) {
        expect(typeof DEMO_SERVICE_DEFAULTS[demoType]).toBe('object');
      }
    });

    it('should register code scenarios only for demos that support them', () => {
      expect(DEMO_CODE_SCENARIOS['otel-demo']).toBeDefined();
      expect(getDemoCodeScenarios('otel-demo')).toHaveLength(5);
      expect(getDemoCodeScenarios('bank-of-anthos')).toEqual([]);
    });
  });

  describe('listAvailableDemos', () => {
    it('should return all demo types', () => {
      const demos = listAvailableDemos();
      expect(demos).toHaveLength(ALL_DEMO_TYPES.length);
      for (const demoType of ALL_DEMO_TYPES) {
        expect(demos).toContain(demoType);
      }
    });
  });

  describe('getDemoConfig', () => {
    it('should return config for valid demo type', () => {
      const config = getDemoConfig('bank-of-anthos');
      expect(config.id).toBe('bank-of-anthos');
      expect(config.displayName).toBe('Bank of Anthos');
    });

    it('should throw for unknown demo type', () => {
      expect(() => getDemoConfig('unknown-demo' as DemoType)).toThrow('Unknown demo type');
    });
  });

  describe('getDemoManifests', () => {
    it('should return manifest generator for valid demo type', () => {
      const manifests = getDemoManifests('quarkus-super-heroes');
      expect(manifests).toBeDefined();
      expect(typeof manifests.generate).toBe('function');
    });

    it('should throw for unknown demo type', () => {
      expect(() => getDemoManifests('unknown-demo' as DemoType)).toThrow('Unknown demo type');
    });
  });

  describe('getDemoScenarios', () => {
    it('should return scenarios array for valid demo type', () => {
      const scenarios = getDemoScenarios('aws-retail-store');
      expect(Array.isArray(scenarios)).toBe(true);
      expect(scenarios.length).toBeGreaterThan(0);
    });

    it('should return empty array for unknown demo type', () => {
      const scenarios = getDemoScenarios('unknown-demo' as DemoType);
      expect(scenarios).toEqual([]);
    });
  });

  describe('getDemoServiceDefaults', () => {
    it('should return service defaults for valid demo type', () => {
      const defaults = getDemoServiceDefaults('rust-k8s-demo');
      expect(typeof defaults).toBe('object');
    });

    it('should return empty object for unknown demo type', () => {
      const defaults = getDemoServiceDefaults('unknown-demo' as DemoType);
      expect(defaults).toEqual({});
    });
  });

  describe('getScenarioById', () => {
    it('should find scenario by id', () => {
      const scenario = getScenarioById('bank-of-anthos', 'ledger-db-disconnect');
      expect(scenario).toBeDefined();
      expect(scenario?.name).toBe('Ledger Database Disconnect');
    });

    it('should return undefined for non-existent scenario', () => {
      const scenario = getScenarioById('bank-of-anthos', 'non-existent-scenario');
      expect(scenario).toBeUndefined();
    });
  });

  describe('getCodeScenarioById', () => {
    it('should find an OTel code scenario by id', () => {
      const scenario = getCodeScenarioById('otel-demo', 'shipping-timeout-regression');
      expect(scenario).toBeDefined();
      expect(scenario?.affectedServices).toEqual(['shipping']);
    });

    it('should return undefined for demos without code scenarios', () => {
      const scenario = getCodeScenarioById('bank-of-anthos', 'shipping-timeout-regression');
      expect(scenario).toBeUndefined();
    });
  });

  describe('getScenariosByCategory', () => {
    it('should filter scenarios by dramatic category', () => {
      const scenarios = getScenariosByCategory('bank-of-anthos', 'dramatic');
      expect(scenarios.length).toBeGreaterThan(0);
      for (const scenario of scenarios) {
        expect(scenario.category).toBe('dramatic');
      }
    });

    it('should filter scenarios by subtle category', () => {
      const scenarios = getScenariosByCategory('bank-of-anthos', 'subtle');
      expect(scenarios.length).toBeGreaterThan(0);
      for (const scenario of scenarios) {
        expect(scenario.category).toBe('subtle');
      }
    });
  });

  describe('listScenarioIds', () => {
    it('should return all scenario ids for a demo', () => {
      const ids = listScenarioIds('rust-k8s-demo');
      expect(Array.isArray(ids)).toBe(true);
      expect(ids.length).toBeGreaterThan(0);
    });
  });

  describe('DemoConfig validation', () => {
    describe.each(ALL_DEMO_TYPES)('%s config', (demoType) => {
      let config: DemoConfig;

      beforeEach(() => {
        config = DEMO_CONFIGS[demoType];
      });

      it('should have required fields', () => {
        expect(config.id).toBe(demoType);
        expect(typeof config.displayName).toBe('string');
        expect(config.displayName.length).toBeGreaterThan(0);
        expect(typeof config.namespace).toBe('string');
        expect(config.namespace.length).toBeGreaterThan(0);
        expect(typeof config.description).toBe('string');
        expect(typeof config.defaultVersion).toBe('string');
        expect(Array.isArray(config.availableVersions)).toBe(true);
        expect(config.availableVersions.length).toBeGreaterThan(0);
        expect(typeof config.getServices).toBe('function');
      });

      it('should have default version in available versions', () => {
        expect(config.availableVersions).toContain(config.defaultVersion);
      });

      it('should return valid services from getServices', () => {
        const services = config.getServices();
        expect(Array.isArray(services)).toBe(true);
        expect(services.length).toBeGreaterThan(0);

        for (const service of services) {
          expect(typeof service.name).toBe('string');
          expect(service.name.length).toBeGreaterThan(0);
          expect(typeof service.image).toBe('string');
          expect(service.image.length).toBeGreaterThan(0);
        }
      });

      it('should return consistent services across calls', () => {
        const services1 = config.getServices();
        const services2 = config.getServices();
        expect(services1.length).toBe(services2.length);
        expect(services1.map((s) => s.name)).toEqual(services2.map((s) => s.name));
      });

      it('should use version in at least some service images', () => {
        const version = config.defaultVersion;
        const services = config.getServices(version);

        const servicesWithVersion = services.filter((service) => service.image.includes(version));
        expect(servicesWithVersion.length).toBeGreaterThan(0);
      });
    });
  });

  describe('FailureScenario validation', () => {
    describe.each(ALL_DEMO_TYPES)('%s scenarios', (demoType) => {
      let scenarios: FailureScenario[];

      beforeEach(() => {
        scenarios = DEMO_SCENARIOS[demoType];
      });

      it('should have unique scenario ids', () => {
        const ids = scenarios.map((s) => s.id);
        const uniqueIds = new Set(ids);
        expect(uniqueIds.size).toBe(ids.length);
      });

      it('should have valid scenario structure', () => {
        for (const scenario of scenarios) {
          expect(typeof scenario.id).toBe('string');
          expect(scenario.id.length).toBeGreaterThan(0);
          expect(typeof scenario.name).toBe('string');
          expect(scenario.name.length).toBeGreaterThan(0);
          expect(typeof scenario.description).toBe('string');
          expect(['dramatic', 'subtle']).toContain(scenario.category);
          expect(Array.isArray(scenario.steps)).toBe(true);
          expect(Array.isArray(scenario.recovery)).toBe(true);
        }
      });

      it('should have valid step structure', () => {
        for (const scenario of scenarios) {
          for (const step of scenario.steps) {
            expect(step.type).toBe('env');
            expect(typeof step.service).toBe('string');
            expect(typeof step.variable).toBe('string');
            expect(typeof step.value).toBe('string');
            expect(typeof step.description).toBe('string');
          }
        }
      });

      it('should have recovery steps for all steps', () => {
        for (const scenario of scenarios) {
          expect(scenario.recovery.length).toBeGreaterThanOrEqual(scenario.steps.length);
        }
      });
    });
  });

  describe('CodeScenario validation', () => {
    it('should have valid OTel code scenario structure', () => {
      const config = DEMO_CONFIGS['otel-demo'];
      const scenarios = getDemoCodeScenarios('otel-demo');
      const ids = scenarios.map((scenario) => scenario.id);

      expect(new Set(ids).size).toBe(ids.length);
      for (const scenario of scenarios) {
        expect(typeof scenario.id).toBe('string');
        expect(typeof scenario.name).toBe('string');
        expect(typeof scenario.description).toBe('string');
        expect(['dramatic', 'subtle']).toContain(scenario.category);
        expect(scenario.bugPatch.patch).toContain('diff --git');
        expect(scenario.affectedServices.length).toBeGreaterThan(0);
        for (const service of scenario.affectedServices) {
          expect(config.serviceSourcePaths?.[service]).toBeDefined();
        }
      }
    });
  });

  describe('Manifest generation', () => {
    const mockOptions = {
      version: 'v1.0.0',
      elasticsearchEndpoint: 'http://localhost:9200',
      username: 'elastic',
      password: 'changeme',
      logsIndex: 'logs-otel.demo',
      collectorConfigYaml: 'receivers:\n  otlp:\n    protocols:\n      grpc:\n',
    };

    describe('bank-of-anthos JWT key mounting', () => {
      it('should mount jwt-key secret for services needing authentication', () => {
        const config = DEMO_CONFIGS['bank-of-anthos'];
        const manifestGenerator = DEMO_MANIFESTS['bank-of-anthos'];
        const yaml = manifestGenerator.generate({
          ...mockOptions,
          config,
        });

        expect(yaml).toContain('jwt-key');
        expect(yaml).toContain('secretName: jwt-key');
        expect(yaml).toContain('path: privatekey');
        expect(yaml).toContain('path: publickey');
        expect(yaml).toContain('mountPath: /tmp/.ssh');
      });
    });

    describe('otel-demo image overrides', () => {
      it('should use local image overrides with imagePullPolicy Never', () => {
        const config = DEMO_CONFIGS['otel-demo'];
        const manifestGenerator = DEMO_MANIFESTS['otel-demo'];
        const yaml = manifestGenerator.generate({
          ...mockOptions,
          config,
          imageOverrides: {
            shipping: 'otel-demo-scenario/shipping:latest',
          },
        });

        expect(yaml).toContain('image: otel-demo-scenario/shipping:latest');
        expect(yaml).toContain('imagePullPolicy: Never');
      });

      it('should apply resource overrides for code scenario services', () => {
        const config = DEMO_CONFIGS['otel-demo'];
        const manifestGenerator = DEMO_MANIFESTS['otel-demo'];
        const yaml = manifestGenerator.generate({
          ...mockOptions,
          config,
          resourceOverrides: {
            'product-catalog': {
              requests: { memory: '64Mi' },
              limits: { memory: '128Mi' },
            },
          },
        });

        expect(yaml).toContain('resources:');
        expect(yaml).toContain('memory: 64Mi');
        expect(yaml).toContain('memory: 128Mi');
      });
    });

    describe.each(ALL_DEMO_TYPES)('%s manifests', (demoType) => {
      it('should generate valid YAML', () => {
        const config = DEMO_CONFIGS[demoType];
        const manifestGenerator = DEMO_MANIFESTS[demoType];
        const yaml = manifestGenerator.generate({
          ...mockOptions,
          config,
        });

        expect(typeof yaml).toBe('string');
        expect(yaml.length).toBeGreaterThan(0);
        expect(yaml).toContain('apiVersion');
        expect(yaml).toContain('kind');
        expect(yaml).toContain(config.namespace);
      });

      it('should include namespace manifest', () => {
        const config = DEMO_CONFIGS[demoType];
        const manifestGenerator = DEMO_MANIFESTS[demoType];
        const yaml = manifestGenerator.generate({
          ...mockOptions,
          config,
        });

        expect(yaml).toContain('kind: Namespace');
        expect(yaml).toContain(`name: ${config.namespace}`);
      });

      it('should include otel-collector manifest', () => {
        const config = DEMO_CONFIGS[demoType];
        const manifestGenerator = DEMO_MANIFESTS[demoType];
        const yaml = manifestGenerator.generate({
          ...mockOptions,
          config,
        });

        expect(yaml).toContain('otel-collector');
        expect(yaml).toContain('otel-collector-config');
      });

      it('should apply env overrides', () => {
        const config = DEMO_CONFIGS[demoType];
        const manifestGenerator = DEMO_MANIFESTS[demoType];
        const services = config.getServices();

        if (services.length > 0) {
          const testService = services[0].name;
          const yaml = manifestGenerator.generate({
            ...mockOptions,
            config,
            envOverrides: {
              [testService]: {
                TEST_OVERRIDE_VAR: 'test-value-12345',
              },
            },
          });

          expect(yaml).toContain('TEST_OVERRIDE_VAR');
          expect(yaml).toContain('test-value-12345');
        }
      });

      it('should include hostAliases in collector pod when provided', () => {
        const config = DEMO_CONFIGS[demoType];
        const manifestGenerator = DEMO_MANIFESTS[demoType];
        const yaml = manifestGenerator.generate({
          ...mockOptions,
          config,
          hostAliases: [{ ip: '192.168.65.254', hostnames: ['host.minikube.internal'] }],
        });

        expect(yaml).toContain('hostAliases');
        expect(yaml).toContain('192.168.65.254');
        expect(yaml).toContain('host.minikube.internal');
      });

      it('should not include hostAliases when not provided', () => {
        const config = DEMO_CONFIGS[demoType];
        const manifestGenerator = DEMO_MANIFESTS[demoType];
        const yaml = manifestGenerator.generate({
          ...mockOptions,
          config,
        });

        expect(yaml).not.toContain('hostAliases');
      });

      it('should use EDOT collector image by default', () => {
        const config = DEMO_CONFIGS[demoType];
        const manifestGenerator = DEMO_MANIFESTS[demoType];
        const yaml = manifestGenerator.generate({
          ...mockOptions,
          config,
          collectorImage: 'docker.elastic.co/elastic-agent/elastic-otel-collector:9.0.0',
        });

        expect(yaml).toContain('docker.elastic.co/elastic-agent/elastic-otel-collector:9.0.0');
        expect(yaml).not.toContain('otel/opentelemetry-collector-contrib');
      });

      it('should use vanilla collector image when --vanilla is used', () => {
        const config = DEMO_CONFIGS[demoType];
        const manifestGenerator = DEMO_MANIFESTS[demoType];
        const yaml = manifestGenerator.generate({
          ...mockOptions,
          config,
          collectorImage: 'otel/opentelemetry-collector-contrib:0.115.1',
        });

        expect(yaml).toContain('otel/opentelemetry-collector-contrib:0.115.1');
        expect(yaml).not.toContain('docker.elastic.co/elastic-agent/elastic-otel-collector');
      });
    });
  });
});
