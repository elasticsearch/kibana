/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type React from 'react';
import type { EuiCommentProps, IconType, EuiButtonProps, EuiThemeComputed } from '@elastic/eui';
import type { z } from '@kbn/zod/v4';
import type {
  ExternalReferenceAttachmentPayload,
  PersistableStateAttachmentPayload,
  UnifiedReferenceAttachmentPayload,
  UnifiedValueAttachmentPayload,
} from '../../../common/types/domain';
import type { CaseUI, CaseUser } from '../../containers/types';
import { AttachmentActionType } from '../../../common/utils/attachment_actions';

export { AttachmentActionType };

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
  render: () => JSX.Element;
}

export type AttachmentAction = ButtonAttachmentAction | CustomAttachmentAction;

export interface AttachmentViewObject<Props = {}> {
  timelineAvatar?: EuiCommentProps['timelineAvatar'];
  getActions?: (props: Props) => AttachmentAction[];
  event?: EuiCommentProps['event'];
  eventColor?: EuiCommentProps['eventColor'];
  children?: React.LazyExoticComponent<React.FC<Props>>;
  hideDefaultActions?: boolean;
  deleteSuccessTitle?: string;
  className?: string;
  css?: EuiCommentProps['css'];
}

export interface AttachmentTabViewObject<Props = {}> {
  children?: React.ComponentType<Props>;
}

export interface CommonAttachmentViewProps {
  savedObjectId: string;
  caseData: Pick<CaseUI, 'id' | 'title'>;
}

/** Props for case-level attachment tabs (Alerts/Events/… table hosts). */
export interface CommonAttachmentTabViewProps {
  caseData: CaseUI;
  searchTerm?: string;
}

export interface ExternalReferenceAttachmentViewProps extends CommonAttachmentViewProps {
  externalReferenceId: ExternalReferenceAttachmentPayload['externalReferenceId'];
  externalReferenceMetadata: ExternalReferenceAttachmentPayload['externalReferenceMetadata'];
}

export interface PersistableStateAttachmentViewProps extends CommonAttachmentViewProps {
  persistableStateAttachmentTypeId: PersistableStateAttachmentPayload['persistableStateAttachmentTypeId'];
  persistableStateAttachmentState: PersistableStateAttachmentPayload['persistableStateAttachmentState'];
}

export interface RowContext {
  manageMarkdownEditIds: string[];
  selectedOutlineCommentId: string;
  loadingCommentIds: string[];
  appId: string;
  euiTheme: EuiThemeComputed<{}>;
}

/**
 * View props for reference-based unified attachments (e.g., alerts, events).
 * These attachments reference external entities by id and may optionally
 * carry an inline `data` snapshot
 */
export interface UnifiedReferenceAttachmentViewProps<
  Metadata = UnifiedReferenceAttachmentPayload['metadata'],
  AttachmentId = UnifiedReferenceAttachmentPayload['attachmentId'],
  Data = UnifiedReferenceAttachmentPayload['data']
> extends CommonAttachmentViewProps {
  attachmentId: AttachmentId;
  metadata?: Metadata;
  data?: Data;
  createdBy: CaseUser;
  version: string;
  rowContext: RowContext;
}

/**
 * View props for value-based unified attachments (e.g., lens, user comments)
 * These attachments contain data/content directly
 */
export interface UnifiedValueAttachmentViewProps<Data = UnifiedValueAttachmentPayload['data']>
  extends CommonAttachmentViewProps {
  data: Data;
  createdBy: CaseUser;
  version: string;
  rowContext: RowContext;
}

export interface AttachmentType<Props> {
  id: string;
  icon: IconType;
  displayName: string;
  getAttachmentViewObject: (props: Props) => AttachmentViewObject<Props>;
  getAttachmentRemovalObject?: (props: Props) => Pick<AttachmentViewObject<Props>, 'event'>;
  getAttachmentTabViewObject?: (
    props?: CommonAttachmentTabViewProps
  ) => AttachmentTabViewObject<CommonAttachmentTabViewProps>;
  schemaValidator?: (data: unknown) => void;
}

interface UnifiedAttachmentSchema {
  /** Full-payload zod schema. Preferred over `schemaValidator`. */
  schema?: z.ZodType;
}

export type ExternalReferenceAttachmentType = AttachmentType<ExternalReferenceAttachmentViewProps>;
export type PersistableStateAttachmentType = AttachmentType<PersistableStateAttachmentViewProps>;
export type UnifiedReferenceAttachmentType<
  Metadata = UnifiedReferenceAttachmentPayload['metadata'],
  AttachmentId = UnifiedReferenceAttachmentPayload['attachmentId'],
  Data = UnifiedReferenceAttachmentPayload['data']
> = AttachmentType<UnifiedReferenceAttachmentViewProps<Metadata, AttachmentId, Data>> &
  UnifiedAttachmentSchema;
export type UnifiedValueAttachmentType<Data = UnifiedValueAttachmentPayload['data']> =
  AttachmentType<UnifiedValueAttachmentViewProps<Data>> & UnifiedAttachmentSchema;
export interface AttachmentFramework {
  registerExternalReference: (
    externalReferenceAttachmentType: ExternalReferenceAttachmentType
  ) => void;
  registerPersistableState: (
    persistableStateAttachmentType: PersistableStateAttachmentType
  ) => void;
  registerUnified: (
    unifiedAttachmentType: UnifiedReferenceAttachmentType | UnifiedValueAttachmentType
  ) => void;
}

/** A payload with `attachmentId` is a reference attachment; otherwise it's value. */
type IsReferenceSchema<S extends z.ZodType> = z.infer<S> extends { attachmentId: unknown }
  ? true
  : false;

/** Narrow registration type — renderers see typed `data`/`metadata`/`attachmentId` from `schema`. */
type UnifiedAttachmentTypeFromSchema<S extends z.ZodType> = IsReferenceSchema<S> extends true
  ? UnifiedReferenceAttachmentType<
      z.infer<S> extends { metadata?: infer M } ? M : never,
      z.infer<S> extends { attachmentId: infer A } ? A : never,
      z.infer<S> extends { data?: infer D } ? D : UnifiedReferenceAttachmentPayload['data']
    >
  : z.infer<S> extends { data: infer D }
  ? UnifiedValueAttachmentType<D>
  : never;

/** Broad registration type returned to callers; avoids a union (contravariant intersection on view props). */
type UnifiedAttachmentTypeForRegistry<S extends z.ZodType> = IsReferenceSchema<S> extends true
  ? UnifiedReferenceAttachmentType
  : UnifiedValueAttachmentType;

/**
 * Defines a unified attachment. Renderer prop narrowing (`data` / `metadata`)
 * is inferred from `schema`, which the registry also uses for full-payload validation.
 */
export const defineAttachment = <S extends z.ZodType>(
  attachmentType: UnifiedAttachmentTypeFromSchema<S> & { schema: S }
): UnifiedAttachmentTypeForRegistry<S> =>
  attachmentType as unknown as UnifiedAttachmentTypeForRegistry<S>;
