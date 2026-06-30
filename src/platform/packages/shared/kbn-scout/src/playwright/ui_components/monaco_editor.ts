/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import type { Locator } from '@playwright/test';
import type { ScoutPage } from '..';
import { expect } from '../../../ui';

/**
 * Minimal description of a Monaco text model used inside `page.evaluate` callbacks.
 * Interfaces are TypeScript-only and are erased at compile time, so these are safe
 * to reference from stringified evaluate functions.
 */
interface MonacoModel {
  getValue(): string;
  setValue(value: string): void;
  getPositionAt(offset: number): unknown;
  uri: { toString(): string };
}

/** Minimal description of a Monaco editor instance used inside `page.evaluate` callbacks. */
interface MonacoEditorInstance {
  getModel(): MonacoModel | null;
  getDomNode(): HTMLElement | null;
  setPosition(pos: unknown): void;
  focus(): void;
  trigger(source: string, handlerId: string, payload: unknown): void;
}

/**
 * Page object that wraps common interactions with the Kibana Monaco-based code editor.
 *
 * Initially the API is intentionally aligned with the FTR `MonacoEditorService`
 * (`src/platform/test/functional/services/monaco_editor.ts`).
 */
export class KibanaCodeEditorWrapper {
  constructor(private readonly page: ScoutPage) {}

  /**
   * Waits for the Monaco textarea inside the container (visible + enabled), like FTR
   * `waitCodeEditorReady`.
   */
  async waitCodeEditorReady(dataTestSubjId: string): Promise<void> {
    const editor = this.page.getByTestId(dataTestSubjId).getByTestId('kibanaCodeEditor');
    await expect(editor).toBeVisible();
  }

  /**
   * Returns the current value of the Monaco editor model at the given index.
   *
   * This uses the globally registered `window.MonacoEnvironment.monaco.editor`
   * (see `src/platform/packages/shared/kbn-monaco/src/register_globals.ts`).
   *
   * @param nthIndex - Index of the Monaco text model to read. Defaults to `0`.
   * @returns The current editor value as a string. If no models are registered,
   *   an empty string is returned.
   */
  async getCodeEditorValue(nthIndex: number = 0): Promise<string> {
    let result = '';

    await expect(async () => {
      result = await this.page.evaluate((index) => {
        const monacoEnv = (window as any).MonacoEnvironment;

        if (!monacoEnv?.monaco?.editor) {
          throw new Error('MonacoEnvironment.monaco.editor is not available');
        }

        const values: string[] = (monacoEnv.monaco.editor.getModels() as MonacoModel[]).map(
          (model) => model.getValue()
        );

        if (!values.length) {
          return '';
        }

        if (index >= 0 && index < values.length) {
          return values[index]!;
        }

        // Fallback to the first model value if the requested index is out of range
        return values[0]!;
      }, nthIndex);
    }).toPass({ timeout: 30_000 });

    return result;
  }

  /**
   * Sets the value of the Monaco editor model at the given index using the
   * global `MonacoEnvironment`, and verifies that the value was applied.
   *
   * @param value - New value to set in the editor.
   * @param nthIndex - Optional index of the Monaco text model to update.
   *   When omitted, all models are updated (matching the FTR behavior).
   */
  async setCodeEditorValue(value: string, nthIndex?: number): Promise<string> {
    await this.page.evaluate(
      ({ editorIndex, codeEditorValue }) => {
        const monacoEnv = (window as any).MonacoEnvironment;

        if (!monacoEnv?.monaco?.editor) {
          throw new Error('MonacoEnvironment.monaco.editor is not available');
        }

        const textModels = monacoEnv.monaco.editor.getModels() as MonacoModel[];

        if (!textModels.length) {
          throw new Error('No Monaco editor models found');
        }

        if (typeof editorIndex === 'number' && textModels[editorIndex]) {
          textModels[editorIndex].setValue(codeEditorValue);
        } else {
          // When the specific model instance is unknown, update all models
          textModels.forEach((model) => model.setValue(codeEditorValue));
        }
      },
      { editorIndex: nthIndex, codeEditorValue: value }
    );

    // Return the new value for later assertions
    return await this.getCodeEditorValue(nthIndex ?? 0);
  }

