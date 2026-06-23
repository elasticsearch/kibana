/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import pMap from 'p-map';
import { stringify as yamlStringify } from 'yaml';
import { logger } from './logger';
import { getKitchenSinkDefinition, KITCHEN_SINK_FIELD_DEFS } from './kitchen_sink_template';
import {
  buildLegacyTemplates,
  LEGACY_CUSTOM_FIELD_KEYS,
  LEGACY_CUSTOM_FIELDS_CONFIG,
  LEGACY_TEMPLATE_KEYS,
  type LegacyCustomFieldConfig,
  type LegacyTemplateConfig,
} from './configure_customfields';
import type {
  CreatedTemplateRef,
  KbnContext,
  SpaceConfig,
  TemplateFieldUserType,
  TemplateInput,
} from './types';
import {
  AUTO_GENERATED_TAG,
  casesBasePath,
  chunk,
  dedupe,
  formatRequestError,
  runWithRetry,
  templateFieldName,
} from './utils';

const CASE_DELETE_BATCH_SIZE = 100;
const TEMPLATE_DELETE_BATCH_SIZE = 1000;
const FIND_PAGE_SIZE = 100;

// True when an error message indicates the target object already exists
// (HTTP 409 or "already exists" copy). Lets create-* helpers treat existing
// spaces/templates/configs as success rather than crashing the run.
function isAlreadyExistsError(err: unknown): boolean {
  const message = (err as Error).message ?? '';
  return message.includes('already exists') || message.includes('409');
}

// Builds the template-field definition object for the Nth field of a
// generated template, mapping the user-facing control name (text, number,
// date, …) to the {control, type, metadata} shape the cases template API
// expects. Used by createTemplates.
function buildTemplateField(
  index: number,
  userType: TemplateFieldUserType
): Record<string, unknown> {
  const name = templateFieldName(index);
  const label = `${name} (${userType})`;

  switch (userType) {
    case 'text':
      return {
        control: 'INPUT_TEXT',
        name,
        label,
        type: 'keyword',
        metadata: { default: 'sample-value' },
      };
    case 'number':
      return {
        control: 'INPUT_NUMBER',
        name,
        label,
        type: 'integer',
        metadata: { default: 42 },
      };
    case 'textarea':
      return {
        control: 'TEXTAREA',
        name,
        label,
        type: 'keyword',
        metadata: { default: 'Sample paragraph of text.' },
      };
    case 'date':
      return {
        control: 'DATE_PICKER',
        name,
        label,
        type: 'date',
        metadata: { default: '2024-01-01T00:00:00Z' },
      };
    case 'select':
      return {
        control: 'SELECT_BASIC',
        name,
        label,
        type: 'keyword',
        metadata: { options: ['alpha', 'beta', 'gamma'], default: 'alpha' },
      };
    case 'radio':
      return {
        control: 'RADIO_GROUP',
        name,
        label,
        type: 'keyword',
        metadata: { options: ['alpha', 'beta', 'gamma'], default: 'alpha' },
      };
    case 'checkbox':
      return {
        control: 'CHECKBOX_GROUP',
        name,
        label,
        type: 'keyword',
        metadata: { options: ['alpha', 'beta'], default: ['alpha'] },
      };
    case 'user':
      return {
        control: 'USER_PICKER',
        name,
        label,
        type: 'keyword',
        metadata: { multiple: false, default: [] },
      };
  }
}

interface TemplateBuildResult {
  // Already-stringified YAML to send as the `definition` body field.
  definitionYaml: string;
  // Tags merged from the input + the template definition (kitchen-sink
  // templates carry their own tags) + the AUTO_GENERATED_TAG marker.
  tags: string[];
  // Description to send at the top level of the request body (so cleanup +
  // listing work without parsing the YAML).
  description?: string;
  // Short summary line printed after a successful create.
  summary: string;
}

