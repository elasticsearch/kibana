/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  EuiButton,
  EuiButtonEmpty,
  EuiEmptyPrompt,
  EuiIllustration,
  EuiLink,
  EuiTitle,
} from '@elastic/eui';
import { relevanceHandTouch } from '@elastic/eui-illustrations';
import React, { useCallback } from 'react';
import { FormattedMessage } from '@kbn/i18n-react';
import { useLibraryEnabled } from '@kbn/workflows-ui';
import { PLUGIN_ID, WORKFLOWS_DOCUMENTATION_URL } from '../../../common';
import { WorkflowsPageName } from '../../deep_links';
import { useKibana } from '../../hooks/use_kibana';
import { PrivilegesFooter } from '../workflows_required_priveleges_footer';
interface WorkflowsEmptyStateProps {
  onCreateWorkflow?: () => void;
}

export function WorkflowsEmptyState({ onCreateWorkflow }: WorkflowsEmptyStateProps) {
  const { application } = useKibana().services;
  const isLibraryEnabled = useLibraryEnabled();

  const navigateToLibrary = useCallback(
    () => application.navigateToApp(PLUGIN_ID, { deepLinkId: WorkflowsPageName.library }),
    [application]
  );

  return (
    <EuiEmptyPrompt
      icon={
        <EuiIllustration
          type={relevanceHandTouch}
          alt=""
          style={{ maxInlineSize: 240, marginInline: 'auto' }}
        />
      }
      title={
        <h2 style={{ whiteSpace: 'nowrap' }}>
          <FormattedMessage
            id="workflows.emptyState.title"
            defaultMessage="Get Started with Workflows"
          />
        </h2>
      }
      layout="horizontal"
      color="plain"
      body={
        <>
          <p>
            <FormattedMessage
              id="workflows.emptyState.body.firstParagraph"
              defaultMessage="Workflows let you automate repetitive tasks and streamline processes across your environment. Create workflows to connect actions, reduce manual effort, and improve operational efficiency."
            />
          </p>
        </>
      }
      actions={
        onCreateWorkflow
          ? [
              <EuiButton color="primary" fill onClick={onCreateWorkflow} iconType="plusCircle">
                <FormattedMessage
                  id="workflows.emptyState.createButton"
                  defaultMessage="Create workflow"
                />
              </EuiButton>,
              isLibraryEnabled ? (
                <EuiButtonEmpty
                  onClick={navigateToLibrary}
                  iconType="chevronSingleRight"
                  iconSide="right"
                  aria-label="Explore library"
                >
                  <FormattedMessage
                    id="workflows.emptyState.exploreLibraryButton"
                    defaultMessage="Explore library"
                  />
                </EuiButtonEmpty>
              ) : (
                <EuiButtonEmpty
                  href="https://github.com/elastic/workflows"
                  target="_blank"
                  iconType="external"
                  iconSide="right"
                  aria-label="Example workflows"
                >
                  <FormattedMessage
                    id="workflows.emptyState.exampleWorkflowsButton"
                    defaultMessage="Example workflows"
                  />
                </EuiButtonEmpty>
              ),
            ]
          : null
      }
      footer={
        <>
          <EuiTitle size="xxs">
            <span>
              <FormattedMessage
                id="workflows.emptyState.footer.title"
                defaultMessage="Need help?"
              />
            </span>
          </EuiTitle>{' '}
          <EuiLink href={WORKFLOWS_DOCUMENTATION_URL} target="_blank">
            <FormattedMessage
              id="workflows.emptyState.footer.link"
              defaultMessage="Read documentation"
            />
          </EuiLink>
        </>
      }
    />
  );
}

export function WorkflowsEmptyStateReadOnly() {
  return (
    <EuiEmptyPrompt
      icon={
        <EuiIllustration
          type={relevanceHandTouch}
          alt=""
          style={{ maxInlineSize: 240, marginInline: 'auto' }}
        />
      }
      title={
        <h2 style={{ whiteSpace: 'nowrap' }}>
          <FormattedMessage
            id="workflows.emptyStateReadOnly.title"
            defaultMessage="Workflows list will be here"
          />
        </h2>
      }
      layout="horizontal"
      color="plain"
      body={
        <>
          <p>
            <FormattedMessage
              id="workflows.emptyStateReadOnly.body.firstParagraph"
              defaultMessage="Workflows let you automate repetitive tasks and streamline processes across your environment."
            />
          </p>
        </>
      }
      footer={
        <PrivilegesFooter
          permissions={[
            {
              id: 'platform.plugins.shared.workflows_management.writeWorkflowPermissionText',
              default: 'Workflows: Write',
            },
          ]}
        />
      }
    />
  );
}
