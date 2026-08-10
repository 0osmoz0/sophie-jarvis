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
  MacOSScreenBackend,
  MacOSWindowDiscovery,
  tryLoadMacOSScreenBridge,
} from "./macos/index.js";
export type {
  MacOSApplicationBackendOptions,
  MacOSNativeBridge,
  MacOSNativeStatus,
  MacOSDiscoveredApplication,
  MacOSScreenBackendOptions,
  MacOSScreenNativeBridge,
  MacOSScreenNativeStatus,
} from "./macos/index.js";
