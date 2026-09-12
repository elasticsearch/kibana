/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { EuiCommentList } from '@elastic/eui';
import { screen } from '@testing-library/react';

import { UserActionActions, UserActionTypes } from '../../../common/types/domain';
import { renderWithTestingProviders } from '../../common/mock';
import { getUserAction } from '../../containers/mock';
import { getMockBuilderArgs } from './mock';
import { createWorkflowUserActionBuilder } from './workflow';
import {
  ATTACHMENTS_WORKFLOW_ORIGIN_TYPE,
  ATTACHMENT_WORKFLOW_ORIGIN_TYPE,
  CASE_WORKFLOW_ORIGIN_TYPE,
  OBSERVABLE_WORKFLOW_ORIGIN_TYPE,
} from '../../../common/types/domain/user_action/workflow/constants';
import { SECURITY_ALERT_ATTACHMENT_TYPE } from '../../../common/constants/attachments';
import { AttachmentActionType } from '../../../common/utils/attachment_actions';
import { WorkflowsManagementUiActions } from '@kbn/workflows/common/privileges';

jest.mock('../../common/lib/kibana');
jest.mock('../../common/navigation/hooks');

// Bring in mocked modules so we can override per-test.
const mockUseKibana = jest.requireMock('../../common/lib/kibana').useKibana;
const mockUseAppUrl = jest.requireMock('../../common/lib/kibana').useAppUrl;

const MOCK_EXECUTION_HREF = 'http://localhost/app/workflows/wf-1?tab=executions&executionId=exec-1';

interface BuildAndRenderOptions {
  payloadOverride?: Record<string, unknown>;
  /** Register a stub attachment type with getDocumentAction. */
  registerDocumentType?: {
    id: string;
    getDocumentAction?: jest.Mock;
    getWorkflowActivityLabel?: jest.Mock;
  };
}

const buildAndRender = ({ payloadOverride, registerDocumentType }: BuildAndRenderOptions = {}) => {
  const builderArgs = getMockBuilderArgs();
  if (registerDocumentType) {
    builderArgs.unifiedAttachmentTypeRegistry.register({
      id: registerDocumentType.id,
      getLabel: () => 'Stub',
      getIcon: () => 'bell',
      getCreationActivity: () => ({}),
      getDocumentAction: registerDocumentType.getDocumentAction,
      ...(registerDocumentType.getWorkflowActivityLabel
        ? {
            workflow: {
              getActivityLabel: registerDocumentType.getWorkflowActivityLabel,
            },
          }
        : {}),
    } as never);
  }
  const userAction = getUserAction(UserActionTypes.workflow, UserActionActions.create, {
    ...(payloadOverride != null ? { payload: payloadOverride } : {}),
  });

  const builder = createWorkflowUserActionBuilder({
    ...builderArgs,
    userAction,
  });

  renderWithTestingProviders(<EuiCommentList comments={builder.build()} />);

  return { userAction };
};

