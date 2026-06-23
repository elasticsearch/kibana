/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { EuiFlyoutProps } from '@elastic/eui';
import {
  EuiButton,
  EuiButtonEmpty,
  EuiButtonIcon,
  EuiFlexGroup,
  EuiFlexItem,
  EuiFlyout,
  EuiFlyoutBody,
  EuiFlyoutFooter,
  EuiHorizontalRule,
  EuiPanel,
  EuiSpacer,
  EuiTitle,
  EuiToolTip,
} from '@elastic/eui';
import { CoreStart, useService } from '@kbn/core-di-browser';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import React from 'react';
import { paths } from '../../../constants';
import { RuleActionsMenu } from '../../../pages/rules_list_page/rule_actions_menu';
import { RuleProvider } from '../../rule_details/rule_context';
import {
  RuleHeaderDescription,
  RuleTitleWithBadges,
} from '../../rule_details/rule_header_description';
import { RuleConditions } from '../../rule_details/sidebar/rule_conditions';
import { RuleMetadata } from '../../rule_details/sidebar/rule_metadata';
import type { RuleApiResponse } from '../../../services/rules_api';

const FLYOUT_TITLE_ID = 'ruleSummaryFlyoutTitle';

export interface RuleSummaryFlyoutProps {
  rule: RuleApiResponse;
  onClose: () => void;
  onEdit: (rule: RuleApiResponse) => void;
  onQuickEdit?: (rule: RuleApiResponse) => void;
  onClone: (rule: RuleApiResponse) => void;
  onDelete: (rule: RuleApiResponse) => void;
  onToggleEnabled: (rule: RuleApiResponse) => void;
  session?: EuiFlyoutProps['session'];
  ownFocus?: EuiFlyoutProps['ownFocus'];
  hasAnimation?: EuiFlyoutProps['hasAnimation'];
}

export const RuleSummaryFlyout = ({
  rule,
  onClose,
  onEdit,
  onQuickEdit,
  onClone,
  onDelete,
  onToggleEnabled,
  session,
  ownFocus = true,
  hasAnimation = true,
}: RuleSummaryFlyoutProps) => {
  const { basePath } = useService(CoreStart('http'));
  const detailsHref = basePath.prepend(paths.ruleDetails(rule.id));

  return (
    <RuleProvider rule={rule}>
      <EuiFlyout
        type="push"
        hasAnimation={hasAnimation}
        size="s"
        ownFocus={ownFocus}
        session={session}
        hideCloseButton
        paddingSize="none"
        onClose={onClose}
        aria-labelledby={FLYOUT_TITLE_ID}
        data-test-subj="ruleSummaryFlyout"
      >
        <EuiPanel
          paddingSize="xs"
          hasShadow={false}
          hasBorder={false}
          borderRadius="none"
          color="transparent"
        >
          <EuiFlexGroup
            justifyContent="flexEnd"
            gutterSize="s"
            responsive={false}
            alignItems="center"
          >
            {onQuickEdit && (
              <EuiFlexItem grow={false}>
                <EuiToolTip
                  content={i18n.translate('xpack.alertingV2.ruleSummaryFlyout.quickEdit', {
                    defaultMessage: 'Quick edit rule',
                  })}
                  disableScreenReaderOutput
                >
                  <EuiButtonIcon
                    iconType="pencil"
                    color="text"
                    onClick={() => onQuickEdit(rule)}
                    aria-label={i18n.translate('xpack.alertingV2.ruleSummaryFlyout.quickEdit', {
                      defaultMessage: 'Quick edit rule',
                    })}
                    data-test-subj="ruleSummaryFlyoutQuickEditButton"
                  />
                </EuiToolTip>
              </EuiFlexItem>
            )}
            <EuiFlexItem grow={false}>
              <RuleActionsMenu
                rule={rule}
                onEdit={onEdit}
                onClone={onClone}
                onDelete={onDelete}
                onToggleEnabled={onToggleEnabled}
              />
            </EuiFlexItem>
            <EuiFlexItem grow={false}>
              <EuiToolTip
                content={i18n.translate('xpack.alertingV2.ruleSummaryFlyout.close', {
                  defaultMessage: 'Close',
                })}
                disableScreenReaderOutput
              >
                <EuiButtonIcon
                  iconType="cross"
                  color="text"
                  onClick={onClose}
                  aria-label={i18n.translate('xpack.alertingV2.ruleSummaryFlyout.close', {
                    defaultMessage: 'Close',
                  })}
                  data-test-subj="ruleSummaryFlyoutCloseButton"
                />
              </EuiToolTip>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiPanel>
        <EuiHorizontalRule margin="none" />
        <EuiFlyoutBody>
          <EuiPanel
            paddingSize="m"
            hasShadow={false}
            hasBorder={false}
            borderRadius="none"
            color="transparent"
          >
            <EuiTitle size="s" id={FLYOUT_TITLE_ID}>
              <h2 data-test-subj="ruleSummaryFlyoutTitle">
                <RuleTitleWithBadges variant="summary" />
              </h2>
            </EuiTitle>
            <EuiSpacer size="s" />
            <RuleHeaderDescription />
          </EuiPanel>
          <EuiHorizontalRule margin="xs" />
          <EuiPanel
            paddingSize="m"
            hasShadow={false}
            hasBorder={false}
            borderRadius="none"
            color="transparent"
          >
            <RuleConditions variant="summary" />
            <EuiHorizontalRule />
            <RuleMetadata />
          </EuiPanel>
        </EuiFlyoutBody>
        <EuiFlyoutFooter>
          <EuiPanel
            paddingSize="m"
            hasShadow={false}
            hasBorder={false}
            borderRadius="none"
            color="transparent"
          >
            <EuiFlexGroup justifyContent="spaceBetween">
              <EuiFlexItem grow={false}>
                <EuiButtonEmpty onClick={onClose} data-test-subj="ruleSummaryFlyoutCancelButton">
                  <FormattedMessage
                    id="xpack.alertingV2.ruleSummaryFlyout.cancel"
                    defaultMessage="Cancel"
                  />
                </EuiButtonEmpty>
              </EuiFlexItem>
              <EuiFlexItem grow={false}>
                <EuiButton
                  fill
                  href={detailsHref}
                  data-test-subj="ruleSummaryFlyoutOpenDetailsButton"
                >
                  <FormattedMessage
                    id="xpack.alertingV2.ruleSummaryFlyout.openDetails"
                    defaultMessage="Open details"
                  />
                </EuiButton>
              </EuiFlexItem>
            </EuiFlexGroup>
          </EuiPanel>
        </EuiFlyoutFooter>
      </EuiFlyout>
    </RuleProvider>
  );
};
