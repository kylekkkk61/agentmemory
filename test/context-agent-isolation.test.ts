import { beforeEach, describe, expect, it, vi } from "vitest";
import { registerContextFunction } from "../src/functions/context.js";
import { KV } from "../src/state/schema.js";

const configState = {
  agentId: undefined as string | undefined,
  isolated: false,
};

vi.mock("../src/config.js", () => ({
  getAgentId: () => configState.agentId,
  isAgentScopeIsolated: () => configState.isolated,
  getEnvVar: () => undefined,
}));

function mockKV() {
  const store = new Map<string, Map<string, unknown>>();
  return {
    get: async <T>(scope: string, key: string): Promise<T | null> =>
      (store.get(scope)?.get(key) as T) ?? null,
    set: async <T>(scope: string, key: string, value: T): Promise<T> => {
      if (!store.has(scope)) store.set(scope, new Map());
      store.get(scope)!.set(key, value);
      return value;
    },
    list: async <T>(scope: string): Promise<T[]> =>
      Array.from(store.get(scope)?.values() ?? []) as T[],
  };
}

type ContextHandler = (data: {
  sessionId: string;
  project: string;
  agentId?: string;
}) => Promise<{ context: string; blocks: number; tokens: number }>;

function wireContext(kv: ReturnType<typeof mockKV>): ContextHandler {
  let handler: ContextHandler | undefined;
  const sdk = {
    registerFunction: vi.fn((id: string, cb: ContextHandler) => {
      if (id === "mem::context") handler = cb;
    }),
  } as unknown as import("iii-sdk").ISdk;
  registerContextFunction(sdk, kv as never, 4000);
  if (!handler) throw new Error("mem::context not registered");
  return handler;
}

describe("mem::context agent isolation", () => {
  beforeEach(() => {
    configState.agentId = undefined;
    configState.isolated = false;
  });

  it("does not inject another agent's session summary", async () => {
    const kv = mockKV();
    const timestamp = new Date().toISOString();
    await kv.set(KV.sessions, "session-a", {
      id: "session-a",
      project: "shared-project",
      cwd: "/work",
      startedAt: timestamp,
      status: "completed",
      observationCount: 1,
      agentId: "agent-a",
    });
    await kv.set(KV.sessions, "session-b", {
      id: "session-b",
      project: "shared-project",
      cwd: "/work",
      startedAt: timestamp,
      status: "completed",
      observationCount: 1,
      agentId: "agent-b",
    });
    await kv.set(KV.summaries, "session-a", {
      sessionId: "session-a",
      project: "shared-project",
      createdAt: timestamp,
      title: "Agent A summary",
      narrative: "agent-a-private-marker",
      keyDecisions: [],
      filesModified: [],
      concepts: [],
      observationCount: 1,
    });
    await kv.set(KV.summaries, "session-b", {
      sessionId: "session-b",
      project: "shared-project",
      createdAt: timestamp,
      title: "Agent B summary",
      narrative: "agent-b-private-marker",
      keyDecisions: [],
      filesModified: [],
      concepts: [],
      observationCount: 1,
    });

    configState.agentId = "agent-a";
    configState.isolated = true;
    const result = await wireContext(kv)({
      sessionId: "current",
      project: "shared-project",
    });

    expect(result.context).toContain("agent-a-private-marker");
    expect(result.context).not.toContain("agent-b-private-marker");
  });

  it("fails closed when isolated mode has no agent id", async () => {
    configState.isolated = true;

    await expect(
      wireContext(mockKV())({
        sessionId: "current",
        project: "shared-project",
      }),
    ).rejects.toThrow("Refusing to read cross-agent rows");
  });
});
