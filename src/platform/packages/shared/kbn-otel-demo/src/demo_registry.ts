/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type {
  CodeScenario,
  DemoType,
  DemoConfig,
  DemoManifestGenerator,
  FailureScenario,
} from './types';
import {
  otelDemoConfig,
  SERVICE_DEFAULTS as OTEL_SERVICE_DEFAULTS,
} from './demos/otel_demo/config';
import { otelDemoManifests } from './demos/otel_demo/manifests';
import { OTEL_DEMO_SCENARIOS } from './demos/otel_demo/scenarios';
import {
  onlineBoutiqueConfig,
  SERVICE_DEFAULTS as BOUTIQUE_SERVICE_DEFAULTS,
} from './demos/online_boutique/config';
import { onlineBoutiqueManifests } from './demos/online_boutique/manifests';
import { ONLINE_BOUTIQUE_SCENARIOS } from './demos/online_boutique/scenarios';
import {
  bankOfAnthosConfig,
  SERVICE_DEFAULTS as BANK_OF_ANTHOS_SERVICE_DEFAULTS,
} from './demos/bank_of_anthos/config';
import { bankOfAnthosManifests } from './demos/bank_of_anthos/manifests';
import { BANK_OF_ANTHOS_SCENARIOS } from './demos/bank_of_anthos/scenarios';
import {
  quarkusSuperHeroesConfig,
  SERVICE_DEFAULTS as QUARKUS_SUPER_HEROES_SERVICE_DEFAULTS,
} from './demos/quarkus_super_heroes/config';
import { quarkusSuperHeroesManifests } from './demos/quarkus_super_heroes/manifests';
import { QUARKUS_SUPER_HEROES_SCENARIOS } from './demos/quarkus_super_heroes/scenarios';
import {
  awsRetailStoreConfig,
  SERVICE_DEFAULTS as AWS_RETAIL_STORE_SERVICE_DEFAULTS,
} from './demos/aws_retail_store/config';
import { awsRetailStoreManifests } from './demos/aws_retail_store/manifests';
import { AWS_RETAIL_STORE_SCENARIOS } from './demos/aws_retail_store/scenarios';
import {
  rustK8sDemoConfig,
  SERVICE_DEFAULTS as RUST_K8S_DEMO_SERVICE_DEFAULTS,
} from './demos/rust_k8s_demo/config';
import { rustK8sDemoManifests } from './demos/rust_k8s_demo/manifests';
import { RUST_K8S_DEMO_SCENARIOS } from './demos/rust_k8s_demo/scenarios';
import { CODE_SCENARIOS } from './code_scenarios';

/**
 * Registry of all available demo configurations
 */
export const DEMO_CONFIGS: Record<DemoType, DemoConfig> = {
  'otel-demo': otelDemoConfig,
  'online-boutique': onlineBoutiqueConfig,
  'bank-of-anthos': bankOfAnthosConfig,
  'quarkus-super-heroes': quarkusSuperHeroesConfig,
  'aws-retail-store': awsRetailStoreConfig,
  'rust-k8s-demo': rustK8sDemoConfig,
};

/**
 * Registry of demo-specific manifest generators
 */
export const DEMO_MANIFESTS: Record<DemoType, DemoManifestGenerator> = {
  'otel-demo': otelDemoManifests,
  'online-boutique': onlineBoutiqueManifests,
  'bank-of-anthos': bankOfAnthosManifests,
  'quarkus-super-heroes': quarkusSuperHeroesManifests,
  'aws-retail-store': awsRetailStoreManifests,
  'rust-k8s-demo': rustK8sDemoManifests,
};

/**
 * Registry of demo-specific failure scenarios
 */
