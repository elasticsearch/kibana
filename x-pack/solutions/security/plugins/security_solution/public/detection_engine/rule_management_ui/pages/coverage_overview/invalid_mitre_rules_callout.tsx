/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useCallback, useState } from 'react';
import {
  EuiBadge,
  EuiButton,
  EuiButtonEmpty,
  EuiCallOut,
  EuiFlexGroup,
  EuiFlexItem,
  EuiLink,
  EuiModal,
  EuiModalBody,
  EuiModalFooter,
  EuiModalHeader,
  EuiModalHeaderTitle,
  EuiSpacer,
  EuiText,
  EuiTitle,
  EuiToolTip,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { MITRE_ATTACK_VERSION } from '../../../../../common/detection_engine/mitre/mitre_version';
import { buildMitreReferenceUrl } from '../../../../../common/detection_engine/mitre/build_mitre_reference_url';
import { useKibana } from '../../../../common/lib/kibana';
import type {
  CoverageOverviewDashboard,
  CoverageOverviewRuleWithInvalidMitre,
} from '../../../rule_management/model/coverage_overview/dashboard';
import { RuleLink } from '../../components/rules_table/use_columns';
import * as i18n from './translations';

interface RuleListProps {
  rules: CoverageOverviewRuleWithInvalidMitre[];
}

const InvalidMitreBadge = memo(({ id }: { id: string }) => {
  const href = buildMitreReferenceUrl(id);

  if (!href) {
    return (
      <EuiBadge color="warning" data-test-subj={`coverageOverviewInvalidMitreBadge-${id}`}>
        {id}
      </EuiBadge>
    );
  }

  return (
    <EuiToolTip content={i18n.INVALID_MITRE_ID_BADGE_TOOLTIP(id)}>
      <EuiBadge
        color="warning"
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        iconType="popout"
        iconSide="right"
        data-test-subj={`coverageOverviewInvalidMitreBadge-${id}`}
      >
        {id}
      </EuiBadge>
    </EuiToolTip>
  );
});
InvalidMitreBadge.displayName = 'InvalidMitreBadge';

const RuleList = memo(({ rules }: RuleListProps) => (
  <EuiFlexGroup direction="column" gutterSize="s">
    {rules.map((rule) => (
      <EuiFlexItem key={rule.id} grow={false}>
        <EuiFlexGroup alignItems="center" gutterSize="s" wrap>
          <EuiFlexItem grow={false}>
            <RuleLink name={rule.name} id={rule.id} />
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiFlexGroup gutterSize="xs" wrap>
              {rule.invalidMitreIds.map((id) => (
                <EuiFlexItem key={id} grow={false}>
                  <InvalidMitreBadge id={id} />
                </EuiFlexItem>
              ))}
            </EuiFlexGroup>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexItem>
    ))}
  </EuiFlexGroup>
));
RuleList.displayName = 'RuleList';

export interface CoverageOverviewInvalidMitreRulesCalloutProps {
  invalidlyMappedRules: CoverageOverviewDashboard['invalidlyMappedRules'];
}

const CoverageOverviewInvalidMitreRulesCalloutComponent = ({
  invalidlyMappedRules,
}: CoverageOverviewInvalidMitreRulesCalloutProps) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const modalTitleId = useGeneratedHtmlId();
  const { docLinks } = useKibana().services;

  const closeModal = useCallback(() => setIsModalOpen(false), []);
  const openModal = useCallback(() => setIsModalOpen(true), []);

  const { enabledRules, disabledRules } = invalidlyMappedRules;
  const invalidCount = enabledRules.length + disabledRules.length;

  if (invalidCount === 0) {
    return null;
  }

  // Show section headers only when both groups are non-empty; otherwise render a flat list.
  const showSections = enabledRules.length > 0 && disabledRules.length > 0;

  return (
    <>
      <EuiCallOut
        announceOnMount={false}
        data-test-subj="coverageOverviewInvalidMitreRulesCallout"
        title={i18n.INVALID_MITRE_RULES_CALLOUT_TITLE}
        color="warning"
        iconType="warning"
      >
        <p>
          <FormattedMessage
            id="xpack.securitySolution.coverageOverviewDashboard.invalidMitreRulesCallout.description"
            defaultMessage="You have {count, plural, one {# rule that references} other {# rules that reference}} MITRE ATT&CK® IDs not present in the currently supported version ({version}). They may not appear correctly in the coverage matrix. {learnMoreLink}"
            values={{
              count: invalidCount,
              version: MITRE_ATTACK_VERSION,
              learnMoreLink: (
                <EuiLink
                  href={docLinks.links.siem.mitreCoverage}
                  target="_blank"
                  data-test-subj="coverageOverviewInvalidMitreRulesLearnMoreLink"
                >
                  {i18n.INVALID_MITRE_RULES_CALLOUT_DESCRIPTION_LEARN_MORE}
                </EuiLink>
              ),
            }}
          />
        </p>
        <p>{i18n.INVALID_MITRE_RULES_CALLOUT_PREBUILT_NOTICE}</p>
        <EuiButton
          data-test-subj="coverageOverviewInvalidMitreRulesViewButton"
          color="warning"
          size="s"
          onClick={openModal}
        >
          {i18n.INVALID_MITRE_RULES_VIEW_RULES_BUTTON}
        </EuiButton>
      </EuiCallOut>
      <EuiSpacer size="m" />

      {isModalOpen && (
        <EuiModal
          aria-labelledby={modalTitleId}
          data-test-subj="coverageOverviewInvalidMitreRulesModal"
          onClose={closeModal}
          maxWidth={800}
        >
          <EuiModalHeader>
            <EuiModalHeaderTitle id={modalTitleId}>
              {i18n.INVALID_MITRE_RULES_MODAL_TITLE}
            </EuiModalHeaderTitle>
          </EuiModalHeader>
          <EuiModalBody>
            <EuiText size="s" color="subdued">
              <p>{i18n.INVALID_MITRE_RULES_MODAL_DESCRIPTION}</p>
            </EuiText>
            <EuiSpacer size="m" />

            {showSections ? (
              <>
                <EuiTitle size="xxs">
                  <h3>{i18n.INVALID_MITRE_RULES_MODAL_ENABLED_SECTION}</h3>
                </EuiTitle>
                <EuiSpacer size="s" />
                <RuleList rules={enabledRules} />
                <EuiSpacer size="m" />
                <EuiTitle size="xxs">
                  <h3>{i18n.INVALID_MITRE_RULES_MODAL_DISABLED_SECTION}</h3>
                </EuiTitle>
                <EuiSpacer size="s" />
                <RuleList rules={disabledRules} />
              </>
            ) : (
              <RuleList rules={[...enabledRules, ...disabledRules]} />
            )}
          </EuiModalBody>
          <EuiModalFooter>
            <EuiButtonEmpty
              data-test-subj="coverageOverviewInvalidMitreRulesModalCloseButton"
              onClick={closeModal}
            >
              {i18n.INVALID_MITRE_RULES_MODAL_CLOSE}
            </EuiButtonEmpty>
          </EuiModalFooter>
        </EuiModal>
      )}
    </>
  );
};

export const CoverageOverviewInvalidMitreRulesCallout = memo(
  CoverageOverviewInvalidMitreRulesCalloutComponent
);
