import type { Tool } from "./Tool.js";
import { isTool } from "./Tool.js";

/**
 * ToolRegistry — register / lookup only.
 * Does NOT execute tools. Execution goes through JarvisCore + PermissionManager.
 */
export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  register(tool: Tool): void {
    if (!isTool(tool)) {
      throw new Error("Cannot register malformed tool: missing required fields");
    }
    if (!tool.id || tool.id.trim() === "") {
      throw new Error("Cannot register tool with empty id");
    }
    if (this.tools.has(tool.id)) {
      throw new Error(`Tool already registered: ${tool.id}`);
    }
    this.tools.set(tool.id, tool);
  }

  unregister(id: string): boolean {
    return this.tools.delete(id);
  }

  get(id: string): Tool | undefined {
    return this.tools.get(id);
  }

  list(): Tool[] {
    return [...this.tools.values()];
  }

  has(id: string): boolean {
    return this.tools.has(id);
  }

  clear(): void {
    this.tools.clear();
  }
}
