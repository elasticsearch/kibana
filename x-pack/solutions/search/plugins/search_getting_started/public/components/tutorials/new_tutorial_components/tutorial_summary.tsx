/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import {
  EuiFlexGroup,
  EuiFlexItem,
  EuiIcon,
  EuiLink,
  EuiPanel,
  EuiSpacer,
  EuiText,
  EuiTitle,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import type { TutorialDefinition } from '../../../hooks/use_tutorial_content';

export interface TutorialSummaryProps {
  summary: TutorialDefinition['summary'];
}

export const TutorialSummary: React.FC<TutorialSummaryProps> = ({ summary }) => {
  return (
    <EuiPanel color="success" paddingSize="l" hasBorder data-test-subj="tutorialSummary">
      <EuiFlexGroup gutterSize="s" alignItems="center">
        <EuiFlexItem grow={false}>
          <EuiIcon type="checkInCircleFilled" color="success" size="l" aria-hidden={true} />
        </EuiFlexItem>
        <EuiFlexItem>
          <EuiTitle size="s">
            <h3>
              {i18n.translate('xpack.searchGettingStarted.tutorial.summary.title', {
                defaultMessage: 'Summary',
              })}
            </h3>
          </EuiTitle>
        </EuiFlexItem>
      </EuiFlexGroup>
      <EuiSpacer size="m" />
      <EuiText size="s">
        <p>{summary.text}</p>
      </EuiText>
      {summary.links.length > 0 && (
        <>
          <EuiSpacer size="m" />
          <EuiTitle size="xxs">
            <h4>
              {i18n.translate('xpack.searchGettingStarted.tutorial.summary.learnMore', {
                defaultMessage: 'Learn more',
              })}
            </h4>
          </EuiTitle>
          <EuiSpacer size="s" />
          <EuiFlexGroup direction="column" gutterSize="xs">
            {summary.links.map((link) => (
              <EuiFlexItem key={link.href} grow={false}>
                <EuiLink
                  data-test-subj="searchGettingStartedTutorialSummaryLink"
                  href={link.href}
                  target="_blank"
                  external
                >
                  {link.label}
                </EuiLink>
              </EuiFlexItem>
            ))}
          </EuiFlexGroup>
        </>
      )}
    </EuiPanel>
  );
};
