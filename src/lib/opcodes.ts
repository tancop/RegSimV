import type { UOp } from "./uops";
import { comptime } from "comptime.ts" with { type: "comptime" };

export interface Operation {
  immediate?: UOp[];
  direct?: UOp[];
  indirect?: UOp[];
  isZeroArgument?: boolean;
}

export const BUILTIN_OPCODES: Record<string, Operation> = {
  ADD: {
    immediate: ["irToMbr", "mAdd"],
    direct: ["irToMbr", "mbrToMar", "readMem", "mAdd"],
    indirect: ["irToMbr", "mbrToMar", "readMem", "mbrToMar", "readMem", "mAdd"],
  },
  STORE: {
    direct: ["irToMbr", "mbrToMar", "accToMbr", "writeMem"],
    indirect: ["irToMbr", "mbrToMar", "readMem", "mbrToMar", "accToMbr", "writeMem"],
  },
  LOAD: {
    direct: ["irToMbr", "mbrToMar", "readMem", "mbrToAcc"],
    indirect: ["irToMbr", "mbrToMar", "readMem", "mbrToMar", "readMem", "mbrToAcc"],
  },
  HALT: {
    immediate: ["halt"],
    isZeroArgument: true,
  },
  SUB: {
    immediate: ["irToMbr", "mSub"],
    direct: ["irToMbr", "mbrToMar", "readMem", "mSub"],
    indirect: ["irToMbr", "mbrToMar", "readMem", "mbrToMar", "readMem", "mSub"],
  },
  MUL: {
    immediate: ["irToMbr", "mMul"],
    direct: ["irToMbr", "mbrToMar", "readMem", "mMul"],
    indirect: ["irToMbr", "mbrToMar", "readMem", "mbrToMar", "readMem", "mMul"],
  },
  DIV: {
    immediate: ["irToMbr", "mDiv"],
    direct: ["irToMbr", "mbrToMar", "readMem", "mDiv"],
    indirect: ["irToMbr", "mbrToMar", "readMem", "mbrToMar", "readMem", "mDiv"],
  },
  NOT: {
    immediate: ["notAcc"],
    isZeroArgument: true,
  },
  AND: {
    immediate: ["irToMbr", "mAnd"],
    direct: ["irToMbr", "mbrToMar", "readMem", "mAnd"],
    indirect: ["irToMbr", "mbrToMar", "readMem", "mbrToMar", "readMem", "mAnd"],
  },
  OR: {
    immediate: ["irToMbr", "mOr"],
    direct: ["irToMbr", "mbrToMar", "readMem", "mOr"],
    indirect: ["irToMbr", "mbrToMar", "readMem", "mbrToMar", "readMem", "mOr"],
  },
  XOR: {
    immediate: ["irToMbr", "mXor"],
    direct: ["irToMbr", "mbrToMar", "readMem", "mXor"],
    indirect: ["irToMbr", "mbrToMar", "readMem", "mbrToMar", "readMem", "mXor"],
  },
  CMP: {
    immediate: ["irToMbr", "cmp"],
    direct: ["irToMbr", "mbrToMar", "readMem", "cmp"],
    indirect: ["irToMbr", "mbrToMar", "readMem", "mbrToMar", "readMem", "cmp"],
  },
  JMP: {
    immediate: ["irToMbr", "mbrToPc"],
  },
  JZ: {
    immediate: ["irToMbr", "testNotAcc", "mbrToPc"],
  },
  JNZ: {
    immediate: ["irToMbr", "testAcc", "mbrToPc"],
  },
  INC: {
    immediate: ["incrementAcc"],
    direct: [
      "irToMbr",
      "mbrToMar",
      "readMem",
      "mbrToAcc",
      "incrementAcc",
      "irToMbr",
      "mbrToMar",
      "accToMbr",
      "writeMem",
    ],
    indirect: [
      "irToMbr",
      "mbrToMar",
      "readMem",
      "mbrToMar",
      "readMem",
      "mbrToAcc",
      "incrementAcc",
      "irToMbr",
      "mbrToMar",
      "accToMbr",
      "writeMem",
    ],
    isZeroArgument: true,
  },
  DEC: {
    immediate: ["decrementAcc"],
    direct: [
      "irToMbr",
      "mbrToMar",
      "readMem",
      "mbrToAcc",
      "decrementAcc",
      "irToMbr",
      "mbrToMar",
      "accToMbr",
      "writeMem",
    ],
    indirect: [
      "irToMbr",
      "mbrToMar",
      "readMem",
      "mbrToMar",
      "readMem",
      "mbrToAcc",
      "decrementAcc",
      "irToMbr",
      "mbrToMar",
      "accToMbr",
      "writeMem",
    ],
    isZeroArgument: true,
  },
  SHL: {
    immediate: ["lshiftAcc"],
  },
  SHR: {
    immediate: ["rshiftAcc"],
  },
  NOP: {
    immediate: ["nop"],
    isZeroArgument: true,
  },
  JC: {
    immediate: ["irToMbr", "testNotCf", "mbrToPc"],
  },
  JNC: {
    immediate: ["irToMbr", "testCf", "mbrToPc"],
  },
  SLO: {
    immediate: ["lshiftAccOf"],
  },
  SRO: {
    immediate: ["rshiftAccOf"],
  },
  CLSR: {
    immediate: ["clearSr"],
    isZeroArgument: true,
  },
};

export function opcodeNumber(opcode: string, opcodes: Record<string, Operation>): number {
  return Object.keys(opcodes).indexOf(opcode.toUpperCase());
}
