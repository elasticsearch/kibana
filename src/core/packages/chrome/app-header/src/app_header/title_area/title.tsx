/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the "Elastic License
 * 2.0", the "GNU Affero General Public License v3.0 only", and the "Server Side
 * Public License v 1"; you may not use this file except in compliance with, at
 * your election, the "Elastic License 2.0", the "GNU Affero General Public
 * License v3.0 only", or the "Server Side Public License, v 1".
 */

import {
  EuiIconTip,
  EuiLoadingSpinner,
  EuiScreenReaderOnly,
  EuiTitle,
  useEuiTheme,
  useGeneratedHtmlId,
} from '@elastic/eui';
import { css } from '@emotion/react';
import { i18n } from '@kbn/i18n';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import type { AppHeaderEditableTitle } from '../../types';
import { APP_HEADER_TEST_SUBJECTS } from '../test_subjects';

// The bundled lib.dom `FocusOptions` does not yet include `focusVisible`, which lets us
// force the focus ring on/off when restoring focus programmatically.
interface FocusOptionsWithVisible extends FocusOptions {
  focusVisible?: boolean;
}

const defaultAriaLabel = i18n.translate('core.ui.chrome.appHeader.editableTitle.ariaLabel', {
  defaultMessage: 'Edit title',
});

const editInstructions = i18n.translate('core.ui.chrome.appHeader.editableTitle.editInstructions', {
  defaultMessage: 'Editable title. Press Enter to edit.',
});

const emptyTitleErrorMessage = i18n.translate(
  'core.ui.chrome.appHeader.editableTitle.emptyTitleErrorMessage',
  {
    defaultMessage: 'Title cannot be empty.',
  }
);

const invalidTitleErrorMessage = i18n.translate(
  'core.ui.chrome.appHeader.editableTitle.invalidTitleErrorMessage',
  {
    defaultMessage: 'Enter a valid title.',
  }
);

export const isEditableTitle = (
  title: string | AppHeaderEditableTitle
): title is AppHeaderEditableTitle => typeof title !== 'string';

