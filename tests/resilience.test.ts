import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import fs from "fs";
import path from "path";
import os from "os";
import {
  getConfig,
  setConfig,
  isFailoverError,
  executeWithFailover,
  Provider,
} from "../src/config.js";

describe("Provider Resilience & Multi-Provider Failover", () => {
  describe("Fallback Provider Configuration", () => {
    it("persists fallbackProvider and fallbackModel in config", () => {
      setConfig({
        fallbackProvider: "openai",
        fallbackModel: "gpt-4o-mini",
      });

      const config = getConfig();
      expect(config.fallbackProvider).toBe("openai");
      expect(config.fallbackModel).toBe("gpt-4o-mini");

      // Clean up
      setConfig({
        fallbackProvider: undefined,
        fallbackModel: undefined,
      });
    });
  });

  describe("isFailoverError Detection", () => {
    it("identifies HTTP 429, 503, 502, 504 status codes as failover errors", () => {
      expect(isFailoverError({ status: 429 })).toBe(true);
      expect(isFailoverError({ statusCode: 503 })).toBe(true);
      expect(isFailoverError({ response: { status: 502 } })).toBe(true);
      expect(isFailoverError({ status: 504 })).toBe(true);
    });

    it("identifies rate-limit and quota messages as failover errors", () => {
      expect(isFailoverError(new Error("Rate limit exceeded: 429"))).toBe(true);
      expect(isFailoverError(new Error("You have exceeded your current quota"))).toBe(true);
      expect(isFailoverError(new Error("RESOURCE_EXHAUSTED: Model capacity reached"))).toBe(true);
    });

    it("identifies network and overload errors as failover errors", () => {
      expect(isFailoverError(new Error("fetch failed: ECONNREFUSED 127.0.0.1"))).toBe(true);
      expect(isFailoverError(new Error("The server is currently overloaded. Please retry later."))).toBe(true);
      expect(isFailoverError(new Error("Request timed out"))).toBe(true);
    });

    it("does not classify ordinary operational errors as failover errors", () => {
      expect(isFailoverError(new Error("Invalid parameter: filePath is required"))).toBe(false);
      expect(isFailoverError(new Error("SyntaxError: Unexpected token"))).toBe(false);
      expect(isFailoverError(null)).toBe(false);
    });
  });

  describe("executeWithFailover Execution", () => {
    it("returns result from primary provider on success without invoking fallback", async () => {
      const mockAction = vi.fn().mockResolvedValue("Primary success response");
      const onFailover = vi.fn();

      const { result, usedProvider, usedModel } = await executeWithFailover(
        mockAction,
        "google",
        "gemini-2.0-flash",
        "openai",
        "gpt-4o-mini",
        onFailover
      );

      expect(result).toBe("Primary success response");
      expect(usedProvider).toBe("google");
      expect(usedModel).toBe("gemini-2.0-flash");
      expect(mockAction).toHaveBeenCalledTimes(1);
      expect(onFailover).not.toHaveBeenCalled();
    });

    it("automatically fails over to fallback provider when primary encounters a 429 rate-limit", async () => {
      const mockAction = vi
        .fn()
        .mockRejectedValueOnce({ status: 429, message: "Rate limit reached" })
        .mockResolvedValueOnce("Fallback success response");

      const onFailover = vi.fn();

      const { result, usedProvider, usedModel } = await executeWithFailover(
        mockAction,
        "openrouter",
        "openrouter/free",
        "google",
        "gemini-2.0-flash",
        onFailover
      );

      expect(result).toBe("Fallback success response");
      expect(usedProvider).toBe("google");
      expect(usedModel).toBe("gemini-2.0-flash");
      expect(mockAction).toHaveBeenCalledTimes(2);
      expect(onFailover).toHaveBeenCalledTimes(1);
      expect(onFailover).toHaveBeenCalledWith("google", expect.objectContaining({ status: 429 }));
    });

    it("does not trigger fallback when primary error is not a failover error", async () => {
      const standardError = new Error("Validation failed: prompt cannot be empty");
      const mockAction = vi.fn().mockRejectedValue(standardError);
      const onFailover = vi.fn();

      await expect(
        executeWithFailover(
          mockAction,
          "openai",
          "gpt-4o",
          "google",
          "gemini-2.0-flash",
          onFailover
        )
      ).rejects.toThrow("Validation failed");

      expect(mockAction).toHaveBeenCalledTimes(1);
      expect(onFailover).not.toHaveBeenCalled();
    });

    it("rethrows error when fallback provider also fails", async () => {
      const primaryErr = new Error("429 Too Many Requests");
      const fallbackErr = new Error("503 Service Unavailable");

      const mockAction = vi
        .fn()
        .mockRejectedValueOnce(primaryErr)
        .mockRejectedValueOnce(fallbackErr);

      await expect(
        executeWithFailover(
          mockAction,
          "openrouter",
          "openrouter/free",
          "openai",
          "gpt-4o-mini"
        )
      ).rejects.toThrow("503 Service Unavailable");

      expect(mockAction).toHaveBeenCalledTimes(2);
    });
  });
});
