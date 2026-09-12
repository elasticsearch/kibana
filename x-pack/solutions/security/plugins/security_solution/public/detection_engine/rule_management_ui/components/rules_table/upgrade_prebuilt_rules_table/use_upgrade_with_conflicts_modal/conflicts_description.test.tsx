/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { render } from '@testing-library/react';
import React from 'react';
import { ConflictsDescription } from './conflicts_description';
import { TestProviders } from '../../../../../../common/mock';

// Removes extra whitespace from the text content to make it easier to compare
function normalizeText(text: string | null): string {
  return (text ?? '').replace(/\s+/g, ' ').trim();
}

describe('UpgradeConflictsDescription displays proper text when there are', () => {
  it('only rules with solvable conflicts', () => {
    const { container } = render(
      <ConflictsDescription
        numOfRulesWithoutConflicts={0}
        numOfRulesWithSolvableConflicts={5}
        numOfRulesWithNonSolvableConflicts={0}
        numOfRulesWithRuleTypeChange={0}
      />,
      { wrapper: TestProviders }
    );

    const expectedText = [
      'Rules with auto-resolved conflicts: 5',
      '5 rules with auto-resolved conflicts can still be updated. Choose one of the following options:',
      'Use the rule update flyout to address auto-resolved conflicts. This is the safest option and gives you more control over the final update. Learn more(external, opens in a new tab or window)',
      'Click Update rules to bulk-update rules with auto-resolved conflicts and rules without conflicts.',
      'Only choose this option if you’re comfortable accepting the fixes Elastic suggested.',
    ].join('');

    expect(normalizeText(container.textContent)).toBe(normalizeText(expectedText));
  });

  it('only rules with non-solvable conflicts', () => {
    const { container } = render(
      <ConflictsDescription
        numOfRulesWithoutConflicts={0}
        numOfRulesWithSolvableConflicts={0}
        numOfRulesWithNonSolvableConflicts={5}
        numOfRulesWithRuleTypeChange={0}
      />,
      { wrapper: TestProviders }
    );

    const expectedText = [
      'Rules with unresolved conflicts: 5',
      '5 rules with unresolved conflicts can’t be updated until you fix the conflicts.',
    ].join('');

    expect(normalizeText(container.textContent)).toBe(normalizeText(expectedText));
  });

  it('rules with solvable conflicts and rules with non-solvable conflicts', () => {
    const { container } = render(
      <ConflictsDescription
        numOfRulesWithoutConflicts={0}
        numOfRulesWithSolvableConflicts={3}
        numOfRulesWithNonSolvableConflicts={5}
        numOfRulesWithRuleTypeChange={0}
      />,
      { wrapper: TestProviders }
    );

    const expectedText = [
      'Rules with unresolved conflicts: 5',
      'Rules with auto-resolved conflicts: 3',
      '5 rules with unresolved conflicts can’t be updated until you fix the conflicts.',
      '3 rules with auto-resolved conflicts can still be updated. Choose one of the following options:',
      'Use the rule update flyout to address auto-resolved conflicts. This is the safest option and gives you more control over the final update. Learn more(external, opens in a new tab or window)',
      'Click Update rules to bulk-update rules with auto-resolved conflicts and rules without conflicts.',
      'Only choose this option if you’re comfortable accepting the fixes Elastic suggested.',
    ].join('');

    expect(normalizeText(container.textContent)).toBe(normalizeText(expectedText));
  });

  it('rules with solvable conflicts and conflict-free rules', () => {
    const { container } = render(
      <ConflictsDescription
        numOfRulesWithoutConflicts={10}
        numOfRulesWithSolvableConflicts={3}
        numOfRulesWithNonSolvableConflicts={0}
        numOfRulesWithRuleTypeChange={0}
      />,
      { wrapper: TestProviders }
    );

    const expectedText = [
      'Rules with auto-resolved conflicts: 3',
      'Rules without conflicts: 10',
      '3 rules with auto-resolved conflicts can still be updated. Choose one of the following options:',
      'Use the rule update flyout to address auto-resolved conflicts. This is the safest option and gives you more control over the final update. Learn more(external, opens in a new tab or window)',
      'Click Update rules to bulk-update rules with auto-resolved conflicts and rules without conflicts.',
      'Only choose this option if you’re comfortable accepting the fixes Elastic suggested.',
      '10 rules without conflicts can still be updated by clicking Update rules without conflicts. Choose this option if you only want to update rules without conflicts.',
    ].join('');

    expect(normalizeText(container.textContent)).toBe(normalizeText(expectedText));
  });

  it('rules with non-solvable conflicts and conflict-free rules', () => {
    const { container } = render(
      <ConflictsDescription
        numOfRulesWithoutConflicts={10}
        numOfRulesWithSolvableConflicts={0}
        numOfRulesWithNonSolvableConflicts={5}
        numOfRulesWithRuleTypeChange={0}
      />,
      { wrapper: TestProviders }
    );

    const expectedText = [
      'Rules with unresolved conflicts: 5',
      'Rules without conflicts: 10',
      '5 rules with unresolved conflicts can’t be updated until you fix the conflicts.',
      '10 rules without conflicts can still be updated by clicking Update rules without conflicts. Choose this option if you only want to update rules without conflicts.',
    ].join('');

    expect(normalizeText(container.textContent)).toBe(normalizeText(expectedText));
  });

  it('rules with non-solvable conflicts, rules with solvable conflicts and conflict-free rules', () => {
    const { container } = render(
      <ConflictsDescription
        numOfRulesWithoutConflicts={10}
        numOfRulesWithSolvableConflicts={3}
        numOfRulesWithNonSolvableConflicts={5}
        numOfRulesWithRuleTypeChange={0}
      />,
      { wrapper: TestProviders }
    );

    const expectedText = [
      'Rules with unresolved conflicts: 5',
      'Rules with auto-resolved conflicts: 3',
      'Rules without conflicts: 10',
      '5 rules with unresolved conflicts can’t be updated until you fix the conflicts.',
      '3 rules with auto-resolved conflicts can still be updated. Choose one of the following options:',
      'Use the rule update flyout to address auto-resolved conflicts. This is the safest option and gives you more control over the final update. Learn more(external, opens in a new tab or window)',
      'Click Update rules to bulk-update rules with auto-resolved conflicts and rules without conflicts.',
      'Only choose this option if you’re comfortable accepting the fixes Elastic suggested.',
      '10 rules without conflicts can still be updated by clicking Update rules without conflicts. Choose this option if you only want to update rules without conflicts.',
    ].join('');

    expect(normalizeText(container.textContent)).toBe(normalizeText(expectedText));
  });

  it('rules with solvable conflicts including rule type changes', () => {
    const { container } = render(
      <ConflictsDescription
        numOfRulesWithoutConflicts={0}
        numOfRulesWithSolvableConflicts={5}
        numOfRulesWithNonSolvableConflicts={0}
        numOfRulesWithRuleTypeChange={2}
      />,
      { wrapper: TestProviders }
    );

    const expectedText = [
      'Rules with auto-resolved conflicts: 5 (2 unmodified rules with rule type changes)',
      '5 rules with auto-resolved conflicts can still be updated. Choose one of the following options:',
      'Use the rule update flyout to address auto-resolved conflicts. This is the safest option and gives you more control over the final update. Learn more(external, opens in a new tab or window)',
      'Click Update rules to bulk-update rules with auto-resolved conflicts and rules without conflicts.',
      'Only choose this option if you’re comfortable accepting the fixes Elastic suggested.',
      'Auto-resolved conflicts include a rule type change for 2 unmodified rules. A rule type change can affect how the rule’s actions and exceptions are executed.',
    ].join('');

    expect(normalizeText(container.textContent)).toBe(normalizeText(expectedText));
  });

  it('a single rule with a solvable conflict that is a rule type change', () => {
    const { container } = render(
      <ConflictsDescription
        numOfRulesWithoutConflicts={0}
        numOfRulesWithSolvableConflicts={1}
        numOfRulesWithNonSolvableConflicts={0}
        numOfRulesWithRuleTypeChange={1}
      />,
      { wrapper: TestProviders }
    );

    expect(normalizeText(container.textContent)).toContain(
      'Rules with auto-resolved conflicts: 1 (1 unmodified rule with a rule type change)'
    );
    expect(normalizeText(container.textContent)).toContain(
      'Auto-resolved conflicts include a rule type change for 1 unmodified rule. A rule type change can affect how the rule’s actions and exceptions are executed.'
    );
  });
});
