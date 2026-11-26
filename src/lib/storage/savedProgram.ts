import type { OpcodeDefinition } from "#lib/opcodes.ts";

export interface SavedProgram {
  source: string[];
  memory: [number, number][];
  customInstructions: OpcodeDefinition[];
  dataMemoryStart: number;
}

export function validateSavedProgram(obj: unknown): obj is SavedProgram {
  if (typeof obj !== "object" || obj === null) return false;
  const o = obj as Record<string, unknown>;
  if (!Array.isArray(o.source)) return false;
  if (!Array.isArray(o.memory)) return false;
  if (!Array.isArray(o.customInstructions)) return false;
  if (typeof o.dataMemoryStart !== "number") return false;
  return true;
}
