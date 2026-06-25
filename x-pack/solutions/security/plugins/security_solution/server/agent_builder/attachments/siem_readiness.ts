/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import type {
  AttachmentTypeDefinition,
  AttachmentFormatContext,
} from '@kbn/agent-builder-server/attachments';
import type { Attachment } from '@kbn/agent-builder-common/attachments';
import type {
  ContinuityPayload,
  CoveragePayload,
  QualityPayload,
  RetentionInfo,
  RetentionPayload,
} from '@kbn/siem-readiness';
import { securityAttachmentDataSchema } from './security_attachment_data_schema';

export const SIEM_READINESS_ATTACHMENT_ID = 'security.siem_readiness';

// ---- Shared sub-schemas ----

const affectedRuleSchema = z.object({
  id: z.string().max(100),
  name: z.string().max(500),
});

const affectedTacticSchema = z.object({
  id: z.string().max(20),
  name: z.string().max(200),
  totalRules: z.number(),
  affectedRulesCount: z.number(),
});

const recommendedActionSchema = z.object({
  label: z.string().max(200),
  href: z.string().max(2048),
});

const actionableFindingSchema = z.object({
  category: z.string().max(100).optional(),
  severity: z.enum(['CRITICAL', 'WARNING', 'INFORMATIONAL']),
  message: z.string().max(5000),
  resource: z.string().max(500),
  affectedRules: z.array(affectedRuleSchema).optional(),
  affectedTactics: z.array(affectedTacticSchema).optional(),
  affectedPlatform: z.string().max(200).optional(),
  recommendedActions: z.array(recommendedActionSchema).optional(),
  blastRadiusStatus: z.enum(['healthy', 'partial', 'unavailable']).optional(),
});

// ---- Coverage ----

export const siemReadinessCoverageDataSchema = securityAttachmentDataSchema.extend({
  dimension: z.literal('coverage'),
  status: z.enum(['healthy', 'actionsRequired', 'noData']),
  summary: z.string().max(8000),
  items: z.array(
    z.object({
      category: z.string().max(100),
      indices: z.array(z.object({ indexName: z.string().max(500), docs: z.number() })),
    })
  ),
  actionableFindings: z.array(actionableFindingSchema),
});

// ---- Quality ----

export const siemReadinessQualityDataSchema = securityAttachmentDataSchema.extend({
  dimension: z.literal('quality'),
  status: z.enum(['healthy', 'actionsRequired', 'noData']),
  summary: z.string().max(8000),
  items: z.array(
    z.object({
      indexName: z.string().max(500),
      incompatibleFieldCount: z.number(),
      totalFieldCount: z.number(),
      ecsFieldCount: z.number(),
      checkedAt: z.number(),
    })
  ),
  actionableFindings: z.array(actionableFindingSchema),
});

// ---- Continuity ----

export const siemReadinessContinuityDataSchema = securityAttachmentDataSchema.extend({
  dimension: z.literal('continuity'),
  status: z.enum(['healthy', 'actionsRequired', 'noData']),
  summary: z.string().max(8000),
  items: z.array(
    z.object({
      name: z.string().max(500),
      indices: z.array(z.string().max(500)),
      docsCount: z.number(),
      failedDocsCount: z.number(),
      statsAvailable: z.boolean(),
      categories: z.array(z.string().max(100)).optional(),
    })
  ),
  actionableFindings: z.array(actionableFindingSchema),
});

// ---- Retention ----

export const siemReadinessRetentionDataSchema = securityAttachmentDataSchema.extend({
  dimension: z.literal('retention'),
  status: z.enum(['healthy', 'actionsRequired', 'noData']),
  summary: z.string().max(8000),
  items: z.array(
    z.object({
      indexName: z.string().max(500),
      isDataStream: z.boolean(),
      retentionType: z.enum(['ilm', 'dsl']).nullable(),
      retentionPeriod: z.string().max(50).nullable(),
      retentionDays: z.number().nullable(),
      policyName: z.string().max(500).nullable(),
      status: z.enum(['healthy', 'non-compliant']),
      categories: z.array(z.string().max(100)).optional(),
    })
  ),
  actionableFindings: z.array(actionableFindingSchema),
});

// ---- Union schema ----

export const siemReadinessAttachmentDataSchema = z.discriminatedUnion('dimension', [
  siemReadinessCoverageDataSchema,
  siemReadinessQualityDataSchema,
  siemReadinessContinuityDataSchema,
  siemReadinessRetentionDataSchema,
]);

export type SiemReadinessAttachmentData = z.infer<typeof siemReadinessAttachmentDataSchema>;

// ---- Text format helpers ----

const STATUS_LABELS: Record<string, string> = {
  healthy: 'Healthy',
  actionsRequired: 'Actions Required',
  noData: 'No Data',
  CRITICAL: 'Critical',
  WARNING: 'Warning',
  INFORMATIONAL: 'Informational',
};

