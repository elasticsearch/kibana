/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useState } from 'react';
import { EuiButton, EuiContextMenu, EuiPopover } from '@elastic/eui';
import type { EuiContextMenuPanelDescriptor } from '@elastic/eui';
import { SECURITY_TIMELINE_ATTACHMENT_TYPE } from '../../../../common/constants/attachments';
import type { CaseUI } from '../../../../common/ui/types';
import { UploadFileModal } from '../../attachments/file/upload_file_modal';
import { AttachSavedObjectModalLazy } from '../../attachments/common/saved_object/attach_saved_object_modal_lazy';
import { useCasesContext } from '../../cases_context/use_cases_context';
import { useTimelineContext } from '../../timeline_context/use_timeline_context';
import { useCasesConfig, KibanaServices } from '../../../common/lib/kibana';
import { useCreateAttachments } from '../../../containers/use_create_attachments';
import { useRefreshCaseViewPage } from '../use_on_refresh_case_view_page';
import * as i18n from './translations';

export interface CaseViewAttachButtonProps {
  caseData: CaseUI;
  fill?: boolean;
}

type ActiveModal = 'file' | 'timeline' | 'savedObject' | null;

const CaseViewAttachButtonComponent: React.FC<CaseViewAttachButtonProps> = ({
  caseData,
  fill = false,
}) => {
  const { permissions, owner } = useCasesContext();
  const timelineContext = useTimelineContext();
  const SelectTimelineModal = timelineContext?.components?.SelectTimelineModal;
  const { attachmentsEnabled } = useCasesConfig();
  const { mutate: createAttachments } = useCreateAttachments();
  const refreshCaseViewPage = useRefreshCaseViewPage();

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [activeModal, setActiveModal] = useState<ActiveModal>(null);

  const closePopover = useCallback(() => setIsPopoverOpen(false), []);
  const togglePopover = useCallback(() => setIsPopoverOpen((open) => !open), []);
  const closeModal = useCallback(() => setActiveModal(null), []);

  const openFile = useCallback(() => {
    closePopover();
    setActiveModal('file');
  }, [closePopover]);

  const openTimeline = useCallback(() => {
    closePopover();
    setActiveModal('timeline');
  }, [closePopover]);

  // Gated by feature flag AND presence of the timeline integration
  const showTimeline = attachmentsEnabled && Boolean(SelectTimelineModal);

  const onSelectTimeline = useCallback(
    ({ savedObjectId, title }: { savedObjectId: string; title: string }) => {
      closeModal();
      createAttachments(
        {
          caseId: caseData.id,
          caseOwner: owner[0],
          attachments: [
            {
              type: SECURITY_TIMELINE_ATTACHMENT_TYPE,
              attachmentId: savedObjectId,
              metadata: { title },
            },
          ],
        },
        { onSuccess: refreshCaseViewPage }
      );
    },
    [caseData.id, closeModal, createAttachments, owner, refreshCaseViewPage]
  );

  const openSavedObject = useCallback(() => {
    closePopover();
    setActiveModal('savedObject');
  }, [closePopover]);

  const attachmentsFlagEnabled = KibanaServices.getConfig()?.attachments?.enabled === true;

  const panels = useMemo<EuiContextMenuPanelDescriptor[]>(
    () => [
      {
        id: 0,
        items: [
          {
            name: i18n.ATTACH_MENU_FILE,
            onClick: openFile,
            'data-test-subj': 'case-view-attach-menu-file',
          },
          ...(showTimeline
            ? [
                {
                  name: i18n.ATTACH_MENU_TIMELINE,
                  onClick: openTimeline,
                  'data-test-subj': 'case-view-attach-menu-timeline',
                },
              ]
            : []),
          ...(attachmentsFlagEnabled
            ? [
                {
                  name: i18n.ATTACH_MENU_SAVED_OBJECT,
                  onClick: openSavedObject,
                  'data-test-subj': 'case-view-attach-menu-saved-object',
                },
              ]
            : []),
        ],
      },
    ],
    [openFile, openTimeline, showTimeline, openSavedObject, attachmentsFlagEnabled]
  );

  if (!permissions.createComment) {
    return null;
  }

  const button = (
    <EuiButton
      iconType="paperClip"
      iconSide="left"
      fill={fill}
      onClick={togglePopover}
      data-test-subj="case-view-attach-button"
    >
      {i18n.ATTACH_BUTTON_LABEL}
    </EuiButton>
  );

  return (
    <>
      <EuiPopover
        aria-label={i18n.ATTACH_MENU_LABEL}
        button={button}
        isOpen={isPopoverOpen}
        closePopover={closePopover}
        panelPaddingSize="none"
        anchorPosition="downLeft"
        data-test-subj="case-view-attach-popover"
      >
        <EuiContextMenu initialPanelId={0} panels={panels} />
      </EuiPopover>
      {activeModal === 'file' && <UploadFileModal caseId={caseData.id} onClose={closeModal} />}
      {activeModal === 'timeline' && SelectTimelineModal && (
        <SelectTimelineModal onSelect={onSelectTimeline} onClose={closeModal} />
      )}
      {activeModal === 'savedObject' && (
        <AttachSavedObjectModalLazy caseData={caseData} onClose={closeModal} />
      )}
    </>
  );
};

CaseViewAttachButtonComponent.displayName = 'CaseViewAttachButton';

export const CaseViewAttachButton = React.memo(CaseViewAttachButtonComponent);
