/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { z } from '@kbn/zod/v4';
import type {
  PluginManifest,
  ParsedPluginArchive,
  ParsedSkillFile,
  UnmanagedPluginAssets,
} from '@kbn/agent-builder-common';
import type { ZipArchive } from '../archive';
import { parseSkillFile } from './parse_skill_file';
import { readCommands } from './parse_command_files';

const manifestPaths = ['.claude-plugin/plugin.json', 'plugin.json'];

const defaultSkillsDir = 'skills/';
const defaultAgentsDir = 'agents/';
const defaultHooksConfig = 'hooks/hooks.json';
const defaultHooksDir = 'hooks/';
const defaultMcpConfig = '.mcp.json';
const defaultOutputStylesDir = 'outputStyles/';
const defaultLspConfig = '.lsp.json';

/**
 * Parses and validates a Claude plugin zip archive.
 *
 * Extracts the manifest, parses skill and command files, and detects
 * unmanaged assets (agents, hooks, etc.) that are
 * present in the archive but not yet supported for installation.
 */
export const parsePluginZipFile = async (archive: ZipArchive): Promise<ParsedPluginArchive> => {
  const manifest = await readAndValidateManifest(archive);
  const skills = await readSkills(archive, manifest);
  const commands = await readCommands(archive, manifest);
  const unmanagedAssets = detectUnmanagedAssets(archive, manifest);

  // Many Claude plugins ship a command with the same name as a skill
  // (the command just loads the skill). Drop such commands to avoid
  // name collisions.
  const skillNames = new Set(skills.map((s) => s.dirName));
  const dedupedCommands = commands.filter((cmd) => !skillNames.has(cmd.dirName));

  const allSkills = [...skills, ...dedupedCommands];

  const seen = new Set<string>();
  for (const skill of allSkills) {
    if (seen.has(skill.dirName)) {
      throw new PluginArchiveError(
        `Duplicate skill name "${skill.dirName}" found in archive. Skills and commands must have unique names.`
      );
    }
    seen.add(skill.dirName);
  }

  return { manifest, skills: allSkills, unmanagedAssets };
};

const readAndValidateManifest = async (archive: ZipArchive): Promise<PluginManifest> => {
  const resolvedPath = manifestPaths.find((p) => archive.hasEntry(p));
  if (!resolvedPath) {
    throw new PluginArchiveError(
      `Plugin manifest not found. Looked for ${manifestPaths.join(
        ' and '
      )}. A plugin.json manifest is required.`
    );
  }

  const content = await archive.getEntryContent(resolvedPath);
  let parsed: unknown;
  try {
    parsed = JSON.parse(content.toString('utf-8'));
  } catch (e) {
    throw new PluginArchiveError(
      `Invalid JSON in plugin manifest: ${e instanceof Error ? e.message : String(e)}`
    );
  }

  return validateManifest(parsed);
};

const pathFieldSchema = z.union([z.string(), z.array(z.string())]);

const pluginManifestSchema = z
  .object({
    name: z
      .string()
      .refine((val) => val.trim().length > 0, { message: 'must not be empty' })
      .transform((val) => val.trim()),
    version: z.string().optional(),
    description: z.string().optional(),
    author: z
      .object({
        name: z.string(),
        email: z.string().optional(),
        url: z.string().optional(),
      })
      .optional(),
    homepage: z.string().optional(),
    repository: z.string().optional(),
    license: z.string().optional(),
    keywords: z.array(z.string()).optional(),
    commands: pathFieldSchema.optional(),
    agents: pathFieldSchema.optional(),
    skills: pathFieldSchema.optional(),
    hooks: pathFieldSchema.optional(),
    mcpServers: pathFieldSchema.optional(),
    outputStyles: pathFieldSchema.optional(),
    lspServers: pathFieldSchema.optional(),
  })
  .strict();

const validateManifest = (raw: unknown): PluginManifest => {
  const result = pluginManifestSchema.safeParse(raw);
  if (!result.success) {
    const messages = result.error.issues
      .map((issue) => {
        const path = issue.path.length > 0 ? `"${issue.path.join('.')}"` : 'root';
        return `${path}: ${issue.message}`;
      })
      .join('; ');
    throw new PluginArchiveError(`Invalid plugin manifest: ${messages}`);
  }
  return result.data;
};

