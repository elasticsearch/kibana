/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ActionableFinding, RecommendedAction } from './types';

type FindingType = `${string}:${string}`;

type ActionBuilder = (finding: ActionableFinding) => RecommendedAction[];

export const recommendedActionsRegistry = new Map<FindingType, ActionBuilder>();

const createResourceSlug = (resource: string): string => {
  return resource
    .replace(/[^a-z0-9-]/gi, '-')
    .toLowerCase()
    .slice(0, 50);
};

export const getDefaultActions = (
  finding: ActionableFinding,
  dimension: string,
  caseTag?: string
): RecommendedAction[] => {
  const slug = createResourceSlug(finding.resource);
  const tag = caseTag ?? finding.severity.toLowerCase();

  return [
    {
      label: 'View affected rules',
      href: `/app/security/rules?index=${encodeURIComponent(finding.resource)}`,
    },
    {
      label: 'Open case',
      href: `/app/security/cases/create?tags=readiness:${dimension},${tag},${slug}`,
    },
  ];
};

export const getDimensionActions = (dimension: string): RecommendedAction[] => {
  switch (dimension) {
    case 'continuity':
      return [{ label: 'Open ingest pipelines', href: '/app/management/ingest/ingest_pipelines' }];
    case 'retention':
      return [
        { label: 'Open ILM policies', href: '/app/management/data/index_lifecycle_management' },
      ];
    case 'quality':
      return [{ label: 'Open Data Quality', href: '/app/security/data_quality' }];
    case 'coverage':
      return [{ label: 'View rule coverage', href: '/app/security/rules/coverage' }];
    default:
      return [];
  }
};

const getSilenceActions = (finding: ActionableFinding): RecommendedAction[] => [
  { label: 'Check Fleet integrations', href: '/app/integrations' },
  ...getDefaultActions(finding, 'continuity', 'silence'),
];

const getVolumeDropActions = (finding: ActionableFinding): RecommendedAction[] => [
  { label: 'Review integration policy', href: '/app/integrations' },
  { label: 'Open ingest pipelines', href: '/app/management/ingest/ingest_pipelines' },
  ...getDefaultActions(finding, 'continuity', 'volume-drop'),
];

export const buildRecommendedActions = (
  finding: ActionableFinding,
  dimension: string
): RecommendedAction[] => {
  if (dimension === 'continuity') {
    if (finding.type === 'silence') return getSilenceActions(finding);
    if (finding.type === 'volume_drop_warning' || finding.type === 'volume_drop_critical') {
      return getVolumeDropActions(finding);
    }
  }
  const findingType: FindingType = `${dimension}:${finding.category ?? 'general'}`;
  const customBuilder = recommendedActionsRegistry.get(findingType);

  if (customBuilder) {
    return customBuilder(finding);
  }

  return [...getDimensionActions(dimension), ...getDefaultActions(finding, dimension)];
};
