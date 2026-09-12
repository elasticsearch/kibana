/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import { EuiLink } from '@elastic/eui';
import { KbnWarningCallout } from '@kbn/ui-callout';
import { useKibana } from '../../../../../../common/lib/kibana';

export const UPGRADE_CONFLICTS_MODAL_TITLE = i18n.translate(
  'xpack.securitySolution.detectionEngine.upgradeConflictsModal.messageTitle',
  {
    defaultMessage: 'Conflicts found',
  }
);

export const UPGRADE_CONFLICTS_MODAL_CANCEL = i18n.translate(
  'xpack.securitySolution.detectionEngine.upgradeConflictsModal.cancelTitle',
  {
    defaultMessage: 'Cancel',
  }
);

export const UPGRADE_RULES_WITHOUT_CONFLICTS = (rulesCount: number) =>
  i18n.translate(
    'xpack.securitySolution.detectionEngine.upgradeConflictsModal.upgradeRulesWithoutConflicts',
    {
      defaultMessage: 'Update {rulesCount, plural, =1 {rule} other {rules}} without conflicts',
      values: { rulesCount },
    }
  );

export const UPGRADE_RULES_WITH_CONFLICTS = (numOfRules: number) =>
  i18n.translate(
    'xpack.securitySolution.detectionEngine.upgradeConflictsModal.upgradeRulesWithConflicts',
    {
      defaultMessage: 'Update {numOfRules, plural, =1 {rule} other {rules}}',
      values: { numOfRules },
    }
  );

export const RULES_WITH_NON_SOLVABLE_CONFLICTS_TOTAL = (
  numOfRulesWithNonSolvableConflicts: number
) => (
  <FormattedMessage
    id="xpack.securitySolution.detectionEngine.upgradeConflictsModal.rulesWithNonSolvableConflictsTotal"
    defaultMessage="Rules with unresolved conflicts: {numOfRulesWithNonSolvableConflictsStrong}"
    values={{
      numOfRulesWithNonSolvableConflictsStrong: (
        <strong>{numOfRulesWithNonSolvableConflicts}</strong>
      ),
    }}
  />
);

export const RULES_WITH_SOLVABLE_CONFLICTS_TOTAL = ({
  numOfRulesWithSolvableConflicts,
  numOfRulesWithRuleTypeChange,
}: {
  numOfRulesWithSolvableConflicts: number;
  numOfRulesWithRuleTypeChange: number;
}) => (
  <>
    <FormattedMessage
      id="xpack.securitySolution.detectionEngine.upgradeConflictsModal.rulesWithSolvableConflictsTotal"
      defaultMessage="Rules with auto-resolved conflicts: {numOfRulesWithSolvableConflictsStrong}"
      values={{
        numOfRulesWithSolvableConflictsStrong: <strong>{numOfRulesWithSolvableConflicts}</strong>,
      }}
    />
    {numOfRulesWithRuleTypeChange > 0 && (
      <>
        {' '}
        <FormattedMessage
          id="xpack.securitySolution.detectionEngine.upgradeConflictsModal.rulesWithSolvableConflictsRuleTypeChangeSubset"
          defaultMessage="({numOfRulesWithRuleTypeChangeStrong} unmodified {numOfRulesWithRuleTypeChange, plural, =1 {rule with a rule type change} other {rules with rule type changes}})"
          values={{
            numOfRulesWithRuleTypeChange,
            numOfRulesWithRuleTypeChangeStrong: <strong>{numOfRulesWithRuleTypeChange}</strong>,
          }}
        />
      </>
    )}
  </>
);

export const RULES_WITHOUT_CONFLICTS_TOTAL = (numOfRulesWithoutConflicts: number) => (
  <FormattedMessage
    id="xpack.securitySolution.detectionEngine.upgradeConflictsModal.rulesWithoutConflictsTotal"
    defaultMessage="Rules without conflicts: {numOfRulesWithoutConflictsStrong}"
    values={{
      numOfRulesWithoutConflictsStrong: <strong>{numOfRulesWithoutConflicts}</strong>,
    }}
  />
);

export const RULES_WITH_NON_SOLVABLE_CONFLICTS_GUIDANCE = (
  numOfRulesWithNonSolvableConflicts: number
) => (
  <FormattedMessage
    id="xpack.securitySolution.detectionEngine.upgradeConflictsModal.rulesWithNonSolvableConflictsGuidance"
    defaultMessage="{numOfRulesWithNonSolvableConflictsStrong} {numOfRulesWithNonSolvableConflicts, plural, =1 {rule} other {rules}} with unresolved {numOfRulesWithNonSolvableConflicts, plural, =1 {conflict} other {conflicts}} can’t be updated until you fix the {numOfRulesWithNonSolvableConflicts, plural, =1 {conflict} other {conflicts}}."
    values={{
      numOfRulesWithNonSolvableConflicts,
      numOfRulesWithNonSolvableConflictsStrong: (
        <strong>{numOfRulesWithNonSolvableConflicts}</strong>
      ),
    }}
  />
);

