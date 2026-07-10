import { describe, it, expect } from 'vitest';
import {
  userPK,
  projectSK,
  snapshotSK,
  snapshotSKPrefix,
  autoCapturePK,
  autoCaptureSK,
  parseUserIdFromPK,
  parseProjectIdFromSK,
  parseSnapshotSK,
  parseUserIdFromAutoCapturePK,
  PK_USER_PREFIX,
  SK_PROJECT_PREFIX,
  SK_SNAPSHOT_PREFIX,
  GSI1_AUTOCAP_PREFIX,
} from './keys.js';

describe('DynamoDB Key Schema Utilities', () => {
  describe('Primary Key Constructors', () => {
    it('userPK constructs USER#{userId}', () => {
      expect(userPK('user-123')).toBe('USER#user-123');
      expect(userPK('abc')).toBe('USER#abc');
    });

    it('projectSK constructs PROJECT#{projectId}', () => {
      expect(projectSK('proj-456')).toBe('PROJECT#proj-456');
      expect(projectSK('a1b2c3d4e5f6')).toBe('PROJECT#a1b2c3d4e5f6');
    });

    it('snapshotSK constructs SNAPSHOT#{projectId}#{timestamp}', () => {
      expect(snapshotSK('proj-456', '2024-01-15T10:30:00.000Z')).toBe(
        'SNAPSHOT#proj-456#2024-01-15T10:30:00.000Z'
      );
    });

    it('snapshotSKPrefix constructs SNAPSHOT#{projectId}# for begins_with queries', () => {
      expect(snapshotSKPrefix('proj-456')).toBe('SNAPSHOT#proj-456#');
    });
  });

  describe('GSI-1 Key Constructors', () => {
    it('autoCapturePK constructs AUTOCAP#{userId}', () => {
      expect(autoCapturePK('user-123')).toBe('AUTOCAP#user-123');
    });

    it('autoCaptureSK constructs PROJECT#{projectId}', () => {
      expect(autoCaptureSK('proj-456')).toBe('PROJECT#proj-456');
    });
  });

  describe('Key Parsing Utilities', () => {
    it('parseUserIdFromPK extracts userId from USER# key', () => {
      expect(parseUserIdFromPK('USER#user-123')).toBe('user-123');
      expect(parseUserIdFromPK('USER#abc-def-ghi')).toBe('abc-def-ghi');
    });

    it('parseUserIdFromPK throws on invalid prefix', () => {
      expect(() => parseUserIdFromPK('INVALID#user-123')).toThrow('Invalid PK format');
      expect(() => parseUserIdFromPK('')).toThrow('Invalid PK format');
    });

    it('parseProjectIdFromSK extracts projectId from PROJECT# key', () => {
      expect(parseProjectIdFromSK('PROJECT#proj-456')).toBe('proj-456');
    });

    it('parseProjectIdFromSK throws on invalid prefix', () => {
      expect(() => parseProjectIdFromSK('SNAPSHOT#proj')).toThrow('Invalid SK format');
    });

    it('parseSnapshotSK extracts projectId and timestamp', () => {
      const result = parseSnapshotSK('SNAPSHOT#proj-456#2024-01-15T10:30:00.000Z');
      expect(result.projectId).toBe('proj-456');
      expect(result.timestamp).toBe('2024-01-15T10:30:00.000Z');
    });

    it('parseSnapshotSK throws on invalid prefix', () => {
      expect(() => parseSnapshotSK('PROJECT#proj')).toThrow('Invalid SK format');
    });

    it('parseSnapshotSK throws on missing timestamp separator', () => {
      expect(() => parseSnapshotSK('SNAPSHOT#projwithoutseparator')).toThrow(
        'missing timestamp separator'
      );
    });

    it('parseUserIdFromAutoCapturePK extracts userId from AUTOCAP# key', () => {
      expect(parseUserIdFromAutoCapturePK('AUTOCAP#user-123')).toBe('user-123');
    });

    it('parseUserIdFromAutoCapturePK throws on invalid prefix', () => {
      expect(() => parseUserIdFromAutoCapturePK('USER#user-123')).toThrow(
        'Invalid GSI-1 PK format'
      );
    });
  });

  describe('Roundtrip consistency', () => {
    it('userPK and parseUserIdFromPK are inverses', () => {
      const userId = 'test-user-42';
      expect(parseUserIdFromPK(userPK(userId))).toBe(userId);
    });

    it('projectSK and parseProjectIdFromSK are inverses', () => {
      const projectId = 'a1b2c3d4e5f6g7h8';
      expect(parseProjectIdFromSK(projectSK(projectId))).toBe(projectId);
    });

    it('snapshotSK and parseSnapshotSK are inverses', () => {
      const projectId = 'proj-abc';
      const timestamp = '2024-06-01T08:00:00.000Z';
      const result = parseSnapshotSK(snapshotSK(projectId, timestamp));
      expect(result.projectId).toBe(projectId);
      expect(result.timestamp).toBe(timestamp);
    });

    it('autoCapturePK and parseUserIdFromAutoCapturePK are inverses', () => {
      const userId = 'auto-user-99';
      expect(parseUserIdFromAutoCapturePK(autoCapturePK(userId))).toBe(userId);
    });
  });

  describe('Prefix constants', () => {
    it('exports correct prefix values', () => {
      expect(PK_USER_PREFIX).toBe('USER#');
      expect(SK_PROJECT_PREFIX).toBe('PROJECT#');
      expect(SK_SNAPSHOT_PREFIX).toBe('SNAPSHOT#');
      expect(GSI1_AUTOCAP_PREFIX).toBe('AUTOCAP#');
    });
  });
});
