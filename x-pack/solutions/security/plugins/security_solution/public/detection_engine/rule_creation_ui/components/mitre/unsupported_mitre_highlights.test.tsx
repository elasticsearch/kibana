/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import type { Threats } from '@kbn/securitysolution-io-ts-alerting-types';

import { AddMitreAttackThreat } from '.';
import { TestProviders, useFormFieldMock } from '../../../../common/mock';

// Ghost options, "renamed from" hints, and form-row errors are gated behind
// the mitreAttackUpdatesUIEnabled feature flag, which is off by default.
// Force it on for this test suite.
jest.mock('../../../../common/hooks/use_experimental_features', () => ({
  useIsExperimentalFeatureEnabled: jest.fn().mockReturnValue(true),
}));

jest.mock('../../../../../common/detection_engine/mitre/mitre_tactics_techniques', () => ({
  tactics: [
    {
      name: 'Tactic 1',
      id: 'TA001',
      reference: 'https://example.com/TA001',
      label: 'Tactic 1',
      value: 'tactic1',
    },
    {
      name: 'Tactic 2',
      id: 'TA002',
      reference: 'https://example.com/TA002',
      label: 'Tactic 2',
      value: 'tactic2',
    },
  ],
  techniques: [
    {
      name: 'Technique 1',
      id: 'T001',
      reference: 'https://example.com/T001',
      tactics: ['tactic-1'],
      label: 'Technique 1',
      value: 'technique1',
    },
    // Belongs to Tactic 2 only - used to validate the reassigned-from-tactic path.
    {
      name: 'Moved Technique',
      id: 'T002',
      reference: 'https://example.com/T002',
      tactics: ['tactic-2'],
      label: 'Moved Technique',
      value: 'movedtechnique',
    },
  ],
  subtechniques: [
    {
      name: 'Subtechnique 1',
      id: 'T001.001',
      reference: 'https://example.com/T001/001',
      tactics: ['tactic-1'],
      techniqueId: 'T001',
      label: 'Subtechnique 1',
      value: 'subtechnique1',
    },
  ],
}));

const MITRE_FRAMEWORK = 'MITRE ATT&CK';

const renderWithThreats = (threats: Threats) => {
  const Component = () => {
    const field = useFormFieldMock<unknown>({ value: threats, label: 'MITRE' });
    return (
      <AddMitreAttackThreat
        dataTestSubj="dataTestSubj"
        idAria="idAria"
        isDisabled={false}
        field={field}
      />
    );
  };
  return render(<Component />, { wrapper: TestProviders });
};

describe('AddMitreAttackThreat - unsupported MITRE ID highlighting', () => {
  it('does not highlight anything when all referenced IDs are supported', async () => {
    const threats: Threats = [
      {
        framework: MITRE_FRAMEWORK,
        tactic: { id: 'TA001', name: 'Tactic 1', reference: '' },
        technique: [
          {
            id: 'T001',
            name: 'Technique 1',
            reference: '',
            subtechnique: [{ id: 'T001.001', name: 'Subtechnique 1', reference: '' }],
          },
        ],
      },
    ];

    renderWithThreats(threats);

    // wait for the lazy MITRE dataset load to settle before asserting absence
    await waitFor(() => {
      expect(screen.queryByText(/not in the currently supported MITRE/)).toBeNull();
    });
    expect(screen.queryByText(/Fake Tactic/)).toBeNull();
  });

  it('renders a ghost option and form-row error when the tactic ID is unsupported', async () => {
    const threats: Threats = [
      {
        framework: MITRE_FRAMEWORK,
        tactic: { id: 'TA9999', name: 'Fake Tactic', reference: '' },
        technique: [],
      },
    ];

    renderWithThreats(threats);

    expect(await screen.findByText('Fake Tactic (TA9999)')).toBeInTheDocument();
    expect(
      await screen.findByText(/"TA9999" is not in the currently supported MITRE/)
    ).toBeInTheDocument();
  });

  it('falls back to the id-only label when the stored tactic has no name', async () => {
    const threats: Threats = [
      {
        framework: MITRE_FRAMEWORK,
        tactic: { id: 'TA9999', name: '', reference: '' },
        technique: [],
      },
    ];

    renderWithThreats(threats);

    expect(await screen.findByText('TA9999')).toBeInTheDocument();
    expect(
      await screen.findByText(/"TA9999" is not in the currently supported MITRE/)
    ).toBeInTheDocument();
  });

  it('renders a ghost option and form-row error when the technique ID is unsupported', async () => {
    const threats: Threats = [
      {
        framework: MITRE_FRAMEWORK,
        tactic: { id: 'TA001', name: 'Tactic 1', reference: '' },
        technique: [
          {
            id: 'T9999',
            name: 'Fake Technique',
            reference: '',
          },
        ],
      },
    ];

    renderWithThreats(threats);

    expect(await screen.findByText('Fake Technique (T9999)')).toBeInTheDocument();
    expect(
      await screen.findByText(/"T9999" is not in the currently supported MITRE/)
    ).toBeInTheDocument();
  });

  it('renders a ghost option and form-row error when the subtechnique ID is unsupported', async () => {
    const threats: Threats = [
      {
        framework: MITRE_FRAMEWORK,
        tactic: { id: 'TA001', name: 'Tactic 1', reference: '' },
        technique: [
          {
            id: 'T001',
            name: 'Technique 1',
            reference: '',
            subtechnique: [{ id: 'T001.999', name: 'Fake Subtechnique', reference: '' }],
          },
        ],
      },
    ];

    renderWithThreats(threats);

    expect(await screen.findByText('Fake Subtechnique (T001.999)')).toBeInTheDocument();
    expect(
      await screen.findByText(/"T001.999" is not in the currently supported MITRE/)
    ).toBeInTheDocument();
  });
});