// Builds the YAML body for one template request. Kitchen-sink mode hydrates
// the canonical YAML once, overrides the name/description, and merges tags;
// the synthesized path builds a definition from --templateFieldTypes.
// Extracted so createTemplates can stay focused on the API loop.
function buildTemplateBody(template: TemplateInput): TemplateBuildResult {
  if (template.useKitchenSink) {
    const definitionObj = getKitchenSinkDefinition();
    definitionObj.name = template.name;
    if (template.description) {
      definitionObj.description = template.description;
    }
    const mergedTags = dedupe([
      ...(definitionObj.tags ?? []),
      ...(template.tags ?? []),
      AUTO_GENERATED_TAG,
    ]);
    definitionObj.tags = mergedTags;
    return {
      definitionYaml: yamlStringify(definitionObj),
      tags: mergedTags,
      description: template.description ?? definitionObj.description,
      summary: `with ${definitionObj.fields.length} kitchen-sink field(s)`,
    };
  }

  const fields = template.fieldTypes.map((userType, index) => buildTemplateField(index, userType));
  const tags = dedupe([...(template.tags ?? []), AUTO_GENERATED_TAG]);
  const definitionObj: Record<string, unknown> = {
    name: template.name,
    fields,
    tags,
  };
  if (template.description) {
    definitionObj.description = template.description;
  }
  const summary =
    fields.length > 0
      ? `with ${fields.length} field(s): ${template.fieldTypes.join(', ')}`
      : 'with no fields';
  return {
    definitionYaml: yamlStringify(definitionObj),
    tags,
    description: template.description,
    summary,
  };
}

// Creates each template in `templates` for the given owner+space via the
// templates API, returning refs (id+version+fieldTypes+kitchenSinkFields) for
// the ones that stuck. Called per template-owner by run.ts; the returned
// refs are later attached to generated cases so cases can be linked to their
// template. "Already exists" responses are logged and skipped.
export async function createTemplates({
  ctx,
  space,
  owner,
  templates,
}: {
  ctx: KbnContext;
  space: string;
  owner: string;
  templates: TemplateInput[];
}): Promise<CreatedTemplateRef[]> {
  if (templates.length === 0) return [];

  const templatesPath = `${casesBasePath(space)}/internal/cases/templates`;
  const spaceLabel = space || 'default';
  const created: CreatedTemplateRef[] = [];

  logger.info(
    `Creating ${templates.length} template(s) for owner "${owner}" in space "${spaceLabel}"...`
  );

  for (const template of templates) {
    const built = buildTemplateBody(template);
    const body: Record<string, unknown> = {
      owner,
      definition: built.definitionYaml,
      tags: built.tags,
    };
    if (built.description) body.description = built.description;

    try {
      const { data } = await runWithRetry(
        () =>
          ctx.kbnClient.request<{ templateId: string; templateVersion: number }>({
            method: 'POST',
            path: templatesPath,
            headers: ctx.headers,
            body,
          }),
        { label: `create_template_${template.name}` }
      );
      if (data?.templateId && typeof data.templateVersion === 'number') {
        created.push({
          id: data.templateId,
          version: data.templateVersion,
          fieldTypes: template.useKitchenSink ? [] : template.fieldTypes,
          kitchenSinkFields: template.useKitchenSink ? KITCHEN_SINK_FIELD_DEFS : undefined,
        });
      }
      logger.info(`  Created template "${template.name}" for owner "${owner}" ${built.summary}`);
    } catch (err) {
      if (isAlreadyExistsError(err)) {
        logger.info(`  Template "${template.name}" already exists for owner "${owner}", skipping`);
      } else {
        logger.error(
          `Failed to create template "${template.name}" for owner "${owner}": ${formatRequestError(
            err
          )}`
        );
      }
    }
  }

  return created;
}

// Creates a single Kibana space, no-op'ing on "already exists". Called via
// pMap by createSpaces when --numSpaces > 0.
export async function createSpace(ctx: KbnContext, spaceId: string): Promise<void> {
  try {
    await runWithRetry(
      () =>
        ctx.kbnClient.request({
          method: 'POST',
          path: '/api/spaces/space',
          headers: ctx.headers,
          body: { id: spaceId, name: spaceId, disabledFeatures: [] },
        }),
      { label: `create_space_${spaceId}` }
    );
    logger.info(`  Created space "${spaceId}"`);
  } catch (err) {
    if (isAlreadyExistsError(err)) {
      logger.info(`  Space "${spaceId}" already exists, skipping`);
      return;
    }
    logger.error(`  Failed to create space "${spaceId}": ${formatRequestError(err)}`);
  }
}

