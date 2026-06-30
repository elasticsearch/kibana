/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { v4 as uuidv4 } from 'uuid';
import { BehaviorSubject, Subject, distinctUntilChanged } from 'rxjs';
import type { RuleResponse } from '../../../common/api/detection_engine/model/rule_schema';

export interface AiRuleCreationSession {
  sessionId: string;
  startTimestamp: number;
  applyCount: number;
}

/**
 * Links the attachment to its saved rule via `origin` and invalidates the conversation so the
 * card reflects the saved state in-session. Supplied by the inline attachment's framework
 * callback; the save handler calls it once the rule is persisted.
 */
export type UpdateAttachmentOriginFn = (origin: string) => Promise<unknown>;

export interface SaveRuleRequest {
  rule: RuleResponse;
  attachmentId?: string;
  updateOrigin?: UpdateAttachmentOriginFn;
}

export class AiRuleCreationService {
  private readonly saveRuleSubject = new Subject<SaveRuleRequest>();
  // Tracks the attachment ID currently being saved, or null when idle.
  private readonly savingSubject = new BehaviorSubject<string | null>(null);
  private readonly aiRuleSubject = new BehaviorSubject<RuleResponse | null>(null);
  private readonly formSyncSubject = new BehaviorSubject<boolean>(false);
  // `null` = form idle (no active bind). Released when a brand-new rule card is minted.
  // Plain field, not a subject: every consumer reads it imperatively via `getBoundAttachmentId`.
  private boundAttachmentId: string | null = null;
  private session: AiRuleCreationSession | null = null;

  public readonly saveRuleRequest$ = this.saveRuleSubject.asObservable();
  /** Emits the attachment ID currently being saved, or null when idle. */
  public readonly saving$ = this.savingSubject.pipe(distinctUntilChanged());
  public readonly aiCreatedRule$ = this.aiRuleSubject.asObservable();
  public readonly formSyncActive$ = this.formSyncSubject.pipe(distinctUntilChanged());

  public startSession = (): AiRuleCreationSession => {
    this.session = {
      sessionId: uuidv4(),
      startTimestamp: Date.now(),
      applyCount: 0,
    };
    return this.session;
  };

  public getSession = (): AiRuleCreationSession | null => {
    return this.session;
  };

  public incrementApplyCount = (): void => {
    if (this.session) {
      this.session.applyCount += 1;
    }
  };

  public requestSaveRule = (
    rule: RuleResponse,
    options?: {
      attachmentId?: string;
      updateOrigin?: UpdateAttachmentOriginFn;
    }
  ): void => {
    this.savingSubject.next(options?.attachmentId ?? '__saving__');
    this.saveRuleSubject.next({
      rule,
      attachmentId: options?.attachmentId,
      updateOrigin: options?.updateOrigin,
    });
  };

  public clearSaving = (): void => {
    this.savingSubject.next(null);
  };

  /** Returns true if the given attachment is currently being saved, or (no arg) if any save is in progress. */
  public getIsSaving = (attachmentId?: string): boolean => {
    const current = this.savingSubject.getValue();
    return attachmentId !== undefined ? current === attachmentId : current !== null;
  };

  public setAiCreatedRule = (rule: RuleResponse, attachmentId?: string): void => {
    this.aiRuleSubject.next(rule);
    if (attachmentId !== undefined) {
      this.boundAttachmentId = attachmentId;
    }
  };

  public setBoundAttachment = (attachmentId: string): void => {
    this.boundAttachmentId = attachmentId;
  };

  public releaseBind = (): void => {
    this.boundAttachmentId = null;
  };

  public getBoundAttachmentId = (): string | null => {
    return this.boundAttachmentId;
  };

  public clearAiCreatedRule = (): void => {
    this.aiRuleSubject.next(null);
  };

  public activateFormSync = (): void => {
    this.formSyncSubject.next(true);
  };

  public deactivateFormSync = (): void => {
    this.formSyncSubject.next(false);
  };

  public clearSession = (): void => {
    this.session = null;
  };

  public reset = (): void => {
    this.savingSubject.next(false);
    this.aiRuleSubject.next(null);
    this.formSyncSubject.next(false);
    this.boundAttachmentId = null;
    this.session = null;
  };
}
