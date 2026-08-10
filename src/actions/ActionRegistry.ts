import { RiskLevel } from "../permissions/RiskLevel.js";
import type { ActionType, ActionPayload } from "./types.js";
import type { PayloadValidator } from "./payloadValidation.js";
import {
  validateAppClosePayload,
  validateAppOpenPayload,
  validateFileCopyPayload,
  validateFileCreatePayload,
  validateFileDeletePayload,
  validateFileMovePayload,
} from "./payloadValidation.js";
import { ActionRiskEvaluator } from "./ActionRiskEvaluator.js";

export interface ActionDefinition {
  actionType: ActionType;
  riskLevel: RiskLevel;
  requiresConfirmation: boolean;
  validatePayload: PayloadValidator;
  auditLabel: string;
}

/**
 * ActionRegistry — explicit, code-defined actions only.
 * Never register from free-form user text.
 */
export class ActionRegistry {
  private readonly byType = new Map<ActionType, ActionDefinition>();

  constructor(definitions?: ActionDefinition[]) {
    if (definitions) {
      for (const def of definitions) {
        this.register(def);
      }
    } else {
      this.registerBuiltins();
    }
  }

  /** Test/DI only — not for user-supplied text. */
  register(def: ActionDefinition): void {
    if (this.byType.has(def.actionType)) {
      throw new Error(`Action already registered: ${def.actionType}`);
    }
    this.byType.set(def.actionType, def);
  }

  get(actionType: ActionType): ActionDefinition | undefined {
    return this.byType.get(actionType);
  }

  has(actionType: ActionType): boolean {
    return this.byType.has(actionType);
  }

  list(): ActionDefinition[] {
    return [...this.byType.values()];
  }

  private registerBuiltins(): void {
    const risk = new ActionRiskEvaluator();
    const builtins: Array<{
      actionType: ActionType;
      validatePayload: PayloadValidator;
      auditLabel: string;
    }> = [
      {
        actionType: "FILE_COPY",
        validatePayload: validateFileCopyPayload,
        auditLabel: "file.copy",
      },
      {
        actionType: "FILE_MOVE",
        validatePayload: validateFileMovePayload,
        auditLabel: "file.move",
      },
      {
        actionType: "FILE_CREATE",
        validatePayload: validateFileCreatePayload,
        auditLabel: "file.create",
      },
      {
        actionType: "FILE_DELETE",
        validatePayload: validateFileDeletePayload,
        auditLabel: "file.delete",
      },
      {
        actionType: "APP_OPEN",
        validatePayload: validateAppOpenPayload,
        auditLabel: "application.open",
      },
      {
        actionType: "APP_CLOSE",
        validatePayload: validateAppClosePayload,
        auditLabel: "application.close",
      },
    ];

    for (const b of builtins) {
      this.register({
        actionType: b.actionType,
        riskLevel: risk.riskFor(b.actionType),
        requiresConfirmation: risk.requiresConfirmation(b.actionType),
        validatePayload: b.validatePayload,
        auditLabel: b.auditLabel,
      });
    }
  }
}

export type { ActionPayload };
