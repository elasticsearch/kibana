/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import type { ScoutPage, Locator } from '@kbn/scout';

/**
 * Page object for the notes tool overlay inside the flyout v2 document flyout.
 * Opened from the header notes action; covers the notes list, the add-note editor
 * and the delete-note confirmation flow.
 */
export class NotesTool {
  /** Tool overlay body — confirms the notes overlay is open. */
  public readonly content: Locator;
  /** Loading spinner shown while the document's notes are being fetched. */
  public readonly notesLoading: Locator;
  /** "No notes have been created for this {alert|event}." empty-state message. */
  public readonly noNotesMessage: Locator;
  /** Markdown editor textarea used to compose a new note. */
  public readonly addNoteTextArea: Locator;
  /** "Add note" submit button. */
  public readonly addNoteButton: Locator;
  /** All rendered note comments in the list. */
  public readonly noteComments: Locator;
  /** Delete-note confirmation modal. */
  public readonly deleteConfirmModal: Locator;
  /** Confirm button inside the delete-note confirmation modal. */
  public readonly deleteConfirmButton: Locator;
  /** Back button in this overlay's flyout menu. */
  public readonly backButton: Locator;

  private readonly page: ScoutPage;

  constructor(page: ScoutPage) {
    this.page = page;
    this.content = page.testSubj.locator('securitySolutionFlyoutNotesTabContent');
    this.notesLoading = page.testSubj.locator('securitySolutionNotesNotesLoading');
    this.noNotesMessage = this.content.getByText(/No notes have been created for this/);
    this.addNoteTextArea = this.content.getByRole('textbox');
    this.addNoteButton = page.testSubj.locator('securitySolutionNotesAddNotesButton');
    this.noteComments = page.locator('[data-test-subj^="securitySolutionNotesNotesComment-"]');
    this.deleteConfirmModal = page.testSubj.locator('delete-notes-modal');
    this.deleteConfirmButton = page.testSubj.locator('confirmModalConfirmButton');
    this.backButton = page
      .locator('[role="dialog"]', { has: this.content })
      .getByTestId('euiFlyoutMenuBackButton');
  }

  /** Note comment locator for the note at the given list index. */
  noteComment(index: number): Locator {
    return this.page.testSubj.locator(`securitySolutionNotesNotesComment-${index}`);
  }

  /** Delete button locator for the note at the given list index. */
  deleteNoteButton(index: number): Locator {
    return this.page.testSubj.locator(`securitySolutionNotesDeleteNotesButton-${index}`);
  }

  /** Type the given text into the add-note markdown editor and submit it. */
  async addNote(text: string) {
    await this.addNoteTextArea.fill(text);
    await this.addNoteButton.click();
  }
}
