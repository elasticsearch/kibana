/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { spaceTest, tags, CUSTOM_QUERY_RULE } from '@kbn/scout-security';
import { expect } from '@kbn/scout-security/ui';

spaceTest.describe(
  'Document flyout v2 — Notes tool overlay',
  { tag: [...tags.stateful.classic, ...tags.serverless.security.complete] },
  () => {
    let ruleName: string;

    spaceTest.beforeEach(async ({ browserAuth, apiServices, scoutSpace }) => {
      ruleName = `${CUSTOM_QUERY_RULE.name}_${scoutSpace.id}_${Date.now()}`;
      await apiServices.detectionRule.createCustomQueryRule({
        ...CUSTOM_QUERY_RULE,
        name: ruleName,
        index: ['auditbeat-*'],
      });
      await browserAuth.loginAsPlatformEngineer();
    });

    spaceTest.afterEach(async ({ apiServices, kbnClient, scoutSpace }) => {
      await apiServices.detectionRule.deleteAll();
      await apiServices.detectionAlerts.deleteAll();
      // Notes created by these tests are `siem-ui-timeline-note` saved objects, which detection
      // cleanup and `cleanStandardList` don't cover — remove them so they don't leak into the
      // worker's space.
      await kbnClient.savedObjects.clean({
        types: ['siem-ui-timeline-note'],
        space: scoutSpace.id,
      });
    });

    spaceTest(
      'adds a note which appears in the list and updates the header notes count',
      async ({ pageObjects }) => {
        const noteText = `Scout note ${Date.now()}`;

        await pageObjects.documentFlyout.openForRule(ruleName);

        await pageObjects.documentFlyout.openNotes();
        await expect(pageObjects.notesTool.content).toBeVisible({ timeout: 10_000 });
        await expect(pageObjects.notesTool.noNotesMessage).toBeVisible({ timeout: 10_000 });

        await pageObjects.notesTool.addNote(noteText);

        // The created note renders as a single comment containing the text.
        await expect(pageObjects.notesTool.noteComments).toHaveCount(1, { timeout: 15_000 });
        await expect(pageObjects.notesTool.noteComment(0)).toContainText(noteText);
        await expect(pageObjects.notesTool.noNotesMessage).toBeHidden();

        // The header notes count badge reflects the newly added note.
        await expect(pageObjects.documentFlyout.notesCount).toHaveText('1', { timeout: 15_000 });
      }
    );

    spaceTest(
      'deletes a note and the original flyout header reflects the remaining count',
      async ({ pageObjects }) => {
        const now = Date.now();

        await pageObjects.documentFlyout.openForRule(ruleName);

        await pageObjects.documentFlyout.openNotes();
        await expect(pageObjects.notesTool.content).toBeVisible({ timeout: 10_000 });

        // Seed two notes so a single deletion leaves a verifiable count behind.
        await pageObjects.notesTool.addNote(`Scout note A ${now}`);
        await expect(pageObjects.notesTool.noteComments).toHaveCount(1, { timeout: 15_000 });
        await pageObjects.notesTool.addNote(`Scout note B ${now}`);
        await expect(pageObjects.notesTool.noteComments).toHaveCount(2, { timeout: 15_000 });

        // Deleting prompts a confirmation modal before the note is removed.
        await pageObjects.notesTool.deleteNoteButton(0).click();
        await expect(pageObjects.notesTool.deleteConfirmModal).toBeVisible();
        await pageObjects.notesTool.deleteConfirmButton.click();
        await expect(pageObjects.notesTool.noteComments).toHaveCount(1, { timeout: 15_000 });

        // Navigate back to the original document flyout; its header notes count shows the
        // remaining note.
        await pageObjects.notesTool.backButton.click();
        await pageObjects.documentFlyout.waitForAlertFlyout();
        await expect(pageObjects.documentFlyout.notesCount).toHaveText('1', { timeout: 15_000 });
        await expect(pageObjects.documentFlyout.notesAddButton).toBeHidden();
      }
    );
  }
);
