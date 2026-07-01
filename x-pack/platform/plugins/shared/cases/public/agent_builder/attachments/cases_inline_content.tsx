/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React, { useMemo } from 'react';
import {
  EuiButton,
  EuiFlexGroup,
  EuiFlexItem,
  EuiHorizontalRule,
  EuiIcon,
  EuiLink,
  EuiSplitPanel,
  EuiText,
  EuiTextBlockTruncate,
  EuiTitle,
} from '@elastic/eui';
import type { ApplicationStart } from '@kbn/core-application-browser';
import type { AttachmentRenderProps } from '@kbn/agent-builder-browser/attachments';
import type { Attachment } from '@kbn/agent-builder-common/attachments';
import type {
  CASES_ATTACHMENT_TYPE,
  CaseAttachmentData,
  CasesAttachmentData,
} from '../../../common/types/agent_builder/attachment_schemas';
import { SeverityHealth } from '../../components/severity/config';
import { CaseMetaRow } from './case_meta_row';
import { getAppIdForOwner, getCasesListPathForOwner, getCaseUrls } from './route_helpers';
import { CASES_HEADER, GO_TO_CASES, NO_CASES, SHOWING_FOOTER } from './translations';
import type { CaseSeverity } from '../../../common/types/domain';

const MAX_VISIBLE_ROWS = 10;
// Approx height of 5 case rows + dividers to create a scroll cutoff
const SCROLL_CUTOFF_PX = 400;

export type CasesAttachment = Attachment<typeof CASES_ATTACHMENT_TYPE, CasesAttachmentData>;

interface Services {
  application: ApplicationStart;
}

const CaseRow: React.FC<{ data: CaseAttachmentData; application: ApplicationStart }> = ({
  data,
  application,
}) => {
  const idLabel = data.incremental_id ? `#${data.incremental_id}` : null;
  const caseUrls = useMemo(() => getCaseUrls({ application, data }), [application, data]);

  return (
    <EuiFlexGroup direction="column" gutterSize="s">
      <EuiFlexGroup gutterSize="s" alignItems="baseline" responsive={false}>
        <EuiFlexItem>
          <EuiFlexGroup gutterSize="s" alignItems="baseline" responsive={false}>
            {idLabel && (
              <EuiFlexItem grow={false}>
                <EuiText size="s" color="subdued">
                  {idLabel}
                </EuiText>
              </EuiFlexItem>
            )}
            <EuiFlexItem grow={false}>
              <EuiTitle size="xs">
                <EuiLink
                  href={caseUrls.case}
                  target="_blank"
                  data-test-subj="case-attachment-row-title"
                >
                  {data.title}
                </EuiLink>
              </EuiTitle>
            </EuiFlexItem>
          </EuiFlexGroup>
        </EuiFlexItem>
        <EuiFlexItem grow={false}>
          <SeverityHealth severity={data.severity as CaseSeverity} />
        </EuiFlexItem>
      </EuiFlexGroup>

      <EuiFlexItem>
        <EuiFlexGroup gutterSize="s" responsive={false}>
          <EuiFlexItem grow={false}>
            <CaseMetaRow data={data} caseUrls={caseUrls} />
          </EuiFlexItem>
        </EuiFlexGroup>
      </EuiFlexItem>

      <EuiFlexItem>
        <EuiTextBlockTruncate lines={2}>
          <EuiText size="s" color="subdued">
            {data.description}
          </EuiText>
        </EuiTextBlockTruncate>
      </EuiFlexItem>
    </EuiFlexGroup>
  );
};
CaseRow.displayName = 'CaseRow';

interface InlineContentProps extends AttachmentRenderProps<CasesAttachment> {
  application: ApplicationStart;
}
const InlineContent: React.FC<InlineContentProps> = ({ attachment, application }) => {
  const { data } = attachment;
  const visible = data.cases.slice(0, MAX_VISIBLE_ROWS);

  // Only show "Go to cases" when all visible cases share the same owner — a
  // mixed-owner list (possible from by_alert mode) has no single correct target.
  const sharedOwner = useMemo(() => {
    if (visible.length === 0) return null;
    const first = visible[0].owner;
    return visible.every((c) => c.owner === first) ? first : null;
  }, [visible]);

  const casesUrl = useMemo(
    () =>
      sharedOwner &&
      application.getUrlForApp(getAppIdForOwner(sharedOwner), {
        path: getCasesListPathForOwner(sharedOwner),
      }),
    [application, sharedOwner]
  );

  if (visible.length === 0) {
    return (
      <EuiText size="s" color="subdued" data-test-subj="cases-attachment-empty">
        {NO_CASES}
      </EuiText>
    );
  }

  return (
    <EuiSplitPanel.Outer hasBorder data-test-subj="cases-attachment-inline">
      <EuiSplitPanel.Inner color="subdued">
        <EuiFlexGroup alignItems="center" gutterSize="s" responsive={false}>
          <EuiFlexItem grow={false}>
            <EuiIcon type="briefcase" aria-hidden />
          </EuiFlexItem>
          <EuiFlexItem>
            <EuiText size="s">
              <strong>{CASES_HEADER(data.total)}</strong>
            </EuiText>
          </EuiFlexItem>
          {sharedOwner && (
            <EuiFlexItem grow={false}>
              <EuiButton
                size="s"
                iconType="popout"
                iconSide="right"
                href={casesUrl || undefined}
                target="_blank"
                color="text"
                data-test-subj="cases-attachment-go-to-cases"
              >
                {GO_TO_CASES}
              </EuiButton>
            </EuiFlexItem>
          )}
        </EuiFlexGroup>
      </EuiSplitPanel.Inner>
      <EuiSplitPanel.Inner>
        <EuiFlexGroup
          style={{ maxHeight: SCROLL_CUTOFF_PX, overflowY: 'auto' }}
          data-test-subj="cases-attachment-scroll-container"
          gutterSize="s"
          direction="column"
        >
          {visible.map((c: CaseAttachmentData, idx: number) => (
            <EuiFlexItem key={c.id}>
              {idx > 0 && <EuiHorizontalRule margin="m" />}
              <CaseRow data={c} application={application} />
              {idx === visible.length - 1 && data.total > visible.length && (
                <>
                  <EuiHorizontalRule margin="s" />
                  <EuiText size="xs" color="subdued" textAlign="center">
                    {SHOWING_FOOTER(visible.length, data.total)}
                  </EuiText>
                </>
              )}
            </EuiFlexItem>
          ))}
        </EuiFlexGroup>
      </EuiSplitPanel.Inner>
    </EuiSplitPanel.Outer>
  );
};

InlineContent.displayName = 'InlineContent';

export const createCasesInlineContent = ({ application }: Services) =>
  function render(props: AttachmentRenderProps<CasesAttachment>) {
    return <InlineContent application={application} {...props} />;
  };