export const DEMO_SCENARIOS: Record<DemoType, FailureScenario[]> = {
  'otel-demo': OTEL_DEMO_SCENARIOS,
  'online-boutique': ONLINE_BOUTIQUE_SCENARIOS,
  'bank-of-anthos': BANK_OF_ANTHOS_SCENARIOS,
  'quarkus-super-heroes': QUARKUS_SUPER_HEROES_SCENARIOS,
  'aws-retail-store': AWS_RETAIL_STORE_SCENARIOS,
  'rust-k8s-demo': RUST_K8S_DEMO_SCENARIOS,
};

export const DEMO_CODE_SCENARIOS: Partial<Record<DemoType, CodeScenario[]>> = {
  'otel-demo': CODE_SCENARIOS,
};

/**
 * Registry of demo-specific service defaults (for scenario reset)
 */
export const DEMO_SERVICE_DEFAULTS: Record<DemoType, Record<string, Record<string, string>>> = {
  'otel-demo': OTEL_SERVICE_DEFAULTS,
  'online-boutique': BOUTIQUE_SERVICE_DEFAULTS,
  'bank-of-anthos': BANK_OF_ANTHOS_SERVICE_DEFAULTS,
  'quarkus-super-heroes': QUARKUS_SUPER_HEROES_SERVICE_DEFAULTS,
  'aws-retail-store': AWS_RETAIL_STORE_SERVICE_DEFAULTS,
  'rust-k8s-demo': RUST_K8S_DEMO_SERVICE_DEFAULTS,
};

/**
 * Get configuration for a specific demo
 */
export function getDemoConfig(type: DemoType): DemoConfig {
  const config = DEMO_CONFIGS[type];
  if (!config) {
    throw new Error(`Unknown demo type: ${type}`);
  }
  return config;
}

/**
 * Get manifest generator for a specific demo
 */
export function getDemoManifests(type: DemoType): DemoManifestGenerator {
  const manifests = DEMO_MANIFESTS[type];
  if (!manifests) {
    throw new Error(`Unknown demo type: ${type}`);
  }
  return manifests;
}

/**
 * Get failure scenarios for a specific demo
 */
export function getDemoScenarios(type: DemoType): FailureScenario[] {
  return DEMO_SCENARIOS[type] || [];
}

/**
 * Get service defaults for a specific demo
 */
export function getDemoServiceDefaults(type: DemoType): Record<string, Record<string, string>> {
  return DEMO_SERVICE_DEFAULTS[type] || {};
}

/**
 * Get a scenario by ID for a specific demo
 */
export function getScenarioById(type: DemoType, id: string): FailureScenario | undefined {
  const scenarios = getDemoScenarios(type);
  return scenarios.find((s) => s.id === id);
}

export function getDemoCodeScenarios(type: DemoType): CodeScenario[] {
  return DEMO_CODE_SCENARIOS[type] || [];
}

export function getCodeScenarioById(type: DemoType, id: string): CodeScenario | undefined {
  const scenarios = getDemoCodeScenarios(type);
  return scenarios.find((scenario) => scenario.id === id);
}

/**
 * Get all scenarios in a category for a specific demo
 */
export function getScenariosByCategory(
  type: DemoType,
  category: 'dramatic' | 'subtle'
): FailureScenario[] {
  const scenarios = getDemoScenarios(type);
  return scenarios.filter((s) => s.category === category);
}

/**
 * List all available demo types
 */
export function listAvailableDemos(): DemoType[] {
  return Object.keys(DEMO_CONFIGS) as DemoType[];
}

/**
 * List demos that are ready to use (don't require custom images)
 */
export function listReadyDemos(): DemoType[] {
  return (Object.keys(DEMO_CONFIGS) as DemoType[]).filter(
    (type) => !DEMO_CONFIGS[type].requiresCustomImages
  );
}

/**
 * Check if a demo requires custom-built images
 */
export function requiresCustomImages(type: DemoType): boolean {
  return DEMO_CONFIGS[type]?.requiresCustomImages ?? false;
}

/**
 * List all scenario IDs for a specific demo
 */
export function listScenarioIds(type: DemoType): string[] {
  const scenarios = getDemoScenarios(type);
  return scenarios.map((s) => s.id);
}
