/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiBadge, EuiLink, EuiText } from '@elastic/eui';
import { FormattedMessage } from '@kbn/i18n-react';
import { getWorkflowsCapabilities } from '@kbn/workflows-ui';
import { WORKFLOWS_APP_ID } from '@kbn/deeplinks-workflows';
import type { SnakeToCamelCase } from '../../../common/types';
import type { WorkflowOrigin, WorkflowUserAction } from '../../../common/types/domain';
import {
  ATTACHMENTS_WORKFLOW_ORIGIN_TYPE,
  ATTACHMENT_WORKFLOW_ORIGIN_TYPE,
  CASE_WORKFLOW_ORIGIN_TYPE,
  OBSERVABLE_WORKFLOW_ORIGIN_TYPE,
  OBSERVABLES_WORKFLOW_ORIGIN_TYPE,
} from '../../../common/types/domain/user_action/workflow/constants';
import { OBSERVABLE_TYPES_BUILTIN } from '../../../common/constants';
import type { UserActionBuilder, UserActionBuilderArgs } from './types';
import { createCommonUpdateUserActionBuilder } from './common';
import { renderAttachmentAction } from './attachment_action';
import { useAppUrl, useKibana } from '../../common/lib/kibana';
import type { CasesConfigurationUI } from '../../containers/types';
import type { UnifiedAttachmentTypeRegistry } from '../../client/attachment_framework/unified_attachment_registry';

interface WorkflowActivityLabelProps {
  workflow: SnakeToCamelCase<WorkflowUserAction>['payload']['workflow'];
  origin?: WorkflowOrigin;
  casesConfiguration: CasesConfigurationUI;
  unifiedAttachmentTypeRegistry: UnifiedAttachmentTypeRegistry;
}

const WorkflowActivityLabel: React.FC<WorkflowActivityLabelProps> = ({
  workflow,
  origin,
  casesConfiguration,
  unifiedAttachmentTypeRegistry,
}) => {
  const { getAppUrl } = useAppUrl(WORKFLOWS_APP_ID);
  const capabilities = useKibana().services?.application?.capabilities;

  const { id, name, executionId } = workflow;

  // Gate the execution deep link on Workflows view permissions (readWorkflow + readWorkflowExecution).
  // `@kbn/workflows-ui` is already a runtime dependency of the Cases bundle, so this reuses the
  // existing helper rather than hand-rolling the capability lookup.
  const { canReadWorkflow, canReadWorkflowExecution } = getWorkflowsCapabilities(
    capabilities ?? {}
  );
  const canViewExecution = canReadWorkflow && canReadWorkflowExecution;

  const executionHref = getAppUrl({
    path: `/${encodeURIComponent(id)}?tab=executions&executionId=${encodeURIComponent(
      executionId
    )}`,
  });

  const workflowNameNode = canViewExecution ? (
    <EuiLink data-test-subj="workflow-execution-link" href={executionHref} target="_blank">
      {name}
    </EuiLink>
  ) : (
    <>{name}</>
  );

  const label = (() => {
    switch (origin?.type) {
      case ATTACHMENT_WORKFLOW_ORIGIN_TYPE:
      case ATTACHMENTS_WORKFLOW_ORIGIN_TYPE: {
        if (unifiedAttachmentTypeRegistry.has(origin.attachmentType)) {
          const attachmentType = unifiedAttachmentTypeRegistry.get(origin.attachmentType);
          const registeredLabel = attachmentType.workflow?.getActivityLabel({
            workflowName: workflowNameNode,
            count: origin.type === ATTACHMENTS_WORKFLOW_ORIGIN_TYPE ? origin.count : undefined,
          });
          if (registeredLabel != null) {
            return registeredLabel;
          }
        }

        return (
          <FormattedMessage
            id="xpack.cases.caseView.userActions.ranWorkflowOnAttachmentLabel"
            defaultMessage="ran {name} on {count, plural, =0 {an attachment} one {# attachment} other {# attachments}}"
            values={{
              name: workflowNameNode,
              count: origin.type === ATTACHMENTS_WORKFLOW_ORIGIN_TYPE ? origin.count ?? 1 : 0,
            }}
          />
        );
      }
      case OBSERVABLE_WORKFLOW_ORIGIN_TYPE: {
        if (origin.typeKey && origin.value) {
          const allObservableTypes = [
            ...OBSERVABLE_TYPES_BUILTIN,
            ...(casesConfiguration?.observableTypes ?? []),
          ];
          const found = allObservableTypes.find((t) => t.key === origin.typeKey);
          const typeLabel = found?.label ?? origin.typeKey;
          const observableNode = (
            <EuiBadge color="hollow" data-test-subj="workflow-observable-badge">
              {typeLabel}
              {': '}
              {origin.value}
            </EuiBadge>
          );
          return (
            <FormattedMessage
              id="xpack.cases.caseView.userActions.ranWorkflowOnObservableDetailsLabel"
              defaultMessage="ran {name} on observable {observable}"
              values={{ name: workflowNameNode, observable: observableNode }}
            />
          );
        }
        return (
          <FormattedMessage
            id="xpack.cases.caseView.userActions.ranWorkflowOnObservableLabel"
            defaultMessage="ran {name} on an observable"
            values={{ name: workflowNameNode }}
          />
        );
      }
      case OBSERVABLES_WORKFLOW_ORIGIN_TYPE: {
        const count = origin.count;
        if (count !== undefined) {
          return (
            <FormattedMessage
              id="xpack.cases.caseView.userActions.ranWorkflowOnObservablesCountLabel"
              defaultMessage="ran {name} on {count, plural, one {# observable} other {# observables}}"
              values={{ name: workflowNameNode, count }}
            />
          );
        }
        return (
          <FormattedMessage
            id="xpack.cases.caseView.userActions.ranWorkflowOnObservablesLabel"
            defaultMessage="ran {name} on observables"
            values={{ name: workflowNameNode }}
          />
        );
      }
      case CASE_WORKFLOW_ORIGIN_TYPE:
      default:
        return (
          <FormattedMessage
            id="xpack.cases.caseView.userActions.ranWorkflowOnCaseLabel"
            defaultMessage="ran {name} on this case"
            values={{ name: workflowNameNode }}
          />
        );
    }
  })();

  return (
    <EuiText size="s" data-test-subj="workflow-user-action-label">
      {label}
    </EuiText>
  );
};

