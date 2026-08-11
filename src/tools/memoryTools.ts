import { RiskLevel } from "../permissions/RiskLevel.js";
import type { Tool } from "./Tool.js";
import type { ToolResult } from "../core/types.js";
import type { MemoryService } from "../memory/MemoryService.js";
import type { MemoryCandidate } from "../memory/types.js";

export function createMemoryRecallTool(memory: MemoryService): Tool {
  return {
    id: "memory.recall",
    name: "Memory Recall",
    description: "Recall relevant long-term memories (read-only).",
    riskLevel: RiskLevel.LOW,
    validate(args) {
      if (args.query != null && typeof args.query !== "string") {
        return "query must be a string";
      }
      return null;
    },
    async execute(args): Promise<ToolResult> {
      const query = typeof args.query === "string" ? args.query : "";
      const { records, timing } = await memory.recall(query || "preferences");
      return {
        ok: true,
        data: {
          memories: records.map(publicView),
          timing,
          mode: "MEMORY_INFORMS_ONLY",
        },
      };
    },
  };
}

export function createMemorySearchTool(memory: MemoryService): Tool {
  return {
    id: "memory.search",
    name: "Memory Search",
    description: "Search long-term memories (read-only).",
    riskLevel: RiskLevel.LOW,
    validate(args) {
      if (typeof args.query !== "string" || !args.query.trim()) {
        return "query is required";
      }
      return null;
    },
    async execute(args): Promise<ToolResult> {
      const records = await memory.search(String(args.query));
      return {
        ok: true,
        data: { memories: records.map(publicView), mode: "MEMORY_INFORMS_ONLY" },
      };
    },
  };
}

export function createMemoryListTool(memory: MemoryService): Tool {
  return {
    id: "memory.list",
    name: "Memory List",
    description: "List stored memories (read-only, bounded).",
    riskLevel: RiskLevel.LOW,
    validate() {
      return null;
    },
    async execute(): Promise<ToolResult> {
      const records = await memory.list();
      return {
        ok: true,
        data: {
          count: records.length,
          memories: records.slice(0, 50).map(publicView),
          mode: "MEMORY_INFORMS_ONLY",
        },
      };
    },
  };
}

export function createMemoryRememberTool(memory: MemoryService): Tool {
  return {
    id: "memory.remember",
    name: "Memory Remember",
    description:
      "Store a validated memory candidate. Never stores secrets. MEDIUM risk.",
    riskLevel: RiskLevel.MEDIUM,
    validate(args) {
      if (typeof args.content !== "string" || !args.content.trim()) {
        return "content is required";
      }
      if (args.kind != null && typeof args.kind !== "string") {
        return "kind must be a string";
      }
      return null;
    },
    async execute(args): Promise<ToolResult> {
      const candidate: MemoryCandidate = {
        kind: (typeof args.kind === "string" ? args.kind : "fact") as MemoryCandidate["kind"],
        content: String(args.content),
        importance:
          typeof args.importance === "number" ? args.importance : 0.7,
        confidence:
          typeof args.confidence === "number" ? args.confidence : 0.9,
        source: "user_explicit",
        tags: Array.isArray(args.tags)
          ? args.tags.filter((t): t is string => typeof t === "string")
          : [],
      };
      const result = await memory.remember(candidate);
      if (!result.ok) {
        return { ok: false, error: result.reason ?? "rejected" };
      }
      return {
        ok: true,
        data: {
          decision: result.decision,
          reason: result.reason,
          memory: result.record ? publicView(result.record) : null,
          timing: result.timing,
          mode: "MEMORY_INFORMS_ONLY",
        },
      };
    },
  };
}

export function createMemoryForgetTool(memory: MemoryService): Tool {
  return {
    id: "memory.forget",
    name: "Memory Forget",
    description: "Forget a memory by id or query. MEDIUM risk — confirmation required.",
    riskLevel: RiskLevel.MEDIUM,
    validate(args) {
      if (typeof args.query !== "string" || !args.query.trim()) {
        return "query is required";
      }
      return null;
    },
    async execute(args): Promise<ToolResult> {
      const result = await memory.forget(String(args.query));
      if (!result.ok) {
        return { ok: false, error: result.reason ?? "not_found" };
      }
      return {
        ok: true,
        data: {
          decision: result.decision,
          reason: result.reason,
          memory: result.record ? publicView(result.record) : null,
          mode: "MEMORY_INFORMS_ONLY",
        },
      };
    },
  };
}

function publicView(r: {
  id: string;
  kind: string;
  content: string;
  importance: number;
  confidence: number;
  sensitivity: string;
  tags: string[];
  updatedAt: number;
}) {
  return {
    id: r.id,
    kind: r.kind,
    content: r.content,
    importance: r.importance,
    confidence: r.confidence,
    sensitivity: r.sensitivity,
    tags: [...r.tags],
    updatedAt: r.updatedAt,
  };
}
