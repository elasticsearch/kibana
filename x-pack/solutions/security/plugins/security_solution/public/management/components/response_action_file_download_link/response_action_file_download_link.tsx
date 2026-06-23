/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { memo, useMemo } from 'react';
import {
  EuiButtonEmpty,
  EuiSkeletonText,
  EuiText,
  EuiSpacer,
  EuiIcon,
  EuiFlexGroup,
  EuiFlexItem,
  type EuiTextProps,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import styled from 'styled-components';
import { FormattedMessage } from '@kbn/i18n-react';
import { useHttp } from '../../../common/lib/kibana';
import { RESPONSE_ACTIONS_ZIP_PASSCODE } from '../../../../common/endpoint/service/response_actions/constants';
import { getFileDownloadId } from '../../../../common/endpoint/service/response_actions/get_file_download_id';
import { resolvePathVariables } from '../../../common/utils/resolve_path_variables';
import { FormattedError } from '../formatted_error';
import { useGetFileInfo } from '../../hooks/response_actions/use_get_file_info';
import { useTestIdGenerator } from '../../hooks/use_test_id_generator';
import type { MaybeImmutable } from '../../../../common/endpoint/types';
import type { ActionDetails } from '../../../../common/endpoint/types/actions';
import { ACTION_AGENT_FILE_DOWNLOAD_ROUTE } from '../../../../common/endpoint/constants';

const STYLE_INHERIT_FONT_FAMILY = {
  fontFamily: 'inherit',
};

const DEFAULT_BUTTON_TITLE = i18n.translate(
  'xpack.securitySolution.responseActionFileDownloadLink.downloadButtonLabel',
  { defaultMessage: 'Click here to download' }
);

export const FILE_NO_LONGER_AVAILABLE_MESSAGE = i18n.translate(
  'xpack.securitySolution.responseActionFileDownloadLink.fileNoLongerAvailable',
  { defaultMessage: 'File has expired and is no longer available for download.' }
);

export const FILE_DELETED_MESSAGE = i18n.translate(
  'xpack.securitySolution.responseActionFileDownloadLink.deleteNotice',
  {
    defaultMessage:
      'Files are periodically deleted to clear storage space. Download and save file locally if needed.',
  }
);

export const FILE_PASSCODE_INFO_MESSAGE = (passcode: string) =>
  i18n.translate('xpack.securitySolution.responseActionFileDownloadLink.passcodeInfo', {
    defaultMessage: '(ZIP file passcode: {passcode}).',
    values: { passcode },
  });

export const FILE_TRUNCATED_MESSAGE = i18n.translate(
  'xpack.securitySolution.responseActionFileDownloadLink.fileTruncated',
  {
    defaultMessage:
      'Output data in the provided zip file is truncated due to file size limitations.',
  }
);

const FileDownloadLinkContainer = styled.div`
  & > * {
    vertical-align: middle;
  }
`;

interface TruncatedTextInfoProps {
  textSize: Required<ResponseActionFileDownloadLinkProps['textSize']>;
  'data-test-subj'?: string;
}

const TruncatedTextInfo = memo<TruncatedTextInfoProps>(
  ({ textSize, 'data-test-subj': dataTestSubj }) => {
    const alertIconSize = useMemo(() => (textSize === 'xs' ? 's' : 'm'), [textSize]);
    return (
      <>
        <EuiSpacer size="m" />
        <EuiFlexGroup gutterSize="s" justifyContent="flexStart" alignItems="center">
          <EuiFlexItem grow={false}>
            <EuiIcon size={alertIconSize} type="warning" color="warning" aria-hidden={true} />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiText size={textSize} color="warning" data-test-subj={dataTestSubj}>
              {FILE_TRUNCATED_MESSAGE}
            </EuiText>
          </EuiFlexItem>
        </EuiFlexGroup>
      </>
    );
  }
);

TruncatedTextInfo.displayName = 'TruncatedTextInfo';
export interface ResponseActionFileDownloadLinkProps {
  action: MaybeImmutable<ActionDetails>;
  /** If left undefined, the first agent that the action was sent to will be used */
  agentId?: string;
  buttonTitle?: string;
  canAccessFileDownloadLink: boolean;
  isTruncatedFile?: boolean;
  'data-test-subj'?: string;
  textSize?: EuiTextProps['size'];
  /**
   * If zip file needs a passcode to be opened. If `false`, then the passcode text will not be displayed.
   * Default is `true`
   */
  showPasscode?: boolean;
}

/**
 * Displays the download link for a file retrieved via a Response Action. The download link
 * button will only be displayed if the user has authorization to use file operations.
 *
 * NOTE: Currently displays only the link for the first host in the Action
 */
export const ResponseActionFileDownloadLink = memo<ResponseActionFileDownloadLinkProps>(
  ({
    action: _action,
    agentId,
    buttonTitle = DEFAULT_BUTTON_TITLE,
    canAccessFileDownloadLink,
    isTruncatedFile = false,
    showPasscode = true,
    textSize = 's',
    'data-test-subj': dataTestSubj,
  }) => {
    const action = _action as ActionDetails; // cast to remove `Immutable`
    const getTestId = useTestIdGenerator(dataTestSubj);
    const http = useHttp();

    const isCompleted = useMemo(() => {
      return agentId ? action.agentState[agentId]?.isCompleted : action.isCompleted;
    }, [action.agentState, action.isCompleted, agentId]);

    const wasSuccessful = useMemo(() => {
      return agentId ? action.agentState[agentId]?.wasSuccessful : action.wasSuccessful;
    }, [action.agentState, action.wasSuccessful, agentId]);

    const shouldFetchFileInfo: boolean = useMemo(() => {
      return isCompleted && wasSuccessful;
    }, [isCompleted, wasSuccessful]);

    const downloadUrl: string = useMemo(() => {
      return `${http.basePath.get()}${resolvePathVariables(ACTION_AGENT_FILE_DOWNLOAD_ROUTE, {
        action_id: action.id,
        file_id: getFileDownloadId(action, agentId),
      })}?apiVersion=2023-10-31`;
    }, [action, agentId, http.basePath]);

    const {
      isLoading,
      data: fileInfo,
      error,
    } = useGetFileInfo(action, undefined, {
      enabled: canAccessFileDownloadLink && shouldFetchFileInfo,
    });

    if (!canAccessFileDownloadLink || !isCompleted || !wasSuccessful) {
      return null;
    }

    if (isLoading) {
      return (
        <div data-test-subj={getTestId()}>
          <EuiSkeletonText lines={1} data-test-subj={getTestId('loading')} />
        </div>
      );
    }

    // Check if file is no longer available
    if ((error && error?.response?.status === 404) || fileInfo?.data.status === 'DELETED') {
      return (
        <div data-test-subj={getTestId()}>
          <EuiText
            size={textSize}
            color="warning"
            data-test-subj={getTestId('fileNoLongerAvailable')}
          >
            {FILE_NO_LONGER_AVAILABLE_MESSAGE}
          </EuiText>
        </div>
      );
    } else if (error) {
      return (
        <EuiText size={textSize} color="warning" data-test-subj={getTestId()}>
          <FormattedMessage
            id="xpack.securitySolution.responseActionFileDownloadLink.apiError"
            defaultMessage="Attempt to retrieve file download information failed."
          />
          <FormattedError error={error} data-test-subj={getTestId('apiError')} />
        </EuiText>
      );
    }

    return (
      <FileDownloadLinkContainer data-test-subj={dataTestSubj}>
        <EuiButtonEmpty
          href={downloadUrl}
          iconType="download"
          data-test-subj={getTestId('downloadButton')}
          flush="left"
          css={STYLE_INHERIT_FONT_FAMILY}
          iconSize="s"
          download
        >
          <EuiText size={textSize}>{buttonTitle}</EuiText>
        </EuiButtonEmpty>
        {showPasscode && (
          <EuiText
            size={textSize}
            data-test-subj={getTestId('passcodeMessage')}
            className="eui-displayInline"
          >
            {FILE_PASSCODE_INFO_MESSAGE(RESPONSE_ACTIONS_ZIP_PASSCODE[action.agentType])}
          </EuiText>
        )}
        <EuiText size={textSize} color="warning" data-test-subj={getTestId('fileDeleteMessage')}>
          {FILE_DELETED_MESSAGE}
        </EuiText>
        {isTruncatedFile && (
          <TruncatedTextInfo
            textSize={textSize}
            data-test-subj={getTestId('fileTruncatedMessage')}
          />
        )}
      </FileDownloadLinkContainer>
    );
  }
);
ResponseActionFileDownloadLink.displayName = 'ResponseActionFileDownloadLink';