describe('AddMitreAttackThreat - renamed MITRE entity handling', () => {
  it('renders the tactic with its current dataset name and a "renamed from" hint when the stored name has drifted', async () => {
    const threats: Threats = [
      {
        framework: MITRE_FRAMEWORK,
        // Same id as the dataset, but the saved name predates a rename.
        tactic: { id: 'TA001', name: 'Tactic Old Name', reference: '' },
        technique: [],
      },
    ];

    renderWithThreats(threats);

    // Trigger reflects the current dataset label rather than rendering blank.
    expect(await screen.findByText('Tactic 1')).toBeInTheDocument();
    // Helper text explains the drift to the user.
    expect(await screen.findByText(/Renamed from "Tactic Old Name"/)).toBeInTheDocument();
    // Not flagged as unsupported (the id is still in the dataset).
    expect(screen.queryByText(/is not in the currently supported MITRE/)).toBeNull();
    expect(screen.queryByText(/\(unsupported\)/)).toBeNull();
  });

  it('still resolves the technique cascade when the parent tactic has been renamed', async () => {
    const threats: Threats = [
      {
        framework: MITRE_FRAMEWORK,
        tactic: { id: 'TA001', name: 'Tactic Old Name', reference: '' },
        technique: [{ id: 'T001', name: 'Technique 1', reference: '' }],
      },
    ];

    renderWithThreats(threats);

    // The technique trigger renders its label (not the placeholder), proving
    // the technique was matched against the parent tactic resolved by id.
    expect(await screen.findByText('Technique 1')).toBeInTheDocument();
    // No "unsupported" indicators for the technique row either.
    expect(screen.queryByText(/T001 \(unsupported\)/)).toBeNull();
  });

  it('renders the technique with its current dataset name and a "renamed from" hint', async () => {
    const threats: Threats = [
      {
        framework: MITRE_FRAMEWORK,
        tactic: { id: 'TA001', name: 'Tactic 1', reference: '' },
        technique: [{ id: 'T001', name: 'Technique Old Name', reference: '' }],
      },
    ];

    renderWithThreats(threats);

    expect(await screen.findByText('Technique 1')).toBeInTheDocument();
    expect(await screen.findByText(/Renamed from "Technique Old Name"/)).toBeInTheDocument();
  });

  it('renders the subtechnique with its current dataset name and a "renamed from" hint', async () => {
    const threats: Threats = [
      {
        framework: MITRE_FRAMEWORK,
        tactic: { id: 'TA001', name: 'Tactic 1', reference: '' },
        technique: [
          {
            id: 'T001',
            name: 'Technique 1',
            reference: '',
            subtechnique: [{ id: 'T001.001', name: 'Subtechnique Old Name', reference: '' }],
          },
        ],
      },
    ];

    renderWithThreats(threats);

    expect(await screen.findByText('Subtechnique 1')).toBeInTheDocument();
    expect(await screen.findByText(/Renamed from "Subtechnique Old Name"/)).toBeInTheDocument();
  });

  it('does not show a "renamed from" hint when the stored names match the dataset', async () => {
    const threats: Threats = [
      {
        framework: MITRE_FRAMEWORK,
        tactic: { id: 'TA001', name: 'Tactic 1', reference: '' },
        technique: [
          {
            id: 'T001',
            name: 'Technique 1',
            reference: '',
            subtechnique: [{ id: 'T001.001', name: 'Subtechnique 1', reference: '' }],
          },
        ],
      },
    ];

    renderWithThreats(threats);

    await waitFor(() => {
      expect(screen.queryByText(/Renamed from/)).toBeNull();
    });
  });

  it('renders a ghost option and form-row error when the technique was reassigned to a different tactic', async () => {
    // T002 lives under Tactic 2 in the dataset but the rule still stores it
    // under Tactic 1 - this previously left the technique select blank.
    const threats: Threats = [
      {
        framework: MITRE_FRAMEWORK,
        tactic: { id: 'TA001', name: 'Tactic 1', reference: '' },
        technique: [
          {
            id: 'T002',
            name: 'Moved Technique',
            reference: '',
          },
        ],
      },
    ];

    renderWithThreats(threats);

    expect(await screen.findByText('Moved Technique (T002)')).toBeInTheDocument();
    expect(
      await screen.findByText(/"T002" is no longer assigned to the selected tactic/)
    ).toBeInTheDocument();
    // Reassigned technique is still in the dataset, so we don't mislead users
    // by flagging it as removed.
    expect(screen.queryByText(/"T002" is not in the currently supported MITRE/)).toBeNull();
  });
});