// Materializes N spaces from a SpaceConfig (namePattern + count) and returns
// the resolved space IDs in declaration order. Called by run.ts before
// generating cases when multi-space mode is on.
export async function createSpaces(ctx: KbnContext, config: SpaceConfig): Promise<string[]> {
  const spaceIds = Array.from({ length: config.count }, (_, i) =>
    config.namePattern.replace('{i}', String(i + 1))
  );

  logger.info(`Creating ${spaceIds.length} space(s) with pattern "${config.namePattern}"...`);
  await pMap(spaceIds, (spaceId) => createSpace(ctx, spaceId), { concurrency: 5 });
  return spaceIds;
}

// Returns every Kibana space ID, normalizing the built-in `default` space to
// the empty string the rest of the codebase uses. Called by runCleanup when
// --cleanup is set without --spaces, so the cleanup step is truly global.
// Falls back to ['' ] (default only) when the spaces API call fails so a
// failing endpoint can't silently skip cleanup.
export async function listAllSpaces(ctx: KbnContext): Promise<string[]> {
  try {
    const { data } = await runWithRetry(
      () =>
        ctx.kbnClient.request<Array<{ id: string }>>({
          method: 'GET',
          path: '/api/spaces/space',
          headers: ctx.headers,
        }),
      { label: 'list_all_spaces' }
    );
    const ids = data
      .map((s) => (s.id === 'default' ? '' : s.id))
      .filter((id, idx, arr) => arr.indexOf(id) === idx);
    return ids.length > 0 ? ids : [''];
  } catch (err) {
    logger.warning(
      `Failed to list spaces (${formatRequestError(
        err
      )}); falling back to cleaning the default space only.`
    );
    return [''];
  }
}

// Turns on `analytics_enabled` in the cases configuration for one owner+space,
// patching an existing config when present and creating a new one otherwise.
// Called once per (owner, space) pair by enableAnalyticsForSpaces.
export async function enableAnalyticsForOwner({
  ctx,
  space,
  owner,
}: {
  ctx: KbnContext;
  space: string;
  owner: string;
}): Promise<void> {
  const configurePath = `${casesBasePath(space)}/api/cases/configure`;
  const spaceLabel = space || 'default';

  try {
    const { data: existing } = await runWithRetry(
      () =>
        ctx.kbnClient.request<Array<{ id: string; version: string }>>({
          method: 'GET',
          path: `${configurePath}?owner=${owner}`,
          headers: ctx.headers,
        }),
      { label: `get_case_config_${owner}_${spaceLabel}` }
    );

    if (existing.length > 0) {
      const { id, version } = existing[0];
      await runWithRetry(
        () =>
          ctx.kbnClient.request({
            method: 'PATCH',
            path: `${configurePath}/${id}`,
            headers: ctx.headers,
            body: { analytics_enabled: true, version },
          }),
        { label: `patch_case_config_${owner}_${spaceLabel}` }
      );
      logger.info(
        `  Enabled analytics for owner "${owner}" in space "${spaceLabel}" (updated existing config)`
      );
      return;
    }

    await runWithRetry(
      () =>
        ctx.kbnClient.request({
          method: 'POST',
          path: configurePath,
          headers: ctx.headers,
          body: {
            owner,
            analytics_enabled: true,
            connector: { id: 'none', name: 'none', type: '.none', fields: null },
            closure_type: 'close-by-user',
          },
        }),
      { label: `create_case_config_${owner}_${spaceLabel}` }
    );
    logger.info(
      `  Enabled analytics for owner "${owner}" in space "${spaceLabel}" (created new config)`
    );
  } catch (err) {
    if (isAlreadyExistsError(err)) {
      logger.info(
        `  Analytics config for owner "${owner}" in space "${spaceLabel}" already exists, skipping`
      );
      return;
    }
    logger.error(
      `  Failed to enable analytics for owner "${owner}" in space "${spaceLabel}": ${formatRequestError(
        err
      )}`
    );
  }
}

