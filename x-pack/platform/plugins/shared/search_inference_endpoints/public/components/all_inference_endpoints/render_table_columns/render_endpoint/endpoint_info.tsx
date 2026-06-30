/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  EuiBadge,
  EuiBadgeGroup,
  EuiBetaBadge,
  EuiButtonIcon,
  EuiCopy,
  EuiFlexGroup,
  EuiFlexItem,
  EuiToolTip,
} from '@elastic/eui';
import { i18n } from '@kbn/i18n';
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { TASK_TYPE_DESCRIPTIONS } from '@kbn/inference-endpoint-ui-common';
import type { InferenceInferenceEndpointInfo } from '@elastic/elasticsearch/lib/api/types';
import { isEndpointPreconfigured } from '../../../../utils/preconfigured_endpoint_helper';
import { isProviderTechPreview } from '../../../../utils/reranker_helper';
import { EndpointInfoContainer, getCopyButtonStyles } from '../../styles';

const COPIED_ICON_DISPLAY_DURATION_MS = 1000;

export interface EndpointInfoProps {
  inferenceId: string;
  endpointInfo: InferenceInferenceEndpointInfo;
}

export const EndpointInfo: React.FC<EndpointInfoProps> = ({ inferenceId, endpointInfo }) => {
  const [isCopied, setIsCopied] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const { task_type: taskType } = endpointInfo;
  const isPreconfigured = isEndpointPreconfigured(inferenceId);
  const isTechPreview = isProviderTechPreview(endpointInfo);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleCopy = useCallback((copyFn: () => void) => {
    copyFn();
    setIsCopied(true);
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    timeoutRef.current = setTimeout(() => {
      setIsCopied(false);
    }, COPIED_ICON_DISPLAY_DURATION_MS);
  }, []);

  return (
    <EuiFlexGroup direction="column" gutterSize="xs">
      <EuiFlexItem grow={false}>
        <EuiFlexGroup
          gutterSize="xs"
          alignItems="center"
          responsive={false}
          css={EndpointInfoContainer}
        >
          <EuiFlexItem grow={false}>
            <strong>{inferenceId}</strong>
          </EuiFlexItem>
          <EuiFlexItem grow={false} className="copyButton" css={getCopyButtonStyles(isCopied)}>
            <EuiCopy
              textToCopy={inferenceId}
              afterMessage={i18n.translate(
                'xpack.searchInferenceEndpoints.elasticsearch.endpointInfo.copyIdCopied',
                { defaultMessage: 'Copied' }
              )}
            >
              {(copy) => (
                <EuiToolTip
                  content={
                    isCopied
                      ? i18n.translate(
                          'xpack.searchInferenceEndpoints.elasticsearch.endpointInfo.copyIdCopied',
                          { defaultMessage: 'Copied' }
                        )
                      : i18n.translate(
                          'xpack.searchInferenceEndpoints.elasticsearch.endpointInfo.copyIdToClipboard',
                          { defaultMessage: 'Copy endpoint ID to clipboard' }
                        )
                  }
                  disableScreenReaderOutput
                >
                  <EuiButtonIcon
                    size="xs"
                    display="empty"
                    onClick={() => handleCopy(copy)}
                    iconType={isCopied ? 'check' : 'copy'}
                    color={isCopied ? 'success' : 'text'}
                    data-test-subj={
                      isCopied
                        ? 'inference-endpoint-copy-id-button-copied'
                        : 'inference-endpoint-copy-id-button'
                    }
                    aria-label={
                      isCopied
                        ? i18n.translate(
                            'xpack.searchInferenceEndpoints.elasticsearch.endpointInfo.copyIdCopied',
                            { defaultMessage: 'Copied' }
                          )
                        : i18n.translate(
                            'xpack.searchInferenceEndpoints.elasticsearch.endpointInfo.copyIdToClipboard',
                            { defaultMessage: 'Copy endpoint ID to clipboard' }
                          )
                    }
                  />
                </EuiToolTip>
              )}
            </EuiCopy>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexItem>
      <EuiFlexItem grow={false}>
        <EuiBadgeGroup gutterSize="xs">
          {taskType != null && (
            <EuiToolTip content={TASK_TYPE_DESCRIPTIONS[taskType] ?? taskType}>
              <EuiBadge
                tabIndex={0}
                data-test-subj={`table-column-task-type-${taskType}`}
                color="hollow"
              >
                {taskType}
              </EuiBadge>
            </EuiToolTip>
          )}
          {isPreconfigured && (
            <EuiToolTip
              content={i18n.translate(
                'xpack.searchInferenceEndpoints.elasticsearch.endpointInfo.preconfiguredTooltip',
                {
                  defaultMessage: 'This endpoint is preconfigured by Elastic and cannot be deleted',
                }
              )}
            >
              <EuiBadge tabIndex={0} data-test-subj="preconfiguredBadge" color="hollow">
                {i18n.translate(
                  'xpack.searchInferenceEndpoints.elasticsearch.endpointInfo.preconfigured',
                  { defaultMessage: 'PRECONFIGURED' }
                )}
              </EuiBadge>
            </EuiToolTip>
          )}
          {isTechPreview && (
            <EuiBetaBadge
              tabIndex={0}
              label={i18n.translate(
                'xpack.searchInferenceEndpoints.elasticsearch.endpointInfo.techPreview',
                { defaultMessage: 'TECH PREVIEW' }
              )}
              tooltipContent={i18n.translate(
                'xpack.searchInferenceEndpoints.elasticsearch.endpointInfo.techPreviewTooltip',
                {
                  defaultMessage:
                    'This functionality is experimental and not supported. It may change or be removed at any time.',
                }
              )}
              size="s"
              color="subdued"
              alignment="middle"
              data-test-subj="techPreviewBadge"
            />
          )}
        </EuiBadgeGroup>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
