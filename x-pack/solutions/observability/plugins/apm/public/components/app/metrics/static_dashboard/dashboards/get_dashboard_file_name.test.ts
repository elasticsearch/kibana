/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { getDashboardFileName, parseMajorVersion } from './get_dashboard_file_name';
import { evaluateVersionCondition, parseVersionCondition } from './dashboard_catalog';

const apmAgent = [
  {
    agentName: 'java',
    telemetrySdkName: undefined,
    telemetrySdkLanguage: undefined,
    fileName: 'classic_apm-apm-java',
  },
  {
    agentName: 'iOS/swift',
    telemetrySdkName: undefined,
    telemetrySdkLanguage: undefined,
    fileName: undefined,
  },
  {
    agentName: 'java',
    telemetrySdkName: 'opentelemetry',
    fileName: undefined,
  },
];
const edotSdk = [
  {
    agentName: 'opentelemetry/java/test/elastic',
    fileName: 'classic_apm-edot-java',
  },
  {
    agentName: 'opentelemetry/java/elastic',
    fileName: 'classic_apm-edot-java',
  },
  {
    agentName: 'opentelemetry/java/elastic',
    telemetrySdkName: 'opentelemetry',
    telemetrySdkLanguage: 'java',
    fileName: 'otel_native-edot-java',
  },
  {
    agentName: 'opentelemetry/nodejs/nodejs-agent/elastic',
    telemetrySdkName: 'opentelemetry',
    telemetrySdkLanguage: 'nodejs',
    fileName: 'otel_native-edot-nodejs',
  },
  {
    agentName: 'opentelemetry/php/elastic',
    telemetrySdkName: 'opentelemetry',
    telemetrySdkLanguage: 'php',
    fileName: 'otel_native-edot-php',
  },
];
const vanillaOtelSdk = [
  {
    agentName: 'opentelemetry/java',
    fileName: 'classic_apm-otel_other-java',
  },
  {
    agentName: 'opentelemetry/php/opentelemetry-php-instrumentation',
    telemetrySdkName: 'opentelemetry',
    telemetrySdkLanguage: 'php',
    fileName: 'otel_native-otel_other-php',
  },
  {
    agentName: 'opentelemetry/php/opentelemetry-php-distro',
    telemetrySdkName: 'opentelemetry',
    telemetrySdkLanguage: 'php',
    fileName: 'otel_native-otel_other-php',
  },
  {
    agentName: 'opentelemetry/nodejs/test/nodejs-agent',
    telemetrySdkName: 'opentelemetry',
    telemetrySdkLanguage: 'nodejs',
    fileName: 'otel_native-otel_other-nodejs',
  },
  {
    agentName: 'opentelemetry/java/test/something-else/',
    telemetrySdkName: 'opentelemetry',
    telemetrySdkLanguage: 'java',
    fileName: 'otel_native-otel_other-java',
  },
  {
    agentName: 'otlp/nodejs',
    telemetrySdkName: 'opentelemetry',
    telemetrySdkLanguage: 'nodejs',
    fileName: 'otel_native-otel_other-nodejs',
  },
  {
    agentName: 'otlp/Android',
    telemetrySdkName: 'opentelemetry',
    telemetrySdkLanguage: 'android',
    fileName: undefined,
  },
  {
    agentName: 'opentelemetry/go',
    telemetrySdkName: undefined,
    telemetrySdkLanguage: undefined,
    fileName: 'classic_apm-otel_other-go',
  },
];
const noFilenameCases = [
  {
    agentName: 'test/java/test/something-else/',
    telemetrySdkName: undefined,
    telemetrySdkLanguage: undefined,
    fileName: undefined,
  },
  {
    agentName: 'otlp',
    fileName: undefined,
  },
  {
    agentName: 'elastic',
    fileName: undefined,
  },
  {
    agentName: 'my-awesome-agent/otel',
    telemetrySdkName: 'opentelemetry',
    fileName: undefined,
  },
];

