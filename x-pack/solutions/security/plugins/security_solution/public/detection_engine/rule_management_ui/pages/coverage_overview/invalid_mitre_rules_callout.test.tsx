/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { TestProviders } from '../../../../common/mock';
import { CoverageOverviewInvalidMitreRulesCallout } from './invalid_mitre_rules_callout';
import { MITRE_ATTACK_VERSION } from '../../../../../common/detection_engine/mitre/mitre_version';
import type { CoverageOverviewDashboard } from '../../../rule_management/model/coverage_overview/dashboard';

const emptyInvalidlyMappedRules: CoverageOverviewDashboard['invalidlyMappedRules'] = {
  enabledRules: [],
  disabledRules: [],
};

const renderCallout = (
  props: React.ComponentProps<typeof CoverageOverviewInvalidMitreRulesCallout>
) =>
  render(
    <TestProviders>
      <CoverageOverviewInvalidMitreRulesCallout {...props} />
    </TestProviders>
  );

describe('CoverageOverviewInvalidMitreRulesCallout', () => {
  it('renders nothing when there are no invalidly mapped rules', () => {
    const { container } = renderCallout({ invalidlyMappedRules: emptyInvalidlyMappedRules });
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the callout with singular description when there is one invalid rule', () => {
    renderCallout({
      invalidlyMappedRules: {
        enabledRules: [{ id: 'rule-1', name: 'Enabled rule', invalidMitreIds: ['TA9999'] }],
        disabledRules: [],
      },
    });

    const callout = screen.getByTestId('coverageOverviewInvalidMitreRulesCallout');
    expect(callout).toBeInTheDocument();
    expect(callout.textContent).toContain('You have 1 rule that references MITRE ATT&CK® IDs');
    expect(callout.textContent).toContain(`currently supported version (${MITRE_ATTACK_VERSION})`);
    expect(callout.textContent).toContain('Elastic prebuilt rule mappings were updated');
    expect(
      screen.getByTestId('coverageOverviewInvalidMitreRulesLearnMoreLink')
    ).toBeInTheDocument();
    expect(screen.getByTestId('coverageOverviewInvalidMitreRulesViewButton')).toBeInTheDocument();
    expect(screen.queryByTestId('coverageOverviewInvalidMitreRulesModal')).not.toBeInTheDocument();
  });

  it('uses plural description when there are multiple invalid rules', () => {
    renderCallout({
      invalidlyMappedRules: {
        enabledRules: [{ id: 'rule-1', name: 'Enabled rule', invalidMitreIds: ['TA9999'] }],
        disabledRules: [{ id: 'rule-2', name: 'Disabled rule', invalidMitreIds: ['T9999'] }],
      },
    });

    const callout = screen.getByTestId('coverageOverviewInvalidMitreRulesCallout');
    expect(callout.textContent).toContain('You have 2 rules that reference MITRE ATT&CK® IDs');
  });

  it('renders the outdated-mappings warning title', () => {
    renderCallout({
      invalidlyMappedRules: {
        enabledRules: [{ id: 'rule-1', name: 'Enabled rule', invalidMitreIds: ['TA9999'] }],
        disabledRules: [],
      },
    });

    expect(screen.getByText(/Some rules have outdated MITRE ATT&CK® mappings/)).toBeInTheDocument();
  });

  it('opens the modal with all invalid rules grouped by status', async () => {
    const user = userEvent.setup();

    renderCallout({
      invalidlyMappedRules: {
        enabledRules: [
          {
            id: 'rule-enabled',
            name: 'Enabled rule with bad MITRE',
            invalidMitreIds: ['TA9999', 'T9999'],
          },
        ],
        disabledRules: [
          {
            id: 'rule-disabled',
            name: 'Disabled rule with bad MITRE',
            invalidMitreIds: ['T1234.999'],
          },
        ],
      },
    });

    await user.click(screen.getByTestId('coverageOverviewInvalidMitreRulesViewButton'));

    expect(screen.getByTestId('coverageOverviewInvalidMitreRulesModal')).toBeInTheDocument();
    expect(screen.getByText('Enabled rule with bad MITRE')).toBeInTheDocument();
    expect(screen.getByText('Disabled rule with bad MITRE')).toBeInTheDocument();
    expect(screen.getByTestId('coverageOverviewInvalidMitreBadge-TA9999')).toHaveAttribute(
      'href',
      'https://attack.mitre.org/tactics/TA9999/'
    );
    expect(screen.getByTestId('coverageOverviewInvalidMitreBadge-T9999')).toHaveAttribute(
      'href',
      'https://attack.mitre.org/techniques/T9999/'
    );
    expect(screen.getByTestId('coverageOverviewInvalidMitreBadge-T1234.999')).toHaveAttribute(
      'href',
      'https://attack.mitre.org/techniques/T1234/999/'
    );
    expect(screen.getByRole('heading', { name: 'Enabled rules' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Disabled rules' })).toBeInTheDocument();
  });

  it('renders a flat list (no section headers) when only one group has rules', async () => {
    const user = userEvent.setup();

    renderCallout({
      invalidlyMappedRules: {
        enabledRules: [
          { id: 'rule-enabled-only', name: 'Enabled rule', invalidMitreIds: ['TA9999'] },
        ],
        disabledRules: [],
      },
    });

    await user.click(screen.getByTestId('coverageOverviewInvalidMitreRulesViewButton'));

    expect(screen.getByTestId('coverageOverviewInvalidMitreRulesModal')).toBeInTheDocument();
    expect(screen.getByText('Enabled rule')).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Enabled rules' })).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Disabled rules' })).not.toBeInTheDocument();
  });

  it('closes the modal via the close button', async () => {
    const user = userEvent.setup();

    renderCallout({
      invalidlyMappedRules: {
        enabledRules: [{ id: 'rule-1', name: 'Some rule', invalidMitreIds: ['TA9999'] }],
        disabledRules: [],
      },
    });

    await user.click(screen.getByTestId('coverageOverviewInvalidMitreRulesViewButton'));
    expect(screen.getByTestId('coverageOverviewInvalidMitreRulesModal')).toBeInTheDocument();

    await user.click(screen.getByTestId('coverageOverviewInvalidMitreRulesModalCloseButton'));
    expect(screen.queryByTestId('coverageOverviewInvalidMitreRulesModal')).not.toBeInTheDocument();
  });
});