describe('createWorkflowUserActionBuilder', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: no workflow capabilities → no link
    mockUseKibana.mockReturnValue({
      services: {
        application: {
          capabilities: {},
        },
      },
    });
    mockUseAppUrl.mockReturnValue({
      getAppUrl: jest.fn().mockReturnValue(MOCK_EXECUTION_HREF),
    });
  });

  describe('execution link visibility', () => {
    it('renders the workflow name as plain text when user has no Workflows capabilities', () => {
      buildAndRender();
      // The label renders; no execution link present without capabilities.
      expect(screen.getByTestId('workflow-user-action-label')).toBeInTheDocument();
      expect(screen.queryByTestId('workflow-execution-link')).toBeNull();
    });

    it('renders the workflow name as a link when user has both read and readExecution capabilities', () => {
      mockUseKibana.mockReturnValue({
        services: {
          application: {
            capabilities: {
              workflowsManagement: {
                [WorkflowsManagementUiActions.read]: true,
                [WorkflowsManagementUiActions.readExecution]: true,
              },
            },
          },
        },
      });

      buildAndRender();

      const link = screen.getByTestId('workflow-execution-link');
      expect(link).toBeInTheDocument();
      expect(link).toHaveAttribute('href', MOCK_EXECUTION_HREF);
    });

    it('does not render a link when only readWorkflow capability is present', () => {
      mockUseKibana.mockReturnValue({
        services: {
          application: {
            capabilities: {
              workflowsManagement: {
                [WorkflowsManagementUiActions.read]: true,
                [WorkflowsManagementUiActions.readExecution]: false,
              },
            },
          },
        },
      });

      buildAndRender();
      expect(screen.queryByTestId('workflow-execution-link')).toBeNull();
    });
  });

  describe('origin labels', () => {
    const WORKFLOW_NAME = 'My Workflow';
    const makePayload = (type: string, extra: Record<string, unknown> = {}) => ({
      workflow: { id: 'wf-1', name: WORKFLOW_NAME, executionId: 'exec-1' },
      origin: { type, id: 'x', ...extra },
    });

    it('renders the case origin label', () => {
      buildAndRender({ payloadOverride: makePayload(CASE_WORKFLOW_ORIGIN_TYPE) });
      expect(screen.getByTestId('workflow-user-action-label')).toHaveTextContent(
        `ran ${WORKFLOW_NAME} on this case`
      );
    });

    it('renders the case label when the list-surface run has no origin', () => {
      buildAndRender({
        payloadOverride: { workflow: { id: 'wf-1', name: WORKFLOW_NAME, executionId: 'exec-1' } },
      });
      expect(screen.getByTestId('workflow-user-action-label')).toHaveTextContent(
        `ran ${WORKFLOW_NAME} on this case`
      );
    });

    it('renders the observable origin label with type+value when enriched', () => {
      buildAndRender({
        payloadOverride: makePayload(OBSERVABLE_WORKFLOW_ORIGIN_TYPE, {
          typeKey: 'ip',
          value: '1.2.3.4',
        }),
      });
      // typeKey 'ip' has no builtin label, so the raw key is used as the type label.
      expect(screen.getByTestId('workflow-user-action-label')).toHaveTextContent(
        `ran ${WORKFLOW_NAME} on observable ip: 1.2.3.4`
      );
    });

    it('renders the observable fallback label when not enriched', () => {
      buildAndRender({ payloadOverride: makePayload(OBSERVABLE_WORKFLOW_ORIGIN_TYPE) });
      expect(screen.getByTestId('workflow-user-action-label')).toHaveTextContent(
        `ran ${WORKFLOW_NAME} on an observable`
      );
    });

    it('renders a generic attachment label through the registered attachment type', () => {
      const getWorkflowActivityLabel = jest.fn(
        ({ workflowName }: { workflowName: React.ReactNode }) => (
          <>
            {'ran '}
            {workflowName}
            {' on an alert'}
          </>
        )
      );
      buildAndRender({
        payloadOverride: makePayload(ATTACHMENT_WORKFLOW_ORIGIN_TYPE, {
          attachmentType: SECURITY_ALERT_ATTACHMENT_TYPE,
        }),
        registerDocumentType: {
          id: SECURITY_ALERT_ATTACHMENT_TYPE,
          getWorkflowActivityLabel,
        },
      });

      expect(screen.getByTestId('workflow-user-action-label')).toHaveTextContent(
        `ran ${WORKFLOW_NAME} on an alert`
      );
      expect(getWorkflowActivityLabel).toHaveBeenCalledWith({
        workflowName: expect.anything(),
        count: undefined,
      });
    });

    it('passes the stored count to a generic bulk attachment label', () => {
      const getWorkflowActivityLabel = jest.fn(() => <>{'bulk label'}</>);
      buildAndRender({
        payloadOverride: makePayload(ATTACHMENTS_WORKFLOW_ORIGIN_TYPE, {
          attachmentType: SECURITY_ALERT_ATTACHMENT_TYPE,
          count: 2,
        }),
        registerDocumentType: {
          id: SECURITY_ALERT_ATTACHMENT_TYPE,
          getWorkflowActivityLabel,
        },
      });

      expect(getWorkflowActivityLabel).toHaveBeenCalledWith({
        workflowName: expect.anything(),
        count: 2,
      });
    });
  });

  describe('document action button', () => {
    const WORKFLOW_NAME = 'My Workflow';
    const makePayload = (type: string, extra: Record<string, unknown> = {}) => ({
      workflow: { id: 'wf-1', name: WORKFLOW_NAME, executionId: 'exec-1' },
      origin: { type, id: 'alert-abc', ...extra },
    });

    const makeDocumentAction = (testId: string): jest.Mock =>
      jest.fn(() => ({
        type: AttachmentActionType.CUSTOM as const,
        isPrimary: true,
        render: () => (
          <button type="button" data-test-subj={testId}>
            {'Open document'}
          </button>
        ),
      }));

    it('resolves a generic attachment action directly by registered type', () => {
      const getDocumentAction = makeDocumentAction('test-generic-doc-action');
      const { userAction } = buildAndRender({
        payloadOverride: makePayload(ATTACHMENT_WORKFLOW_ORIGIN_TYPE, {
          attachmentType: SECURITY_ALERT_ATTACHMENT_TYPE,
          index: '.alerts-security.alerts-default',
        }),
        registerDocumentType: {
          id: SECURITY_ALERT_ATTACHMENT_TYPE,
          getDocumentAction,
        },
      });

      expect(screen.getByTestId('test-generic-doc-action')).toBeInTheDocument();
      expect(getDocumentAction).toHaveBeenCalledWith({
        id: userAction.id,
        documentId: 'alert-abc',
        index: '.alerts-security.alerts-default',
      });
    });

    it('does not render the document action when getDocumentAction returns null', () => {
      const getDocumentAction = jest.fn(() => null);
      buildAndRender({
        payloadOverride: makePayload(ATTACHMENT_WORKFLOW_ORIGIN_TYPE, {
          attachmentType: SECURITY_ALERT_ATTACHMENT_TYPE,
        }),
        registerDocumentType: {
          id: SECURITY_ALERT_ATTACHMENT_TYPE,
          getDocumentAction,
        },
      });

      // copy link still present, no document action
      expect(screen.getByLabelText('Copy reference link')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Open document' })).not.toBeInTheDocument();
    });

    it('does not render the document action when the attachment type is not registered', () => {
      // No registerDocumentType — registry only has the comment type from getMockBuilderArgs.
      buildAndRender({
        payloadOverride: makePayload(ATTACHMENT_WORKFLOW_ORIGIN_TYPE, {
          attachmentType: SECURITY_ALERT_ATTACHMENT_TYPE,
          index: '.alerts-security.alerts-default',
        }),
      });

      // Should not throw, and no document action should appear.
      expect(screen.getByTestId('workflow-user-action-label')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Open document' })).not.toBeInTheDocument();
    });

    it('does not render the document action when getDocumentAction is not implemented', () => {
      buildAndRender({
        payloadOverride: makePayload(ATTACHMENT_WORKFLOW_ORIGIN_TYPE, {
          attachmentType: SECURITY_ALERT_ATTACHMENT_TYPE,
          index: '.alerts-security.alerts-default',
        }),
        registerDocumentType: {
          id: SECURITY_ALERT_ATTACHMENT_TYPE,
          // getDocumentAction is undefined — type registered but doesn't implement the hook
          getDocumentAction: undefined,
        },
      });

      expect(screen.queryByRole('button', { name: 'Open document' })).not.toBeInTheDocument();
    });

    it('does not render the document action for cases.attachments (bulk) origin', () => {
      buildAndRender({
        payloadOverride: makePayload(ATTACHMENTS_WORKFLOW_ORIGIN_TYPE, {
          attachmentType: SECURITY_ALERT_ATTACHMENT_TYPE,
        }),
        registerDocumentType: {
          id: SECURITY_ALERT_ATTACHMENT_TYPE,
          getDocumentAction: makeDocumentAction('should-not-appear'),
        },
      });

      expect(screen.queryByTestId('should-not-appear')).not.toBeInTheDocument();
    });

    it('does not render the document action for cases.case origin', () => {
      buildAndRender({
        payloadOverride: makePayload(CASE_WORKFLOW_ORIGIN_TYPE),
        registerDocumentType: {
          id: SECURITY_ALERT_ATTACHMENT_TYPE,
          getDocumentAction: makeDocumentAction('should-not-appear-case'),
        },
      });

      expect(screen.queryByTestId('should-not-appear-case')).not.toBeInTheDocument();
    });

    it('does not render the document action for cases.observable origin', () => {
      buildAndRender({
        payloadOverride: makePayload(OBSERVABLE_WORKFLOW_ORIGIN_TYPE),
        registerDocumentType: {
          id: SECURITY_ALERT_ATTACHMENT_TYPE,
          getDocumentAction: makeDocumentAction('should-not-appear-obs'),
        },
      });

      expect(screen.queryByTestId('should-not-appear-obs')).not.toBeInTheDocument();
    });

    it('always renders the copy-link button alongside the document action', () => {
      buildAndRender({
        payloadOverride: makePayload(ATTACHMENT_WORKFLOW_ORIGIN_TYPE, {
          attachmentType: SECURITY_ALERT_ATTACHMENT_TYPE,
          index: '.alerts-security.alerts-default',
        }),
        registerDocumentType: {
          id: SECURITY_ALERT_ATTACHMENT_TYPE,
          getDocumentAction: makeDocumentAction('test-doc-copy-alongside'),
        },
      });

      expect(screen.getByLabelText('Copy reference link')).toBeInTheDocument();
      expect(screen.getByTestId('test-doc-copy-alongside')).toBeInTheDocument();
    });
  });
});
