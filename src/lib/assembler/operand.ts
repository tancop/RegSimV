import { AssembleErrorType, type AssembleError } from "#lib/assemble.ts";
import { AddressMode } from "#lib/encoding.ts";
import { isValidLabel } from "./labels";

/** Inclusive bounds of a signed 24-bit operand. */
export const MIN_OPERAND = -0x800000;
export const MAX_OPERAND = 0x7fffff;

// Indirect mode - `[mem 1024]`, `[mem label]`
const INDIRECT_REGEX = /\[\s*mem (\w+)\s*\]/;

// Direct mode - `[1024]`, `[label]`
const DIRECT_REGEX = /\[\s*(\w+)\s*\]/;

type Operand = { mode: AddressMode } & (
  | { literal: number }
  | { label: string }
  | { nullOperand: true }
);
type OperandResult = { value: Operand } | { error: AssembleError };

export function parseOperand(operand: string, lineNum: number): OperandResult {
  if (!operand || !operand.length) {
    // No operand
    return { value: { mode: AddressMode.Immediate, nullOperand: true } };
  }

  let match = operand.match(INDIRECT_REGEX);
  if (match) {
    const val = match[1].trim();
    const asNum = +val;
    if (Number.isInteger(asNum)) {
      // Indirect mode
      return {
        value: {
          mode: AddressMode.Indirect,
          literal: asNum,
        },
      };
    } else if (isValidLabel(val)) {
      return {
        value: {
          mode: AddressMode.Indirect,
          label: val,
        },
      };
    } else {
      return {
        error: {
          type: AssembleErrorType.MalformedOperand,
          lineNum: lineNum,
          message: `Operand must be a label or number`,
        },
      };
    }
  }

  match = operand.match(DIRECT_REGEX);
  if (match) {
    // Direct mode
    const val = match[1].trim();
    const asNum = +val;
    if (Number.isInteger(asNum)) {
      return {
        value: {
          mode: AddressMode.Direct,
          literal: asNum,
        },
      };
    } else if (isValidLabel(val)) {
      return {
        value: {
          mode: AddressMode.Direct,
          label: val,
        },
      };
    } else {
      return {
        error: {
          type: AssembleErrorType.MalformedOperand,
          lineNum: lineNum,
          message: `Operand must be a label or number`,
        },
      };
    }
  }

  // Immediate mode
  const asNum = +operand;
  if (Number.isInteger(asNum)) {
    return { value: { mode: AddressMode.Immediate, literal: asNum } };
  } else if (isValidLabel(operand)) {
    return { value: { mode: AddressMode.Immediate, label: operand } };
  }

  return {
    error: {
      type: AssembleErrorType.MalformedOperand,
      lineNum: lineNum,
      message: `Operand must be a label or number`,
    },
  };
}
