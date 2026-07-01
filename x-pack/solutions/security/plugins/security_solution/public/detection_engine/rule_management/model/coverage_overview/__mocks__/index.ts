/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { CoverageOverviewDashboard } from '../dashboard';
import type { CoverageOverviewMitreSubTechnique } from '../mitre_subtechnique';
import type { CoverageOverviewMitreTactic } from '../mitre_tactic';
import type { CoverageOverviewMitreTechnique } from '../mitre_technique';
import type { CoverageOverviewRule } from '../rule';

export const getMockCoverageOverviewRule = (): CoverageOverviewRule => ({
  id: 'rule-id',
  name: 'test rule',
});

const mockCoverageOverviewRules = {
  enabledRules: [getMockCoverageOverviewRule()],
  disabledRules: [getMockCoverageOverviewRule()],
  availableRules: [getMockCoverageOverviewRule()],
};

export const getMockCoverageOverviewMitreTactic = (): CoverageOverviewMitreTactic => ({
  id: 'tactic-id',
  name: 'test tactic',
  reference: 'http://test-link',
  techniques: [],
  ...mockCoverageOverviewRules,
});

export const getMockCoverageOverviewMitreTechnique = (): CoverageOverviewMitreTechnique => ({
  id: 'technique-id',
  name: 'test technique',
  reference: 'http://test-link',
  subtechniques: [],
  ...mockCoverageOverviewRules,
});

export const getMockCoverageOverviewMitreSubTechnique = (): CoverageOverviewMitreSubTechnique => ({
  id: 'sub-technique-id',
  name: 'test sub-technique',
  reference: 'http://test-link',
  ...mockCoverageOverviewRules,
});

export const getMockCoverageOverviewDashboard = (): CoverageOverviewDashboard => ({
  mitreTactics: [getMockCoverageOverviewMitreTactic()],
  unmappedRules: {
    enabledRules: [],
    disabledRules: [],
    availableRules: [],
  },
  invalidlyMappedRules: {
    enabledRules: [],
    disabledRules: [],
  },
  metrics: {
    totalRulesCount: 3,
    totalEnabledRulesCount: 1,
  },
});

export const getMockCoverageOverviewTactics = () => [
  {
    name: 'Tactic 1',
    id: 'TA001',
    reference: 'https://some-link/TA001',
    label: 'Tactic 1',
    value: 'tactic1',
  },
  {
    name: 'Tactic 2',
    id: 'TA002',
    reference: 'https://some-link/TA002',
    label: 'Tactic 2',
    value: 'tactic2',
  },
];

export const getMockCoverageOverviewTechniques = () => [
  {
    name: 'Technique 1',
    id: 'T001',
    reference: 'https://some-link/T001',
    tactics: ['tactic-1'],
    label: 'Technique 1',
    value: 'technique1',
  },
  {
    name: 'Technique 2',
    id: 'T002',
    reference: 'https://some-link/T002',
    tactics: ['tactic-1', 'tactic-2'],
    label: 'Technique 2',
    value: 'technique2',
  },
];

export const getMockCoverageOverviewSubtechniques = () => [
  {
    name: 'Subtechnique 1',
    id: 'T001.001',
    reference: 'https://some-link/T001/001',
    tactics: ['tactic-1'],
    techniqueId: 'T001',
    label: 'Subtechnique 1',
    value: 'subtechnique1',
  },
  {
    name: 'Subtechnique 2',
    id: 'T001.002',
    reference: 'https://some-link/T001/002',
    tactics: ['tactic-1'],
    techniqueId: 'T001',
    label: 'Subtechnique 2',
    value: 'subtechnique2',
  },
];
