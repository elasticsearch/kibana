/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { FileEntryType, type FileEntry } from '@kbn/agent-builder-server/runner/filestore';
import { MemoryVolume } from '../runner/store/memory_volume';
import { VolumeBackedReadOnlyFs } from './volume_backed_read_only_fs';

const makeFileEntry = (path: string, plainText?: string, raw: object = {}): FileEntry => ({
  path,
  type: 'file',
  metadata: {
    type: FileEntryType.toolResult,
    id: path,
    token_count: 0,
    readonly: true,
  },
  content: { raw, plain_text: plainText },
});

const seed = (volume: MemoryVolume, entries: FileEntry[]) => {
  for (const e of entries) volume.add(e);
};

describe('VolumeBackedReadOnlyFs', () => {
  let volume: MemoryVolume;
  let fs: VolumeBackedReadOnlyFs;

  beforeEach(() => {
    volume = new MemoryVolume();
    fs = new VolumeBackedReadOnlyFs(volume);
  });

  describe('readFile', () => {
    it('returns plain_text when present', async () => {
      seed(volume, [makeFileEntry('/a.txt', 'hello')]);
      expect(await fs.readFile('/a.txt')).toBe('hello');
    });

    it('falls back to JSON.stringify(raw) when plain_text is undefined', async () => {
      seed(volume, [makeFileEntry('/b.json', undefined, { foo: 1 })]);
      expect(await fs.readFile('/b.json')).toBe(JSON.stringify({ foo: 1 }, undefined, 2));
    });

    it('throws ENOENT for missing files', async () => {
      await expect(fs.readFile('/missing.txt')).rejects.toThrow(/ENOENT/);
    });
  });

  describe('readdir', () => {
    it('lists files and directories in a path', async () => {
      seed(volume, [
        makeFileEntry('/dir/a.txt', 'a'),
        makeFileEntry('/dir/b.txt', 'b'),
        makeFileEntry('/dir/sub/c.txt', 'c'),
      ]);
      const names = await fs.readdir('/dir');
      expect(names.sort()).toEqual(['a.txt', 'b.txt', 'sub']);
    });

    it('throws ENOENT for missing directories', async () => {
      await expect(fs.readdir('/nope')).rejects.toThrow(/ENOENT/);
    });
  });

  describe('exists', () => {
    it('returns true for known files', async () => {
      seed(volume, [makeFileEntry('/a.txt', 'a')]);
      expect(await fs.exists('/a.txt')).toBe(true);
    });

    it('returns false for missing paths', async () => {
      expect(await fs.exists('/missing')).toBe(false);
    });
  });

  describe('stat / lstat', () => {
    it('returns isFile=true for files', async () => {
      seed(volume, [makeFileEntry('/a.txt', 'hello')]);
      const s = await fs.stat('/a.txt');
      expect(s.isFile).toBe(true);
      expect(s.isDirectory).toBe(false);
      expect(s.isSymbolicLink).toBe(false);
      expect(s.size).toBe(Buffer.from('hello').length);
    });

    it('returns isDirectory=true for directories', async () => {
      seed(volume, [makeFileEntry('/dir/a.txt', 'a')]);
      const s = await fs.stat('/dir');
      expect(s.isDirectory).toBe(true);
    });

    it('lstat behaves the same as stat (no symlinks)', async () => {
      seed(volume, [makeFileEntry('/a.txt', 'a')]);
      expect(await fs.lstat('/a.txt')).toEqual(await fs.stat('/a.txt'));
    });
  });

  describe('always-fresh view', () => {
    it('reflects entries added after construction', async () => {
      expect(await fs.exists('/late.txt')).toBe(false);
      seed(volume, [makeFileEntry('/late.txt', 'now')]);
      expect(await fs.exists('/late.txt')).toBe(true);
      expect(await fs.readFile('/late.txt')).toBe('now');
    });
  });

  describe('write methods throw EROFS', () => {
    it.each<[string, () => Promise<unknown>]>([
      ['writeFile', () => fs.writeFile('/x', 'y')],
      ['appendFile', () => fs.appendFile('/x', 'y')],
      ['mkdir', () => fs.mkdir('/x')],
      ['rm', () => fs.rm('/x')],
      ['cp', () => fs.cp('/x', '/y')],
      ['mv', () => fs.mv('/x', '/y')],
      ['chmod', () => fs.chmod('/x', 0o644)],
      ['symlink', () => fs.symlink('/t', '/l')],
      ['link', () => fs.link('/t', '/l')],
      ['utimes', () => fs.utimes('/x', new Date(), new Date())],
    ])('%s throws EROFS', async (_name, op) => {
      await expect(op()).rejects.toThrow(/EROFS/);
    });
  });
});
