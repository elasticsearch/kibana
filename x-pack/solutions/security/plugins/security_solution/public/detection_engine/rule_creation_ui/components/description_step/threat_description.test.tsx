/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { render, screen, waitFor } from '@testing-library/react';
import React from 'react';
import type { Threats } from '@kbn/securitysolution-io-ts-alerting-types';
import { TestProviders } from '../../../../common/mock';
import { ThreatEuiFlexGroup } from './threat_description';

// Warning icons are gated behind the mitreAttackUpdatesUIEnabled feature flag,
// which is off by default. Force it on for this test suite.
jest.mock('../../../../common/hooks/use_experimental_features', () => ({
  useIsExperimentalFeatureEnabled: jest.fn().mockReturnValue(true),
}));

jest.mock('../../../../../common/detection_engine/mitre/mitre_tactics_techniques', () => ({
  tactics: [
    {
      id: 'TA0005',
      name: 'Defense Evasion',
      label: 'Defense Evasion (TA0005)',
      reference: 'https://attack.mitre.org/tactics/TA0005/',
      text: 'Defense Evasion',
      value: 'defenseEvasion',
    },
  ],
  techniques: [
    {
      id: 'T1548',
      name: 'Abuse Elevation Control Mechanism',
      label: 'Abuse Elevation Control Mechanism (T1548)',
      reference: 'https://attack.mitre.org/techniques/T1548/',
      tactics: ['defense-evasion'],
      value: 'abuseElevationControlMechanism',
    },
  ],
  subtechniques: [
    {
      id: 'T1548.002',
      name: 'Bypass User Account Control',
      label: 'Bypass User Account Control (T1548.002)',
      reference: 'https://attack.mitre.org/techniques/T1548/002/',
      tactics: ['defense-evasion'],
      techniqueId: 'T1548',
      value: 'bypassUserAccountControl',
    },
  ],
}));

const MITRE_FRAMEWORK = 'MITRE ATT&CK';

const renderThreat = (threat: Threats) =>
  render(
    <TestProviders>
      <ThreatEuiFlexGroup threat={threat} />
    </TestProviders>
  );

describe('ThreatEuiFlexGroup', () => {
  it('renders no warning when every tactic, technique, and subtechnique is in the dataset', async () => {
    const threat: Threats = [
      {
        framework: MITRE_FRAMEWORK,
        tactic: {
          id: 'TA0005',
          name: 'Defense Evasion',
          reference: 'https://attack.mitre.org/tactics/TA0005/',
        },
        technique: [
          {
            id: 'T1548',
            name: 'Abuse Elevation Control Mechanism',
            reference: 'https://attack.mitre.org/techniques/T1548/',
            subtechnique: [
              {
                id: 'T1548.002',
                name: 'Bypass User Account Control',
                reference: 'https://attack.mitre.org/techniques/T1548/002/',
              },
            ],
          },
        ],
      },
    ];

    renderThreat(threat);

    expect(await screen.findByText('Defense Evasion (TA0005)')).toBeInTheDocument();
    expect(screen.queryByTestId('threatUnsupportedMitreIdWarning-TA0005')).not.toBeInTheDocument();
    expect(screen.queryByTestId('threatUnsupportedMitreIdWarning-T1548')).not.toBeInTheDocument();
    expect(
      screen.queryByTestId('threatUnsupportedMitreIdWarning-T1548.002')
    ).not.toBeInTheDocument();
  });

  it('renders a warning icon next to an unsupported tactic id', async () => {
    const threat: Threats = [
      {
        framework: MITRE_FRAMEWORK,
        tactic: {
          id: 'TA9999',
          name: 'Outdated Tactic',
          reference: 'https://example.com/ta9999',
        },
        technique: [],
      },
    ];

    renderThreat(threat);

    expect(await screen.findByTestId('threatUnsupportedMitreIdWarning-TA9999')).toBeInTheDocument();
  });

  it('renders a warning icon next to an unsupported technique id', async () => {
    const threat: Threats = [
      {
        framework: MITRE_FRAMEWORK,
        tactic: {
          id: 'TA0005',
          name: 'Defense Evasion',
          reference: 'https://attack.mitre.org/tactics/TA0005/',
        },
        technique: [
          {
            id: 'T9999',
            name: 'Outdated Technique',
            reference: 'https://example.com/t9999',
          },
        ],
      },
    ];

    renderThreat(threat);

    expect(await screen.findByTestId('threatUnsupportedMitreIdWarning-T9999')).toBeInTheDocument();
    expect(screen.queryByTestId('threatUnsupportedMitreIdWarning-TA0005')).not.toBeInTheDocument();
  });

  it('renders a warning icon next to an unsupported subtechnique id', async () => {
    const threat: Threats = [
      {
        framework: MITRE_FRAMEWORK,
        tactic: {
          id: 'TA0005',
          name: 'Defense Evasion',
          reference: 'https://attack.mitre.org/tactics/TA0005/',
        },
        technique: [
          {
            id: 'T1548',
            name: 'Abuse Elevation Control Mechanism',
            reference: 'https://attack.mitre.org/techniques/T1548/',
            subtechnique: [
              {
                id: 'T1548.999',
                name: 'Outdated Subtechnique',
                reference: 'https://example.com/sub',
              },
            ],
          },
        ],
      },
    ];

    renderThreat(threat);

    expect(
      await screen.findByTestId('threatUnsupportedMitreIdWarning-T1548.999')
    ).toBeInTheDocument();
    expect(screen.queryByTestId('threatUnsupportedMitreIdWarning-T1548')).not.toBeInTheDocument();
  });

  it('does not show false-positive warnings before the MITRE dataset has loaded', async () => {
    const threat: Threats = [
      {
        framework: MITRE_FRAMEWORK,
        tactic: {
          id: 'TA0005',
          name: 'Defense Evasion',
          reference: 'https://attack.mitre.org/tactics/TA0005/',
        },
        technique: [],
      },
    ];

    const { container } = renderThreat(threat);

    // Synchronously: the lazy MITRE config hasn't resolved yet, so no warnings should render.
    expect(
      container.querySelector('[data-test-subj^="threatUnsupportedMitreIdWarning-"]')
    ).toBeNull();

    // After the dataset resolves, the supported tactic still has no warning.
    await waitFor(() => expect(screen.getByText('Defense Evasion (TA0005)')).toBeInTheDocument());
    expect(screen.queryByTestId('threatUnsupportedMitreIdWarning-TA0005')).not.toBeInTheDocument();
  });
});