WorkflowActivityLabel.displayName = 'WorkflowActivityLabel';

export const createWorkflowUserActionBuilder: UserActionBuilder = ({
  userAction,
  userProfiles,
  handleOutlineComment,
  casesConfiguration,
  unifiedAttachmentTypeRegistry,
}: UserActionBuilderArgs) => ({
  build: () => {
    const action = userAction as SnakeToCamelCase<WorkflowUserAction>;
    const { workflow, origin } = action.payload;

    // Resolve the document-flyout button for attachment origins. The button is
    // solution-owned (it lives behind getDocumentAction on the unified attachment type),
    // so we look it up from the registry rather than hard-coding the flyout here.
    let documentAction: React.ReactNode;
    if (origin?.type === ATTACHMENT_WORKFLOW_ORIGIN_TYPE) {
      if (unifiedAttachmentTypeRegistry.has(origin.attachmentType)) {
        const attachmentType = unifiedAttachmentTypeRegistry.get(origin.attachmentType);
        const resolvedAction = attachmentType.getDocumentAction?.({
          id: userAction.id,
          documentId: origin.id,
          index: origin.index,
        });
        if (resolvedAction != null) {
          documentAction = renderAttachmentAction(
            resolvedAction,
            `workflow-document-action-${userAction.id}`
          );
        }
      }
    }

    const label = (
      <WorkflowActivityLabel
        workflow={workflow}
        origin={origin}
        casesConfiguration={casesConfiguration}
        unifiedAttachmentTypeRegistry={unifiedAttachmentTypeRegistry}
      />
    );

    return createCommonUpdateUserActionBuilder({
      userProfiles,
      userAction,
      handleOutlineComment,
      label,
      icon: 'workflow',
      documentAction,
    }).build();
  },
});
