import { describe, it, expect } from 'vitest';
import { sortProjectsByTimestamp, sortSnapshotsByTimestamp } from './sorting.js';
import type { ProjectRecord, Snapshot } from './models.js';

describe('Sorting Utilities', () => {
  describe('sortProjectsByTimestamp', () => {
    it('sorts projects by lastParkTimestamp descending (newest first)', () => {
      const projects: ProjectRecord[] = [
        { userId: 'u1', projectId: 'p1', projectName: 'alpha', lastParkTimestamp: '2024-01-01T00:00:00.000Z', summary: '', snapshotCount: 1 },
        { userId: 'u1', projectId: 'p2', projectName: 'beta', lastParkTimestamp: '2024-03-15T12:00:00.000Z', summary: '', snapshotCount: 2 },
        { userId: 'u1', projectId: 'p3', projectName: 'gamma', lastParkTimestamp: '2024-02-10T08:30:00.000Z', summary: '', snapshotCount: 1 },
      ];

      const sorted = sortProjectsByTimestamp(projects);

      expect(sorted[0].projectName).toBe('beta');
      expect(sorted[1].projectName).toBe('gamma');
      expect(sorted[2].projectName).toBe('alpha');
    });

    it('does not mutate the input array', () => {
      const projects: ProjectRecord[] = [
        { userId: 'u1', projectId: 'p1', projectName: 'first', lastParkTimestamp: '2024-01-01T00:00:00.000Z', summary: '', snapshotCount: 1 },
        { userId: 'u1', projectId: 'p2', projectName: 'second', lastParkTimestamp: '2024-06-01T00:00:00.000Z', summary: '', snapshotCount: 1 },
      ];

      const originalOrder = projects.map(p => p.projectName);
      sortProjectsByTimestamp(projects);

      expect(projects.map(p => p.projectName)).toEqual(originalOrder);
    });

    it('returns empty array for empty input', () => {
      expect(sortProjectsByTimestamp([])).toEqual([]);
    });

    it('returns single-element array unchanged', () => {
      const projects: ProjectRecord[] = [
        { userId: 'u1', projectId: 'p1', projectName: 'only', lastParkTimestamp: '2024-05-05T00:00:00.000Z', summary: '', snapshotCount: 1 },
      ];

      const sorted = sortProjectsByTimestamp(projects);
      expect(sorted).toEqual(projects);
    });
  });

  describe('sortSnapshotsByTimestamp', () => {
    const makeSnapshot = (timestamp: string, projectName = 'test'): Snapshot => ({
      projectId: 'p1',
      projectName,
      timestamp,
      source: 'manual',
      git: { branch: 'main', lastCommits: [], uncommittedDiff: '', modifiedFiles: [] },
    });

    it('sorts snapshots by timestamp descending (newest first)', () => {
      const snapshots = [
        makeSnapshot('2024-01-10T09:00:00.000Z'),
        makeSnapshot('2024-03-20T14:00:00.000Z'),
        makeSnapshot('2024-02-05T11:30:00.000Z'),
      ];

      const sorted = sortSnapshotsByTimestamp(snapshots);

      expect(sorted[0].timestamp).toBe('2024-03-20T14:00:00.000Z');
      expect(sorted[1].timestamp).toBe('2024-02-05T11:30:00.000Z');
      expect(sorted[2].timestamp).toBe('2024-01-10T09:00:00.000Z');
    });

    it('does not mutate the input array', () => {
      const snapshots = [
        makeSnapshot('2024-01-01T00:00:00.000Z'),
        makeSnapshot('2024-12-31T23:59:59.000Z'),
      ];

      const originalTimestamps = snapshots.map(s => s.timestamp);
      sortSnapshotsByTimestamp(snapshots);

      expect(snapshots.map(s => s.timestamp)).toEqual(originalTimestamps);
    });

    it('returns empty array for empty input', () => {
      expect(sortSnapshotsByTimestamp([])).toEqual([]);
    });

    it('returns single-element array unchanged', () => {
      const snapshots = [makeSnapshot('2024-06-15T12:00:00.000Z')];
      const sorted = sortSnapshotsByTimestamp(snapshots);
      expect(sorted).toEqual(snapshots);
    });
  });
});
