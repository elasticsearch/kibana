/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import type { UnifiedReferenceAttachmentViewProps } from '@kbn/cases-plugin/public/client/attachment_framework/types';
import {
  AttachmentActionType,
  SECURITY_ALERT_ATTACHMENT_TYPE,
  SECURITY_ATTACK_ATTACHMENT_TYPE,
} from '@kbn/cases-plugin/common';
import { MAX_ALERTS_PER_CASE } from '@kbn/cases-plugin/common/constants';
import { replaceAnonymizedValuesWithOriginalValues } from '@kbn/elastic-assistant-common';
import type { AttackAttachmentPayload } from '../../../../common/cases/attachments/attack';
import {
  AttackAttachmentPayloadSchema,
  MAX_ATTACK_DETAILS_MARKDOWN_LENGTH,
  MAX_ATTACK_ENTITY_SUMMARY_MARKDOWN_LENGTH,
  MAX_ATTACK_MITRE_ATTACK_TACTIC_LENGTH,
  MAX_ATTACK_MITRE_ATTACK_TACTICS,
  MAX_ATTACK_SUMMARY_MARKDOWN_LENGTH,
  MAX_ATTACK_TITLE_LENGTH,
} from '../../../../common/cases/attachments/attack';
import {
  buildAttackAttachments,
  generateAttackAttachmentsWithoutOwner,
  getAttackAttachment,
  type AttackToAttach,
} from '.';
import { TestProviders } from '../../../common/mock/test_providers';
import { useFlyoutApi } from '../../../flyout_v2/use_flyout_api';
import { createFlyoutApiMock } from '../../../flyout_v2/use_flyout_api.mock';
import { useIsNewFlyoutEnabled } from '../../../common/hooks/use_is_new_flyout_enabled';
import { FLYOUT_ORIGIN } from '../../../common/lib/telemetry';

jest.mock('@kbn/expandable-flyout', () => ({
  useExpandableFlyoutApi: () => ({ openFlyout: jest.fn() }),
}));
jest.mock('../../../flyout_v2/use_flyout_api');
jest.mock('../../../common/hooks/use_is_new_flyout_enabled');

type Props = UnifiedReferenceAttachmentViewProps<AttackAttachmentPayload['metadata']>;

const allPermissions = {
  all: true,
  create: true,
  read: true,
  update: true,
  delete: true,
  push: true,
  connectors: true,
  settings: true,
  reopenCase: true,
  createComment: true,
  assign: true,
};

const baseProps = {
  caseData: { id: 'case-1', title: 'Case 1' },
  permissions: allPermissions,
  savedObjectId: 'so-1',
  attachmentId: 'attack-id-1',
  metadata: {
    title: 'Credential harvesting on host-1',
    alertCount: 4,
    index: '.alerts-security.attack.discovery.alerts-default',
  },
} as unknown as Props;

