/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */
import type { EuiBasicTableColumn } from '@elastic/eui';
import {
  EuiBasicTable,
  EuiButtonIcon,
  EuiLink,
  EuiText,
  EuiToolTip,
  useEuiTheme,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import React, { useCallback, useMemo } from 'react';
import type {
  Attachment,
  AttachmentType,
} from '@kbn/streams-plugin/server/lib/streams/attachments/types';
import { useKibana } from '../../hooks/use_kibana';
import { AttachmentTagsList } from './attachment_tags_list';
import { ATTACHMENT_TYPE_CONFIG } from './attachment_constants';
import { AttachmentTypeBadge } from './attachment_type_badge';
import { getAttachmentUrl } from './get_attachment_url';
import { useTimefilter } from '../../hooks/use_timefilter';

interface BaseAttachmentsTableProps {
  entityId?: string;
  loading: boolean;
  attachments: Attachment[];
  compact?: boolean;
  selectedAttachments?: Attachment[];
  setSelectedAttachments?: (attachments: Attachment[]) => void;
  onUnlinkAttachment?: (attachment: Attachment) => void;
  dataTestSubj?: string;
  selectionDisabled?: boolean;
}

interface WithActionsProps extends BaseAttachmentsTableProps {
  showActions: true;
  onViewDetails: (attachment: Attachment) => void;
}

interface WithoutActionsProps extends BaseAttachmentsTableProps {
  showActions?: false;
  onViewDetails?: never;
}

type AttachmentsTableProps = WithActionsProps | WithoutActionsProps;

export function AttachmentsTable({
  attachments,
  compact = false,
  showActions = false,
  selectedAttachments,
  setSelectedAttachments,
  onUnlinkAttachment,
  onViewDetails,
  loading,
  entityId,
  dataTestSubj,
  selectionDisabled = false,
}: AttachmentsTableProps) {
  const {
    core: { application },
    services: { telemetryClient },
    dependencies: {
      start: { share },
    },
  } = useKibana();

  const { euiTheme } = useEuiTheme();
  const { timeState } = useTimefilter();

  const navigateToAttachment = useCallback(
    ({ attachment, url }: { attachment: Attachment; url: string }) => {
      if (entityId) {
        telemetryClient.trackAttachmentClick({
          attachment_id: attachment.id,
          attachment_type: attachment.type,
          name: entityId,
        });
      }
      application.navigateToUrl(url);
    },
    [application, entityId, telemetryClient]
  );

  const columns = useMemo((): Array<EuiBasicTableColumn<Attachment>> => {
    const viewDetailsLabel = i18n.translate(
      'xpack.streams.attachmentTable.detailsButtonAriaLabel',
      { defaultMessage: 'View details' }
    );

    const detailsColumn: EuiBasicTableColumn<Attachment> = {
      field: 'details',
      name: '',
      width: '40px',
      render: (_, attachment) => (
        <EuiToolTip content={viewDetailsLabel} disableScreenReaderOutput>
          <EuiButtonIcon
            data-test-subj="streamsAppAttachmentDetailsButton"
            iconType="maximize"
            aria-label={viewDetailsLabel}
            onClick={() => onViewDetails?.(attachment)}
          />
        </EuiToolTip>
      ),
    };

    const actionsColumn: EuiBasicTableColumn<Attachment> = {
      name: i18n.translate('xpack.streams.attachmentTable.actionsColumnTitle', {
        defaultMessage: 'Actions',
      }),
      actions: [
        {
          name: i18n.translate('xpack.streams.attachmentTable.seeDetailsActionTitle', {
            defaultMessage: 'See details',
          }),
          description: i18n.translate('xpack.streams.attachmentTable.seeDetailsActionDescription', {
            defaultMessage: 'See attachment details',
          }),
          type: 'icon',
          icon: 'tableDensityLow',
          onClick: (attachment) => onViewDetails?.(attachment),
          'data-test-subj': 'streamsAppAttachmentSeeDetailsAction',
        },
        {
          name: (attachment) => {
            const config = ATTACHMENT_TYPE_CONFIG[attachment.type];
            return i18n.translate('xpack.streams.attachmentTable.goToActionTitle', {
              defaultMessage: 'Go to {type}',
              values: { type: config.label },
            });
          },
          description: i18n.translate('xpack.streams.attachmentTable.goToActionDescription', {
            defaultMessage: 'Navigate to attachment',
          }),
          type: 'icon',
          icon: (attachment) => ATTACHMENT_TYPE_CONFIG[attachment.type].icon,
          onClick: (attachment) => {
            const url = getAttachmentUrl(
              attachment.redirectId,
              attachment.type,
              share.url.locators,
              timeState.timeRange
            );
            if (url) {
              navigateToAttachment({ attachment, url });
            }
          },
          'data-test-subj': 'streamsAppAttachmentGoToAction',
        },
        {
          name: i18n.translate('xpack.streams.attachmentTable.removeActionTitle', {
            defaultMessage: 'Remove attachment',
          }),
          description: i18n.translate('xpack.streams.attachmentTable.removeActionDescription', {
            defaultMessage: 'Remove this attachment from stream',
          }),
          type: 'icon',
          icon: 'linkSlash',
          enabled: () => onUnlinkAttachment !== undefined,
          onClick: (attachment) => {
            onUnlinkAttachment?.(attachment);
          },
          'data-test-subj': 'streamsAppAttachmentUnlinkAction',
        },
      ],
    };

    return [
      ...(showActions ? [detailsColumn] : []),
      {
        field: 'label',
        name: i18n.translate('xpack.streams.attachmentTable.titleColumnTitle', {
          defaultMessage: 'Title',
        }),
        render: (_, attachment) => {
          const url = getAttachmentUrl(
            attachment.redirectId,
            attachment.type,
            share.url.locators,
            timeState.timeRange
          );

          if (!url) {
            return <EuiText size="s">{attachment.title}</EuiText>;
          }

          return (
            <EuiLink
              data-test-subj="streamsAppAttachmentColumnsLink"
              onClick={() => navigateToAttachment({ attachment, url })}
            >
              {attachment.title}
            </EuiLink>
          );
        },
      },
      {
        field: 'type',
        name: i18n.translate('xpack.streams.attachmentTable.typeColumnTitle', {
          defaultMessage: 'Type',
        }),
        render: (type: AttachmentType) => <AttachmentTypeBadge type={type} />,
      },
      ...(!compact
        ? ([
            {
              field: 'tags',
              name: i18n.translate('xpack.streams.attachmentTable.tagsColumnTitle', {
                defaultMessage: 'Tags',
              }),
              render: (_, { tags }) => <AttachmentTagsList tags={tags} />,
            },
          ] satisfies Array<EuiBasicTableColumn<Attachment>>)
        : []),
      ...(showActions ? [actionsColumn] : []),
    ];
  }, [
    compact,
    showActions,
    share,
    timeState,
    onUnlinkAttachment,
    onViewDetails,
    navigateToAttachment,
  ]);

  const items = useMemo(() => {
    return attachments ?? [];
  }, [attachments]);

  return (
    <EuiBasicTable
      css={css`
        & thead tr {
          background-color: ${euiTheme.colors.backgroundBaseSubdued};
        }
      `}
      tableCaption={i18n.translate('xpack.streams.attachmentTable.tableCaption', {
        defaultMessage: 'List of attachments',
      })}
      data-test-subj={dataTestSubj}
      columns={columns}
      itemId="id"
      items={items}
      loading={loading}
      selection={
        setSelectedAttachments
          ? {
              onSelectionChange: setSelectedAttachments,
              selected: selectedAttachments,
              selectable: selectionDisabled ? () => false : undefined,
            }
          : undefined
      }
    />
  );
}
