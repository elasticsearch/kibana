/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import { collectTechPreviewSuggestAriaPrefixes } from './collect_tech_preview_suggest_aria_prefixes';

jest.mock('../../connectors_cache', () => ({
  getCachedAllConnectors: jest.fn(),
}));

jest.mock('../../../../../trigger_schemas', () => ({
  triggerSchemas: {
    getTriggerDefinitions: jest.fn(),
  },
}));

jest.mock('@kbn/workflows', () => ({
  builtInStepDefinitions: [
    { id: 'workflow.execute' },
    { id: 'workflow.executeAsync' },
    { id: 'wait' },
  ],
  getBuiltInStepStability: jest.fn((type: string) => {
    if (type === 'workflow.execute' || type === 'workflow.executeAsync') {
      return 'tech_preview';
    }
    return undefined;
  }),
}));

jest.mock('../../get_stability_note', () => {
  const actual = jest.requireActual('../../get_stability_note');
  return {
    getExtensionStability: actual.getExtensionStability,
  };
});

jest.mock('../../../../../../common/step_schemas', () => ({
  stepSchemas: {
    getAllRegisteredStepDefinitions: jest.fn(() => []),
  },
}));

jest.mock('../../../../../../common/step_schemas', () => ({
  stepSchemas: {
    getAllRegisteredStepDefinitions: jest.fn(() => []),
  },
}));

import { stepSchemas } from '../../../../../../common/step_schemas';
import { triggerSchemas } from '../../../../../trigger_schemas';
import { getCachedAllConnectors } from '../../connectors_cache';

describe('collectTechPreviewSuggestAriaPrefixes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (triggerSchemas.getTriggerDefinitions as jest.Mock).mockReturnValue([
      { id: 'cases.caseCreated', title: 'Case Created' },
    ]);
    (getCachedAllConnectors as jest.Mock).mockReturnValue([
      {
        type: 'kibana.streams.list',
        summary: 'List Streams',
        stability: 'tech_preview',
      },
      {
        type: 'elasticsearch.search',
        stability: 'stable',
      },
    ]);
  });

  it('includes event-driven trigger ids and tech preview steps/connectors', () => {
    const prefixes = collectTechPreviewSuggestAriaPrefixes();

    expect(prefixes).toEqual(
      expect.arrayContaining([
        'cases.caseCreated',
        'workflow.execute',
        'workflow.executeAsync',
        'kibana.streams.list',
      ])
    );
    expect(prefixes).not.toContain('elasticsearch.search');
  });

  it('includes dynamic connector display name prefixes', () => {
    (getCachedAllConnectors as jest.Mock).mockReturnValue([
      {
        type: 'my.custom.connector',
        summary: 'My Custom connector',
        stability: 'tech_preview',
      },
    ]);

    const prefixes = collectTechPreviewSuggestAriaPrefixes();

    expect(prefixes).toContain('my.custom.connector');
    expect(prefixes).toContain('My Custom');
  });

  it('includes extension step ids marked tech preview', () => {
    (stepSchemas.getAllRegisteredStepDefinitions as jest.Mock).mockReturnValue([
      { id: 'custom.stable', stability: 'stable' },
      { id: 'custom.experimental' },
    ]);

    const prefixes = collectTechPreviewSuggestAriaPrefixes();

    expect(prefixes).toContain('custom.experimental');
    expect(prefixes).not.toContain('custom.stable');
  });
});