describe('Attack attachment', () => {
  let flyoutApi: ReturnType<typeof createFlyoutApiMock>;

  beforeEach(() => {
    jest.clearAllMocks();
    flyoutApi = createFlyoutApiMock();
    jest.mocked(useFlyoutApi).mockReturnValue(flyoutApi);
    jest.mocked(useIsNewFlyoutEnabled).mockReturnValue(true);
  });

  it('creates the attachment type correctly', () => {
    const attackType = getAttackAttachment();

    expect(attackType.getIcon({} as Props)).toBe('securitySignalDetected');
    expect(attackType.getLabel()).toBe('Attacks');
    expect(attackType).toStrictEqual({
      id: SECURITY_ATTACK_ATTACHMENT_TYPE,
      getIcon: expect.any(Function),
      getLabel: expect.any(Function),
      schema: AttackAttachmentPayloadSchema,
      getCreationActivity: expect.any(Function),
      getRemovalActivity: expect.any(Function),
      getAttachmentList: expect.any(Function),
    });
  });

  it('exposes an attachments list view so attacks get their own section in the Attachments tab', () => {
    const attackType = getAttackAttachment();

    expect(attackType.getAttachmentList?.()?.children).toBeDefined();
  });

  it('renders the activity event text correctly', () => {
    const attackType = getAttackAttachment();
    const { event } = attackType.getCreationActivity(baseProps);

    render(<TestProviders>{event}</TestProviders>);

    expect(screen.getByText('added an attack')).toBeInTheDocument();
  });

  it('renders the removal event text correctly', () => {
    const attackType = getAttackAttachment();
    const { event } = attackType.getRemovalActivity?.(baseProps) ?? {};

    render(<TestProviders>{event}</TestProviders>);

    expect(screen.getByText('removed an attack')).toBeInTheDocument();
  });

  it('renders the preview card lazily from metadata only', async () => {
    const attackType = getAttackAttachment();
    const { children: Children } = attackType.getCreationActivity(baseProps);

    expect(Children).toBeDefined();

    render(
      <TestProviders>
        <React.Suspense fallback={null}>
          {Children ? <Children {...baseProps} /> : null}
        </React.Suspense>
      </TestProviders>
    );

    expect(await screen.findByText('Credential harvesting on host-1')).toBeInTheDocument();
  });

  it('exposes the show attack and remove buttons as primary custom actions', () => {
    const attackType = getAttackAttachment();
    const actions = attackType.getCreationActivity(baseProps).getActions?.(baseProps) ?? [];

    expect(actions).toHaveLength(2);
    expect(actions).toEqual([
      expect.objectContaining({ type: AttachmentActionType.CUSTOM, isPrimary: true }),
      expect.objectContaining({ type: AttachmentActionType.CUSTOM, isPrimary: true }),
    ]);
  });

  it("replaces the framework's own delete action rather than adding to it", () => {
    const attackType = getAttackAttachment();

    expect(attackType.getCreationActivity(baseProps).hideDefaultActions).toBe(true);
  });

  it('omits the remove action when the user cannot delete attachments', () => {
    const attackType = getAttackAttachment();
    const readOnlyProps = {
      ...baseProps,
      permissions: { ...allPermissions, all: false, delete: false },
    } as unknown as Props;
    const actions = attackType.getCreationActivity(readOnlyProps).getActions?.(readOnlyProps) ?? [];

    expect(actions).toHaveLength(1);
  });

  it('returns no actions when the metadata is missing', () => {
    const attackType = getAttackAttachment();
    const propsWithoutMetadata = { ...baseProps, metadata: undefined };

    expect(
      attackType.getCreationActivity(propsWithoutMetadata).getActions?.(propsWithoutMetadata)
    ).toEqual([]);
  });

  it('opens the attack flyout with the attachment id when the action is clicked', async () => {
    const attackType = getAttackAttachment();
    const actions = attackType.getCreationActivity(baseProps).getActions?.(baseProps) ?? [];
    const action = actions[0];

    render(
      <TestProviders>
        {action.type === AttachmentActionType.CUSTOM && action.render()}
      </TestProviders>
    );

    fireEvent.click(await screen.findByTestId('comment-action-show-attack-so-1'));

    await waitFor(() =>
      expect(flyoutApi.openAttackFlyout).toHaveBeenCalledWith({
        attackId: 'attack-id-1',
        // The snapshotted index is normalised to a pattern the user can read.
        indexName: '.alerts-security.attack.discovery.alerts-*',
        attackTitle: 'Credential harvesting on host-1',
        origin: FLYOUT_ORIGIN.CASE_ATTACHMENT,
      })
    );
  });
});

const ATTACK_INDEX = '.alerts-security.attack.discovery.alerts-default';
const ADHOC_ATTACK_INDEX = '.adhoc.alerts-security.attack.discovery.alerts-default';
const ALERTS_INDEX = '.alerts-security.alerts-default';

const attackToAttach = (overrides: Partial<AttackToAttach> = {}): AttackToAttach => ({
  id: 'attack-id-1',
  index: ATTACK_INDEX,
  title: 'Credential harvesting on host-1',
  summaryMarkdown: 'An adversary harvested credentials from `host-1`.',
  riskScore: 73,
  alertsIndex: ALERTS_INDEX,
  ...overrides,
});