const ACCEPT_SOLVABLE_CONFLICTS_WARNING = i18n.translate(
  'xpack.securitySolution.detectionEngine.upgradeConflictsModal.acceptSolvableConflictsWarning',
  {
    defaultMessage:
      'Only choose this option if you’re comfortable accepting the fixes Elastic suggested.',
  }
);

export const RULES_WITH_AUTO_RESOLVED_CONFLICTS_GUIDANCE = ({
  numOfRulesWithSolvableConflicts,
  numOfRulesWithoutConflicts,
  numOfRulesWithRuleTypeChange,
}: {
  numOfRulesWithSolvableConflicts: number;
  numOfRulesWithoutConflicts: number;
  numOfRulesWithRuleTypeChange: number;
}) => {
  const docsUrl = useKibana().services.docLinks.links.securitySolution.resolvePrebuiltRuleConflicts;

  return (
    <>
      <div>
        <FormattedMessage
          id="xpack.securitySolution.detectionEngine.upgradeConflictsModal.rulesWithAutoResolvedConflictsGuidance"
          defaultMessage="{numOfRulesWithSolvableConflictsStrong} {numOfRulesWithSolvableConflicts, plural, =1 {rule} other {rules}} with auto-resolved {numOfRulesWithSolvableConflicts, plural, =1 {conflict} other {conflicts}} can still be updated. Choose one of the following options:"
          values={{
            numOfRulesWithSolvableConflicts,
            numOfRulesWithSolvableConflictsStrong: (
              <strong>{numOfRulesWithSolvableConflicts}</strong>
            ),
          }}
        />
        <ul>
          <li>
            <FormattedMessage
              id="xpack.securitySolution.detectionEngine.upgradeConflictsModal.useRuleUpdateFlyout"
              defaultMessage="Use the rule update flyout to address auto-resolved conflicts. This is the safest option and gives you more control over the final update. {learnMoreLink}"
              values={{
                learnMoreLink: (
                  <EuiLink href={docsUrl} target="_blank">
                    <FormattedMessage
                      id="xpack.securitySolution.detectionEngine.upgradeConflictsModal.learnMore"
                      defaultMessage="Learn more"
                    />
                  </EuiLink>
                ),
              }}
            />
          </li>
          <li>
            <FormattedMessage
              id="xpack.securitySolution.detectionEngine.upgradeConflictsModal.bulkUpdateRules"
              defaultMessage="Click {updateRules} to bulk-update rules with auto-resolved conflicts and rules without conflicts."
              values={{
                updateRules: (
                  <strong>
                    {UPGRADE_RULES_WITH_CONFLICTS(
                      numOfRulesWithSolvableConflicts + numOfRulesWithoutConflicts
                    )}
                  </strong>
                ),
              }}
            />
          </li>
          <KbnWarningCallout
            title={ACCEPT_SOLVABLE_CONFLICTS_WARNING}
            data-test-subj="upgradeConflictsModalSolvableConflictsWarning"
            text={
              numOfRulesWithRuleTypeChange > 0 ? (
                <p data-test-subj="upgradeConflictsModalRuleTypeChangeWarning">
                  <FormattedMessage
                    id="xpack.securitySolution.detectionEngine.upgradeConflictsModal.rulesWithRuleTypeChangeWarning"
                    defaultMessage="Auto-resolved conflicts include a rule type change for {numOfRulesWithRuleTypeChangeStrong} unmodified {numOfRulesWithRuleTypeChange, plural, =1 {rule} other {rules}}. A rule type change can affect how the rule’s actions and exceptions are executed."
                    values={{
                      numOfRulesWithRuleTypeChange,
                      numOfRulesWithRuleTypeChangeStrong: (
                        <strong>{numOfRulesWithRuleTypeChange}</strong>
                      ),
                    }}
                  />
                </p>
              ) : undefined
            }
          />
        </ul>
      </div>
      <br />
    </>
  );
};

export const RULES_WITHOUT_CONFLICTS_GUIDANCE = (numOfRulesWithoutConflicts: number) => (
  <FormattedMessage
    id="xpack.securitySolution.detectionEngine.upgradeConflictsModal.rulesWithoutConflictsGuidance"
    defaultMessage="{numOfRulesWithoutConflictsStrong} {numOfRulesWithoutConflicts, plural, =1 {rule} other {rules}} without conflicts can still be updated by clicking {updateRulesWithoutConflicts}. Choose this option if you only want to update {numOfRulesWithoutConflicts, plural, =1 {the rule} other {rules}} without conflicts."
    values={{
      numOfRulesWithoutConflicts,
      numOfRulesWithoutConflictsStrong: <strong>{numOfRulesWithoutConflicts}</strong>,
      updateRulesWithoutConflicts: (
        <strong>{UPGRADE_RULES_WITHOUT_CONFLICTS(numOfRulesWithoutConflicts)}</strong>
      ),
    }}
  />
);
