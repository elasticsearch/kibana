/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useEffect } from 'react';

import {
  EuiButton,
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiLink,
  EuiSpacer,
  EuiSplitPanel,
  EuiText,
  EuiTitle,
  useEuiTheme,
  transparentize,
  EuiHorizontalRule,
  EuiHideFor,
} from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { css } from '@emotion/react';
import { TryInConsoleButton } from '@kbn/try-in-console';
import { i18n } from '@kbn/i18n';
import { PLUGIN_TITLE } from '../../../common';
import { docLinks } from '../../../common/doc_links';

import { CREATE_QUERY_RULE_SET_API_SNIPPET } from '../../../common/constants';

import { useKibana } from '../../hooks/use_kibana';

import queryRulesImg from '../../assets/query-rules-context-alt.svg';
import queryRulesDarkImg from '../../assets/query-rules-context-alt-dark.svg';
import backgroundPanelImg from '../../assets/query-rule-panel-background.svg';
import { AnalyticsEvents } from '../../analytics/constants';
import { useUsageTracker } from '../../hooks/use_usage_tracker';
import backgroundPaneDarklImg from '../../assets/query-rule-panel-background-dark.svg';

interface EmptyPromptProps {
  getStartedAction: () => void;
}
export const EmptyPrompt: React.FC<EmptyPromptProps> = ({ getStartedAction }) => {
  const usageTracker = useUsageTracker();
  const { application, share, console: consolePlugin } = useKibana().services;
  const { euiTheme, colorMode } = useEuiTheme();

  useEffect(() => {
    usageTracker?.load(AnalyticsEvents.emptyPromptLoaded);
  }, [usageTracker]);

  const gradientOverlay = css({
    background: `linear-gradient(180deg, ${transparentize(
      euiTheme.colors.backgroundBasePlain,
      0
    )}, ${transparentize(euiTheme.colors.backgroundBasePlain, 1)} 100%)`,
    position: 'absolute',
    bottom: 0,
    height: '30px',
    width: '100%',
  });
  const imgProps = css({
    maxWidth: '900px',
    height: 'auto',
    margin: '0 auto',
  });
  const boxedPrompt = css({
    maxWidth: `${parseFloat(euiTheme.size.base) * 58}px`,
  });
  const positionRelative = css({
    position: 'relative',
  });
  const backgroundPanel = css({
    backgroundImage: `url(${colorMode === 'DARK' ? backgroundPaneDarklImg : backgroundPanelImg})`,
    backgroundSize: '50%',
    backgroundRepeat: 'no-repeat',
    backgroundPosition: 'top right',
  });

  return (
    <EuiFlexItem grow={false} css={boxedPrompt}>
      <EuiSplitPanel.Outer grow={false} css={backgroundPanel}>
        <EuiSplitPanel.Inner paddingSize="l">
          <EuiFlexGroup direction="row" gutterSize="m" alignItems="center">
            <EuiFlexItem grow>
              <EuiTitle size="l">
                <h2>
                  <FormattedMessage
                    id="xpack.queryRules.emptyPrompt.title"
                    defaultMessage="Add custom business logic with query rules"
                  />
                </h2>
              </EuiTitle>
              <EuiSpacer size="m" />
              <EuiText color="subdued" size="m">
                <p>
                  <FormattedMessage
                    id="xpack.queryRules.emptyPrompt.subtitle"
                    defaultMessage="Enhance search experiences with custom rules to filter and prioritize results based on your business logic."
                  />
                </p>
              </EuiText>
              <EuiSpacer size="m" />
              <EuiFlexGroup>
                <EuiFlexItem grow={false}>
                  <EuiButton
                    data-test-subj="searchQueryRulesEmptyPromptGetStartedButton"
                    color="primary"
                    fill
                    onClick={() => {
                      usageTracker?.click(AnalyticsEvents.gettingStartedButtonClicked);
                      getStartedAction();
                    }}
                  >
                    <FormattedMessage
                      id="xpack.queryRules.emptyPrompt.getStartedButton"
                      defaultMessage="Create your first ruleset"
                    />
                  </EuiButton>
                </EuiFlexItem>
              </EuiFlexGroup>
              <EuiSpacer size="xl" />
              <EuiFlexItem grow={false}>
                <EuiFlexGroup gutterSize="m" direction="column">
                  <EuiFlexGroup responsive={false} gutterSize="s" direction="row">
                    <EuiFlexItem grow={false}>
                      <EuiIcon type="check" aria-hidden={true} />
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiFlexGroup responsive={false} gutterSize="xs" direction="column">
                        <EuiFlexItem grow={false}>
                          <EuiTitle size="xxs">
                            <h5>
                              <FormattedMessage
                                id="xpack.queryRules.emptyPrompt.feature1.title"
                                defaultMessage="Pin and hide specific documents"
                              />
                            </h5>
                          </EuiTitle>
                        </EuiFlexItem>
                        <EuiFlexItem>
                          <EuiText size="xs" color="subdued">
                            <p>
                              <FormattedMessage
                                id="xpack.queryRules.emptyPrompt.feature1.description"
                                defaultMessage="Build a customized results list by selecting documents from different indices."
                              />
                            </p>
                          </EuiText>
                        </EuiFlexItem>
                      </EuiFlexGroup>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                  <EuiFlexGroup responsive={false} gutterSize="s" direction="row">
                    <EuiFlexItem grow={false}>
                      <EuiIcon type="check" aria-hidden={true} />
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiFlexGroup responsive={false} gutterSize="xs" direction="column">
                        <EuiFlexItem grow={false}>
                          <EuiTitle size="xxs">
                            <h5>
                              <FormattedMessage
                                id="xpack.queryRules.emptyPrompt.feature2.title"
                                defaultMessage="Level up your search relevance"
                              />
                            </h5>
                          </EuiTitle>
                        </EuiFlexItem>
                        <EuiFlexItem>
                          <EuiText size="xs" color="subdued">
                            <p>
                              <FormattedMessage
                                id="xpack.queryRules.emptyPrompt.feature2.description"
                                defaultMessage="Improve relevance for your search or RAG system by adding custom query parameters to your retrieval pipeline."
                              />
                            </p>
                          </EuiText>
                        </EuiFlexItem>
                      </EuiFlexGroup>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                  <EuiFlexGroup responsive={false} gutterSize="s" direction="row">
                    <EuiFlexItem grow={false}>
                      <EuiIcon type="check" aria-hidden={true} />
                    </EuiFlexItem>
                    <EuiFlexItem grow={false}>
                      <EuiFlexGroup responsive={false} gutterSize="xs" direction="column">
                        <EuiFlexItem grow={false}>
                          <EuiTitle size="xxs">
                            <h5>
                              <FormattedMessage
                                id="xpack.queryRules.emptyPrompt.feature3.title"
                                defaultMessage="Collaborate across workflows"
                              />
                            </h5>
                          </EuiTitle>
                        </EuiFlexItem>
                        <EuiFlexItem>
                          <EuiText size="xs" color="subdued">
                            <p>
                              <FormattedMessage
                                id="xpack.queryRules.emptyPrompt.feature3.description"
                                defaultMessage="Update query rules and export as code for seamless developer handoff."
                              />
                            </p>
                          </EuiText>
                        </EuiFlexItem>
                      </EuiFlexGroup>
                    </EuiFlexItem>
                  </EuiFlexGroup>
                </EuiFlexGroup>
              </EuiFlexItem>
            </EuiFlexItem>

            <EuiFlexItem grow css={positionRelative}>
              <img
                src={colorMode === 'DARK' ? queryRulesDarkImg : queryRulesImg}
                alt={PLUGIN_TITLE}
                css={imgProps}
              />
              <div css={gradientOverlay}>&nbsp;</div>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiSplitPanel.Inner>
        <EuiHorizontalRule margin="none" />
        <EuiSplitPanel.Inner color="subdued" paddingSize="l">
          <EuiFlexGroup direction="row" alignItems="center">
            <EuiFlexGroup direction="row" gutterSize="s" alignItems="center">
              <EuiFlexItem grow={false}>
                <EuiTitle size="xxs">
                  <span>
                    <FormattedMessage
                      id="xpack.queryRules.emptyPrompt.footer"
                      defaultMessage="Prefer to use the APIs?"
                    />
                  </span>
                </EuiTitle>
              </EuiFlexItem>
              <EuiHideFor sizes={['xs', 's']}>
                <EuiFlexItem grow={false}>
                  <TryInConsoleButton
                    application={application}
                    sharePlugin={share ?? undefined}
                    consolePlugin={consolePlugin ?? undefined}
                    request={CREATE_QUERY_RULE_SET_API_SNIPPET}
                    type="emptyButton"
                    content={i18n.translate('xpack.queryRules.emptyPrompt.TryInConsoleLabel', {
                      defaultMessage: 'Create in Console',
                    })}
                    showIcon
                    data-test-subj={AnalyticsEvents.createInConsoleClicked}
                  />
                </EuiFlexItem>
              </EuiHideFor>
            </EuiFlexGroup>

            <EuiFlexItem grow={false}>
              <EuiLink
                data-test-subj="searchQueryRulesEmptyPromptFooterLink"
                href={docLinks.queryRulesApi}
                target="_blank"
                external
              >
                <FormattedMessage
                  id="xpack.queryRules.emptyPrompt.footerLink"
                  defaultMessage="API reference"
                />
              </EuiLink>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiSplitPanel.Inner>
      </EuiSplitPanel.Outer>
    </EuiFlexItem>
  );
};
