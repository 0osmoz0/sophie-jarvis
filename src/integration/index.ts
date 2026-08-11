export type {
  SophieInputEvent,
  SophieOutputEvent,
  SophieEvent,
  SophieInputEventType,
  SophieOutputEventType,
  SophiePublicSnapshot,
  SophieEmitResult,
  SophieIntegrationTiming,
  ContextSophieSignals,
  SophieSignalRecord,
  SophieEventListener,
  UserReturnedEvent,
  UserIdleEvent,
  PetEvent,
  BehaviorStartedEvent,
  BehaviorFinishedEvent,
  UserInteractionEvent,
  StateChangedEvent,
} from "./types.js";

export {
  FORBIDDEN_SOPHIE_PAYLOAD_KEYS,
  SOPHIE_INPUT_EVENT_TYPES,
  SOPHIE_OUTPUT_EVENT_TYPES,
  SOPHIE_ERROR_CODES,
} from "./types.js";

export { SophieEventBus } from "./SophieEventBus.js";
export type { SophieBusEventType } from "./SophieEventBus.js";
export {
  SophieIntegration,
  SophieSignalMemory,
} from "./SophieIntegration.js";
export type { SophieIntegrationOptions } from "./SophieIntegration.js";
export { SophieAPI } from "./SophieAPI.js";

export type {
  SophieBridge,
  SophieBridgeMessage,
  SophieBridgeMessageType,
} from "./SophieBridge.js";
export {
  NullSophieBridge,
  createSophieBridgeMessage,
} from "./SophieBridge.js";
