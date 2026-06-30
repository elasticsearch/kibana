/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { ToolType, ToolResultType } from '@kbn/agent-builder-common';
import {
  createToolHandlerContext,
  createToolTestMocks,
  setupMockCoreStartServices,
} from '../../__mocks__/test_helpers';
import {
  GET_INSTALLED_RULES_MITRE_COVERAGE_INLINE_TOOL_ID,
  buildMitreCoverageFromRules,
  createGetInstalledRulesMitreCoverageTool,
} from './get_installed_rules_mitre_coverage_tool';
import { findRules } from '../../../lib/detection_engine/rule_management/logic/search/find_rules';

jest.mock('../../../lib/detection_engine/rule_management/logic/search/find_rules', () => ({
  findRules: jest.fn(),
}));

const mockFindRules = jest.mocked(findRules);

// ---- Threat fixture builders (mirror the structured `params.threat` shape) ----

const sub = (id: string, name: string) => ({ id, name, reference: `https://attack/${id}` });

const tech = (
  id: string,
  name: string,
  subtechnique: Array<{ id: string; name: string }> = []
) => ({
  id,
  name,
  reference: `https://attack/${id}`,
  subtechnique,
});

const mitre = (
  tacticId: string,
  tacticName: string,
  technique: Array<ReturnType<typeof tech>> = []
) => ({
  framework: 'MITRE ATT&CK',
  tactic: { id: tacticId, name: tacticName, reference: `https://attack/${tacticId}` },
  technique,
});

type Rules = Parameters<typeof buildMitreCoverageFromRules>[0];
const rule = (threat: unknown) => ({ params: { threat } });
const rules = (...list: unknown[]): Rules => list as Rules;

const createMockDeps = () => {
  const { mockCore, mockLogger, mockEsClient, mockRequest } = createToolTestMocks();
  const mockCoreStart = setupMockCoreStartServices(mockCore, mockEsClient);

  const mockRulesClientInstance = {};
  const alertingPlugin = {
    getRulesClientWithRequest: jest.fn().mockResolvedValue(mockRulesClientInstance),
  };

  mockCore.getStartServices.mockResolvedValue([
    mockCoreStart,
    { alerting: alertingPlugin },
    {},
  ] as never);

  return { getStartServices: mockCore.getStartServices, mockLogger, mockRequest };
};

describe('buildMitreCoverageFromRules', () => {
  it('keeps each technique paired with its own name (regression: the flattened-agg bug)', () => {
    // One rule mapping to two techniques. The old aggregation-based implementation
    // cross-contaminated names across techniques; reading the structured object keeps them paired.
    const result = buildMitreCoverageFromRules(
      rules(
        rule([
          mitre('TA0040', 'Impact', [
            tech('T1491', 'Defacement', [sub('T1491.002', 'External Defacement')]),
            tech('T1565', 'Data Manipulation', [sub('T1565.001', 'Stored Data Manipulation')]),
          ]),
        ])
      )
    );

    expect(result).toEqual({
      total_installed_rules: 1,
      total_with_mitre_mapping: 1,
      tactics: [{ id: 'TA0040', name: 'Impact', count: 1 }],
      techniques: [
        { id: 'T1491', name: 'Defacement', count: 1 },
        { id: 'T1565', name: 'Data Manipulation', count: 1 },
      ],
    });
  });

  it('counts each rule once per id and sorts by count desc then id', () => {
    const result = buildMitreCoverageFromRules(
      rules(
        rule([
          mitre('TA0001', 'Initial Access', [
            tech('T1059', 'Command and Scripting Interpreter', [sub('T1059.001', 'PowerShell')]),
          ]),
        ]),
        rule([
          mitre('TA0001', 'Initial Access', [
            tech('T1059', 'Command and Scripting Interpreter', [
              sub('T1059.003', 'Windows Command Shell'),
            ]),
          ]),
        ]),
        rule([mitre('TA0002', 'Execution', [tech('T1059', 'Command and Scripting Interpreter')])])
      )
    );

    expect(result.total_with_mitre_mapping).toBe(3);
    expect(result.tactics).toEqual([
      { id: 'TA0001', name: 'Initial Access', count: 2 },
      { id: 'TA0002', name: 'Execution', count: 1 },
    ]);
    expect(result.techniques).toEqual([
      { id: 'T1059', name: 'Command and Scripting Interpreter', count: 3 },
    ]);
  });

  it('de-duplicates ids within a single rule (technique referenced under two tactics counts once)', () => {
    const result = buildMitreCoverageFromRules(
      rules(
        rule([
          mitre('TA0001', 'Initial Access', [tech('T1059', 'Command and Scripting Interpreter')]),
          mitre('TA0002', 'Execution', [tech('T1059', 'Command and Scripting Interpreter')]),
        ])
      )
    );

    expect(result.total_with_mitre_mapping).toBe(1);
    expect(result.techniques).toEqual([
      { id: 'T1059', name: 'Command and Scripting Interpreter', count: 1 },
    ]);
    expect(result.tactics).toEqual([
      { id: 'TA0001', name: 'Initial Access', count: 1 },
      { id: 'TA0002', name: 'Execution', count: 1 },
    ]);
  });

  it('reports techniques flat — subtechniques in the threat data are not tallied', () => {
    const result = buildMitreCoverageFromRules(
      rules(
        rule([
          mitre('TA0005', 'Defense Evasion', [
            tech('T1055', 'Process Injection', [
              sub('T1055.001', 'Dynamic-link Library Injection'),
              sub('T1055.002', 'Portable Executable Injection'),
            ]),
          ]),
        ])
      )
    );

    // The technique is counted once; its subtechniques are not surfaced as a field.
    expect(result.techniques).toEqual([{ id: 'T1055', name: 'Process Injection', count: 1 }]);
    expect('subtechniques' in result.techniques[0]).toBe(false);
  });

  it('ignores non-MITRE-ATT&CK frameworks', () => {
    const result = buildMitreCoverageFromRules(
      rules(
        rule([
          {
            framework: 'Some Other Framework',
            tactic: { id: 'XX', name: 'X', reference: 'https://x' },
            technique: [],
          },
        ])
      )
    );

    expect(result).toEqual({
      total_installed_rules: 1,
      total_with_mitre_mapping: 0,
      tactics: [],
      techniques: [],
    });
  });

  it('falls back to the id as the name when a name is missing', () => {
    const result = buildMitreCoverageFromRules(
      rules(
        rule([
          {
            framework: 'MITRE ATT&CK',
            tactic: { id: 'TA0001', name: '', reference: 'https://x' },
            technique: [],
          },
        ])
      )
    );

    expect(result.tactics).toEqual([{ id: 'TA0001', name: 'TA0001', count: 1 }]);
  });

  it('treats rules without threat as having no MITRE mapping', () => {
    const result = buildMitreCoverageFromRules(rules(rule(undefined)));
    expect(result).toEqual({
      total_installed_rules: 1,
      total_with_mitre_mapping: 0,
      tactics: [],
      techniques: [],
    });
  });
});