const formatStatus = (status: string): string => STATUS_LABELS[status] ?? status;

const formatFindingWithBlastRadius = (f: z.infer<typeof actionableFindingSchema>): string[] => {
  const lines: string[] = [];
  lines.push(`  [${f.severity}] ${f.message}`);

  if (f.blastRadiusStatus === 'unavailable') {
    // A required reverse-map lookup failed; these fields cannot be trusted — surface the gap
    // explicitly rather than showing empty values that look like "no impact found".
    lines.push('    Affected Rules: unavailable (lookup failed)');
    lines.push('    Affected Tactics: unavailable (lookup failed)');
    lines.push('    Platform: unavailable (lookup failed)');
  } else {
    const partialSuffix = f.blastRadiusStatus === 'partial' ? ' (may be incomplete)' : '';

    if (f.affectedRules && f.affectedRules.length > 0) {
      lines.push(`    Affected Rules (${f.affectedRules.length})${partialSuffix}:`);
      f.affectedRules.slice(0, 5).forEach((rule) => {
        lines.push(`      - ${rule.name}`);
      });
      if (f.affectedRules.length > 5) {
        lines.push(`      ... and ${f.affectedRules.length - 5} more`);
      }
    }

    if (f.affectedTactics && f.affectedTactics.length > 0) {
      lines.push(`    Affected MITRE Tactics${partialSuffix}:`);
      f.affectedTactics.forEach((tactic) => {
        lines.push(
          `      - ${tactic.name} (${tactic.affectedRulesCount}/${tactic.totalRules} rules)`
        );
      });
    }

    if (f.affectedPlatform) {
      lines.push(`    Platform: ${f.affectedPlatform}`);
    }
  }

  if (f.recommendedActions && f.recommendedActions.length > 0) {
    lines.push(`    Actions:`);
    f.recommendedActions.forEach((action) => {
      lines.push(`      - ${action.label}: ${action.href}`);
    });
  }

  return lines;
};

const formatCoverageForAgent = (data: CoveragePayload & { dimension: 'coverage' }): string => {
  const lines = [`SIEM Coverage — ${formatStatus(data.status)}`, data.summary];
  data.items.forEach((cat) => {
    const totalDocs = cat.indices.reduce((sum, idx) => sum + idx.docs, 0);
    lines.push(
      `  ${cat.category}: ${totalDocs.toLocaleString()} docs across ${cat.indices.length} indices`
    );
  });
  if (data.actionableFindings?.length) {
    lines.push('Findings:');
    data.actionableFindings.forEach((f) => {
      const finding = f as z.infer<typeof actionableFindingSchema>;
      lines.push(...formatFindingWithBlastRadius(finding));
    });
  }
  return lines.join('\n');
};

const formatQualityForAgent = (data: QualityPayload & { dimension: 'quality' }): string => {
  const lines = [`SIEM Quality — ${formatStatus(data.status)}`, data.summary];
  if (data.actionableFindings?.length) {
    lines.push('Findings:');
    data.actionableFindings.forEach((f) => {
      const finding = f as z.infer<typeof actionableFindingSchema>;
      lines.push(...formatFindingWithBlastRadius(finding));
    });
  }
  return lines.join('\n');
};

const formatContinuityForAgent = (
  data: ContinuityPayload & { dimension: 'continuity' }
): string => {
  const lines = [`SIEM Continuity — ${formatStatus(data.status)}`, data.summary];

  // Group critical pipelines by their primary category for the agent.
  const criticalByCategory = new Map<string, typeof data.items>();
  data.items.forEach((item) => {
    if (item.statsAvailable && item.failedDocsCount > 0) {
      const primaryCategory = item.categories?.[0] ?? 'Uncategorized';
      const existing = criticalByCategory.get(primaryCategory) ?? [];
      criticalByCategory.set(primaryCategory, [...existing, item]);
    }
  });

  if (criticalByCategory.size > 0) {
    lines.push('Pipelines with failures by category:');
    criticalByCategory.forEach((items, category) => {
      lines.push(`  ${category}:`);
      items.forEach((item) => {
        const rate =
          item.docsCount > 0
            ? `${((item.failedDocsCount / item.docsCount) * 100).toFixed(2)}%`
            : 'N/A';
        lines.push(
          `    ${item.name} — ${item.failedDocsCount} failed / ${item.docsCount} total (${rate})`
        );
      });
    });
  }

  if (data.actionableFindings?.length) {
    lines.push('Findings:');
    data.actionableFindings.forEach((f) => {
      const finding = f as z.infer<typeof actionableFindingSchema>;
      lines.push(...formatFindingWithBlastRadius(finding));
    });
  }
  return lines.join('\n');
};