  /**
   * Sets the value of the Monaco editor whose DOM node lives inside the container
   * identified by `data-test-subj`. Use this instead of {@link setCodeEditorValue}
   * when several Monaco editors are mounted on screen and addressing one by model
   * index is ambiguous (e.g. split base/alert ES|QL editors).
   *
   * @param containerTestSubjId - `data-test-subj` of the element that wraps the editor.
   * @param value - New value to set in the editor.
   */
  async setValueByContainer(containerTestSubjId: string, value: string): Promise<void> {
    await this.page.evaluate(
      ({ testSubjId, codeEditorValue }) => {
        const monacoEnv = (window as any).MonacoEnvironment;
        if (!monacoEnv?.monaco?.editor) {
          throw new Error('MonacoEnvironment.monaco.editor is not available');
        }
        const container = document.querySelector(`[data-test-subj="${testSubjId}"]`);
        if (!container) {
          throw new Error(`Editor container "${testSubjId}" not found`);
        }
        const editors = monacoEnv.monaco.editor.getEditors() as MonacoEditorInstance[];
        const editor = editors.find((e) => {
          const node = e.getDomNode();
          return node != null && container.contains(node);
        });
        if (!editor) {
          throw new Error(`No Monaco editor instance found inside "${testSubjId}"`);
        }
        const model = editor.getModel();
        if (!model) {
          throw new Error(`Editor inside "${testSubjId}" has no model`);
        }
        model.setValue(codeEditorValue);
      },
      { testSubjId: containerTestSubjId, codeEditorValue: value }
    );
  }

  /**
   * Positions the cursor at the end of the editor whose DOM node lives inside the
   * container identified by `data-test-subj`, then triggers Monaco autocomplete.
   * The container variant of {@link triggerSuggest} for screens with multiple editors.
   *
   * @param containerTestSubjId - `data-test-subj` of the element that wraps the editor.
   */
  async triggerSuggestByContainer(containerTestSubjId: string): Promise<void> {
    await this.page.evaluate((testSubjId) => {
      const monacoEnv = (window as any).MonacoEnvironment;
      if (!monacoEnv?.monaco?.editor) {
        throw new Error('MonacoEnvironment.monaco.editor is not available');
      }
      const container = document.querySelector(`[data-test-subj="${testSubjId}"]`);
      if (!container) {
        throw new Error(`Editor container "${testSubjId}" not found`);
      }
      const editors = monacoEnv.monaco.editor.getEditors() as MonacoEditorInstance[];
      const editor = editors.find((e) => {
        const node = e.getDomNode();
        return node != null && container.contains(node);
      });
      if (!editor) {
        throw new Error(`No Monaco editor instance found inside "${testSubjId}"`);
      }
      const model = editor.getModel();
      if (model) {
        editor.setPosition(model.getPositionAt(model.getValue().length));
      }
      editor.focus();
      editor.trigger('scout-test', 'editor.action.triggerSuggest', {});
    }, containerTestSubjId);
  }

  /**
   * Returns a locator for the current Monaco error markers inside the given
   * editor container.
   *
   * This mirrors the FTR helper that finds `.cdr.squiggly-error` elements,
   * but exposes a Playwright `Locator` so callers can assert on count, text, etc.
   *
   * @param testSubjId - `data-test-subj` of the editor container.
   *   Defaults to `'kibanaCodeEditor'`.
   * @returns A Playwright `Locator` for the current error markers.
   */
  getCurrentMarkers(testSubjId: string = 'kibanaCodeEditor'): Locator {
    const selector = `[data-test-subj="${testSubjId}"] .cdr.squiggly-error`;
    return this.page.locator(selector);
  }

  public getCodeEditorSuggestWidget() {
    return this.page.locator(
      '[data-test-subj="kbnCodeEditorEditorOverflowWidgetsContainer"] .suggest-widget'
    );
  }

