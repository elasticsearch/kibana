/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import {
  SECURITY_ALERT_ATTACHMENT_TYPE,
  SECURITY_ATTACK_ATTACHMENT_TYPE,
} from '@kbn/cases-plugin/common';
import type { CaseAttachment } from './utils';
import {
  DEFAULT_ATTACK_TAB_COLUMN_IDS,
  isAttackAttachment,
  matchesSearchTerm,
  toReadableAttackIndexPattern,
  toVisibleAttackTabColumnIds,
} from './utils';

const attackAttachment = {
  type: SECURITY_ATTACK_ATTACHMENT_TYPE,
  attachmentId: 'attack-id-1',
  metadata: {
    title: 'Credential harvesting on host-1',
    alertCount: 4,
    index: '.alerts-security.attack.discovery.alerts-default',
  },
} as unknown as CaseAttachment;

describe('isAttackAttachment', () => {
  it('accepts an attack attachment', () => {
    expect(isAttackAttachment(attackAttachment)).toBe(true);
  });

  it('rejects another attachment type', () => {
    expect(
      isAttackAttachment({
        ...attackAttachment,
        type: SECURITY_ALERT_ATTACHMENT_TYPE,
      } as unknown as CaseAttachment)
    ).toBe(false);
  });

  it('rejects an attachment with an array of ids', () => {
    expect(
      isAttackAttachment({
        ...attackAttachment,
        attachmentId: ['attack-id-1'],
      } as unknown as CaseAttachment)
    ).toBe(false);
  });

  it('rejects an attachment with no metadata', () => {
    expect(
      isAttackAttachment({ ...attackAttachment, metadata: null } as unknown as CaseAttachment)
    ).toBe(false);
  });
});

describe('matchesSearchTerm', () => {
  const attachment = {
    attachmentId: 'attack-id-1',
    metadata: {
      title: 'Credential harvesting on host-1',
      summaryMarkdown: 'An adversary dumped LSASS memory',
      alertCount: 4,
      index: '.alerts-security.attack.discovery.alerts-default',
    },
  };

  it.each([
    ['the title', 'credential'],
    ['the summary', 'lsass'],
    ['the attack id', 'attack-id-1'],
  ])('matches on %s', (_label, searchTerm) => {
    expect(matchesSearchTerm(attachment, searchTerm)).toBe(true);
  });

  it('does not match unrelated text', () => {
    expect(matchesSearchTerm(attachment, 'kerberoasting')).toBe(false);
  });

  it('matches when the optional summary is absent', () => {
    const { summaryMarkdown, ...metadata } = attachment.metadata;
    expect(matchesSearchTerm({ ...attachment, metadata }, 'credential')).toBe(true);
  });
});

describe('toVisibleAttackTabColumnIds', () => {
  const defaults = [...DEFAULT_ATTACK_TAB_COLUMN_IDS];

  it('keeps a persisted selection, in the order it was persisted', () => {
    expect(toVisibleAttackTabColumnIds(['title', 'status', 'detectedOn'])).toEqual([
      'title',
      'status',
      'detectedOn',
    ]);
  });

  it('falls back to the defaults when nothing has been persisted', () => {
    expect(toVisibleAttackTabColumnIds(undefined)).toEqual(defaults);
  });

  it('drops an id the grid no longer renders', () => {
    expect(toVisibleAttackTabColumnIds(['title', 'entityCount'])).toEqual(['title']);
  });

  it('drops the actions column, which the grid renders outside the picker', () => {
    expect(toVisibleAttackTabColumnIds(['actions', 'title'])).toEqual(['title']);
  });

  it.each([
    ['an empty selection', []],
    ['a selection of ids the grid no longer renders', ['entityCount']],
  ])('falls back to the defaults for %s', (_label, persisted) => {
    expect(toVisibleAttackTabColumnIds(persisted)).toEqual(defaults);
  });

  it.each([
    ['an object', { columns: ['title'] }],
    ['a string', 'title'],
    ['a number', 7],
    ['null', null],
  ])('falls back to the defaults for %s written under the key', (_label, persisted) => {
    expect(toVisibleAttackTabColumnIds(persisted as unknown as string[])).toEqual(defaults);
  });
});

describe('toReadableAttackIndexPattern', () => {
  it.each([
    ['.internal.alerts-security.attack.discovery.alerts-default-000001'],
    ['.alerts-security.attack.discovery.alerts-default'],
  ])('maps the scheduled index %s to the scheduled alias pattern', (index) => {
    expect(toReadableAttackIndexPattern(index)).toBe('.alerts-security.attack.discovery.alerts-*');
  });

  it.each([
    ['.internal.adhoc.alerts-security.attack.discovery.alerts-default-000001'],
    ['.adhoc.alerts-security.attack.discovery.alerts-default'],
  ])('maps the adhoc index %s to the adhoc alias pattern', (index) => {
    expect(toReadableAttackIndexPattern(index)).toBe(
      '.adhoc.alerts-security.attack.discovery.alerts-*'
    );
  });

  it('passes through an index that belongs to neither attack-discovery family', () => {
    expect(toReadableAttackIndexPattern('.alerts-security.alerts-default')).toBe(
      '.alerts-security.alerts-default'
    );
  });
});