const formatRetentionForAgent = (data: RetentionPayload & { dimension: 'retention' }): string => {
  const lines = [`SIEM Retention — ${formatStatus(data.status)}`, data.summary];

  // Group non-compliant items by their primary category for the agent.
  const nonCompliantByCategory = new Map<string, typeof data.items>();
  data.items.forEach((item) => {
    if (item.status === 'non-compliant') {
      const primaryCategory =
        (item as RetentionInfo & { categories?: string[] }).categories?.[0] ?? 'Uncategorized';
      const existing = nonCompliantByCategory.get(primaryCategory) ?? [];
      nonCompliantByCategory.set(primaryCategory, [...existing, item]);
    }
  });

  if (nonCompliantByCategory.size > 0) {
    lines.push('Non-compliant by category:');
    nonCompliantByCategory.forEach((items, category) => {
      lines.push(`  ${category}:`);
      items.forEach((item) => {
        const retention = item.retentionDays ? `${item.retentionDays}d` : 'no policy';
        lines.push(`    ${item.indexName} — ${retention} (threshold: 365d)`);
      });
    });
  }

  if (data.actionableFindings?.length) {
    lines.push('Findings:');
    data.actionableFindings.forEach((f) => {
      const finding = f as z.infer<typeof actionableFindingSchema>;
      lines.push(...formatFindingWithBlastRadius(finding));
    });
  }
  return lines.join('\n');
};

const getAgentDescription = (): string => `
You have access to SIEM readiness data for one dimension (coverage, quality, continuity, or retention).
The attachment contains:
- dimension: which SIEM readiness dimension this data covers
- status: overall health verdict (healthy | actionsRequired | noData)
- summary: pre-computed narrative summary
- items: raw dimension data (pipelines, indices, data streams, or category groups)
- actionableFindings: pre-shaped findings with blast radius context

Each actionable finding includes:
- category, severity (CRITICAL | WARNING | INFORMATIONAL), message, resource
- type (continuity only): pipeline_failure | silence | volume_drop_warning | volume_drop_critical
- affectedRules: detection rules impacted by this finding
- affectedTactics: MITRE ATT&CK tactics with rule counts (total vs affected)
- affectedPlatform: primary platform impacted (e.g., AWS, Endpoint, Azure)
- recommendedActions: links to relevant Kibana pages and case creation

Continuity pipeline items include silence and volume health fields:
- silenceMs: milliseconds since the last event (null if stream never received events)
- isSilent: true when the silence gap exceeds the category-specific threshold
- lastFullDayDocs: document count for yesterday (the most recent complete day; the in-progress current day is excluded) (null if stream < 7 days old)
- baseline7dAvg: average daily doc count over the prior full days (null if stream < 7 days old)
- volumeDropPct: percentage drop vs baseline clamped to [0, ∞); null when baseline unavailable
- blastRadiusStatus (optional): reliability of the blast radius fields
  - 'unavailable': a required lookup failed; affectedRules/Tactics/Platform are omitted and MUST be shown as "unavailable (lookup failed)" — never as "none"
  - 'partial': at least one rule's index resolution failed; the fields shown may be undercounted — append "(may be incomplete)" when presenting them
  - omitted/undefined: blast radius is complete and trustworthy

Field mapping (tool output camelCase → attachment snake_case):
- pipeline name: name → pipeline_name
- failure rate: failedDocsCount / docsCount → failure_rate
- retention days: retentionDays → retention_days
- policy name: policyName → policy_name

Use the blast radius information to prioritize findings by impact. Always structure your response using the four-section format: Status → Summary → Findings by dimension then by category → Suggested Actions.
`;

// ---- Attachment type definition ----

export const createSiemReadinessAttachmentType = (): AttachmentTypeDefinition => ({
  id: SIEM_READINESS_ATTACHMENT_ID,
  validate: (input) => {
    const parseResult = siemReadinessAttachmentDataSchema.safeParse(input);
    if (parseResult.success) {
      return { valid: true, data: parseResult.data };
    }
    return { valid: false, error: parseResult.error.message };
  },
  format: (attachment: Attachment<string, unknown>, _context: AttachmentFormatContext) => {
    const parseResult = siemReadinessAttachmentDataSchema.safeParse(attachment.data);
    if (!parseResult.success) {
      throw new Error(`Invalid SIEM readiness attachment data for attachment ${attachment.id}`);
    }
    const data = parseResult.data;
    return {
      getRepresentation: () => {
        let text: string;
        switch (data.dimension) {
          case 'coverage':
            text = formatCoverageForAgent(data as CoveragePayload & { dimension: 'coverage' });
            break;
          case 'quality':
            text = formatQualityForAgent(data as QualityPayload & { dimension: 'quality' });
            break;
          case 'continuity':
            text = formatContinuityForAgent(
              data as ContinuityPayload & { dimension: 'continuity' }
            );
            break;
          case 'retention':
            text = formatRetentionForAgent(data as RetentionPayload & { dimension: 'retention' });
            break;
        }
        return { type: 'text', value: text };
      },
    };
  },
  getTools: () => [],
  getAgentDescription,
});
