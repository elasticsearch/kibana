/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ReactNode } from 'react';
import type { EuiButtonColor, IconType } from '@elastic/eui';
import type {
  UnknownAttachment,
  AttachmentVersion,
  UpdateOriginResponse,
  ScreenContextAttachmentData,
} from '@kbn/agent-builder-common/attachments';

export enum ActionButtonType {
  PRIMARY = 'primary',
  SECONDARY = 'secondary',
  OVERFLOW = 'overflow',
}

export type AttachmentPreviewState = 'none' | 'preview_available' | 'previewing';
/**
 * Props passed to custom attachment content renderers.
 */
export interface AttachmentRenderProps<TAttachment extends UnknownAttachment = UnknownAttachment> {
  /** The attachment to render */
  attachment: TAttachment;
  /** Whether the attachment is being rendered in a sidebar context */
  isSidebar: boolean;
  /** Data from the screen context attachment, if present in the conversation */
  screenContext?: ScreenContextAttachmentData;
  /** Callback to open the agent builder sidebar with the current conversation loaded. Undefined when already in the sidebar. */
  openSidebarConversation?: () => void;
}

/**
 * Callbacks available to canvas content renderers.
 */
export interface CanvasRenderCallbacks {
  /** Register action buttons to display in the canvas header */
  registerActionButtons: (buttons: ActionButton[]) => void;
  /** Update the attachment's origin reference (e.g., after saving to library) */
  updateOrigin: (origin: string) => Promise<UpdateOriginResponse | undefined>;
  /** Close the canvas (expanded flyout view) */
  closeCanvas: () => void;
  /**
   * Optional callback for externally-controlled inline preview state.
   * Use to mark an attachment as currently previewed outside canvas.
   */
  setPreviewState?: (previewState: AttachmentPreviewState) => void;
}

/**
 * Callbacks available to inline content renderers.
 */
export interface InlineRenderCallbacks {
  /** Register action buttons to display in the inline attachment header */
  registerActionButtons: (buttons: ActionButton[]) => void;
}

/**
 * Parameters passed when requesting action buttons for an inline-rendered attachment.
 */
export interface GetActionButtonsParams<TAttachment extends UnknownAttachment = UnknownAttachment> {
  /** The attachment for which to provide action buttons */
  attachment: TAttachment;
  /** Whether the attachment is being rendered in a sidebar context */
  isSidebar: boolean;
  /** Whether the attachment is being rendered in canvas mode (expanded flyout view) */
  isCanvas: boolean;
  /** Id of the agent the current conversation is using, when known. */
  agentId?: string;
  /** Function to update the attachment's origin reference */
  updateOrigin: (origin: string) => Promise<UpdateOriginResponse | undefined>;
  /** Callback to open the attachment in canvas mode (expanded flyout view). Undefined when already in canvas mode. */
  openCanvas?: () => void;
  /** Callback to open the agent builder sidebar with the current conversation loaded. */
  openSidebarConversation?: () => void;
  /**
   * Optional callback for externally-controlled inline preview state.
   * Use to mark an attachment as currently previewed outside canvas.
   */
  setPreviewBadgeState?: (previewBadgeState: AttachmentPreviewState) => void;
}

/**
 * Action button definition for inline-rendered attachments.
 */
export interface ActionButton {
  /** Button label text */
  label: string;
  /** Optional icon to display in the button (EUI icon name or custom React element) */
  icon?: IconType;
  /** Whether this is the primary action button */
  type: ActionButtonType;
  /** Optional EUI button color override (defaults to 'text') */
  color?: EuiButtonColor;
  /** Whether the action is currently unavailable */
  disabled?: boolean;
  /** Optional explanation shown when a disabled action remains visible */
  disabledReason?: string;
  /**
   * Optional URL. When provided, the button renders as an anchor (`<a href>`)
   * so it honors native browser behaviors like middle-click and cmd-click /
   * "Open in new tab" from the context menu.
   */
  href?: string;
  /**
   * When true, the link opens in a new browser tab. Only applies when `href`
   * is set; `rel="noopener noreferrer"` is added automatically.
   */
  openInNewTab?: boolean;
  /**
   * Handler function called when the button is clicked.
   */
  handler: () => void | Promise<void>;
}

/**
 * Parameters passed to attachment lifecycle hooks.
 */
export interface AttachmentLifecycleParams<
  TAttachment extends UnknownAttachment = UnknownAttachment
> {
  /** Returns the current attachment state */
  getAttachment: () => TAttachment;
  /** Update the attachment's origin reference (e.g., after saving to library) */
  updateOrigin: (origin: string) => Promise<UpdateOriginResponse | undefined>;
}

