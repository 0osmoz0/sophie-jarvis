export type {
  ApplicationBackend,
  BackendCapability,
  CapabilityStatus,
  CapabilityReport,
  BackendApplicationIdentity,
} from "./ApplicationBackend.js";
export { MockApplicationBackend } from "./MockApplicationBackend.js";
export {
  MacOSApplicationBackend,
  MacOSApplicationDiscovery,
  tryLoadMacOSNativeBridge,
} from "./macos/index.js";
export type {
  MacOSApplicationBackendOptions,
  MacOSNativeBridge,
  MacOSNativeStatus,
  MacOSDiscoveredApplication,
} from "./macos/index.js";
