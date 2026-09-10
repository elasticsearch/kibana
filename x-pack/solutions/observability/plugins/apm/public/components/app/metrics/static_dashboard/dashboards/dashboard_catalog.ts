/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

// The new dashboard file names should be added here
const dashboardFileNames = [
  'classic_apm-apm-nodejs',
  'classic_apm-edot-nodejs',
  'classic_apm-otel_other-nodejs',
  'otel_native-edot-nodejs',
  'otel_native-otel_other-nodejs',
  'classic_apm-apm-java',
  'classic_apm-otel_other-java',
  'classic_apm-otel_other-dotnet',
  'classic_apm-edot-java',
  'otel_native-edot-java',
  'otel_native-otel_other-java',
  'classic_apm-edot-dotnet',
  'classic_apm-edot-dotnet-lte-v8',
  'otel_native-edot-dotnet',
  'otel_native-otel_other-dotnet',
  'otel_native-edot-dotnet-lte-v8',
  'otel_native-edot-python',
  'otel_native-otel_other-python',
  'classic_apm-otel_other-go',
  'otel_native-otel_other-go',
  'otel_native-edot-php',
  'otel_native-otel_other-php',
] as const;

export type DashboardFileName = (typeof dashboardFileNames)[number];

type VersionOperator = '>=' | '<=' | '>' | '<' | '==';

export interface VersionRule {
  condition: `${VersionOperator}${number}`;
  fileName: DashboardFileName;
}

/**
 * Maps a base key (e.g. 'classic_apm-edot-dotnet') to an ordered list of
 * version rules. Rules are evaluated top-to-bottom; first match wins.
 * When no rule matches (or no version is available), the base key entry
 * from dashboardFileNames is used as fallback.
 */
export const versionedDashboardRules: Record<string, VersionRule[]> = {
  'classic_apm-edot-dotnet': [{ condition: '<=8', fileName: 'classic_apm-edot-dotnet-lte-v8' }],
  'otel_native-edot-dotnet': [{ condition: '<=8', fileName: 'otel_native-edot-dotnet-lte-v8' }],
};

export const parseVersionCondition = (
  condition: string
): { operator: VersionOperator; version: number } | undefined => {
  const match = condition.match(/^(>=|<=|>|<|==)(\d+)$/);

  if (!match) {
    return undefined;
  }

  return { operator: match[1] as VersionOperator, version: Number(match[2]) };
};

export const evaluateVersionCondition = (condition: string, majorVersion: number): boolean => {
  const parsed = parseVersionCondition(condition);

  if (!parsed) {
    return false;
  }

  switch (parsed.operator) {
    case '>=':
      return majorVersion >= parsed.version;
    case '<=':
      return majorVersion <= parsed.version;
    case '>':
      return majorVersion > parsed.version;
    case '<':
      return majorVersion < parsed.version;
    case '==':
      return majorVersion === parsed.version;
  }
};

const existingDashboardFileNames: Set<string> = new Set(dashboardFileNames);

export const resolveDashboard = (
  baseKey: string,
  majorVersion: number | undefined
): DashboardFileName | undefined => {
  if (majorVersion !== undefined) {
    const rules = versionedDashboardRules[baseKey];

    if (rules) {
      for (const rule of rules) {
        if (evaluateVersionCondition(rule.condition, majorVersion)) {
          return rule.fileName;
        }
      }
    }
  }

  if (existingDashboardFileNames.has(baseKey)) {
    return baseKey as DashboardFileName;
  }

  return undefined;
};

