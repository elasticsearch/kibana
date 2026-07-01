/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod';
import { ToolType, ToolResultType } from '@kbn/agent-builder-common';
import type { BuiltinToolDefinition } from '@kbn/agent-builder-server';
import type { Logger } from '@kbn/logging';
import type { SecuritySolutionPluginCoreSetupDependencies } from '../../plugin_contract';
import { getAgentBuilderResourceAvailability } from '../utils/get_agent_builder_resource_availability';
import { securityTool } from './constants';
import {
  pciIndexPatternSchema,
  pciTimeRangeSchema,
  buildScopeClaim,
} from './pci_compliance_schemas';

const DEFAULT_SAMPLE_LOOKBACK_DAYS = 7;
const SAMPLE_HIT_COUNT = 3;
const SAMPLE_SOURCE_FIELD_LIMIT = 20;

const pciFieldMapperSchema = z.object({
  indexPattern: pciIndexPatternSchema.describe(
    'Index pattern to inspect for field mapping (e.g. "logs-custom-myapp*").'
  ),
  targetFields: z
    .array(z.string().min(1).max(256))
    .min(1)
    .max(50)
    .optional()
    .describe('Optional list of ECS fields to map to. Defaults to common PCI-relevant ECS fields.'),
  timeRange: pciTimeRangeSchema
    .optional()
    .describe(
      'Optional ISO-8601 time range for the sample hit lookup. Defaults to the last 7 days. ' +
        'Keeping a narrow window avoids scanning frozen/cold data when looking for representative rows.'
    ),
});

export const PCI_FIELD_MAPPER_TOOL_ID = securityTool('pci_field_mapper');

const SENSITIVE_FIELD_PATTERNS = [
  /card/i,
  /pan/i,
  /\bcvv\b/i,
  /\bcvc\b/i,
  /account.?number/i,
  /credit/i,
  /ssn/i,
  /social.?security/i,
  /secret/i,
  /password/i,
  /token/i,
];

const DEFAULT_ECS_TARGETS = [
  'user.name',
  'source.ip',
  'destination.ip',
  'event.outcome',
  'event.action',
  'event.category',
  'host.name',
  'tls.version',
  'process.name',
  'vulnerability.id',
  'vulnerability.severity',
];

const FIELD_MAPPING_HINTS: Record<string, string[]> = {
  'user.name': [
    'username',
    'user_name',
    'login',
    'account',
    'principal',
    'actor',
    'userid',
    'user_id',
  ],
  'source.ip': [
    'src_ip',
    'src_addr',
    'source_ip',
    'client_ip',
    'remote_addr',
    'remote_ip',
    'origin_ip',
  ],
  'destination.ip': ['dst_ip', 'dst_addr', 'dest_ip', 'server_ip', 'target_ip'],
  'event.outcome': ['outcome', 'result', 'status', 'success', 'auth_result', 'login_result'],
  'event.action': ['action', 'event_type', 'operation', 'activity', 'method', 'api_call'],
  'event.category': ['category', 'event_class', 'log_type', 'event_group'],
  'host.name': ['hostname', 'server', 'host', 'machine', 'device', 'device_name', 'computer'],
  'tls.version': ['ssl_version', 'tls_ver', 'protocol_version', 'ssl_protocol'],
  'process.name': ['process', 'proc', 'program', 'exe', 'executable', 'binary'],
  'vulnerability.id': ['vuln_id', 'cve', 'cve_id', 'vulnerability', 'finding_id'],
  'vulnerability.severity': ['severity', 'risk_level', 'vuln_severity', 'criticality', 'risk'],
};

function isSensitiveField(fieldName: string): boolean {
  return SENSITIVE_FIELD_PATTERNS.some((pattern) => pattern.test(fieldName));
}

function matchFieldToEcs(
  fieldName: string,
  ecsTarget: string
): { score: number; reason: string } | null {
  const lowerField = fieldName.toLowerCase();
  const hints = FIELD_MAPPING_HINTS[ecsTarget];
  if (!hints) return null;

  for (const hint of hints) {
    const lowerHint = hint.toLowerCase();
    if (lowerField === lowerHint) {
      return { score: 1.0, reason: `Exact match: "${fieldName}" matches hint "${hint}"` };
    }

    const wordBoundary = new RegExp(`(^|[._\\-])${lowerHint}($|[._\\-])`, 'i');
    if (wordBoundary.test(lowerField)) {
      return {
        score: 0.8,
        reason: `Word-boundary match: "${fieldName}" contains "${hint}"`,
      };
    }
  }

  const ecsLeaf = ecsTarget.split('.').pop()?.toLowerCase();
  if (ecsLeaf && lowerField.includes(ecsLeaf) && lowerField.length < ecsLeaf.length + 10) {
    return {
      score: 0.5,
      reason: `Partial match: "${fieldName}" resembles ECS leaf "${ecsLeaf}"`,
    };
  }

  return null;
}