// Enables analytics for every (owner, space) cross-product, fanning out to
// enableAnalyticsForOwner with bounded concurrency. Called once by run.ts
// when --analyticsOwners is supplied.
export async function enableAnalyticsForSpaces({
  ctx,
  spaces,
  owners,
}: {
  ctx: KbnContext;
  spaces: string[];
  owners: string[];
}): Promise<void> {
  if (owners.length === 0 || spaces.length === 0) return;
  logger.info(
    `Enabling analytics for owners [${owners.join(', ')}] across ${spaces.length} space(s)...`
  );

  const work = spaces.flatMap((space) => owners.map((owner) => ({ owner, space })));

  await pMap(work, ({ owner, space }) => enableAnalyticsForOwner({ ctx, space, owner }), {
    concurrency: 6,
  });
}

// Shape returned by GET /api/cases/configure?owner=… for a single config.
// Only the fields the legacy code path reads are typed; the rest are kept
// as `unknown` so we can pass them through without making assumptions.
interface ConfigureSummary {
  id: string;
  version: string;
  customFields?: LegacyCustomFieldConfig[];
  templates?: LegacyTemplateConfig[];
}

// GETs the (single, per-owner) cases-configure SO for an owner+space. Returns
// undefined when no config exists yet, or the first config when one or more
// exist. Used by the legacy customFields/templates code path so PATCH/POST
// decisions can read the current customFields/templates before writing.
async function getConfigureForOwner(
  ctx: KbnContext,
  space: string,
  owner: string
): Promise<ConfigureSummary | undefined> {
  const configurePath = `${casesBasePath(space)}/api/cases/configure`;
  const { data } = await runWithRetry(
    () =>
      ctx.kbnClient.request<ConfigureSummary[]>({
        method: 'GET',
        path: `${configurePath}?owner=${encodeURIComponent(owner)}`,
        headers: ctx.headers,
      }),
    { label: `get_case_config_${owner}_${space || 'default'}` }
  );
  return data.length > 0 ? data[0] : undefined;
}

interface LegacyConfigureWrite {
  // Whether to register the typed customFields on the configure SO.
  customFields: boolean;
  // Whether to register the legacy templates on the configure SO.
  templates: boolean;
}

// Computes the next customFields array for the configure SO by stripping any
// of this script's keys from the existing list and appending the canonical
// LEGACY_CUSTOM_FIELDS_CONFIG. Used by configureLegacyForOwner so reruns
// stay idempotent and manually-added fields are preserved.
function mergeCustomFields(
  existing: LegacyCustomFieldConfig[] | undefined,
  installLegacy: boolean
): LegacyCustomFieldConfig[] {
  const filtered = (existing ?? []).filter(
    (entry) => !LEGACY_CUSTOM_FIELD_KEYS.includes(entry.key)
  );
  return installLegacy ? [...filtered, ...LEGACY_CUSTOM_FIELDS_CONFIG] : filtered;
}

// Computes the next templates array for the configure SO. Same idempotency
// guarantees as mergeCustomFields. When `includeCustomFieldValues` is true
// the new templates' caseFields.customFields slot is populated with the
// configured customFields' values; otherwise it stays empty (because the
// caller didn't ask for --legacyCustomFields, so referencing those keys in
// a template would dangle).
function mergeTemplates(
  existing: LegacyTemplateConfig[] | undefined,
  installLegacy: boolean,
  includeCustomFieldValues: boolean
): LegacyTemplateConfig[] {
  const filtered = (existing ?? []).filter((entry) => !LEGACY_TEMPLATE_KEYS.includes(entry.key));
  return installLegacy
    ? [...filtered, ...buildLegacyTemplates(includeCustomFieldValues)]
    : filtered;
}