const readSkills = async (
  archive: ZipArchive,
  manifest: PluginManifest
): Promise<ParsedSkillFile[]> => {
  const skillDirs = resolveSkillDirs(archive, manifest);
  const skills: ParsedSkillFile[] = [];

  for (const skillDir of skillDirs) {
    const skillMdPath = `${skillDir}SKILL.md`;
    if (!archive.hasEntry(skillMdPath)) {
      continue;
    }

    const content = await archive.getEntryContent(skillMdPath);
    const { meta, content: body } = parseSkillFile(content.toString('utf-8'));

    const referencedFiles = await readReferencedFiles(archive, skillDir, skillMdPath);
    const dirName = skillDir.replace(/\/$/, '').split('/').pop()!;

    skills.push({
      dirName,
      meta,
      content: body,
      referencedFiles,
    });
  }

  return skills;
};

/**
 * Resolves all skill directories from the archive.
 * A skill directory is any directory containing a SKILL.md file,
 * found under the default `skills/` or custom paths from the manifest.
 */
const resolveSkillDirs = (archive: ZipArchive, manifest: PluginManifest): string[] => {
  const searchRoots = new Set<string>();
  searchRoots.add(defaultSkillsDir);

  if (manifest.skills !== undefined) {
    const customPaths = Array.isArray(manifest.skills) ? manifest.skills : [manifest.skills];
    for (const p of customPaths) {
      searchRoots.add(normalizeDirPath(p));
    }
  }

  const skillDirs = new Set<string>();
  const entries = archive.getEntryPaths();

  for (const entryPath of entries) {
    for (const root of searchRoots) {
      if (entryPath.startsWith(root) && entryPath.endsWith('/SKILL.md')) {
        const dir = entryPath.substring(0, entryPath.length - 'SKILL.md'.length);
        skillDirs.add(dir);
      }
    }
  }

  return [...skillDirs];
};

const readReferencedFiles = async (
  archive: ZipArchive,
  skillDir: string,
  skillMdPath: string
): Promise<Array<{ relativePath: string; content: string }>> => {
  const entries = archive.getEntryPaths();
  const referencedFiles: Array<{ relativePath: string; content: string }> = [];

  for (const entryPath of entries) {
    if (entryPath.startsWith(skillDir) && entryPath !== skillMdPath && !entryPath.endsWith('/')) {
      const fileContent = await archive.getEntryContent(entryPath);
      referencedFiles.push({
        relativePath: entryPath.substring(skillDir.length),
        content: fileContent.toString('utf-8'),
      });
    }
  }

  return referencedFiles;
};

const detectUnmanagedAssets = (
  archive: ZipArchive,
  manifest: PluginManifest
): UnmanagedPluginAssets => {
  const entries = archive.getEntryPaths();

  return {
    agents: findAssetEntries(entries, defaultAgentsDir, manifest.agents),
    hooks: findAssetEntries(entries, defaultHooksDir, manifest.hooks, defaultHooksConfig),
    mcp_servers: findAssetEntries(entries, undefined, manifest.mcpServers, defaultMcpConfig),
    output_styles: findAssetEntries(entries, defaultOutputStylesDir, manifest.outputStyles),
    lsp_servers: findAssetEntries(entries, undefined, manifest.lspServers, defaultLspConfig),
  };
};

/**
 * Finds archive entries matching a given asset type.
 *
 * Searches:
 * - entries under `defaultDir` (if provided)
 * - entries matching manifest custom paths
 * - a single known config file (if provided)
 *
 * Only returns non-directory entries.
 */
const findAssetEntries = (
  entries: string[],
  defaultDir: string | undefined,
  customPaths: string | string[] | undefined,
  defaultConfigFile?: string
): string[] => {
  const matched = new Set<string>();

  for (const entry of entries) {
    if (entry.endsWith('/')) {
      continue;
    }
    if (defaultDir && entry.startsWith(defaultDir)) {
      matched.add(entry);
    }
    if (defaultConfigFile && entry === defaultConfigFile) {
      matched.add(entry);
    }
  }

  if (customPaths !== undefined) {
    const paths = Array.isArray(customPaths) ? customPaths : [customPaths];
    for (const customPath of paths) {
      const cleaned = customPath.startsWith('./') ? customPath.substring(2) : customPath;
      const asDir = cleaned.endsWith('/') ? cleaned : `${cleaned}/`;
      for (const entry of entries) {
        if (entry.endsWith('/')) {
          continue;
        }
        if (entry === cleaned || entry.startsWith(asDir)) {
          matched.add(entry);
        }
      }
    }
  }

  return [...matched];
};

const normalizeDirPath = (p: string): string => {
  const cleaned = p.startsWith('./') ? p.substring(2) : p;
  return cleaned.endsWith('/') ? cleaned : `${cleaned}/`;
};

export class PluginArchiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PluginArchiveError';
  }
}