  /**
   * Waits for the Monaco autocomplete popover to render at least one row, then
   * returns the visible suggestion labels. Centralizes Monaco's internal DOM shape
   * (`.monaco-list-row`, `.label-name`) so individual suites don't duplicate it.
   */
  async getSuggestionLabels(): Promise<string[]> {
    const widget = this.getCodeEditorSuggestWidget();
    await widget.waitFor({ state: 'visible' });
    // Auto-retrying readiness wait: the popover is visible before its rows render,
    // so wait until at least one suggestion row exists before reading labels.
    await expect(widget.locator('.monaco-list-row')).not.toHaveCount(0);
    return widget.locator('.monaco-list-row .label-name').allInnerTexts();
  }

  /**
   * Returns a locator for the Monaco suggestion detail panel (the documentation pop-up
   * displayed alongside the autocomplete suggestion list).
   *
   * The detail panel has no `data-test-subj`. Monaco renders it as an *overlay widget*
   * (via `addOverlayWidget`) which is placed inside the main `.monaco-editor` element,
   * NOT inside the overflow-widgets container (which only holds content widgets).
   */
  public getSuggestDetailsContainer() {
    return this.page.locator('.suggest-details-container');
  }

  /**
   * Positions the cursor after the given `text` in the editor model (if provided),
   * then programmatically triggers the Monaco autocomplete suggestion list.
   *
   * @param text - Optional substring to position the cursor after before triggering.
   *   When omitted the cursor stays at its current position.
   * @param nthIndex - Index of the Monaco text model to use. Defaults to `0`.
   */
  async triggerSuggest(text?: string, nthIndex: number = 0): Promise<void> {
    await this.page.evaluate(
      ({ searchText, modelIndex }) => {
        const monacoEnv = (window as any).MonacoEnvironment;
        if (!monacoEnv?.monaco?.editor) {
          throw new Error('MonacoEnvironment.monaco.editor is not available');
        }

        const models = monacoEnv.monaco.editor.getModels() as MonacoModel[];
        if (!models.length) {
          throw new Error('No Monaco editor models found');
        }

        const model = models[modelIndex] ?? models[0];
        const editors = monacoEnv.monaco.editor.getEditors() as MonacoEditorInstance[];
        const editorInstance =
          editors.find((e) => e.getModel()?.uri?.toString() === model.uri.toString()) ?? editors[0];

        if (!editorInstance) {
          throw new Error('No Monaco editor instance found');
        }

        if (searchText !== undefined) {
          const content: string = model.getValue();
          const offset = content.indexOf(searchText);
          if (offset === -1) {
            throw new Error(`Text "${searchText}" not found in editor`);
          }
          const position = model.getPositionAt(offset + searchText.length);
          editorInstance.setPosition(position);
        }

        editorInstance.focus();
        editorInstance.trigger('scout-test', 'editor.action.triggerSuggest', {});
      },
      { searchText: text, modelIndex: nthIndex }
    );
  }

  /**
   * Toggles the Monaco suggestion detail panel (the documentation pop-up displayed
   * alongside the autocomplete suggestion list) for the given editor instance.
   *
   * The precondition `HasFocusedSuggestion` must already be satisfied — call
   * `triggerSuggest()` and navigate to an item with `ArrowDown` before calling this.
   *
   * @param editorIndex - Index of the editor instance to target. Defaults to `0`.
   */
  async toggleSuggestDetails(editorIndex: number = 0): Promise<void> {
    await this.page.evaluate((index) => {
      const monacoEnv = (window as any).MonacoEnvironment;
      if (!monacoEnv?.monaco?.editor) {
        throw new Error('MonacoEnvironment.monaco.editor is not available');
      }
      const editors = monacoEnv.monaco.editor.getEditors() as MonacoEditorInstance[];
      const editor = editors[index] ?? editors[0];
      if (!editor) {
        throw new Error('No Monaco editor instance found');
      }
      editor.trigger('scout-test', 'toggleSuggestionDetails', {});
    }, editorIndex);
  }
}
