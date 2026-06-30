/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo } from 'react';
import {
  EuiSpacer,
  EuiFlexItem,
  EuiCard,
  EuiFlexGroup,
  EuiButton,
  EuiHorizontalRule,
} from '@elastic/eui';

import { useStartServices } from '../../hooks';
import type { RegistryPolicyTemplate } from '../../types';

export const NextSteps = ({ policyTemplates }: { policyTemplates?: RegistryPolicyTemplate[] }) => {
  const { application } = useStartServices();

  const configurationLinks = useMemo(() => {
    if (policyTemplates) {
      return policyTemplates
        ?.filter(
          (template) => template?.configuration_links && template.configuration_links.length > 0
        )
        .flatMap((template) => template.configuration_links);
    }
    return [];
  }, [policyTemplates]);

  const parseKbnLink = (url: string) => {
    // matching strings with format kbn:/app/appId/path/optionalsubpath
    const matches = url.match(/kbn:\/app\/(\w*)\/(\w*\/*)*/);
    if (matches && matches.length > 0) {
      const appId = matches[1];
      const path = matches[2];
      return { appId, path };
    }
    return undefined;
  };

  const isExternal = (url: string) => url.startsWith('http') || url.startsWith('https');
  const onClickLink = useCallback(
    (url?: string) => {
      if (!url) return undefined;

      if (isExternal(url)) {
        application.navigateToUrl(`${url}`);
      } else if (url.startsWith('kbn:/')) {
        const parsedLink = parseKbnLink(url);
        if (parsedLink) {
          const { appId, path } = parsedLink;
          application.navigateToApp(appId, {
            path,
          });
        }
      }
    },
    [application]
  );

  const nextStepsCards = configurationLinks
    .filter((link) => link?.type === 'next_step')
    .map((link, index) => {
      return (
        <EuiFlexItem key={index}>
          <EuiCard
            data-test-subj={`agentlessStepConfirmData.connectorCard.${link?.title}`}
            title={`${link?.title}`}
            description={`${link?.content}`}
            onClick={() => onClickLink(link?.url)}
          />
        </EuiFlexItem>
      );
    });

  const actionButtons = configurationLinks
    .filter((link) => !!link && link?.type === 'action')
    .map((link, index) => {
      return (
        <EuiFlexItem key={index} grow={false}>
          <EuiButton
            data-test-subj={`agentlessStepConfirmData.connectorCard.${link?.title}`}
            iconType="link"
            onClick={() => onClickLink(link?.url)}
          >
            {link?.title}
          </EuiButton>
        </EuiFlexItem>
      );
    });

  return (
    <>
      <EuiSpacer size="m" />
      {nextStepsCards.length > 0 && (
        <EuiFlexGroup alignItems="center" direction="row" wrap={true}>
          {nextStepsCards}
        </EuiFlexGroup>
      )}
      <EuiSpacer size="m" />
      <EuiHorizontalRule />
      {actionButtons.length > 0 && (
        <EuiFlexGroup alignItems="center" direction="row" wrap={true}>
          {actionButtons}
        </EuiFlexGroup>
      )}
    </>
  );
};