const defaultTimeRange = (): { from: string; to: string } => {
  const to = new Date();
  const from = new Date(to.getTime() - DEFAULT_SAMPLE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  return { from: from.toISOString(), to: to.toISOString() };
};

export const pciFieldMapperTool = (
  core: SecuritySolutionPluginCoreSetupDependencies,
  logger: Logger
): BuiltinToolDefinition<typeof pciFieldMapperSchema> => {
  return {
    id: PCI_FIELD_MAPPER_TOOL_ID,
    type: ToolType.builtin,
    description:
      'Inspect non-ECS index fields and suggest mappings to ECS fields for PCI compliance queries. ' +
      'Use this when the scope discovery tool reports low ECS coverage for an index. Bounded by a ' +
      'short time window to avoid scanning cold/frozen data when sampling rows.',
    schema: pciFieldMapperSchema,
    availability: {
      cacheMode: 'space',
      handler: async ({ request }) => {
        return getAgentBuilderResourceAvailability({ core, request, logger });
      },
    },
    handler: async ({ indexPattern, targetFields, timeRange }, { esClient }) => {
      const ecsTargets = targetFields ?? DEFAULT_ECS_TARGETS;
      const resolvedRange = timeRange ?? defaultTimeRange();

      let allFields: string[];
      try {
        const fieldCaps = await esClient.asCurrentUser.fieldCaps({
          index: indexPattern,
          fields: ['*'],
          ignore_unavailable: true,
          allow_no_indices: true,
        });
        allFields = Object.keys(fieldCaps.fields ?? {});
      } catch {
        return {
          results: [
            {
              type: ToolResultType.error,
              data: {
                message: `Unable to inspect fields for index pattern "${indexPattern}".`,
              },
            },
          ],
        };
      }

      // Treat any field outside the requested ECS-target set as a mapping candidate, including
      // dotted/namespaced custom fields like `myorg.user_id`. The previous filter excluded any
      // field with a `.` in it, which silently dropped hierarchical non-ECS shapes that real
      // customers ingest from custom pipelines.
      const ecsTargetSet = new Set(ecsTargets);
      const nonEcsFields = allFields.filter(
        (f) => !f.startsWith('@') && !f.startsWith('_') && !ecsTargetSet.has(f)
      );

      const ecsFieldsPresent = allFields.filter((f) => ecsTargets.includes(f));
      const ecsMissing = ecsTargets.filter((f) => !allFields.includes(f));

      const mappings: Array<{
        sourceField: string;
        suggestedEcsField: string;
        confidence: number;
        reason: string;
      }> = [];

      for (const field of nonEcsFields) {
        if (!isSensitiveField(field)) {
          const lowerField = field.toLowerCase();
          for (const ecsTarget of ecsMissing) {
            // Skip fields that already live in the same ECS namespace as the missing target
            // (e.g. don't suggest `process.pid → process.name`); those are ECS-shaped already.
            const ecsNamespace = ecsTarget.split('.')[0];
            const sharesEcsNamespace = lowerField.startsWith(`${ecsNamespace}.`);
            if (!sharesEcsNamespace) {
              const match = matchFieldToEcs(field, ecsTarget);
              if (match && match.score >= 0.5) {
                mappings.push({
                  sourceField: field,
                  suggestedEcsField: ecsTarget,
                  confidence: match.score,
                  reason: match.reason,
                });
              }
            }
          }
        }
      }

      mappings.sort((a, b) => b.confidence - a.confidence);

      // Best-effort sample constrained to the provided time window so we don't scan cold/frozen data.
      let sampleFields: string[] = [];
      try {
        const sampleResponse = await esClient.asCurrentUser.search({
          index: indexPattern,
          size: SAMPLE_HIT_COUNT,
          _source_includes: nonEcsFields
            .filter((f) => !isSensitiveField(f))
            .slice(0, SAMPLE_SOURCE_FIELD_LIMIT),
          query: {
            range: {
              '@timestamp': {
                gte: resolvedRange.from,
                lte: resolvedRange.to,
              },
            },
          },
          ignore_unavailable: true,
          allow_no_indices: true,
        });
        if (sampleResponse.hits?.hits?.length) {
          sampleFields = [
            ...new Set(sampleResponse.hits.hits.flatMap((hit) => Object.keys(hit._source ?? {}))),
          ];
        }
      } catch {
        // Sample retrieval is best-effort (e.g. indices without @timestamp will error here).
      }

      const scopeClaim = buildScopeClaim({
        indices: [indexPattern],
        from: resolvedRange.from,
        to: resolvedRange.to,
        requirementsEvaluated: [],
        requiredFieldsChecked: ecsTargets,
      });

      return {
        results: [
          {
            type: ToolResultType.other,
            data: {
              indexPattern,
              totalFields: allFields.length,
              ecsFieldsPresent,
              ecsMissing,
              ecsCoveragePercent: Math.round((ecsFieldsPresent.length / ecsTargets.length) * 100),
              suggestedMappings: mappings.slice(0, 20),
              sampleFieldNames: sampleFields.slice(0, 30),
              guidance:
                mappings.length > 0
                  ? 'Use the generateEsql tool to create adapted queries using the suggested field mappings above. ' +
                    'For example, if "username" maps to "user.name", use RENAME or reference the source field directly.'
                  : 'No automatic mappings found. Inspect the sample field names and create manual field mappings.',
              scopeClaim,
            },
          },
        ],
      };
    },
    tags: ['security', 'compliance', 'pci', 'field-mapping'],
  };
};
