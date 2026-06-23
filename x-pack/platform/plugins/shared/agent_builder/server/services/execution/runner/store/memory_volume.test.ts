/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { FileEntryType, type FileEntry } from '@kbn/agent-builder-server/runner/filestore';
import { MemoryVolume } from './memory_volume';

const createFileEntry = (path: string, overrides: Partial<FileEntry> = {}): FileEntry => ({
  path,
  type: 'file',
  metadata: {
    type: FileEntryType.toolResult,
    id: path,
    token_count: 100,
    readonly: true,
  },
  content: {
    raw: { name: `content for ${path}` },
  },
  ...overrides,
});

describe('MemoryVolume', () => {
  describe('add', () => {
    it('adds a file entry to the volume', async () => {
      const volume = new MemoryVolume();
      const entry = createFileEntry('/agents/agent1.json');

      volume.add(entry);

      expect(volume.has('/agents/agent1.json')).toBe(true);
      expect(await volume.get('/agents/agent1.json')).toEqual(entry);
    });

    it('normalizes paths', async () => {
      const volume = new MemoryVolume();
      const entry = createFileEntry('agents//agent1.json');

      volume.add(entry);

      expect(volume.has('/agents/agent1.json')).toBe(true);
    });

    it('creates nested directories as needed', async () => {
      const volume = new MemoryVolume();
      const entry = createFileEntry('/deep/nested/path/file.json');

      volume.add(entry);

      expect(await volume.exists('/deep')).toBe(true);
      expect(await volume.exists('/deep/nested')).toBe(true);
      expect(await volume.exists('/deep/nested/path')).toBe(true);
    });

    it('overwrites existing entry at the same path', async () => {
      const volume = new MemoryVolume();
      const entry1 = createFileEntry('/agents/agent1.json', { content: { raw: { version: 1 } } });
      const entry2 = createFileEntry('/agents/agent1.json', { content: { raw: { version: 2 } } });

      volume.add(entry1);
      volume.add(entry2);

      const result = (await volume.get('/agents/agent1.json')) as FileEntry;
      expect(result.content.raw).toEqual({ version: 2 });
    });
  });

  describe('remove', () => {
    it('removes a file entry', async () => {
      const volume = new MemoryVolume();
      volume.add(createFileEntry('/agents/agent1.json'));

      const removed = volume.remove('/agents/agent1.json');

      expect(removed).toBe(true);
      expect(volume.has('/agents/agent1.json')).toBe(false);
    });

    it('returns false if entry does not exist', () => {
      const volume = new MemoryVolume();

      const removed = volume.remove('/agents/agent1.json');

      expect(removed).toBe(false);
    });

    it('cleans up empty directories', async () => {
      const volume = new MemoryVolume();
      volume.add(createFileEntry('/a/b/c/file.json'));

      volume.remove('/a/b/c/file.json');

      expect(await volume.exists('/a/b/c')).toBe(false);
      expect(await volume.exists('/a/b')).toBe(false);
      expect(await volume.exists('/a')).toBe(false);
    });
  });

  describe('has', () => {
    it('returns true for existing files', () => {
      const volume = new MemoryVolume();
      volume.add(createFileEntry('/agents/agent1.json'));

      expect(volume.has('/agents/agent1.json')).toBe(true);
    });

    it('returns false for non-existing files', () => {
      const volume = new MemoryVolume();

      expect(volume.has('/agents/agent1.json')).toBe(false);
    });

    it('returns false for directories (only tracks files)', () => {
      const volume = new MemoryVolume();
      volume.add(createFileEntry('/agents/agent1.json'));

      expect(volume.has('/agents')).toBe(false);
    });
  });

  describe('list', () => {
    it('returns files in the specified directory', async () => {
      const volume = new MemoryVolume();
      const entry1 = createFileEntry('/agents/agent1.json');
      const entry2 = createFileEntry('/agents/agent2.json');
      volume.add(entry1);
      volume.add(entry2);

      const results = await volume.list('/agents');

      expect(results).toHaveLength(2);
      expect(results).toEqual(expect.arrayContaining([entry1, entry2]));
    });

    it('returns subdirectories as DirEntry', async () => {
      const volume = new MemoryVolume();
      volume.add(createFileEntry('/agents/custom/agent1.json'));

      const results = await volume.list('/agents');

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({ path: '/agents/custom', type: 'dir' });
    });

    it('returns both files and subdirectories', async () => {
      const volume = new MemoryVolume();
      const fileEntry = createFileEntry('/agents/agent1.json');
      volume.add(fileEntry);
      volume.add(createFileEntry('/agents/custom/agent2.json'));

      const results = await volume.list('/agents');

      expect(results).toHaveLength(2);
      expect(results).toEqual(
        expect.arrayContaining([fileEntry, { path: '/agents/custom', type: 'dir' }])
      );
    });

    it('returns empty array for empty directory', async () => {
      const volume = new MemoryVolume();

      const results = await volume.list('/agents');

      expect(results).toEqual([]);
    });

    it('does not return nested files (only immediate children)', async () => {
      const volume = new MemoryVolume();
      volume.add(createFileEntry('/agents/level1/level2/deep.json'));

      const results = await volume.list('/agents');

      expect(results).toHaveLength(1);
      expect(results[0]).toEqual({ path: '/agents/level1', type: 'dir' });
    });
  });

  describe('exists', () => {
    it('returns true for existing files', async () => {
      const volume = new MemoryVolume();
      volume.add(createFileEntry('/agents/agent1.json'));

      expect(await volume.exists('/agents/agent1.json')).toBe(true);
    });

    it('returns true for implicit directories', async () => {
      const volume = new MemoryVolume();
      volume.add(createFileEntry('/agents/agent1.json'));

      expect(await volume.exists('/agents')).toBe(true);
    });

    it('returns false for non-existing paths', async () => {
      const volume = new MemoryVolume();

      expect(await volume.exists('/agents/agent1.json')).toBe(false);
    });
  });

  describe('clear', () => {
    it('removes all entries from the volume', async () => {
      const volume = new MemoryVolume();
      volume.add(createFileEntry('/agents/agent1.json'));
      volume.add(createFileEntry('/agents/agent2.json'));

      volume.clear();

      expect(volume.has('/agents/agent1.json')).toBe(false);
      expect(volume.has('/agents/agent2.json')).toBe(false);
      expect(await volume.exists('/agents')).toBe(false);
    });
  });
});