// Installs typed customFields and/or legacy templates on the cases-configure
// SO for one (owner, space). Existing entries that this script doesn't own
// are preserved. Reruns are idempotent — this script's entries are replaced
// in place rather than duplicated. Called via pMap by configureLegacyForSpaces.
export async function configureLegacyForOwner({
  ctx,
  space,
  owner,
  install,
}: {
  ctx: KbnContext;
  space: string;
  owner: string;
  install: LegacyConfigureWrite;
}): Promise<void> {
  if (!install.customFields && !install.templates) return;

  const configurePath = `${casesBasePath(space)}/api/cases/configure`;
  const spaceLabel = space || 'default';

  try {
    const existing = await getConfigureForOwner(ctx, space, owner);
    const nextCustomFields = mergeCustomFields(existing?.customFields, install.customFields);
    const nextTemplates = mergeTemplates(
      existing?.templates,
      install.templates,
      install.customFields
    );

    if (existing) {
      await runWithRetry(
        () =>
          ctx.kbnClient.request({
            method: 'PATCH',
            path: `${configurePath}/${existing.id}`,
            headers: ctx.headers,
            body: {
              customFields: nextCustomFields,
              templates: nextTemplates,
              version: existing.version,
            },
          }),
        { label: `patch_case_config_legacy_${owner}_${spaceLabel}` }
      );
      logger.info(
        `  Legacy configure for owner "${owner}" in space "${spaceLabel}" updated (customFields=${
          install.customFields ? nextCustomFields.length : 'untouched'
        }, templates=${install.templates ? nextTemplates.length : 'untouched'})`
      );
      return;
    }

    await runWithRetry(
      () =>
        ctx.kbnClient.request({
          method: 'POST',
          path: configurePath,
          headers: ctx.headers,
          body: {
            owner,
            customFields: nextCustomFields,
            templates: nextTemplates,
            connector: { id: 'none', name: 'none', type: '.none', fields: null },
            closure_type: 'close-by-user',
          },
        }),
      { label: `create_case_config_legacy_${owner}_${spaceLabel}` }
    );
    logger.info(
      `  Legacy configure for owner "${owner}" in space "${spaceLabel}" created (customFields=${nextCustomFields.length}, templates=${nextTemplates.length})`
    );
  } catch (err) {
    if (isAlreadyExistsError(err)) {
      logger.info(
        `  Legacy configure for owner "${owner}" in space "${spaceLabel}" already exists, skipping`
      );
      return;
    }
    logger.error(
      `  Failed to install legacy configure for owner "${owner}" in space "${spaceLabel}": ${formatRequestError(
        err
      )}`
    );
  }
}

// Installs legacy customFields and/or templates across every (owner, space)
// cross-product, with bounded concurrency. Called once by run.ts when
// --legacyCustomFields or --legacyTemplates is supplied.
export async function configureLegacyForSpaces({
  ctx,
  spaces,
  owners,
  install,
}: {
  ctx: KbnContext;
  spaces: string[];
  owners: string[];
  install: LegacyConfigureWrite;
}): Promise<void> {
  if (owners.length === 0 || spaces.length === 0) return;
  if (!install.customFields && !install.templates) return;

  const installLabel = [
    install.customFields ? 'customFields' : null,
    install.templates ? 'templates' : null,
  ]
    .filter(Boolean)
    .join(' + ');

  logger.info(
    `Installing legacy ${installLabel} for owners [${owners.join(', ')}] across ${
      spaces.length
    } space(s)...`
  );

  const work = spaces.flatMap((space) => owners.map((owner) => ({ owner, space })));

  await pMap(work, ({ owner, space }) => configureLegacyForOwner({ ctx, space, owner, install }), {
    concurrency: 6,
  });
}