describe('buildAttackAttachments', () => {
  it('returns the attack attachment first, then one alert attachment holding every alert', () => {
    const { attachments } = buildAttackAttachments(
      attackToAttach({ alertIds: ['alert-1', 'alert-2'] })
    );

    expect(attachments).toHaveLength(2);
    expect(attachments[0]).toEqual({
      type: SECURITY_ATTACK_ATTACHMENT_TYPE,
      attachmentId: 'attack-id-1',
      metadata: {
        title: 'Credential harvesting on host-1',
        summaryMarkdown: 'An adversary harvested credentials from `host-1`.',
        riskScore: 73,
        alertCount: 2,
        index: ATTACK_INDEX,
      },
    });
    expect(attachments[1]).toEqual({
      type: SECURITY_ALERT_ATTACHMENT_TYPE,
      attachmentId: ['alert-1', 'alert-2'],
      metadata: { index: ALERTS_INDEX },
    });
  });

  it('builds a payload that satisfies the registered attack attachment schema', () => {
    const { attachments } = buildAttackAttachments(
      attackToAttach({ alertIds: ['alert-1'], entityCount: 3 })
    );

    expect(
      AttackAttachmentPayloadSchema.safeParse({ ...attachments[0], owner: 'securitySolution' })
        .success
    ).toBe(true);
  });

  it('builds a schema-valid payload for a fully populated attack', () => {
    const { attachments } = buildAttackAttachments(
      attackToAttach({
        alertIds: ['alert-1'],
        detailsMarkdown: '- An adversary ran `curl` on {{ host.name host-1 }}.',
        entitySummaryMarkdown: '{{ user.name user-1 }} on {{ host.name host-1 }}',
        mitreAttackTactics: ['Credential Access', 'Exfiltration'],
        timestamp: '2026-08-27T10:00:00.000Z',
        entityCount: 3,
      })
    );

    expect(
      AttackAttachmentPayloadSchema.safeParse({ ...attachments[0], owner: 'securitySolution' })
        .success
    ).toBe(true);
  });

  it('builds a schema-valid payload for an attack carrying only the required fields', () => {
    const { attachments } = buildAttackAttachments({
      id: 'attack-id-1',
      index: ATTACK_INDEX,
      title: 'Credential harvesting on host-1',
      alertsIndex: ALERTS_INDEX,
    });

    expect(
      AttackAttachmentPayloadSchema.safeParse({ ...attachments[0], owner: 'securitySolution' })
        .success
    ).toBe(true);
  });

  it('snapshots the narrative fields de-anonymised', () => {
    const { attachments } = buildAttackAttachments(
      attackToAttach({
        title: 'Credential harvesting on {{ host.name Host-abc }}',
        summaryMarkdown: 'An adversary targeted {{ user.name User-xyz }}.',
        detailsMarkdown: '- {{ user.name User-xyz }} authenticated to {{ host.name Host-abc }}.',
        entitySummaryMarkdown: '{{ user.name User-xyz }} on {{ host.name Host-abc }}',
        replacements: { 'Host-abc': 'host-1', 'User-xyz': 'jdoe' },
      })
    );

    expect(attachments[0].metadata).toEqual(
      expect.objectContaining({
        title: 'Credential harvesting on {{ host.name host-1 }}',
        summaryMarkdown: 'An adversary targeted {{ user.name jdoe }}.',
        detailsMarkdown: '- {{ user.name jdoe }} authenticated to {{ host.name host-1 }}.',
        entitySummaryMarkdown: '{{ user.name jdoe }} on {{ host.name host-1 }}',
      })
    );
  });

  it('leaves an already de-anonymised snapshot untouched when the replacements are re-applied', () => {
    const replacements = { 'Host-abc': 'host-1' };
    const { attachments } = buildAttackAttachments(
      attackToAttach({ title: 'Attack on {{ host.name Host-abc }}', replacements })
    );
    const { title } = attachments[0].metadata as { title: string };

    // The Attachments tab re-applies the replacements over whichever title it renders.
    expect(replaceAnonymizedValuesWithOriginalValues({ messageContent: title, replacements })).toBe(
      title
    );
  });

  it('snapshots the MITRE tactics and the detected-on timestamp', () => {
    const { attachments } = buildAttackAttachments(
      attackToAttach({
        mitreAttackTactics: ['Credential Access', 'Exfiltration'],
        timestamp: '2026-08-27T10:00:00.000Z',
      })
    );

    expect(attachments[0].metadata).toEqual(
      expect.objectContaining({
        mitreAttackTactics: ['Credential Access', 'Exfiltration'],
        timestamp: '2026-08-27T10:00:00.000Z',
      })
    );
  });

  it('caps the MITRE tactics at the schema bounds', () => {
    const { attachments } = buildAttackAttachments(
      attackToAttach({
        mitreAttackTactics: Array.from({ length: MAX_ATTACK_MITRE_ATTACK_TACTICS + 5 }, () =>
          'a'.repeat(MAX_ATTACK_MITRE_ATTACK_TACTIC_LENGTH + 10)
        ),
      })
    );

    const { mitreAttackTactics } = attachments[0].metadata as { mitreAttackTactics: string[] };
    expect(mitreAttackTactics).toHaveLength(MAX_ATTACK_MITRE_ATTACK_TACTICS);
    expect(
      mitreAttackTactics.every((tactic) => tactic.length === MAX_ATTACK_MITRE_ATTACK_TACTIC_LENGTH)
    ).toBe(true);
    expect(
      AttackAttachmentPayloadSchema.safeParse({ ...attachments[0], owner: 'securitySolution' })
        .success
    ).toBe(true);
  });

  it('omits the narrative fields the attack does not carry rather than persisting empty strings', () => {
    const { attachments } = buildAttackAttachments(attackToAttach({ summaryMarkdown: undefined }));

    expect(attachments[0].metadata).not.toHaveProperty('summaryMarkdown');
    expect(attachments[0].metadata).not.toHaveProperty('detailsMarkdown');
    expect(attachments[0].metadata).not.toHaveProperty('entitySummaryMarkdown');
    expect(attachments[0].metadata).not.toHaveProperty('mitreAttackTactics');
    expect(attachments[0].metadata).not.toHaveProperty('timestamp');
  });

  it('de-anonymises the alert ids via the attack replacements', () => {
    const { attachments } = buildAttackAttachments(
      attackToAttach({
        alertIds: ['anonymised-1', 'anonymised-2'],
        replacements: { 'anonymised-1': 'original-1', 'anonymised-2': 'original-2' },
      })
    );

    expect(attachments[1].attachmentId).toEqual(['original-1', 'original-2']);
  });

  it('leaves ids with no replacement untouched', () => {
    const { attachments } = buildAttackAttachments(
      attackToAttach({
        alertIds: ['anonymised-1', 'not-anonymised'],
        replacements: { 'anonymised-1': 'original-1' },
      })
    );

    expect(attachments[1].attachmentId).toEqual(['original-1', 'not-anonymised']);
  });

  it('dedupes after de-anonymising, so two anonymised ids for one alert collapse', () => {
    const { attachments, alertCount } = buildAttackAttachments(
      attackToAttach({
        alertIds: ['anonymised-1', 'anonymised-2', 'anonymised-1'],
        replacements: { 'anonymised-1': 'original-1', 'anonymised-2': 'original-1' },
      })
    );

    expect(attachments[1].attachmentId).toEqual(['original-1']);
    expect(alertCount).toBe(1);
  });

  it('sets metadata.alertCount to the deduplicated de-anonymised alert count', () => {
    const { attachments } = buildAttackAttachments(
      attackToAttach({ alertIds: ['alert-1', 'alert-2', 'alert-1'] })
    );

    expect(attachments[0].metadata).toEqual(
      expect.objectContaining({ alertCount: 2, index: ATTACK_INDEX })
    );
  });

  it.each([
    ['scheduled', ATTACK_INDEX],
    ['adhoc', ADHOC_ATTACK_INDEX],
  ])('records the %s attack index in the metadata', (_label, index) => {
    const { attachments } = buildAttackAttachments(
      attackToAttach({ index, alertIds: ['alert-1'] })
    );

    expect(attachments[0].metadata).toEqual(expect.objectContaining({ index }));
  });

  it('returns only the attack attachment when the attack has no alert ids', () => {
    const { attachments, alertCount, truncated } = buildAttackAttachments(attackToAttach());

    expect(attachments).toHaveLength(1);
    expect(attachments[0].type).toBe(SECURITY_ATTACK_ATTACHMENT_TYPE);
    expect(attachments[0].metadata).toEqual(expect.objectContaining({ alertCount: 0 }));
    expect(alertCount).toBe(0);
    expect(truncated).toBe(false);
  });

  it('returns only the attack attachment when the alert ids are an empty array', () => {
    const { attachments } = buildAttackAttachments(attackToAttach({ alertIds: [] }));

    expect(attachments).toHaveLength(1);
  });

  it('caps the batched alert ids at MAX_ALERTS_PER_CASE and reports the truncation', () => {
    const alertIds = Array.from({ length: MAX_ALERTS_PER_CASE + 5 }, (_, i) => `alert-${i}`);

    const { attachments, alertCount, attachedAlertCount, truncated } = buildAttackAttachments(
      attackToAttach({ alertIds })
    );

    expect(attachments).toHaveLength(2);
    expect(attachments[1].attachmentId).toHaveLength(MAX_ALERTS_PER_CASE);
    expect(attachedAlertCount).toBe(MAX_ALERTS_PER_CASE);
    expect(truncated).toBe(true);
    // The metadata keeps the attack's real alert count even though fewer alerts were attached.
    expect(alertCount).toBe(MAX_ALERTS_PER_CASE + 5);
    expect(attachments[0].metadata).toEqual(
      expect.objectContaining({ alertCount: MAX_ALERTS_PER_CASE + 5 })
    );
  });

  it('does not report truncation when the alert count is exactly at the cap', () => {
    const alertIds = Array.from({ length: MAX_ALERTS_PER_CASE }, (_, i) => `alert-${i}`);

    const { attachedAlertCount, truncated } = buildAttackAttachments(attackToAttach({ alertIds }));

    expect(attachedAlertCount).toBe(MAX_ALERTS_PER_CASE);
    expect(truncated).toBe(false);
  });

  it('omits the optional metadata fields the caller did not supply', () => {
    const { attachments } = buildAttackAttachments({
      id: 'attack-id-1',
      index: ATTACK_INDEX,
      title: 'Credential harvesting on host-1',
      alertsIndex: ALERTS_INDEX,
    });

    expect(attachments[0].metadata).toEqual({
      title: 'Credential harvesting on host-1',
      alertCount: 0,
      index: ATTACK_INDEX,
    });
  });

  it('includes the entity count when the caller already resolved it', () => {
    const { attachments } = buildAttackAttachments(attackToAttach({ entityCount: 0 }));

    expect(attachments[0].metadata).toEqual(expect.objectContaining({ entityCount: 0 }));
  });

  it('truncates the title and summary to the schema bounds', () => {
    const { attachments } = buildAttackAttachments(
      attackToAttach({
        title: 'a'.repeat(MAX_ATTACK_TITLE_LENGTH + 200),
        summaryMarkdown: 'b'.repeat(MAX_ATTACK_SUMMARY_MARKDOWN_LENGTH + 1000),
      })
    );

    const metadata = attachments[0].metadata as { title: string; summaryMarkdown: string };
    expect(metadata.title).toHaveLength(MAX_ATTACK_TITLE_LENGTH);
    expect(metadata.summaryMarkdown).toHaveLength(MAX_ATTACK_SUMMARY_MARKDOWN_LENGTH);
    expect(
      AttackAttachmentPayloadSchema.safeParse({ ...attachments[0], owner: 'securitySolution' })
        .success
    ).toBe(true);
  });

  it('cuts back to the previous complete token when the bound falls mid-token', () => {
    const firstToken = '{{ host.name host-1 }}';
    const secondToken = '{{ user.name jdoe }}';
    // Positions the second token so the bound lands five characters into it.
    const filler = 'x'.repeat(
      MAX_ATTACK_ENTITY_SUMMARY_MARKDOWN_LENGTH - 5 - firstToken.length - 2
    );

    const { attachments } = buildAttackAttachments(
      attackToAttach({
        entitySummaryMarkdown: `${firstToken} ${filler} ${secondToken} and more`,
      })
    );

    const { entitySummaryMarkdown } = attachments[0].metadata as {
      entitySummaryMarkdown: string;
    };
    expect(entitySummaryMarkdown).toBe(firstToken);
    expect(entitySummaryMarkdown).not.toContain(`${firstToken} ${filler}`);
  });

  it('drops a partial token outright when no complete token precedes the bound', () => {
    const filler = 'x'.repeat(MAX_ATTACK_ENTITY_SUMMARY_MARKDOWN_LENGTH - 5);

    const { attachments } = buildAttackAttachments(
      attackToAttach({ entitySummaryMarkdown: `${filler}{{ host.name host-1 }}` })
    );

    const { entitySummaryMarkdown } = attachments[0].metadata as {
      entitySummaryMarkdown: string;
    };
    expect(entitySummaryMarkdown).toBe(filler);
    expect(entitySummaryMarkdown).not.toContain('{{');
  });

  it('truncates at the bound when the cut does not fall inside a token', () => {
    const { attachments } = buildAttackAttachments(
      attackToAttach({
        detailsMarkdown: `{{ host.name host-1 }}${'x'.repeat(MAX_ATTACK_DETAILS_MARKDOWN_LENGTH)}`,
      })
    );

    const { detailsMarkdown } = attachments[0].metadata as { detailsMarkdown: string };
    expect(detailsMarkdown).toHaveLength(MAX_ATTACK_DETAILS_MARKDOWN_LENGTH);
  });

  it('truncates the de-anonymised text, not the anonymised original', () => {
    const anonymised = 'Host-abc';
    const original = 'a-much-longer-original-host-name';
    // Exactly at the bound while anonymised, over it once the longer original is substituted in.
    const prefix = 'y'.repeat(MAX_ATTACK_ENTITY_SUMMARY_MARKDOWN_LENGTH - anonymised.length);

    const { attachments } = buildAttackAttachments(
      attackToAttach({
        entitySummaryMarkdown: `${prefix}${anonymised}`,
        replacements: { [anonymised]: original },
      })
    );

    const { entitySummaryMarkdown } = attachments[0].metadata as {
      entitySummaryMarkdown: string;
    };
    expect(entitySummaryMarkdown).toHaveLength(MAX_ATTACK_ENTITY_SUMMARY_MARKDOWN_LENGTH);
    expect(entitySummaryMarkdown.endsWith(original.slice(0, anonymised.length))).toBe(true);
    expect(entitySummaryMarkdown).not.toContain(anonymised);
  });

  it('returns nothing when the attack has no id', () => {
    const { attachments, alertCount, truncated } = buildAttackAttachments(
      attackToAttach({ id: '', alertIds: ['alert-1'] })
    );

    expect(attachments).toEqual([]);
    expect(alertCount).toBe(0);
    expect(truncated).toBe(false);
  });
});

describe('generateAttackAttachmentsWithoutOwner', () => {
  it('returns just the attachments array', () => {
    const attack = attackToAttach({ alertIds: ['alert-1'] });

    expect(generateAttackAttachmentsWithoutOwner(attack)).toEqual(
      buildAttackAttachments(attack).attachments
    );
  });

  it('returns an empty array when the attack has no id', () => {
    expect(generateAttackAttachmentsWithoutOwner(attackToAttach({ id: '' }))).toEqual([]);
  });
});
