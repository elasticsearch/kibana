/*
 * Copyright Elasticsearch B.V. and/or licensed to Elasticsearch B.V. under one
 * or more contributor license agreements. Licensed under the Elastic License
 * 2.0; you may not use this file except in compliance with the Elastic License
 * 2.0.
 */

import { InMemoryFs } from 'just-bash';
import { DirtyTrackingFs } from './dirty_tracking_fs';

const make = () => {
  const inner = new InMemoryFs();
  return { inner, fs: new DirtyTrackingFs(inner) };
};

describe('DirtyTrackingFs', () => {
  describe('initial state', () => {
    it('starts clean', () => {
      const { fs } = make();
      expect(fs.isDirty()).toBe(false);
    });

    it('reads do not flip dirty', async () => {
      const { inner, fs } = make();
      await inner.writeFile('/seed.txt', 'data');
      await fs.readFile('/seed.txt');
      await fs.exists('/seed.txt');
      await fs.stat('/seed.txt');
      await fs.lstat('/seed.txt');
      await fs.readdir('/');
      await fs.readFileBuffer('/seed.txt');
      expect(fs.isDirty()).toBe(false);
    });
  });

  describe('mutations flip dirty', () => {
    it('writeFile', async () => {
      const { fs } = make();
      await fs.writeFile('/a.txt', 'data');
      expect(fs.isDirty()).toBe(true);
    });

    it('appendFile', async () => {
      const { fs } = make();
      await fs.writeFile('/a.txt', 'a');
      fs.resetDirty();
      await fs.appendFile('/a.txt', 'b');
      expect(fs.isDirty()).toBe(true);
    });

    it('cp', async () => {
      const { fs } = make();
      await fs.writeFile('/a.txt', 'a');
      fs.resetDirty();
      await fs.cp('/a.txt', '/b.txt');
      expect(fs.isDirty()).toBe(true);
    });

    it('mv', async () => {
      const { fs } = make();
      await fs.writeFile('/a.txt', 'a');
      fs.resetDirty();
      await fs.mv('/a.txt', '/b.txt');
      expect(fs.isDirty()).toBe(true);
    });

    it('rm', async () => {
      const { fs } = make();
      await fs.writeFile('/a.txt', 'a');
      fs.resetDirty();
      await fs.rm('/a.txt');
      expect(fs.isDirty()).toBe(true);
    });

    it('mkdir', async () => {
      const { fs } = make();
      await fs.mkdir('/sub');
      expect(fs.isDirty()).toBe(true);
    });

    it('chmod', async () => {
      const { fs } = make();
      await fs.writeFile('/a.txt', 'a');
      fs.resetDirty();
      await fs.chmod('/a.txt', 0o600);
      expect(fs.isDirty()).toBe(true);
    });

    it('symlink', async () => {
      const { fs } = make();
      await fs.writeFile('/a.txt', 'a');
      fs.resetDirty();
      await fs.symlink('/a.txt', '/link');
      expect(fs.isDirty()).toBe(true);
    });

    it('link', async () => {
      const { fs } = make();
      await fs.writeFile('/a.txt', 'a');
      fs.resetDirty();
      await fs.link('/a.txt', '/hardlink');
      expect(fs.isDirty()).toBe(true);
    });

    it('utimes', async () => {
      const { fs } = make();
      await fs.writeFile('/a.txt', 'a');
      fs.resetDirty();
      await fs.utimes('/a.txt', new Date(), new Date());
      expect(fs.isDirty()).toBe(true);
    });
  });

  describe('failed mutations do not flip dirty', () => {
    it('writeFile to an inaccessible path leaves dirty unchanged', async () => {
      // Mock an inner that always throws on writeFile.
      const inner = {
        writeFile: jest.fn().mockRejectedValue(new Error('EROFS')),
        // Stubs to satisfy IFileSystem — never called in this test.
      } as unknown as InMemoryFs;
      const fs = new DirtyTrackingFs(inner);
      await expect(fs.writeFile('/a.txt', 'x')).rejects.toThrow(/EROFS/);
      expect(fs.isDirty()).toBe(false);
    });

    it('rm of a missing file leaves dirty unchanged', async () => {
      const { fs } = make();
      await expect(fs.rm('/missing.txt')).rejects.toThrow();
      expect(fs.isDirty()).toBe(false);
    });
  });

  describe('resetDirty', () => {
    it('clears the dirty bit', async () => {
      const { fs } = make();
      await fs.writeFile('/a.txt', 'data');
      expect(fs.isDirty()).toBe(true);
      fs.resetDirty();
      expect(fs.isDirty()).toBe(false);
    });

    it('next mutation re-flips it', async () => {
      const { fs } = make();
      await fs.writeFile('/a.txt', 'data');
      fs.resetDirty();
      expect(fs.isDirty()).toBe(false);
      await fs.writeFile('/b.txt', 'more');
      expect(fs.isDirty()).toBe(true);
    });
  });

  describe('passthrough semantics', () => {
    it('writes are actually applied to the inner fs', async () => {
      const { inner, fs } = make();
      await fs.writeFile('/a.txt', 'hello');
      expect(await inner.readFile('/a.txt')).toBe('hello');
    });

    it('reads return inner content', async () => {
      const { inner, fs } = make();
      await inner.writeFile('/a.txt', 'inner-content');
      expect(await fs.readFile('/a.txt')).toBe('inner-content');
    });
  });
});
