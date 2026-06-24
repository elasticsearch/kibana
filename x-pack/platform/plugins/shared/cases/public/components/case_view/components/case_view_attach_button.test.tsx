/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { screen, waitFor } from '@testing-library/react';
import userEvent, { PointerEventsCheckLevel } from '@testing-library/user-event';

import { CaseViewAttachButton } from './case_view_attach_button';
import { basicCase } from '../../../containers/mock';
import { buildCasesPermissions, renderWithTestingProviders } from '../../../common/mock';
import { KibanaServices } from '../../../common/lib/kibana';
import { useCreateAttachments } from '../../../containers/use_create_attachments';
import { useRefreshCaseViewPage } from '../use_on_refresh_case_view_page';
import {
  CasesTimelineIntegrationProvider,
  type CasesTimelineIntegration,
} from '../../timeline_context';
import { SECURITY_TIMELINE_ATTACHMENT_TYPE } from '../../../../common/constants/attachments';

jest.mock('../../attachments/file/upload_file_modal', () => ({
  UploadFileModal: () => <div data-test-subj="upload-file-modal-mock" />,
}));

jest.mock('../../../containers/use_create_attachments');
const useCreateAttachmentsMock = useCreateAttachments as jest.Mock;

jest.mock('../use_on_refresh_case_view_page');

const getConfigMock = jest.spyOn(KibanaServices, 'getConfig');
const getCasesConfig = (attachmentsEnabled: boolean): ReturnType<typeof KibanaServices.getConfig> =>
  ({ attachments: { enabled: attachmentsEnabled } } as ReturnType<typeof KibanaServices.getConfig>);

const SelectTimelineModalMock: React.FC<{
  onSelect: (args: { savedObjectId: string; title: string }) => void;
  onClose: () => void;
}> = ({ onSelect, onClose }) => (
  <div data-test-subj="select-timeline-modal-mock">
    <button
      type="button"
      data-test-subj="select-timeline-modal-mock-select"
      onClick={() => onSelect({ savedObjectId: 'timeline-id-1', title: 'My investigation' })}
    >
      {'select'}
    </button>
    <button type="button" data-test-subj="select-timeline-modal-mock-close" onClick={onClose}>
      {'close'}
    </button>
  </div>
);

const withTimelineIntegration = (children: React.ReactElement) => (
  <CasesTimelineIntegrationProvider
    timelineIntegration={
      {
        components: { SelectTimelineModal: SelectTimelineModalMock },
      } as unknown as CasesTimelineIntegration
    }
  >
    {children}
  </CasesTimelineIntegrationProvider>
);

describe('CaseViewAttachButton', () => {
  // EuiPopover panel has `pointer-events: none` in jsdom; bypass the check so
  // userEvent can click the menu items rendered inside it.
  const user = userEvent.setup({ pointerEventsCheck: PointerEventsCheckLevel.Never });

  const createAttachmentsMutate = jest.fn();
  const refreshCaseViewPageMock = useRefreshCaseViewPage() as jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    getConfigMock.mockReturnValue(getCasesConfig(false));
    useCreateAttachmentsMock.mockReturnValue({
      isLoading: false,
      mutate: createAttachmentsMutate,
    });
  });

  it('renders the attach button', async () => {
    renderWithTestingProviders(<CaseViewAttachButton caseData={basicCase} />);
    expect(await screen.findByTestId('case-view-attach-button')).toBeInTheDocument();
  });

  it('opens the popover with the upload-file menu item', async () => {
    renderWithTestingProviders(<CaseViewAttachButton caseData={basicCase} />);
    await user.click(await screen.findByTestId('case-view-attach-button'));
    expect(await screen.findByTestId('case-view-attach-menu-file')).toBeInTheDocument();
  });

  it('opens the upload file modal when File is selected', async () => {
    renderWithTestingProviders(<CaseViewAttachButton caseData={basicCase} />);
    await user.click(await screen.findByTestId('case-view-attach-button'));
    await user.click(await screen.findByTestId('case-view-attach-menu-file'));
    await screen.findByTestId('upload-file-modal-mock');
  });

  it('does not render without `createComment` permission', () => {
    renderWithTestingProviders(<CaseViewAttachButton caseData={basicCase} />, {
      wrapperProps: {
        permissions: buildCasesPermissions({ createComment: false }),
      },
    });
    expect(screen.queryByTestId('case-view-attach-button')).not.toBeInTheDocument();
  });

  describe('Timeline option', () => {
    it('is hidden when the timeline integration is absent (e.g. observability)', async () => {
      getConfigMock.mockReturnValue(getCasesConfig(true));
      renderWithTestingProviders(<CaseViewAttachButton caseData={basicCase} />);
      await user.click(await screen.findByTestId('case-view-attach-button'));
      expect(screen.queryByTestId('case-view-attach-menu-timeline')).not.toBeInTheDocument();
    });

    it('is hidden when the attachments feature flag is off', async () => {
      getConfigMock.mockReturnValue(getCasesConfig(false));
      renderWithTestingProviders(
        withTimelineIntegration(<CaseViewAttachButton caseData={basicCase} />)
      );
      await user.click(await screen.findByTestId('case-view-attach-button'));
      expect(screen.queryByTestId('case-view-attach-menu-timeline')).not.toBeInTheDocument();
    });

    it('shows the Timeline option and opens the modal when flag is on and integration is present', async () => {
      getConfigMock.mockReturnValue(getCasesConfig(true));
      renderWithTestingProviders(
        withTimelineIntegration(<CaseViewAttachButton caseData={basicCase} />)
      );
      await user.click(await screen.findByTestId('case-view-attach-button'));
      await user.click(await screen.findByTestId('case-view-attach-menu-timeline'));
      await screen.findByTestId('select-timeline-modal-mock');
    });

    it('creates a security.timeline attachment when a timeline is selected', async () => {
      getConfigMock.mockReturnValue(getCasesConfig(true));
      renderWithTestingProviders(
        withTimelineIntegration(<CaseViewAttachButton caseData={basicCase} />)
      );
      await user.click(await screen.findByTestId('case-view-attach-button'));
      await user.click(await screen.findByTestId('case-view-attach-menu-timeline'));
      await user.click(await screen.findByTestId('select-timeline-modal-mock-select'));

      await waitFor(() => {
        expect(createAttachmentsMutate).toHaveBeenCalledWith(
          {
            caseId: basicCase.id,
            caseOwner: expect.any(String),
            attachments: [
              {
                type: SECURITY_TIMELINE_ATTACHMENT_TYPE,
                attachmentId: 'timeline-id-1',
                metadata: { title: 'My investigation' },
              },
            ],
          },
          { onSuccess: expect.any(Function) }
        );
      });

      expect(screen.queryByTestId('select-timeline-modal-mock')).not.toBeInTheDocument();
    });

    it('refreshes the case view page after a successful timeline attachment', async () => {
      getConfigMock.mockReturnValue(getCasesConfig(true));
      renderWithTestingProviders(
        withTimelineIntegration(<CaseViewAttachButton caseData={basicCase} />)
      );
      await user.click(await screen.findByTestId('case-view-attach-button'));
      await user.click(await screen.findByTestId('case-view-attach-menu-timeline'));
      await user.click(await screen.findByTestId('select-timeline-modal-mock-select'));

      await waitFor(() => {
        expect(createAttachmentsMutate).toHaveBeenCalled();
      });

      const { onSuccess } = createAttachmentsMutate.mock.calls[0][1] as {
        onSuccess: () => void;
      };
      onSuccess();

      expect(refreshCaseViewPageMock).toHaveBeenCalledTimes(1);
    });
  });
});