// All of the title's layout/visual contract lives here, isolated from the behavior in
// `Title`. The comments record the hard-won invariants behind read/edit pixel parity --
// read them before changing any of these rules.
const useTitleStyles = () => {
  const { euiTheme } = useEuiTheme();

  return useMemo(() => {
    const titleWrapper = css`
      flex: 0 1 auto;
      min-inline-size: 0;
      max-width: 100%;
    `;

    // The hover/edit affordance is drawn by two absolutely positioned overlays that bleed
    // past the text on every side, so they never enter layout. The layout box is just the
    // text: the resting title keeps the exact position and trailing spacing of a plain
    // heading (no extra gap before the badges), and there is no transform or negative-margin
    // feedback into the shrink-to-fit width (which previously truncated long titles).
    // `z-index: 0` gives the frame its own stacking context: `::before` paints the
    // background behind the text (`z-index: -1`), while `::after` paints the border above
    // everything -- including the status-icon scrim -- so the box outline (e.g. the invalid
    // red border) is never hidden by the scrim that fades trailing text under the icon.
    const titleFrame = css`
      position: relative;
      z-index: 0;
      display: grid;
      grid-template-columns: minmax(0, max-content);
      box-sizing: border-box;
      max-inline-size: 100%;
      min-inline-size: 0;
      margin: 0;
      padding: 0;
      border: 0;
      background: transparent;
      color: inherit;
      font: inherit;
      text-align: start;

      &::before,
      &::after {
        content: '';
        position: absolute;
        inset-block: calc(-1 * ${euiTheme.size.xxs});
        inset-inline: calc(-1 * ${euiTheme.size.xs}) calc(-1 * ${euiTheme.size.xs});
        border-radius: ${euiTheme.border.radius.small};
        pointer-events: none;
      }

      &::before {
        z-index: -1;
        transition: background-color ${euiTheme.animation.fast} ease;
      }

      &::after {
        border: ${euiTheme.border.width.thin} solid transparent;
        transition: border-color ${euiTheme.animation.fast} ease,
          border-width ${euiTheme.animation.fast} ease;
      }
    `;

    const readModeTrigger = css`
      ${titleFrame};
      cursor: text;
      appearance: none;

      &:hover::before {
        background-color: ${euiTheme.components.buttons.backgroundEmptyTextHover};
      }

      &:focus {
        outline: none;
      }

      &:focus-visible::after {
        border-color: ${euiTheme.colors.primary};
        box-shadow: 0 0 0 ${euiTheme.focus.width} ${euiTheme.colors.primary} inset;
      }

      &:focus-visible {
        outline: none;
      }
    `;

    // Edit mode keeps a reasonable minimum width so a short or empty title still gives a
    // comfortable click/typing target instead of collapsing to the content (or to nothing
    // when empty). Long titles exceed the floor and size to content as usual.
    const editingTitleFrame = css`
      ${titleFrame};
      grid-template-columns: minmax(calc(${euiTheme.size.base} * 8), max-content);

      &::after {
        border-width: ${euiTheme.border.width.thin};
        border-color: ${euiTheme.components.forms.border};
      }

      &:focus-within::after {
        border-width: ${euiTheme.border.width.thick};
        border-color: ${euiTheme.components.forms.borderFocused};
      }
    `;

    const invalidTitleFrame = css`
      &:not(:focus-within)::after {
        border-width: ${euiTheme.border.width.thin};
        border-color: ${euiTheme.components.forms.borderInvalid};
      }
    `;

    const input = css`
      grid-area: 1 / 1;
      box-sizing: border-box;
      inline-size: 100%;
      min-inline-size: 0;
      appearance: none;
      border: 0;
      background: transparent;
      color: inherit;
      font: inherit;
      letter-spacing: inherit;
      line-height: inherit;
      margin: 0;
      padding: 0;

      &:focus,
      &:focus-visible {
        outline: none;
      }

      &:disabled {
        color: inherit;
        opacity: 1;
      }
    `;

    const titleText = css`
      grid-area: 1 / 1;
      min-inline-size: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    `;

    const placeholderText = css`
      color: ${euiTheme.colors.textSubdued};
    `;

    // Must not clip its own content (no overflow/ellipsis), or the track would
    // under-report the text width. `pre` preserves trailing spaces so the frame grows in
    // lockstep with the input as you type. See `renderSizer` for how it drives the width.
    const titleSizer = css`
      grid-area: 1 / 1;
      white-space: pre;
      visibility: hidden;
    `;

    // Absolutely positioned so it never feeds into the grid track, keeping the frame
    // width/height identical whether or not a status icon is shown. The gradient scrim
    // fades the trailing text into the frame background so the icon stays legible when it
    // overlaps long titles; the transparent part stays click-through (only the icon itself
    // is interactive, so the tooltip works and the input remains clickable underneath).
    const statusIcon = css`
      position: absolute;
      inset-block: 0;
      // Align the icon with the overlay's bled trailing edge so it sits in the box's
      // right padding rather than crowding the text.
      inset-inline-end: calc(-1 * ${euiTheme.size.xs});
      display: flex;
      align-items: center;
      justify-content: flex-end;
      // Collapse the inherited title line-height so the icon's tooltip anchor box matches
      // the icon height and centers cleanly against the input.
      line-height: 0;
      padding-inline: ${euiTheme.size.l} ${euiTheme.size.s};
      background: linear-gradient(
        to right,
        transparent,
        ${euiTheme.colors.backgroundBaseSubdued} ${euiTheme.size.m}
      );
      pointer-events: none;

      & > * {
        pointer-events: auto;
      }
    `;

    // Applied only when there is no back button, so a lone title lines up with where the
    // text sits when a back button precedes it.
    const titleOffsetStyle = css`
      padding-left: ${euiTheme.size.xs};
    `;

    return {
      titleWrapper,
      titleFrame,
      editingTitleFrame,
      invalidTitleFrame,
      readModeTrigger,
      input,
      statusIcon,
      titleSizer,
      titleText,
      placeholderText,
      titleOffsetStyle,
    };
  }, [euiTheme]);
};

