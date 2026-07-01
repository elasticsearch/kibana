/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useCallback, useMemo, useState } from 'react';
import {
  EuiBadge,
  EuiButton,
  EuiButtonEmpty,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiIcon,
  EuiSpacer,
  EuiSplitPanel,
  EuiText,
  EuiTextBlockTruncate,
  EuiTitle,
} from '@elastic/eui';
import type { ApplicationStart } from '@kbn/core-application-browser';
import type { AttachmentRenderProps } from '@kbn/agent-builder-browser/attachments';
import type { Attachment } from '@kbn/agent-builder-common/attachments';
import type {
  CASE_ATTACHMENT_TYPE,
  CaseAttachmentData,
} from '../../../common/types/agent_builder/attachment_schemas';
import { CreationDate } from '../../components/creation_date';
import { CaseMetaRow } from './case_meta_row';
import { getCaseUrls } from './route_helpers';
import {
  CASE_HEADER,
  CATEGORY,
  CONNECTOR,
  CREATED,
  DESCRIPTION,
  GO_TO_CASE,
  OBSERVABLES,
  SHOW_LESS,
  SHOW_MORE,
  TAGS,
  UPDATED,
} from './translations';

const keyColumnWidth = { minWidth: 110 };
const DetailRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
  <EuiFlexGroup gutterSize="s" responsive={false} alignItems="flexStart">
    <EuiFlexItem grow={false} style={keyColumnWidth}>
      <EuiText size="s">
        <strong>{label}</strong>
      </EuiText>
    </EuiFlexItem>
    <EuiFlexItem>
      <EuiText size="s" color="subdued">
        {value}
      </EuiText>
    </EuiFlexItem>
  </EuiFlexGroup>
);
DetailRow.displayName = 'DetailRow';

export type CaseAttachment = Attachment<typeof CASE_ATTACHMENT_TYPE, CaseAttachmentData>;

interface Services {
  application: ApplicationStart;
}

interface InlineContentProps extends AttachmentRenderProps<CaseAttachment> {
  application: ApplicationStart;
}

const CaseInlineContent: React.FC<InlineContentProps> = ({ attachment, application }) => {
  const { data } = attachment;
  const idLabel = data.incremental_id ? `#${data.incremental_id}` : null;
  const [expanded, setExpanded] = useState(false);
  const toggleExpanded = useCallback(() => {
    setExpanded((_expanded) => !_expanded);
  }, []);

  const caseUrls = useMemo(() => {
    return getCaseUrls({ application, data });
  }, [application, data]);

  const hasObservablesCount =
    data.total_observables !== null && data.total_observables !== undefined;

  const hasDetails =
    Boolean(data.description) ||
    Boolean(data.category) ||
    Boolean(data.created_at) ||
    Boolean(data.updated_at) ||
    hasObservablesCount ||
    Boolean(data.connector_name) ||
    (data.tags != null && data.tags.length > 0);

  return (
    <EuiSplitPanel.Outer hasBorder data-test-subj="case-attachment-inline">
      <EuiSplitPanel.Inner color="subdued">
        <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiIcon type="briefcase" aria-hidden />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiText size="s">
              <strong>{CASE_HEADER}</strong>
            </EuiText>
          </EuiFlexItem>
          <EuiFlexItem grow={false}>
            <EuiButton
              size="s"
              iconType="popout"
              iconSide="right"
              href={caseUrls.case}
              target="_blank"
              color="text"
              data-test-subj="case-attachment-go-to-case"
            >
              {GO_TO_CASE}
            </EuiButton>
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiSplitPanel.Inner>
      <EuiSplitPanel.Inner>
        <EuiFlexGroup alignItems="baseline" gutterSize="s" responsive={false}>
          {idLabel && (
            <EuiFlexItem grow={false}>
              <EuiText size="s" color="subdued">
                {idLabel}
              </EuiText>
            </EuiFlexItem>
          )}
          <EuiFlexItem grow={true}>
            <EuiTitle size="xs">
              <h3>{data.title}</h3>
            </EuiTitle>
          </EuiFlexItem>
        </EuiFlexGroup>

        <EuiSpacer size="s" />

        <CaseMetaRow caseUrls={caseUrls} data={data} />

        {data.description && !expanded && (
          <>
            <EuiSpacer size="s" />
            <EuiTextBlockTruncate lines={2}>
              <EuiText size="s" color="subdued">
                {data.description}
              </EuiText>
            </EuiTextBlockTruncate>
          </>
        )}

        {expanded && (
          <>
            <EuiHorizontalRule margin="m" />
            <CaseInlineExpandedContent
              attachment={attachment}
              hasObservablesCount={hasObservablesCount}
            />
          </>
        )}

        {hasDetails && (
          <>
            <EuiSpacer size="s" />
            <EuiButtonEmpty
              size="xs"
              iconType={expanded ? 'arrowUp' : 'arrowDown'}
              iconSide="right"
              onClick={toggleExpanded}
              data-test-subj="case-attachment-toggle-details"
            >
              {expanded ? SHOW_LESS : SHOW_MORE}
            </EuiButtonEmpty>
          </>
        )}
      </EuiSplitPanel.Inner>
    </EuiSplitPanel.Outer>
  );
};
CaseInlineContent.displayName = 'CaseInlineContent';

const CaseInlineExpandedContent: React.FC<
  Pick<InlineContentProps, 'attachment'> & { hasObservablesCount: boolean }
> = ({ attachment, hasObservablesCount }) => {
  const data = attachment.data;
  return (
    <EuiFlexGroup direction="column" gutterSize="s">
      {data.description && (
        <EuiFlexItem>
          <DetailRow label={DESCRIPTION} value={data.description} />
        </EuiFlexItem>
      )}
      {data.tags != null && data.tags.length > 0 && (
        <EuiFlexItem>
          <DetailRow
            label={TAGS}
            value={
              <EuiFlexGroup gutterSize="xs" wrap responsive={false}>
                {data.tags.map((tag) => (
                  <EuiFlexItem grow={false} key={tag}>
                    <EuiBadge color="hollow">{tag}</EuiBadge>
                  </EuiFlexItem>
                ))}
              </EuiFlexGroup>
            }
          />
        </EuiFlexItem>
      )}
      {data.category && (
        <EuiFlexItem>
          <DetailRow label={CATEGORY} value={data.category} />
        </EuiFlexItem>
      )}
      {data.created_at && (
        <EuiFlexItem>
          <DetailRow label={CREATED} value={<CreationDate date={data.created_at} />} />
        </EuiFlexItem>
      )}
      {data.updated_at && (
        <EuiFlexItem>
          <DetailRow label={UPDATED} value={<CreationDate date={data.updated_at} />} />
        </EuiFlexItem>
      )}
      {hasObservablesCount && (
        <EuiFlexItem>
          <DetailRow label={OBSERVABLES} value={String(data.total_observables)} />
        </EuiFlexItem>
      )}
      {data.connector_name && (
        <EuiFlexItem>
          <DetailRow label={CONNECTOR} value={data.connector_name} />
        </EuiFlexItem>
      )}
    </EuiFlexGroup>
  );
};
CaseInlineExpandedContent.displayName = 'CaseInlineExpandedContent';

export const createCaseInlineContent = ({ application }: Services) => {
  const Wrapped: React.FC<AttachmentRenderProps<CaseAttachment>> = (props) => (
    <CaseInlineContent {...props} application={application} />
  );
  Wrapped.displayName = 'CaseInlineContentWrapper';
  return Wrapped;
};
