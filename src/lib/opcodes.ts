import type { UOp } from "./uops";

/** An operation with a list of uOps for each address mode. */
export interface Operation {
  immediate?: UOp[];
  direct?: UOp[];
  indirect?: UOp[];
  /** True if the immediate form takes no argument, like `HALT` or `INC`.  */
  isZeroArgument?: boolean;
}

/** A mnemonic paired with the micro-ops that implement it. */
export interface OpcodeDefinition {
  name: string;
  uops: Operation;
}

/**
 * Resolved opcode table. Indices are opcode numbers, so encodings are stable
 * as long as definitions keep their order (builtins first, custom after).
 */
export interface OpcodeTable {
  /** Uppercase mnemonic -> opcode number. */
  nameToIndex: Record<string, number>;
  /** Opcode number -> uppercase mnemonic. */
  indexToName: string[];
  /** Opcode number -> micro-ops. */
  uops: Operation[];
}

/** Opcodes are stored in the low 6 bits of an instruction word. */
const MAX_OPCODE = 0x3f;

/**
 * Builtin definitions in opcode order. New builtins must be appended so that
 * existing programs keep encoding to the same opcode numbers.
 */
export const BUILTIN_OPCODES: OpcodeDefinition[] = [
  {
    name: "ADD",
    uops: {
      immediate: ["irToMbr", "mAdd"],
      direct: ["irToMbr", "mbrToMar", "readMem", "mAdd"],
      indirect: ["irToMbr", "mbrToMar", "readMem", "mbrToMar", "readMem", "mAdd"],
    },
  },
  {
    name: "STORE",
    uops: {
      direct: ["irToMbr", "mbrToMar", "accToMbr", "writeMem"],
      indirect: ["irToMbr", "mbrToMar", "readMem", "mbrToMar", "accToMbr", "writeMem"],
    },
  },
  {
    name: "LOAD",
    uops: {
      direct: ["irToMbr", "mbrToMar", "readMem", "mbrToAcc"],
      indirect: ["irToMbr", "mbrToMar", "readMem", "mbrToMar", "readMem", "mbrToAcc"],
    },
  },
  {
    name: "HALT",
    uops: {
      immediate: ["halt"],
      isZeroArgument: true,
    },
  },
  {
    name: "SUB",
    uops: {
      immediate: ["irToMbr", "mSub"],
      direct: ["irToMbr", "mbrToMar", "readMem", "mSub"],
      indirect: ["irToMbr", "mbrToMar", "readMem", "mbrToMar", "readMem", "mSub"],
    },
  },
  {
    name: "MUL",
    uops: {
      immediate: ["irToMbr", "mMul"],
      direct: ["irToMbr", "mbrToMar", "readMem", "mMul"],
      indirect: ["irToMbr", "mbrToMar", "readMem", "mbrToMar", "readMem", "mMul"],
    },
  },
  {
    name: "DIV",
    uops: {
      immediate: ["irToMbr", "mDiv"],
      direct: ["irToMbr", "mbrToMar", "readMem", "mDiv"],
      indirect: ["irToMbr", "mbrToMar", "readMem", "mbrToMar", "readMem", "mDiv"],
    },
  },
  {
    name: "NOT",
    uops: {
      immediate: ["notAcc"],
      isZeroArgument: true,
    },
  },
  {
    name: "AND",
    uops: {
      immediate: ["irToMbr", "mAnd"],
      direct: ["irToMbr", "mbrToMar", "readMem", "mAnd"],
      indirect: ["irToMbr", "mbrToMar", "readMem", "mbrToMar", "readMem", "mAnd"],
    },
  },
  {
    name: "OR",
    uops: {
      immediate: ["irToMbr", "mOr"],
      direct: ["irToMbr", "mbrToMar", "readMem", "mOr"],
      indirect: ["irToMbr", "mbrToMar", "readMem", "mbrToMar", "readMem", "mOr"],
    },
  },
  {
    name: "XOR",
    uops: {
      immediate: ["irToMbr", "mXor"],
      direct: ["irToMbr", "mbrToMar", "readMem", "mXor"],
      indirect: ["irToMbr", "mbrToMar", "readMem", "mbrToMar", "readMem", "mXor"],
    },
  },
  {
    name: "CMP",
    uops: {
      immediate: ["irToMbr", "cmp"],
      direct: ["irToMbr", "mbrToMar", "readMem", "cmp"],
      indirect: ["irToMbr", "mbrToMar", "readMem", "mbrToMar", "readMem", "cmp"],
    },
  },
  {
    name: "JMP",
    uops: {
      immediate: ["irToMbr", "mbrToPc"],
    },
  },
  {
    name: "JZ",
    uops: {
      immediate: ["irToMbr", "testNotAcc", "mbrToPc"],
    },
  },
  {
    name: "JNZ",
    uops: {
      immediate: ["irToMbr", "testAcc", "mbrToPc"],
    },
  },
  {
    name: "INC",
    uops: {
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
        "readMem",
        "mbrToMar",
        "accToMbr",
        "writeMem",
      ],
      isZeroArgument: true,
    },
  },
  {
    name: "DEC",
    uops: {
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
        "readMem",
        "mbrToMar",
        "accToMbr",
        "writeMem",
      ],
      isZeroArgument: true,
    },
  },
  {
    name: "SHL",
    uops: {
      immediate: ["lshiftAcc"],
      isZeroArgument: true,
    },
  },
  {
    name: "SHR",
    uops: {
      immediate: ["rshiftAcc"],
      isZeroArgument: true,
    },
  },
  {
    name: "NOP",
    uops: {
      immediate: ["nop"],
      isZeroArgument: true,
    },
  },
  {
    name: "JC",
    uops: {
      immediate: ["irToMbr", "testNotCf", "mbrToPc"],
    },
  },
  {
    name: "JNC",
    uops: {
      immediate: ["irToMbr", "testCf", "mbrToPc"],
    },
  },
  {
    name: "ROL",
    uops: {
      immediate: ["lshiftAccOf"],
      isZeroArgument: true,
    },
  },
  {
    name: "ROR",
    uops: {
      immediate: ["rshiftAccOf"],
      isZeroArgument: true,
    },
  },
  {
    name: "CLSR",
    uops: {
      immediate: ["clearSr"],
      isZeroArgument: true,
    },
  },
];

/**
 * Turns ordered name/uops definitions into a table with stable opcode numbers.
 * Call once and reuse the result for both assembling and loading.
 */
export function createOpcodeTable(definitions: readonly OpcodeDefinition[]): OpcodeTable {
  const nameToIndex: Record<string, number> = Object.create(null);
  const table: OpcodeTable = { nameToIndex, indexToName: [], uops: [] };

  for (const { name, uops } of definitions) {
    const mnemonic = name.toUpperCase();
    if (Object.hasOwn(nameToIndex, mnemonic)) {
      throw new Error(`Duplicate opcode name: ${mnemonic}`);
    }
    const index = table.indexToName.length;
    if (index > MAX_OPCODE) {
      throw new RangeError(
        `Too many opcodes: ${index + 1} definitions do not fit in ${MAX_OPCODE + 1} opcode numbers`,
      );
    }
    nameToIndex[mnemonic] = index;
    table.indexToName.push(mnemonic);
    table.uops.push(uops);
  }

  return table;
}