interface TitleProps {
  title: string | AppHeaderEditableTitle;
  titleOffset?: boolean;
  size?: 'xs' | 's';
}

export const Title = React.memo<TitleProps>(({ title, titleOffset, size = 's' }) => {
  const editable = isEditableTitle(title);
  const text = editable ? title.text : title;
  const placeholder = editable ? title.placeholder : undefined;
  const ariaLabel = editable ? title.ariaLabel : undefined;
  const onSave = editable ? title.onSave : undefined;

  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(text);
  const [error, setError] = useState<string | undefined>();
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const titleRef = useRef<HTMLButtonElement>(null);
  // Whether the current edit was opened via keyboard, so the focus ring only returns for
  // keyboard users when focus is restored to the title.
  const enteredViaKeyboardRef = useRef(false);
  // Marks that an edit was resolved by an explicit action (Enter/Escape) so the trailing
  // blur from unmounting the focused input does not re-enter save().
  const resolvingRef = useRef(false);
  const errorId = useGeneratedHtmlId({ prefix: 'appHeaderEditableTitleError' });
  const instructionsId = useGeneratedHtmlId({ prefix: 'appHeaderEditableTitleInstructions' });

  const styles = useTitleStyles();

  useEffect(() => {
    if (!isEditing) {
      return;
    }

    requestAnimationFrame(() => {
      const input = inputRef.current;
      if (!input) {
        return;
      }
      input.focus();
      // Select the whole title on entry so the I-beam never lands the caret in a surprising
      // spot; the user can click again within the now-real input to position it.
      input.select();
    });
  }, [isEditing]);

  const returnFocusToTitle = () => {
    const options: FocusOptionsWithVisible = { focusVisible: enteredViaKeyboardRef.current };
    requestAnimationFrame(() => {
      titleRef.current?.focus(options);
    });
  };

  const startEditing = (viaKeyboard = false) => {
    if (!editable) {
      return;
    }

    enteredViaKeyboardRef.current = viaKeyboard;
    resolvingRef.current = false;
    setDraft(text);
    setError(undefined);
    setIsEditing(true);
  };

  const save = async (restoreFocus = true) => {
    if (!onSave || isSaving) {
      return;
    }

    const nextTitle = draft.trim();

    // No change -> exit without calling onSave (also covers leaving an empty title empty).
    if (nextTitle === text.trim()) {
      resolvingRef.current = true;
      setError(undefined);
      setIsEditing(false);
      if (restoreFocus) {
        returnFocusToTitle();
      }
      return;
    }

    if (!nextTitle) {
      setError(emptyTitleErrorMessage);
      return;
    }

    setIsSaving(true);
    let result: string | void;
    try {
      result = await onSave(nextTitle);
    } catch {
      setIsSaving(false);
      setError(invalidTitleErrorMessage);
      return;
    }

    const saveError = typeof result === 'string' ? result : undefined;
    setIsSaving(false);

    if (saveError) {
      setError(saveError);
      return;
    }

    resolvingRef.current = true;
    setError(undefined);
    setIsEditing(false);
    if (restoreFocus) {
      returnFocusToTitle();
    }
  };

  const cancel = () => {
    resolvingRef.current = true;
    setDraft(text);
    setError(undefined);
    setIsEditing(false);
    returnFocusToTitle();
  };

  const displayText = text || placeholder || '';
  const isPlaceholder = !text && !!placeholder;

  // The hidden sizer is the single source of the frame width in both modes: its intrinsic
  // width sets the grid track while the visible text/input truncates or scrolls within it,
  // so read and edit share identical geometry. Read mode sizes to the shown text (or the
  // placeholder when empty); edit mode sizes to the draft (or placeholder while empty) so
  // the input grows in lockstep as you type and the placeholder shows in full.
  const renderSizer = (sizerText: string) => (
    <span aria-hidden="true" css={styles.titleSizer}>
      {sizerText}
    </span>
  );

  // Shared read view: the sizer drives the frame width while the visible span truncates
  // within it, so editable and non-editable titles have identical geometry.
  const readContent = (
    <>
      {renderSizer(displayText)}
      <span
        data-test-subj={APP_HEADER_TEST_SUBJECTS.title}
        css={[styles.titleText, isPlaceholder ? styles.placeholderText : undefined]}
      >
        {displayText}
      </span>
    </>
  );

  return (
    <div css={[styles.titleWrapper, titleOffset ? styles.titleOffsetStyle : undefined]}>
      <EuiTitle size={size}>
        <h1>
          {isEditing ? (
            <div css={[styles.editingTitleFrame, error ? styles.invalidTitleFrame : undefined]}>
              {renderSizer(draft || placeholder || '')}
              <input
                ref={inputRef}
                // `size={1}` keeps the input's intrinsic width from inflating the grid track,
                // so the sizer span alone determines the frame width.
                size={1}
                data-test-subj={APP_HEADER_TEST_SUBJECTS.titleInput}
                css={styles.input}
                value={draft}
                placeholder={placeholder}
                disabled={isSaving}
                aria-busy={isSaving}
                aria-invalid={!!error}
                aria-label={ariaLabel ?? defaultAriaLabel}
                aria-describedby={error ? errorId : undefined}
                onChange={(event) => {
                  setDraft(event.target.value);
                  setError(undefined);
                }}
                onBlur={() => {
                  // Ignore the trailing blur from an Enter/Escape that already closed the
                  // field; a genuine click-away still commits.
                  if (resolvingRef.current) {
                    return;
                  }
                  void save(false);
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') {
                    event.preventDefault();
                    void save();
                  }

                  if (event.key === 'Escape') {
                    event.preventDefault();
                    cancel();
                  }
                }}
              />
              {error && (
                <EuiScreenReaderOnly>
                  <span
                    id={errorId}
                    role="alert"
                    data-test-subj={APP_HEADER_TEST_SUBJECTS.titleError}
                  >
                    {error}
                  </span>
                </EuiScreenReaderOnly>
              )}
              {(isSaving || error) && (
                <span css={[styles.statusIcon]}>
                  {isSaving ? (
                    <EuiLoadingSpinner size="m" />
                  ) : (
                    <EuiIconTip type="warning" color="danger" content={error} position="top" />
                  )}
                </span>
              )}
            </div>
          ) : editable ? (
            // Accessible name comes from the visible title text (the sizer span is
            // aria-hidden), so the heading reads as the title itself; editability is
            // conveyed via the screen-reader instructions referenced below.
            <button
              ref={titleRef}
              type="button"
              data-test-subj={APP_HEADER_TEST_SUBJECTS.titleButton}
              css={styles.readModeTrigger}
              aria-describedby={instructionsId}
              // `event.detail === 0` marks a keyboard activation (Enter/Space) vs a mouse
              // click, so the ring only returns to keyboard users after editing.
              onClick={(event) => startEditing(event.detail === 0)}
            >
              {readContent}
            </button>
          ) : (
            // Non-editable title: shares the same frame as the editable read view (its
            // transparent overlay simply never activates) so geometry/alignment is identical.
            <span css={styles.titleFrame}>{readContent}</span>
          )}
        </h1>
      </EuiTitle>
      {/* Kept outside the h1 so it never feeds the heading's name-from-content. */}
      {editable && !isEditing && (
        <EuiScreenReaderOnly>
          <span id={instructionsId}>{editInstructions}</span>
        </EuiScreenReaderOnly>
      )}
    </div>
  );
});

Title.displayName = 'Title';