// Strips this script's customFields and legacy templates back off the
// configure SO for one (owner, space). Returns the count of entries removed
// so the caller can roll up cleanup totals. Called via pMap by
// cleanupLegacyForSpaces during --cleanup.
export async function cleanupLegacyForOwner({
  ctx,
  space,
  owner,
}: {
  ctx: KbnContext;
  space: string;
  owner: string;
}): Promise<{ customFieldsRemoved: number; templatesRemoved: number }> {
  const configurePath = `${casesBasePath(space)}/api/cases/configure`;
  const spaceLabel = space || 'default';

  try {
    const existing = await getConfigureForOwner(ctx, space, owner);
    if (!existing) {
      return { customFieldsRemoved: 0, templatesRemoved: 0 };
    }

    const customFieldsBefore = existing.customFields?.length ?? 0;
    const templatesBefore = existing.templates?.length ?? 0;
    const nextCustomFields = (existing.customFields ?? []).filter(
      (entry) => !LEGACY_CUSTOM_FIELD_KEYS.includes(entry.key)
    );
    const nextTemplates = (existing.templates ?? []).filter(
      (entry) => !LEGACY_TEMPLATE_KEYS.includes(entry.key)
    );

    const customFieldsRemoved = customFieldsBefore - nextCustomFields.length;
    const templatesRemoved = templatesBefore - nextTemplates.length;

    if (customFieldsRemoved === 0 && templatesRemoved === 0) {
      return { customFieldsRemoved: 0, templatesRemoved: 0 };
    }

    await runWithRetry(
      () =>
        ctx.kbnClient.request({
          method: 'PATCH',
          path: `${configurePath}/${existing.id}`,
          headers: ctx.headers,
          body: {
            customFields: nextCustomFields,
            templates: nextTemplates,
            version: existing.version,
          },
        }),
      { label: `cleanup_case_config_legacy_${owner}_${spaceLabel}` }
    );
    logger.info(
      `  Cleaned legacy configure for owner "${owner}" in space "${spaceLabel}" (customFields removed=${customFieldsRemoved}, templates removed=${templatesRemoved})`
    );
    return { customFieldsRemoved, templatesRemoved };
  } catch (err) {
    logger.error(
      `  Failed to clean legacy configure for owner "${owner}" in space "${spaceLabel}": ${formatRequestError(
        err
      )}`
    );
    return { customFieldsRemoved: 0, templatesRemoved: 0 };
  }
}

// Cleans this script's legacy customFields and templates off every (owner,
// space) cross-product. Returns aggregated removal counts so runCleanup can
// log a single summary line. Called by runCleanup when --cleanup is set.
export async function cleanupLegacyForSpaces({
  ctx,
  spaces,
  owners,
}: {
  ctx: KbnContext;
  spaces: string[];
  owners: string[];
}): Promise<{ customFieldsRemoved: number; templatesRemoved: number }> {
  if (owners.length === 0 || spaces.length === 0) {
    return { customFieldsRemoved: 0, templatesRemoved: 0 };
  }

  const work = spaces.flatMap((space) => owners.map((owner) => ({ owner, space })));
  const results = await pMap(
    work,
    ({ owner, space }) => cleanupLegacyForOwner({ ctx, space, owner }),
    { concurrency: 6 }
  );

  return results.reduce(
    (acc, r) => ({
      customFieldsRemoved: acc.customFieldsRemoved + r.customFieldsRemoved,
      templatesRemoved: acc.templatesRemoved + r.templatesRemoved,
    }),
    { customFieldsRemoved: 0, templatesRemoved: 0 }
  );
}

// Pages through the cases _find API and returns every case ID that carries
// the given tag in `space`. Used by cleanupCases to enumerate auto-generated
// cases before deleting them.
async function findCaseIdsByTag(ctx: KbnContext, space: string, tag: string): Promise<string[]> {
  const findPath = `${casesBasePath(space)}/api/cases/_find`;
  const ids: string[] = [];
  let page = 1;
  while (true) {
    const { data } = await runWithRetry(
      () =>
        ctx.kbnClient.request<{ cases: Array<{ id: string }>; total: number }>({
          method: 'GET',
          path: `${findPath}?tags=${encodeURIComponent(
            tag
          )}&page=${page}&perPage=${FIND_PAGE_SIZE}&sortField=createdAt&sortOrder=asc`,
          headers: ctx.headers,
        }),
      { label: `find_cases_by_tag_${tag}_p${page}` }
    );
    if (data.cases.length === 0) break;
    for (const c of data.cases) ids.push(c.id);
    if (ids.length >= data.total) break;
    page += 1;
  }
  return ids;
}

