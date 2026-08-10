import type { FileService } from "../files/FileService.js";
import type { ToolRegistry } from "./ToolRegistry.js";
import { createFileListTool } from "./fileList.js";
import { createFileInfoTool } from "./fileInfo.js";
import { createFileCopyTool } from "./fileCopy.js";
import { createFileMoveTool } from "./fileMove.js";
import { createFileCreateTool } from "./fileCreate.js";
import { createFileDeleteTool } from "./fileDelete.js";

/** Register all Phase 3 file tools against a shared FileService. */
export function registerFileTools(
  registry: ToolRegistry,
  files: FileService,
): void {
  registry.register(createFileListTool(files));
  registry.register(createFileInfoTool(files));
  registry.register(createFileCopyTool(files));
  registry.register(createFileMoveTool(files));
  registry.register(createFileCreateTool(files));
  registry.register(createFileDeleteTool(files));
}
