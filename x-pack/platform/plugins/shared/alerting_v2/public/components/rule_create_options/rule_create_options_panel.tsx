/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import {
  EuiCard,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiIcon,
  EuiImage,
  EuiPageTemplate,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
  EuiToolTip,
  type UseEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { useMemoCss } from '@kbn/css-utils/public/use_memo_css';
import { i18n } from '@kbn/i18n';
import { FormattedMessage } from '@kbn/i18n-react';
import type { RuleManagementABSkillRequirements } from '../../hooks/use_is_rule_management_ab_skill_available';
import rulesListEmptyIllustration from '../../assets/illustration-results-128.svg';

export interface LegacyRuleTypeItem {
  id: string;
  label: string;
  onClick: () => void;
  'data-test-subj'?: string;
}

interface RuleCreateOptionsPanelProps {
  onCreateEsqlRule: () => void;
  layout?: 'vertical' | 'horizontal';
  onCreateWithAgent: () => void;
  /**
   * Optional tooltip text for the "Create with AI Agent" option. When set, the option is always
   * rendered but disabled, with this text shown as a tooltip explaining why (e.g. a missing
   * prerequisite). When unset, the option is enabled and `onCreateWithAgent` fires on click.
   */
  createWithAgentTooltipText?: string;
  onCreateThresholdAlert?: () => void;
  legacyRuleTypes?: LegacyRuleTypeItem[];
}

/** Fits the two primary option descriptions on one line; threshold description may wrap. */
const LIST_EMPTY_STATE_MAX_INLINE_SIZE = '44em';

const listEmptyStateStyles = {
  parent: css({
    display: 'flex',
    flexGrow: 1,
    height: '100%',
  }),
  template: css({
    backgroundColor: 'inherit',
    marginInline: 'auto',
    maxInlineSize: LIST_EMPTY_STATE_MAX_INLINE_SIZE,
    width: '100%',
  }),
  widgetContainer: ({ euiTheme }: UseEuiTheme) =>
    css({
      padding: euiTheme.size.xl,
      borderRadius: euiTheme.border.radius.medium,
      '.euiEmptyPrompt__icon': {
        marginBottom: euiTheme.size.l,
        paddingRight: euiTheme.size.s,
      },
      '.euiEmptyPrompt__content': {
        maxInlineSize: LIST_EMPTY_STATE_MAX_INLINE_SIZE,
        width: '100%',
      },
    }),
  actionsWrapper: css({
    width: '100%',
    maxInlineSize: LIST_EMPTY_STATE_MAX_INLINE_SIZE,
    marginInline: 'auto',
  }),
  actionPanel: ({ euiTheme }: UseEuiTheme) =>
    css({
      padding: `${euiTheme.size.s} ${euiTheme.size.base}`,
      cursor: 'pointer',
      minWidth: 0,
    }),
  actionPanelTextWrapper: css({ minWidth: 0 }),
};

/** Applied to an action panel rendered in a disabled state (e.g. missing privileges). */
const actionPanelDisabledStyle = css({
  cursor: 'not-allowed',
  opacity: 0.5,
});

interface RuleCreateOptionItem {
  id: string;
  iconType: string;
  title: string;
  description: string;
  onClick: () => void;
  /** When set, the option is disabled and this string is shown as a hover tooltip. */
  tooltipText?: string;
  'data-test-subj'?: string;
}

const ESQL_RULE_TITLE = i18n.translate(
  'xpack.alertingV2.ruleCreateOptionsPanel.createEsqlRuleTitle',
  { defaultMessage: 'Create ES|QL rule' }
);
const ESQL_RULE_DESCRIPTION = i18n.translate(
  'xpack.alertingV2.ruleCreateOptionsPanel.createWithEsqlDescription',
  { defaultMessage: 'Create as an ES|QL query with live preview. YAML editor available.' }
);
const AI_AGENT_TITLE = i18n.translate(
  'xpack.alertingV2.ruleCreateOptionsPanel.createWithAiAgentTitle',
  { defaultMessage: 'Create with AI Agent' }
);
const AI_AGENT_DESCRIPTION = i18n.translate(
  'xpack.alertingV2.ruleCreateOptionsPanel.createWithAiAgentDescription',
  { defaultMessage: 'Set up an Alerting rule with the help of the AI Agent.' }
);
const CREATE_WITH_AGENT_MISSING_PRIVILEGE_TOOLTIP = i18n.translate(
  'xpack.alertingV2.ruleCreateOptions.createWithAgentMissingPrivilegeTooltip',
  {
    defaultMessage:
      'To create rules with the AI Agent, you need the "Agent Builder: Read" privilege.',
  }
);
const CREATE_WITH_AGENT_MISSING_SETTING_TOOLTIP = i18n.translate(
  'xpack.alertingV2.ruleCreateOptions.createWithAgentMissingSettingTooltip',
  {
    defaultMessage:
      'To create rules with the AI Agent, enable the "Elastic Agent Builder: Experimental Features" advanced setting.',
  }
);
const CREATE_WITH_AGENT_MISSING_ALL_TOOLTIP = i18n.translate(
  'xpack.alertingV2.ruleCreateOptions.createWithAgentMissingAllTooltip',
  {
    defaultMessage:
      'To create rules with the AI Agent, you need the "Agent Builder: Read" privilege and the "Elastic Agent Builder: Experimental Features" advanced setting enabled.',
  }
);

/**
 * Builds the tooltip shown on the disabled "Create with agent" entry points, naming the specific
 * prerequisite(s) the user is missing. Returns `undefined` when the skill is fully available (the
 * option should then be enabled). Shared so all entry points produce the same message.
 */
export const getCreateWithAgentTooltipText = ({
  hasAgentBuilderCapability,
  isExperimentalFeaturesEnabled,
}: RuleManagementABSkillRequirements): string | undefined => {
  if (hasAgentBuilderCapability && isExperimentalFeaturesEnabled) {
    return undefined;
  }
  if (!hasAgentBuilderCapability && !isExperimentalFeaturesEnabled) {
    return CREATE_WITH_AGENT_MISSING_ALL_TOOLTIP;
  }
  if (!hasAgentBuilderCapability) {
    return CREATE_WITH_AGENT_MISSING_PRIVILEGE_TOOLTIP;
  }
  return CREATE_WITH_AGENT_MISSING_SETTING_TOOLTIP;
};
const THRESHOLD_ALERT_TITLE = i18n.translate(
  'xpack.alertingV2.ruleCreateOptionsPanel.thresholdAlertTitle',
  { defaultMessage: 'Threshold Alert' }
);
const THRESHOLD_ALERT_DESCRIPTION = i18n.translate(
  'xpack.alertingV2.ruleCreateOptionsPanel.thresholdAlertDescription',
  {
    defaultMessage:
      'Monitor one or more metrics and alert when they cross a threshold. Multi-condition support with custom aggregations.',
  }
);

const noop = () => undefined;

const RuleCreateOptionActionPanel: React.FC<{
  item: RuleCreateOptionItem;
  actionPanelStyle: React.ComponentProps<typeof EuiPanel>['css'];
}> = ({ item, actionPanelStyle }) => {
  const isDisabled = item.tooltipText !== undefined;
  const panel = (
    <EuiPanel
      element="button"
      hasBorder
      paddingSize="none"
      // EuiPanel has no built-in disabled appearance (unlike EuiCard's `isDisabled`), and a native
      // `disabled` button would both leave it unstyled and suppress the hover events EuiToolTip
      // needs. So we convey the disabled state with `aria-disabled` + styling and guard the click.
      aria-disabled={isDisabled || undefined}
      onClick={isDisabled ? noop : item.onClick}
      css={[actionPanelStyle, isDisabled && actionPanelDisabledStyle]}
      data-test-subj={item['data-test-subj']}
    >
      <EuiFlexGroup alignItems="center" gutterSize="m" responsive={false}>
        <EuiFlexItem grow={false}>
          <EuiIcon type={item.iconType} size="m" color="text" aria-hidden={true} />
        </EuiFlexItem>
        <EuiFlexItem css={listEmptyStateStyles.actionPanelTextWrapper}>
          <EuiText size="s">
            <strong>{item.title}</strong>
          </EuiText>
          <EuiText size="xs" color="subdued">
            {item.description}
          </EuiText>
        </EuiFlexItem>
      </EuiFlexGroup>
    </EuiPanel>
  );

  if (isDisabled) {
    return (
      <EuiToolTip content={item.tooltipText} display="block">
        {panel}
      </EuiToolTip>
    );
  }

  return panel;
};

const RuleBuilderSectionDivider: React.FC = () => (
  <>
    <EuiSpacer size="s" />
    <EuiFlexGroup alignItems="center" gutterSize="m" responsive={false}>
      <EuiFlexItem>
        <EuiHorizontalRule margin="none" />
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiText size="s" color="subdued">
          <FormattedMessage
            id="xpack.alertingV2.ruleCreateOptionsPanel.orStartFromBuilderLabel"
            defaultMessage="or start from a builder"
          />
        </EuiText>
      </EuiFlexItem>
      <EuiFlexItem>
        <EuiHorizontalRule margin="none" />
      </EuiFlexItem>
    </EuiFlexGroup>
    <EuiSpacer size="l" />
  </>
);

/** Rules list empty state — matches dashboard create empty prompt layout. */
const RuleCreateOptionsListEmptyState: React.FC<RuleCreateOptionsPanelProps> = ({
  onCreateEsqlRule,
  onCreateWithAgent,
  createWithAgentTooltipText,
  onCreateThresholdAlert,
}) => {
  const styles = useMemoCss(listEmptyStateStyles);

  const primaryCreateOptions = useMemo<RuleCreateOptionItem[]>(
    () => [
      {
        id: 'create-esql-rule',
        iconType: 'productDiscover',
        title: ESQL_RULE_TITLE,
        description: ESQL_RULE_DESCRIPTION,
        onClick: onCreateEsqlRule,
        'data-test-subj': 'createEsqlRuleCard',
      },
      {
        id: 'create-with-agent',
        iconType: 'productAgent',
        title: AI_AGENT_TITLE,
        description: AI_AGENT_DESCRIPTION,
        onClick: onCreateWithAgent,
        tooltipText: createWithAgentTooltipText,
        'data-test-subj': 'createWithAgentCard',
      },
    ],
    [onCreateEsqlRule, onCreateWithAgent, createWithAgentTooltipText]
  );

  const thresholdCreateOption = useMemo<RuleCreateOptionItem>(
    () => ({
      id: 'create-threshold-alert',
      iconType: 'chartThreshold',
      title: THRESHOLD_ALERT_TITLE,
      description: THRESHOLD_ALERT_DESCRIPTION,
      onClick: onCreateThresholdAlert ?? noop,
      'data-test-subj': 'createThresholdAlertCard',
    }),
    [onCreateThresholdAlert]
  );

  return (
    <div css={listEmptyStateStyles.parent} data-test-subj="ruleCreateOptionsPanel">
      <EuiPageTemplate grow={false} offset={0} css={styles.template}>
        <EuiPageTemplate.EmptyPrompt
          paddingSize="none"
          icon={
            <EuiImage
              size="fullWidth"
              src={rulesListEmptyIllustration}
              alt=""
              data-test-subj="rulesListEmptyIllustration"
            />
          }
          title={
            <h2>
              <FormattedMessage
                id="xpack.alertingV2.ruleCreateOptionsPanel.emptyStateTitle"
                defaultMessage="No rules yet. Let's get started!"
              />
            </h2>
          }
          actions={
            <EuiFlexGroup direction="column" gutterSize="s" css={styles.actionsWrapper}>
              {primaryCreateOptions.map((item) => (
                <EuiFlexItem key={item.id} grow={false}>
                  <RuleCreateOptionActionPanel item={item} actionPanelStyle={styles.actionPanel} />
                </EuiFlexItem>
              ))}
              <EuiFlexItem grow={false}>
                <RuleBuilderSectionDivider />
                <RuleCreateOptionActionPanel
                  item={thresholdCreateOption}
                  actionPanelStyle={styles.actionPanel}
                />
              </EuiFlexItem>
            </EuiFlexGroup>
          }
          titleSize="xs"
          color="transparent"
          css={styles.widgetContainer}
        />
      </EuiPageTemplate>
    </div>
  );
};

const LegacyRuleTypesSection: React.FC<{ items: LegacyRuleTypeItem[] }> = ({ items }) => {
  if (items.length === 0) return null;

  return (
    <>
      <EuiSpacer size="l" />
      <EuiTitle size="xs">
        <h3>
          <FormattedMessage
            id="xpack.alertingV2.ruleCreateOptionsPanel.legacyRuleTypesTitle"
            defaultMessage="Classic rule types"
          />
        </h3>
      </EuiTitle>
      <EuiSpacer size="m" />
      <EuiFlexGroup direction="column" gutterSize="s">
        {items.map((item) => (
          <EuiFlexItem key={item.id} grow={false}>
            <EuiPanel
              element="button"
              hasBorder={false}
              hasShadow={false}
              color="transparent"
              paddingSize="xs"
              onClick={item.onClick}
              data-test-subj={item['data-test-subj']}
            >
              <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
                <EuiFlexItem grow={false}>
                  <EuiIcon type="bell" size="m" color="subdued" aria-hidden={true} />
                </EuiFlexItem>
                <EuiFlexItem grow={false}>
                  <EuiText size="s">{item.label}</EuiText>
                </EuiFlexItem>
              </EuiFlexGroup>
            </EuiPanel>
          </EuiFlexItem>
        ))}
      </EuiFlexGroup>
    </>
  );
};

/** Create-rule flyout — original card layout. */
const RuleCreateOptionsFlyoutPanel: React.FC<RuleCreateOptionsPanelProps> = ({
  onCreateEsqlRule,
  onCreateWithAgent,
  createWithAgentTooltipText,
  onCreateThresholdAlert,
  legacyRuleTypes,
}) => {
  const isAgentDisabled = createWithAgentTooltipText !== undefined;
  const agentCard = (
    <EuiCard
      layout="horizontal"
      display="plain"
      titleElement="h3"
      titleSize="xs"
      hasBorder={true}
      // Convey the disabled state with `aria-disabled` + styling and a guarded click rather than
      // EuiCard's native `isDisabled` (which renders a `disabled` <button>). A native disabled
      // control drops out of the tab order and suppresses the hover events EuiToolTip needs, so the
      // explanatory tooltip would be unreachable — defeating the goal of signalling how to gain
      // access. Keeping it focusable lets the tooltip surface on both hover and keyboard focus.
      aria-disabled={isAgentDisabled || undefined}
      css={isAgentDisabled ? actionPanelDisabledStyle : undefined}
      title={AI_AGENT_TITLE}
      description={AI_AGENT_DESCRIPTION}
      onClick={isAgentDisabled ? noop : onCreateWithAgent}
      icon={<EuiIcon type="productAgent" color="text" size="l" aria-hidden={true} />}
      data-test-subj="createWithAgentCard"
    />
  );

  return (
    <>
      <EuiFlexGroup direction="column" gutterSize="l">
        <EuiFlexItem>
          <EuiCard
            layout="horizontal"
            display="plain"
            titleElement="h3"
            titleSize="xs"
            hasBorder={true}
            title={ESQL_RULE_TITLE}
            description={ESQL_RULE_DESCRIPTION}
            onClick={onCreateEsqlRule}
            icon={<EuiIcon type="productDiscover" color="text" size="l" aria-hidden={true} />}
            data-test-subj="createEsqlRuleCard"
          />
        </EuiFlexItem>
        <EuiFlexItem>
          {isAgentDisabled ? (
            <EuiToolTip content={createWithAgentTooltipText} display="block">
              {agentCard}
            </EuiToolTip>
          ) : (
            agentCard
          )}
        </EuiFlexItem>
      </EuiFlexGroup>
      <RuleBuilderSectionDivider />
      <EuiCard
        layout="horizontal"
        display="plain"
        titleElement="h3"
        titleSize="xs"
        hasBorder={true}
        title={THRESHOLD_ALERT_TITLE}
        description={THRESHOLD_ALERT_DESCRIPTION}
        onClick={onCreateThresholdAlert ?? noop}
        icon={<EuiIcon type="chartThreshold" color="text" size="l" aria-hidden={true} />}
      />
      {legacyRuleTypes && <LegacyRuleTypesSection items={legacyRuleTypes} />}
    </>
  );
};

export const RuleCreateOptionsPanel: React.FC<RuleCreateOptionsPanelProps> = (props) => {
  const { layout = 'horizontal' } = props;
  const isVerticalLayout = layout === 'vertical';

  if (!isVerticalLayout) {
    return <RuleCreateOptionsListEmptyState {...props} />;
  }

  return <RuleCreateOptionsFlyoutPanel {...props} />;
};
