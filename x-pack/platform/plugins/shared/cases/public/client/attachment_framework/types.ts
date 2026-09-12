/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type React from 'react';
import type { EuiCommentProps, EuiButtonProps, EuiThemeComputed } from '@elastic/eui';
import type { z } from '@kbn/zod/v4';
import type {
  UnifiedReferenceAttachmentPayload,
  UnifiedValueAttachmentPayload,
} from '../../../common/types/domain';
import type { CaseUI, CaseUser } from '../../containers/types';
import type { CasesPermissions } from '../../../common/ui/types';
import { AttachmentActionType } from '../../../common/utils/attachment_actions';

export { AttachmentActionType };
export { defineAttachment } from './define_attachment';

interface BaseAttachmentAction {
  type: AttachmentActionType;
  isPrimary?: boolean;
  disabled?: boolean;
}

interface ButtonAttachmentAction extends BaseAttachmentAction {
  label: string;
  type: AttachmentActionType.BUTTON;
  onClick: () => void;
  iconType: string;
  color?: EuiButtonProps['color'];
}

interface CustomAttachmentAction extends BaseAttachmentAction {
  type: AttachmentActionType.CUSTOM;
  render: () => JSX.Element | null;
}

export type AttachmentAction = ButtonAttachmentAction | CustomAttachmentAction;

export interface AttachmentCreationActivity<Props = {}> {
  getActions?: (props: Props) => AttachmentAction[];
  event?: EuiCommentProps['event'];
  eventColor?: EuiCommentProps['eventColor'];
  children?: React.LazyExoticComponent<React.FC<Props>>;
  hideDefaultActions?: boolean;
  deleteSuccessToast?: string;
  className?: string;
  css?: EuiCommentProps['css'];
}

export interface AttachmentRemovalActivity<Props = {}> {
  event?: EuiCommentProps['event'];
}

export interface AttachmentList<Props = {}> {
  children?: React.ComponentType<Props>;
}

export interface CommonAttachmentViewProps {
  savedObjectId: string;
  caseData: Pick<CaseUI, 'id' | 'title'>;
  permissions: CasesPermissions;
}

/** Props for case-level attachment lists (Alerts/Events/… table hosts). */
export interface CommonAttachmentListViewProps {
  caseData: CaseUI;
  searchTerm?: string;
}

export interface RowContext {
  manageMarkdownEditIds: string[];
  selectedOutlineCommentId: string;
  loadingCommentIds: string[];
  appId: string;
  euiTheme: EuiThemeComputed<{}>;
}

type AttachmentId = UnifiedReferenceAttachmentPayload['attachmentId'];
type ReferenceMetadata = UnifiedReferenceAttachmentPayload['metadata'];
export type ReferenceData = UnifiedReferenceAttachmentPayload['data'];
type ValueData = UnifiedValueAttachmentPayload['data'];
type HybridData = ValueData | ReferenceData;

interface UnifiedAttachmentViewPropsBase extends CommonAttachmentViewProps {
  createdBy: CaseUser;
  version: string;
  rowContext: RowContext;
}

/** Reference attachments point at another entity and may include a cached snapshot. */
export interface UnifiedReferenceAttachmentViewProps<
  Metadata = ReferenceMetadata,
  Id = AttachmentId,
  Data = ReferenceData
> extends UnifiedAttachmentViewPropsBase {
  attachmentId: Id;
  data?: Data;
  metadata?: Metadata;
}

/** Value attachments store all renderable content directly on the case comment. */
export interface UnifiedValueAttachmentViewProps<Data = ValueData>
  extends UnifiedAttachmentViewPropsBase {
  data: Data;
}

/** Hybrid attachments support value and reference payloads under one attachment type id. */
export interface UnifiedHybridAttachmentViewProps<
  Data = HybridData,
  Metadata = ReferenceMetadata,
  Id = AttachmentId
> extends UnifiedAttachmentViewPropsBase {
  attachmentId?: Id;
  metadata?: Metadata;
  data?: Data;
}

export interface DocumentActionProps {
  /** Scoping id for DOM ids and test subjects — the id of the hosting activity row. */
  id: string;
  /** ES `_id` of the target document. */
  documentId: string;
  /** ES index the document lives in. Absent when the origin was never enriched. */
  index?: string;
}

export interface WorkflowActivityLabelProps {
  workflowName: React.ReactNode;
  count?: number;
}

export interface AttachmentWorkflow {
  getActivityLabel: (props: WorkflowActivityLabelProps) => React.ReactNode;
}

export interface AttachmentType<Props> {
  id: string;
  getIcon: (props: Props) => EuiCommentProps['timelineAvatar'];
  getLabel: () => string;
  getCreationActivity: (props: Props) => AttachmentCreationActivity<Props>;
  getRemovalActivity?: (props: Props) => AttachmentRemovalActivity<Props>;
  getAttachmentList?: (
    props?: CommonAttachmentListViewProps
  ) => AttachmentList<CommonAttachmentListViewProps>;
  /**
   * Returns a control that opens the ES document this attachment type points at, for
   * activity rows that reference the document but are not the attachment's own row
   * (e.g. a workflow run recorded against `cases.attachment`).
   *
   * Return `null` when the target cannot be resolved (e.g. no `index`). Types whose
   * documents have no flyout should omit this method entirely.
   */
  getDocumentAction?: (props: DocumentActionProps) => AttachmentAction | null;
  /** Enables this registered type to render workflow activity labels. */
  workflow?: AttachmentWorkflow;
}

interface UnifiedAttachmentSchema {
  /** Full-payload zod schema used for validation and renderer prop narrowing. */
  schema: z.ZodType;
  /**
   * Schema exposed to workflow authors. When unset, workflow steps fall back to
   * `schema` if it is a Zod object; when `false`, the type is excluded.
   */
  workflowSchema?: z.ZodObject | false;
}

type UnifiedAttachmentRegistration<Props> = AttachmentType<Props> & UnifiedAttachmentSchema;
export type UnifiedReferenceAttachmentType<
  Metadata = ReferenceMetadata,
  Id = AttachmentId,
  Data = ReferenceData
> = UnifiedAttachmentRegistration<UnifiedReferenceAttachmentViewProps<Metadata, Id, Data>>;

export type UnifiedValueAttachmentType<Data = ValueData> = UnifiedAttachmentRegistration<
  UnifiedValueAttachmentViewProps<Data>
>;

export type UnifiedHybridAttachmentType<
  Data = HybridData,
  Metadata = ReferenceMetadata,
  Id = AttachmentId
> = UnifiedAttachmentRegistration<UnifiedHybridAttachmentViewProps<Data, Metadata, Id>>;

export type RegisteredUnifiedAttachmentType =
  | UnifiedReferenceAttachmentType
  | UnifiedValueAttachmentType
  | UnifiedHybridAttachmentType;

export interface AttachmentFramework {
  registerAttachment: (attachmentType: RegisteredUnifiedAttachmentType) => void;
}
