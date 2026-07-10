import { describe, it, expect } from "vitest";
import {
  NotGitRepoError,
  StorageError,
  NotFoundError,
  ValidationError,
  AuthError,
} from "./errors.js";

describe("errors", () => {
  describe("NotGitRepoError", () => {
    it("has correct default message", () => {
      const err = new NotGitRepoError();
      expect(err.message).toBe("Current directory is not a git repository");
    });

    it("accepts custom message", () => {
      const err = new NotGitRepoError("custom message");
      expect(err.message).toBe("custom message");
    });

    it("has correct name and code", () => {
      const err = new NotGitRepoError();
      expect(err.name).toBe("NotGitRepoError");
      expect(err.code).toBe("NOT_GIT_REPO");
    });

    it("is an instance of Error", () => {
      const err = new NotGitRepoError();
      expect(err).toBeInstanceOf(Error);
    });
  });

  describe("StorageError", () => {
    it("has correct default message", () => {
      const err = new StorageError();
      expect(err.message).toBe("Storage operation failed");
    });

    it("accepts custom message", () => {
      const err = new StorageError("DynamoDB unreachable");
      expect(err.message).toBe("DynamoDB unreachable");
    });

    it("has correct name and code", () => {
      const err = new StorageError();
      expect(err.name).toBe("StorageError");
      expect(err.code).toBe("STORAGE_ERROR");
    });

    it("is an instance of Error", () => {
      const err = new StorageError();
      expect(err).toBeInstanceOf(Error);
    });
  });

  describe("NotFoundError", () => {
    it("has correct default message", () => {
      const err = new NotFoundError();
      expect(err.message).toBe("Resource not found");
    });

    it("accepts custom message", () => {
      const err = new NotFoundError("No context has been captured for project 'my-app'");
      expect(err.message).toBe("No context has been captured for project 'my-app'");
    });

    it("has correct name and code", () => {
      const err = new NotFoundError();
      expect(err.name).toBe("NotFoundError");
      expect(err.code).toBe("NOT_FOUND");
    });

    it("is an instance of Error", () => {
      const err = new NotFoundError();
      expect(err).toBeInstanceOf(Error);
    });
  });

  describe("ValidationError", () => {
    it("has correct default message", () => {
      const err = new ValidationError();
      expect(err.message).toBe("Validation failed");
    });

    it("accepts custom message", () => {
      const err = new ValidationError("Note exceeds 5000 characters");
      expect(err.message).toBe("Note exceeds 5000 characters");
    });

    it("has correct name and code", () => {
      const err = new ValidationError();
      expect(err.name).toBe("ValidationError");
      expect(err.code).toBe("VALIDATION_ERROR");
    });

    it("is an instance of Error", () => {
      const err = new ValidationError();
      expect(err).toBeInstanceOf(Error);
    });
  });

  describe("AuthError", () => {
    it("has correct default message", () => {
      const err = new AuthError();
      expect(err.message).toBe("Authentication failed");
    });

    it("accepts custom message", () => {
      const err = new AuthError("API key revoked");
      expect(err.message).toBe("API key revoked");
    });

    it("has correct name and code", () => {
      const err = new AuthError();
      expect(err.name).toBe("AuthError");
      expect(err.code).toBe("AUTH_ERROR");
    });

    it("is an instance of Error", () => {
      const err = new AuthError();
      expect(err).toBeInstanceOf(Error);
    });
  });

  describe("error discrimination", () => {
    it("errors can be distinguished by code property", () => {
      const errors = [
        new NotGitRepoError(),
        new StorageError(),
        new NotFoundError(),
        new ValidationError(),
        new AuthError(),
      ];
      const codes = errors.map((e) => e.code);
      expect(codes).toEqual([
        "NOT_GIT_REPO",
        "STORAGE_ERROR",
        "NOT_FOUND",
        "VALIDATION_ERROR",
        "AUTH_ERROR",
      ]);
      // All codes should be unique
      expect(new Set(codes).size).toBe(codes.length);
    });
  });
});
