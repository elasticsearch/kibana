/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useState } from 'react';
import {
  EuiButtonIcon,
  EuiContextMenuItem,
  EuiContextMenuPanel,
  EuiIcon,
  EuiPopover,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import { useAbortController } from '@kbn/react-hooks';
import type { Streams } from '@kbn/streams-schema';
import { useKibana } from '../../../../hooks/use_kibana';
import { StreamDeleteModal } from '../../../stream_delete_modal';

interface StreamDetailActionsMenuProps {
  canDelete: boolean;
  definition: Streams.all.GetResponse;
}

export function StreamDetailActionsMenu({ canDelete, definition }: StreamDetailActionsMenuProps) {
  const {
    core: {
      application: { navigateToApp },
    },
    dependencies: {
      start: {
        streams: { streamsRepositoryClient },
      },
    },
  } = useKibana();

  const [isPopoverOpen, setIsPopoverOpen] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const abortController = useAbortController();

  const streamActionsLabel = i18n.translate(
    'xpack.streams.streamDetailActionsMenu.buttonAriaLabel',
    {
      defaultMessage: 'Stream actions',
    }
  );

  const deleteStream = useCallback(async () => {
    await streamsRepositoryClient.fetch('DELETE /api/streams/{name} 2023-10-31', {
      params: { path: { name: definition.stream.name } },
      signal: abortController.signal,
    });
    navigateToApp('/streams');
  }, [definition.stream.name, abortController.signal, navigateToApp, streamsRepositoryClient]);

  if (!canDelete) {
    return null;
  }

  const actionsButton = (
    <EuiToolTip content={streamActionsLabel} disableScreenReaderOutput>
      <EuiButtonIcon
        aria-label={streamActionsLabel}
        data-test-subj="streamsAppStreamDetailActionsButton"
        iconType="boxesVertical"
        onClick={() => setIsPopoverOpen((isOpen) => !isOpen)}
      />
    </EuiToolTip>
  );

  return (
    <>
      <EuiPopover
        aria-label={i18n.translate('xpack.streams.streamDetailActionsMenu.ariaLabel', {
          defaultMessage: 'Stream actions',
        })}
        button={actionsButton}
        isOpen={isPopoverOpen}
        closePopover={() => setIsPopoverOpen(false)}
        panelPaddingSize="none"
        anchorPosition="downRight"
      >
        <EuiContextMenuPanel
          items={[
            <EuiContextMenuItem
              key="delete"
              color="danger"
              data-test-subj="deleteQueryStreamButton"
              icon={<EuiIcon type="trash" color="danger" aria-hidden={true} />}
              onClick={() => {
                setIsPopoverOpen(false);
                setShowDeleteModal(true);
              }}
            >
              {i18n.translate('xpack.streams.streamDetailActionsMenu.deleteStreamLabel', {
                defaultMessage: 'Delete stream',
              })}
            </EuiContextMenuItem>,
          ]}
        />
      </EuiPopover>

      {showDeleteModal ? (
        <StreamDeleteModal
          name={definition.stream.name}
          onClose={() => setShowDeleteModal(false)}
          onCancel={() => setShowDeleteModal(false)}
          onDelete={deleteStream}
        />
      ) : null}
    </>
  );
}
