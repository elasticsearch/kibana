/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ReactNode } from 'react';
import type { IconType } from '@elastic/eui';
import type { z, ZodObject } from '@kbn/zod/v4';
import type { RendererDefinition } from '@kbn/agent-builder-common/renderers';

/**
 * Context passed to a renderer's {@link RendererUIDefinition.render} function.
 * Additional fields (resolution helpers, etc.) are added by later phases — keep
 * any new members optional to stay backwards compatible.
 */
export interface RendererRenderContext {
  /** Whether the renderer is being mounted in canvas mode (expanded view). */
  isCanvas?: boolean;
}

/**
 * Context passed to a renderer's {@link RendererUIDefinition.renderCanvas} function.
 */
// eslint-disable-next-line @typescript-eslint/no-empty-interface
export interface RendererCanvasContext extends RendererRenderContext {}

/**
 * Header metadata for a rendered object (inline / canvas).
 */
export interface RendererHeaderData {
  /** Optional icon to display in the header next to the title. */
  icon?: IconType;
  /** Optional secondary line rendered under the title. */
  subtitle?: string;
}

/**
 * Action button definition for a rendered object.
 */
export interface RendererActionButton {
  /** Button label text. */
  label: string;
  /** Optional icon to display in the button. */
  icon?: IconType;
  /** Whether the action is currently unavailable. */
  disabled?: boolean;
  /** Handler function called when the button is clicked. */
  handler: () => void | Promise<void>;
}

/**
 * Parameters passed when requesting action buttons for a rendered object.
 */
export interface RendererActionButtonsParams<TPayload = unknown> {
  /** The payload being rendered. */
  payload: TPayload;
  /** Whether the object is being rendered in canvas mode (expanded view). */
  isCanvas: boolean;
}

/**
 * Browser-side UI definition for rendering objects of a specific renderer type.
 *
 * Extends the shared {@link RendererDefinition} (type + payload schema) with the
 * browser-only rendering members. Because it carries the `payloadSchema`, the
 * browser has everything it needs to validate a resolved payload before mounting,
 * and the payload type passed to `render` is inferred directly from the schema.
 */
export interface RendererUIDefinition<TSchema extends ZodObject<any> = ZodObject<any>>
  extends RendererDefinition<string, TSchema> {
  /**
   * Renders the payload inline in the conversation.
   */
  render: (payload: z.infer<TSchema>, ctx: RendererRenderContext) => ReactNode;
  /**
   * Optional header metadata (icon, subtitle) for the rendered object.
   */
  getHeader?: (payload: z.infer<TSchema>) => RendererHeaderData;
  /**
   * Optional action buttons displayed alongside the rendered object.
   */
  getActionButtons?: (
    params: RendererActionButtonsParams<z.infer<TSchema>>
  ) => RendererActionButton[];
  /**
   * Optional custom renderer for canvas mode (expanded flyout view).
   */
  renderCanvas?: (payload: z.infer<TSchema>, ctx: RendererCanvasContext) => ReactNode;
  /**
   * Optional preferred width for the canvas flyout. Accepts any valid CSS width
   * value (e.g. `'600px'`, `'40vw'`).
   */
  canvasWidth?: string;
}

/**
 * Public-facing contract for the renderer service.
 */
export interface RendererServiceStartContract {
  /**
   * Registers a UI definition for a renderer type.
   *
   * @param definition - The UI definition; the renderer type is taken from `definition.type`.
   * @throws Error if a renderer for the type is already registered.
   */
  register: <TSchema extends ZodObject<any> = ZodObject<any>>(
    definition: RendererUIDefinition<TSchema>
  ) => void;
  /**
   * Retrieves the UI definition for a renderer type, or `undefined` if none is registered.
   */
  getRendererUiDefinition: (type: string) => RendererUIDefinition | undefined;
  /**
   * Checks whether a UI definition is registered for the given renderer type.
   */
  hasRenderer: (type: string) => boolean;
}