describe('getDashboardFileName', () => {
  describe('apmAgent', () => {
    it.each(apmAgent)(
      'for agent $agentName with sdk $telemetrySdkName returns correct filename',
      ({ agentName, telemetrySdkName, telemetrySdkLanguage, fileName }) => {
        expect(getDashboardFileName({ agentName, telemetrySdkName, telemetrySdkLanguage })).toBe(
          fileName
        );
      }
    );
  });

  describe('vanillaOtelSdk', () => {
    it.each(vanillaOtelSdk)(
      'for agent $agentName with sdk $telemetrySdkName returns correct filename',
      ({ agentName, telemetrySdkName, telemetrySdkLanguage, fileName }) => {
        expect(getDashboardFileName({ agentName, telemetrySdkName, telemetrySdkLanguage })).toBe(
          fileName
        );
      }
    );
  });

  describe('edotSdk', () => {
    it.each(edotSdk)(
      'for agent $agentName with sdk $telemetrySdkName returns correct filename',
      ({ agentName, telemetrySdkName, telemetrySdkLanguage, fileName }) => {
        expect(getDashboardFileName({ agentName, telemetrySdkName, telemetrySdkLanguage })).toBe(
          fileName
        );
      }
    );
  });

  describe('noFilenameCases', () => {
    it.each(noFilenameCases)(
      'for agent $agentName returns undefined',
      ({ agentName, telemetrySdkName, telemetrySdkLanguage, fileName }) => {
        expect(getDashboardFileName({ agentName, telemetrySdkName, telemetrySdkLanguage })).toBe(
          fileName
        );
      }
    );
  });

  describe('with runtimeVersion', () => {
    it('returns default when no version rules match', () => {
      expect(
        getDashboardFileName({
          agentName: 'opentelemetry/java/elastic',
          telemetrySdkName: 'opentelemetry',
          telemetrySdkLanguage: 'java',
          runtimeVersion: '17.0.1',
        })
      ).toBe('otel_native-edot-java');
    });

    it('returns default when runtimeVersion is undefined', () => {
      expect(
        getDashboardFileName({
          agentName: 'opentelemetry/java/elastic',
          telemetrySdkName: 'opentelemetry',
          telemetrySdkLanguage: 'java',
          runtimeVersion: undefined,
        })
      ).toBe('otel_native-edot-java');
    });

    it('returns default when runtimeVersion is invalid', () => {
      expect(
        getDashboardFileName({
          agentName: 'java',
          runtimeVersion: 'beta',
        })
      ).toBe('classic_apm-apm-java');
    });

    it('resolves EDOT .NET 8 via <=8 version rule', () => {
      expect(
        getDashboardFileName({
          agentName: 'opentelemetry/dotnet/elastic',
          runtimeVersion: '8.0.11',
        })
      ).toBe('classic_apm-edot-dotnet-lte-v8');
    });

    it('resolves EDOT .NET 6 via <=8 version rule (backward-compatible)', () => {
      expect(
        getDashboardFileName({
          agentName: 'opentelemetry/dotnet/elastic',
          runtimeVersion: '6.0.0',
        })
      ).toBe('classic_apm-edot-dotnet-lte-v8');
    });

    it('falls back to default for EDOT .NET 9 (above <=8 rule)', () => {
      expect(
        getDashboardFileName({
          agentName: 'opentelemetry/dotnet/elastic',
          runtimeVersion: '9.0.0',
        })
      ).toBe('classic_apm-edot-dotnet');
    });

    it('falls back to default for EDOT .NET 10 (above <=8 rule)', () => {
      expect(
        getDashboardFileName({
          agentName: 'opentelemetry/dotnet/elastic',
          runtimeVersion: '10.0.0',
        })
      ).toBe('classic_apm-edot-dotnet');
    });

    it('resolves OTel-native EDOT .NET 9 to the new dotnet.* dashboard', () => {
      expect(
        getDashboardFileName({
          agentName: 'opentelemetry/dotnet/elastic',
          telemetrySdkName: 'opentelemetry',
          telemetrySdkLanguage: 'dotnet',
          runtimeVersion: '9.0.0',
        })
      ).toBe('otel_native-edot-dotnet');
    });

    it('resolves OTel-native EDOT .NET 8 to the lte-v8 dashboard via <=8 rule', () => {
      expect(
        getDashboardFileName({
          agentName: 'opentelemetry/dotnet/elastic',
          telemetrySdkName: 'opentelemetry',
          telemetrySdkLanguage: 'dotnet',
          runtimeVersion: '8.0.11',
        })
      ).toBe('otel_native-edot-dotnet-lte-v8');
    });

    it('resolves OTel-native vanilla .NET to the otel_other dotnet dashboard', () => {
      expect(
        getDashboardFileName({
          agentName: 'opentelemetry/dotnet',
          telemetrySdkName: 'opentelemetry',
          telemetrySdkLanguage: 'dotnet',
          runtimeVersion: '9.0.0',
        })
      ).toBe('otel_native-otel_other-dotnet');
    });
  });
});

describe('parseMajorVersion', () => {
  it.each([
    { input: '6', expected: 6 },
    { input: '6.10', expected: 6 },
    { input: '6.100.6', expected: 6 },
    { input: '17.0.1', expected: 17 },
    { input: '21', expected: 21 },
    { input: '0.9.1', expected: 0 },
    { input: undefined, expected: undefined },
    { input: '', expected: undefined },
    { input: 'beta', expected: undefined },
    { input: 'v6.10', expected: undefined },
  ])('parseMajorVersion($input) returns $expected', ({ input, expected }) => {
    expect(parseMajorVersion(input)).toBe(expected);
  });
});

describe('version condition evaluation', () => {
  describe('parseVersionCondition', () => {
    it.each([
      { condition: '>=9', expected: { operator: '>=', version: 9 } },
      { condition: '<=8', expected: { operator: '<=', version: 8 } },
      { condition: '>5', expected: { operator: '>', version: 5 } },
      { condition: '<10', expected: { operator: '<', version: 10 } },
      { condition: '==7', expected: { operator: '==', version: 7 } },
      { condition: 'invalid', expected: undefined },
      { condition: '>=', expected: undefined },
      { condition: '9', expected: undefined },
    ])('parseVersionCondition($condition) returns $expected', ({ condition, expected }) => {
      expect(parseVersionCondition(condition)).toStrictEqual(expected);
    });
  });

  describe('evaluateVersionCondition', () => {
    it.each([
      { condition: '>=9', version: 9, expected: true },
      { condition: '>=9', version: 10, expected: true },
      { condition: '>=9', version: 8, expected: false },
      { condition: '<=8', version: 8, expected: true },
      { condition: '<=8', version: 7, expected: true },
      { condition: '<=8', version: 9, expected: false },
      { condition: '>5', version: 6, expected: true },
      { condition: '>5', version: 5, expected: false },
      { condition: '<10', version: 9, expected: true },
      { condition: '<10', version: 10, expected: false },
      { condition: '==7', version: 7, expected: true },
      { condition: '==7', version: 8, expected: false },
    ])(
      'evaluateVersionCondition($condition, $version) returns $expected',
      ({ condition, version, expected }) => {
        expect(evaluateVersionCondition(condition, version)).toBe(expected);
      }
    );
  });
});