describe('createGetInstalledRulesMitreCoverageTool', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('tool definition', () => {
    it('has the correct id and type', () => {
      const { getStartServices, mockLogger } = createMockDeps();
      const tool = createGetInstalledRulesMitreCoverageTool({
        getStartServices,
        logger: mockLogger,
      });

      expect(tool.id).toBe(GET_INSTALLED_RULES_MITRE_COVERAGE_INLINE_TOOL_ID);
      expect(tool.id).toBe('security.get_installed_rules_mitre_coverage');
      expect(tool.type).toBe(ToolType.builtin);
    });
  });

  describe('handler — happy path', () => {
    it('reads structured params.threat and returns coverage', async () => {
      const { getStartServices, mockLogger, mockRequest } = createMockDeps();
      mockFindRules.mockResolvedValue({
        total: 2,
        page: 1,
        perPage: 10000,
        data: [
          rule([
            mitre('TA0001', 'Initial Access', [
              tech('T1566', 'Phishing', [sub('T1566.001', 'Spearphishing Attachment')]),
            ]),
          ]),
          rule([
            mitre('TA0001', 'Initial Access', [tech('T1190', 'Exploit Public-Facing Application')]),
          ]),
        ],
      } as never);

      const tool = createGetInstalledRulesMitreCoverageTool({
        getStartServices,
        logger: mockLogger,
      });
      const context = createToolHandlerContext(mockRequest, {} as never, mockLogger);
      const result = await tool.handler({}, context);

      expect('results' in result).toBe(true);
      if ('results' in result) {
        expect(result.results[0].type).toBe(ToolResultType.other);
        expect(result.results[0].data).toEqual({
          total_installed_rules: 2,
          total_with_mitre_mapping: 2,
          tactics: [{ id: 'TA0001', name: 'Initial Access', count: 2 }],
          techniques: [
            { id: 'T1190', name: 'Exploit Public-Facing Application', count: 1 },
            { id: 'T1566', name: 'Phishing', count: 1 },
          ],
        });
      }
    });

    it('reads up to 10k rules by structured field and does NOT aggregate the flattened params', async () => {
      const { getStartServices, mockLogger, mockRequest } = createMockDeps();
      mockFindRules.mockResolvedValue({ total: 0, page: 1, perPage: 10000, data: [] } as never);

      const tool = createGetInstalledRulesMitreCoverageTool({
        getStartServices,
        logger: mockLogger,
      });
      const context = createToolHandlerContext(mockRequest, {} as never, mockLogger);
      await tool.handler({}, context);

      expect(mockFindRules).toHaveBeenCalledWith(
        expect.objectContaining({
          fields: ['params.threat'],
          page: 1,
          perPage: 10000,
        })
      );
      expect(mockFindRules.mock.calls[0][0].aggregations).toBeUndefined();
    });
  });

  describe('handler — no rules installed', () => {
    it('returns zero counts and empty arrays', async () => {
      const { getStartServices, mockLogger, mockRequest } = createMockDeps();
      mockFindRules.mockResolvedValue({ total: 0, page: 1, perPage: 10000, data: [] } as never);

      const tool = createGetInstalledRulesMitreCoverageTool({
        getStartServices,
        logger: mockLogger,
      });
      const context = createToolHandlerContext(mockRequest, {} as never, mockLogger);
      const result = await tool.handler({}, context);

      if ('results' in result) {
        expect(result.results[0].type).toBe(ToolResultType.other);
        expect(result.results[0].data).toEqual({
          total_installed_rules: 0,
          total_with_mitre_mapping: 0,
          tactics: [],
          techniques: [],
        });
      }
    });
  });

  describe('handler — error path', () => {
    it('returns ToolResultType.error and logs when findRules throws', async () => {
      const { getStartServices, mockLogger, mockRequest } = createMockDeps();
      mockFindRules.mockRejectedValue(new Error('ES cluster unavailable'));

      const tool = createGetInstalledRulesMitreCoverageTool({
        getStartServices,
        logger: mockLogger,
      });
      const context = createToolHandlerContext(mockRequest, {} as never, mockLogger);
      const result = await tool.handler({}, context);

      if ('results' in result) {
        expect(result.results[0].type).toBe(ToolResultType.error);
        expect((result.results[0].data as { message: string }).message).toContain(
          'ES cluster unavailable'
        );
      }
      expect(mockLogger.error).toHaveBeenCalledWith(
        expect.stringContaining('ES cluster unavailable')
      );
    });
  });
});