// Finds every case in `space` carrying `tag` and bulk-deletes them in batches.
// Returns the count of cases removed. Called by runCleanup once per cleanup
// space when --cleanup is set.
export async function cleanupCases({
  ctx,
  space,
  tag,
}: {
  ctx: KbnContext;
  space: string;
  tag: string;
}): Promise<number> {
  const spaceLabel = space || 'default';
  const ids = await findCaseIdsByTag(ctx, space, tag);
  if (ids.length === 0) {
    logger.info(`  No cases tagged "${tag}" in space "${spaceLabel}"`);
    return 0;
  }
  logger.info(`  Found ${ids.length} case(s) tagged "${tag}" in space "${spaceLabel}"`);
  for (const batch of chunk(ids, CASE_DELETE_BATCH_SIZE)) {
    const idsParam = batch.map((id) => `ids=${encodeURIComponent(id)}`).join('&');
    try {
      await runWithRetry(
        () =>
          ctx.kbnClient.request({
            method: 'DELETE',
            path: `${casesBasePath(space)}/api/cases?${idsParam}`,
            headers: ctx.headers,
          }),
        { label: `bulk_delete_cases_${batch.length}` }
      );
      logger.info(`  Deleted ${batch.length} case(s)`);
    } catch (err) {
      logger.error(`  Failed to delete case batch: ${formatRequestError(err)}`);
    }
  }
  return ids.length;
}

// Pages through the templates list API for each owner and returns the IDs of
// templates carrying `tag`. Used by cleanupTemplates to enumerate
// auto-generated templates across owners before bulk-deleting them.
async function findTemplateIdsByTag(
  ctx: KbnContext,
  space: string,
  owners: string[],
  tag: string
): Promise<string[]> {
  const listPath = `${casesBasePath(space)}/internal/cases/templates`;
  const ids: string[] = [];
  for (const owner of owners) {
    let page = 1;
    while (true) {
      const { data } = await runWithRetry(
        () =>
          ctx.kbnClient.request<{
            templates: Array<{ templateId: string; tags?: string[] }>;
            total: number;
          }>({
            method: 'GET',
            path: `${listPath}?owner=${encodeURIComponent(owner)}&tags=${encodeURIComponent(
              tag
            )}&page=${page}&perPage=${FIND_PAGE_SIZE}`,
            headers: ctx.headers,
          }),
        { label: `find_templates_${owner}_p${page}` }
      );
      if (data.templates.length === 0) break;
      for (const t of data.templates) ids.push(t.templateId);
      if (data.templates.length < FIND_PAGE_SIZE) break;
      page += 1;
    }
  }
  return ids;
}

// Finds every template in `space` (across the given owners) carrying `tag`
// and bulk-deletes them in batches. Returns the count removed. Called by
// runCleanup alongside cleanupCases.
export async function cleanupTemplates({
  ctx,
  space,
  owners,
  tag,
}: {
  ctx: KbnContext;
  space: string;
  owners: string[];
  tag: string;
}): Promise<number> {
  const spaceLabel = space || 'default';
  if (owners.length === 0) return 0;
  const ids = await findTemplateIdsByTag(ctx, space, owners, tag);
  if (ids.length === 0) {
    logger.info(`  No templates tagged "${tag}" in space "${spaceLabel}"`);
    return 0;
  }
  logger.info(`  Found ${ids.length} template(s) tagged "${tag}" in space "${spaceLabel}"`);
  for (const batch of chunk(ids, TEMPLATE_DELETE_BATCH_SIZE)) {
    try {
      await runWithRetry(
        () =>
          ctx.kbnClient.request({
            method: 'POST',
            path: `${casesBasePath(space)}/internal/cases/templates/_bulk_delete`,
            headers: ctx.headers,
            body: { ids: batch },
          }),
        { label: `bulk_delete_templates_${batch.length}` }
      );
      logger.info(`  Deleted ${batch.length} template(s)`);
    } catch (err) {
      logger.error(`  Failed to delete template batch: ${formatRequestError(err)}`);
    }
  }
  return ids.length;
}