/**
 * Parameters passed to the `getHeader` resolver.
 */
export interface GetHeaderParams<TAttachment extends UnknownAttachment = UnknownAttachment> {
  /** The attachment being rendered in the header. */
  attachment: TAttachment;
}

/**
 * Return value of the `getHeader` resolver.
 */
export interface HeaderData {
  /** Optional icon to display in the attachment header next to the title. */
  icon?: IconType;
  /** Optional secondary line rendered under the attachment title. */
  subtitle?: string;
  /** Optional badges rendered in the attachment header next to the title. */
  badges?: HeaderBadge[];
}

/**
 * Badge definition for rendering in the attachment header next to the title.
 * Maps directly onto `EuiBadge`'s props.
 */
export interface HeaderBadge {
  /** Badge content. */
  label: string;
  /** Optional EUI badge color (e.g. 'hollow', 'success', 'warning', 'accent'). */
  color?: string;
  /** Optional icon to display alongside the label. */
  iconType?: IconType;
}

/**
 * UI definition for rendering attachments of a specific type.
 */
export interface AttachmentUIDefinition<TAttachment extends UnknownAttachment = UnknownAttachment> {
  /**
   * Returns a human-readable label for the attachment.
   */
  getLabel: (attachment: TAttachment) => string;
  /**
   * Returns the icon type to display for the attachment pill (pre-send chip).
   */
  getIcon?: () => IconType;
  /**
   * Returns header metadata (icon, subtitle, badges) for the attachment header
   * (inline / canvas). Omitted fields fall back to their defaults (no icon, no
   * subtitle, no badges).
   */
  getHeader?: (params: GetHeaderParams<TAttachment>) => HeaderData;
  /**
   * Optional custom click handler for attachment pills.
   * When provided, pills will invoke this instead of the default behavior.
   */
  onClick?: (args: { attachment: TAttachment; version?: AttachmentVersion }) => void;
  /**
   * Optional custom content renderer for inline attachment display.
   * When provided, attachments can be rendered inline in the conversation
   * using the <render_attachment> tag.
   *
   * The `callbacks` object provides:
   * - `registerActionButtons`: dynamically register action buttons in the inline header
   */
  renderInlineContent?: (
    props: AttachmentRenderProps<TAttachment>,
    callbacks?: InlineRenderCallbacks
  ) => ReactNode;
  /**
   * Optional preferred width for the canvas flyout when opened in full-screen context.
   * Accepts any valid CSS width value (e.g. `'600px'`, `'40vw'`).
   * Defaults to `'50vw'` when not specified.
   * Has no effect in sidebar context.
   */
  canvasWidth?: string;
  /**
   * Optional custom content renderer for canvas mode (expanded flyout view).
   * When provided, attachments can be opened in an expanded view via action buttons.
   *
   * The `props` object includes `openSidebarConversation` for opening the sidebar with the current conversation.
   *
   * The `callbacks` object provides:
   * - `registerActionButtons`: dynamically register action buttons in the canvas header
   * - `updateOrigin`: link by-value attachments to persistent storage after saving
   */
  renderCanvasContent?: (
    props: AttachmentRenderProps<TAttachment>,
    callbacks: CanvasRenderCallbacks
  ) => ReactNode;
  /**
   * Optional function to provide action buttons for inline-rendered attachments.
   * Buttons will appear alongside or below the rendered content.
   */
  getActionButtons?: (params: GetActionButtonsParams<TAttachment>) => ActionButton[];
  /**
   * Optional max-width (in px) for the inline attachment panel.
   * When provided, the outer panel will not exceed this width.
   */
  getMaxWidth?: (attachment: TAttachment) => number | undefined;
}

/**
 * Public-facing contract for the attachment service.
 */
export interface AttachmentServiceStartContract {
  /**
   * Registers a UI definition for a specific attachment type.
   *
   * @param attachmentType - The unique identifier for the attachment type
   * @param definition - The UI definition for rendering this attachment type
   */
  addAttachmentType: <TAttachment extends UnknownAttachment = UnknownAttachment>(
    attachmentType: string,
    definition: AttachmentUIDefinition<TAttachment>
  ) => void;

  /**
   * Retrieves the UI definition for a specific attachment type.
   *
   * @param attachmentType - The type identifier to look up
   * @returns The UI definition if registered, undefined otherwise
   */
  getAttachmentUiDefinition: <TAttachment extends UnknownAttachment = UnknownAttachment>(
    attachmentType: string
  ) => AttachmentUIDefinition<TAttachment> | undefined;
}