// The new dashboard files should be mapped here
// + changed with the new ones (following the naming convention)
// + similar mapping for edot needed
//     - example: otel_native-edot-nodejs
//     - example: classic_apm-edot-dotnet-lte-v8 (with <=8 version rule) for a versioned dashboard
export async function loadDashboardFile(filename: DashboardFileName) {
  switch (filename) {
    case 'classic_apm-apm-nodejs': {
      return import(
        /* webpackChunkName: "lazyNodeJsClassicApmDashboard" */
        './nodejs.json'
      );
    }
    case 'classic_apm-otel_other-nodejs': {
      return import(
        /* webpackChunkName: "lazyNodeJsApmOtelDashboard" */
        './opentelemetry_nodejs.json'
      );
    }
    case 'classic_apm-edot-nodejs': {
      return import(
        /* webpackChunkName: "lazyNodeJsOtelNativeDashboard" */
        './opentelemetry_nodejs.json'
      );
    }
    case 'otel_native-otel_other-nodejs': {
      return import(
        /* webpackChunkName: "lazyNodeJsOtelNativeEdotDashboard" */
        './otel_native-otel_other-nodejs.json'
      );
    }
    case 'otel_native-edot-nodejs': {
      return import(
        /* webpackChunkName: "lazyNodeJsOtelNativeEdotDashboard" */
        './otel_native-edot-nodejs.json'
      );
    }
    case 'classic_apm-apm-java': {
      return import(
        /* webpackChunkName: "lazyJavaClassicApmDashboard" */
        './java.json'
      );
    }
    case 'classic_apm-otel_other-java': {
      return import(
        /* webpackChunkName: "lazyJavaApmOtelDashboard" */
        './opentelemetry_java.json'
      );
    }
    case 'classic_apm-edot-java': {
      return import(
        /* webpackChunkName: "lazyJavaOtelNativeDashboard" */
        './opentelemetry_java.json'
      );
    }
    case 'otel_native-otel_other-java': {
      return import(
        /* webpackChunkName: "lazyJavaOtelNativeOtherDashboard" */
        './otel_native-otel_other-java.json'
      );
    }
    case 'otel_native-edot-java': {
      return import(
        /* webpackChunkName: "lazyJavaOtelNativeEdotDashboard" */
        './otel_native-edot-java.json'
      );
    }
    case 'classic_apm-edot-dotnet': {
      return import(
        /* webpackChunkName: "lazyDotnetOtelNativeDashboard" */
        './opentelemetry_dotnet.json'
      );
    }
    case 'classic_apm-edot-dotnet-lte-v8': {
      return import(
        /* webpackChunkName: "lazyDotnetOtelNativeLteV8Dashboard" */
        './opentelemetry_dotnet_lte_v8.json'
      );
    }
    case 'classic_apm-otel_other-dotnet': {
      return import(
        /* webpackChunkName: "lazyDotnetApmOtelDashboard" */
        './opentelemetry_dotnet.json'
      );
    }
    case 'otel_native-edot-dotnet':
    case 'otel_native-otel_other-dotnet': {
      return import(
        /* webpackChunkName: "lazyDotnetOtelNativeRuntimeDashboard" */
        './otel_native-otel_other-dotnet.json'
      );
    }
    case 'otel_native-edot-dotnet-lte-v8': {
      return import(
        /* webpackChunkName: "lazyDotnetOtelNativeRuntimeLteV8Dashboard" */
        './otel_native-edot-dotnet-lte-v8.json'
      );
    }
    case 'otel_native-otel_other-python': {
      return import(
        /* webpackChunkName: "lazyPythonOtelNativeOtherDashboard" */
        './otel_native-otel_other-python.json'
      );
    }
    case 'otel_native-edot-python': {
      return import(
        /* webpackChunkName: "lazyPythonOtelNativeEdotDashboard" */
        './otel_native-edot-python.json'
      );
    }
    case 'otel_native-otel_other-go':
    case 'classic_apm-otel_other-go': {
      return import(
        /* webpackChunkName: "lazyGoOtelNativeDashboard" */
        './otel_native-otel_other-go.json'
      );
    }
    case 'otel_native-otel_other-php':
    case 'otel_native-edot-php': {
      return import(
        /* webpackChunkName: "lazyPhpOtelNativeDashboard" */
        './otel_native-edot-php.json'
      );
    }
    default: {
      break;
    }
  }
}
