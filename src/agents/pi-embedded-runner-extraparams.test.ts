import type { StreamFn } from "@mariozechner/pi-agent-core";
import type { Context, Model, SimpleStreamOptions } from "@mariozechner/pi-ai";
import { AssistantMessageEventStream } from "@mariozechner/pi-ai";
import { describe, expect, it } from "vitest";
import {
  applyExtraParamsToAgent,
  calculateCappedMaxTokens,
  resolveExtraParams,
} from "./pi-embedded-runner.js";

describe("resolveExtraParams", () => {
  it("returns undefined with no model config", () => {
    const result = resolveExtraParams({
      cfg: undefined,
      provider: "zai",
      modelId: "glm-4.7",
    });

    expect(result).toBeUndefined();
  });

  it("returns params for exact provider/model key", () => {
    const result = resolveExtraParams({
      cfg: {
        agents: {
          defaults: {
            models: {
              "openai/gpt-4": {
                params: {
                  temperature: 0.7,
                  maxTokens: 2048,
                },
              },
            },
          },
        },
      },
      provider: "openai",
      modelId: "gpt-4",
    });

    expect(result).toEqual({
      temperature: 0.7,
      maxTokens: 2048,
    });
  });

  it("ignores unrelated model entries", () => {
    const result = resolveExtraParams({
      cfg: {
        agents: {
          defaults: {
            models: {
              "openai/gpt-4": {
                params: {
                  temperature: 0.7,
                },
              },
            },
          },
        },
      },
      provider: "openai",
      modelId: "gpt-4.1-mini",
    });

    expect(result).toBeUndefined();
  });
});

describe("applyExtraParamsToAgent", () => {
  it("adds OpenRouter attribution headers to stream options", () => {
    const calls: Array<SimpleStreamOptions | undefined> = [];
    const baseStreamFn: StreamFn = (_model, _context, options) => {
      calls.push(options);
      return new AssistantMessageEventStream();
    };
    const agent = { streamFn: baseStreamFn };

    applyExtraParamsToAgent(agent, undefined, "openrouter", "openrouter/auto");

    const model = {
      api: "openai-completions",
      provider: "openrouter",
      id: "openrouter/auto",
    } as Model<"openai-completions">;
    const context: Context = { messages: [] };

    void agent.streamFn?.(model, context, { headers: { "X-Custom": "1" } });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.headers).toEqual({
      "HTTP-Referer": "https://openclaw.ai",
      "X-Title": "OpenClaw",
      "X-Custom": "1",
    });
  });

  it("caps maxTokens using z.ai glm-4.7 context defaults when model omits limits", () => {
    const calls: Array<SimpleStreamOptions | undefined> = [];
    const baseStreamFn: StreamFn = (_model, _context, options) => {
      calls.push(options);
      return new AssistantMessageEventStream();
    };
    const agent = { streamFn: baseStreamFn };

    applyExtraParamsToAgent(agent, undefined, "zai", "glm-4.7");

    const model = {
      api: "openai-completions",
      provider: "zai",
      id: "glm-4.7",
    } as Model<"openai-completions">;
    const context: Context = { messages: [] };

    void agent.streamFn?.(model, context, { maxTokens: 500000 });

    expect(calls).toHaveLength(1);
    expect(calls[0]?.maxTokens).toBe(128000);
  });

  it("caps maxTokens to remaining context when model limits are known", () => {
    const calls: Array<SimpleStreamOptions | undefined> = [];
    const baseStreamFn: StreamFn = (_model, _context, options) => {
      calls.push(options);
      return new AssistantMessageEventStream();
    };
    const agent = { streamFn: baseStreamFn };

    applyExtraParamsToAgent(agent, undefined, "openai", "gpt-4");

    const model = {
      api: "openai-completions",
      provider: "openai",
      id: "gpt-4",
      contextWindow: 100,
    } as Model<"openai-completions">;
    const context: Context = { messages: [] };

    void agent.streamFn?.(model, context, {});

    expect(calls).toHaveLength(1);
    expect(calls[0]?.maxTokens).toBe(100);
  });
});

describe("calculateCappedMaxTokens", () => {
  it("returns remaining tokens when no maxTokens are provided", () => {
    const result = calculateCappedMaxTokens({
      requestedMaxTokens: undefined,
      modelMaxTokens: undefined,
      contextWindow: 1000,
      inputTokens: 250,
    });
    expect(result).toBe(750);
  });

  it("caps to model maxTokens and remaining context", () => {
    const result = calculateCappedMaxTokens({
      requestedMaxTokens: 5000,
      modelMaxTokens: 2048,
      contextWindow: 3000,
      inputTokens: 1000,
    });
    expect(result).toBe(2000);
  });

  it("returns 0 when no context space remains", () => {
    const result = calculateCappedMaxTokens({
      requestedMaxTokens: 100,
      modelMaxTokens: 100,
      contextWindow: 1000,
      inputTokens: 1000,
    });
    expect(result).toBe(0);
  });
});
