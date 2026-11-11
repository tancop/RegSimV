import { AddressMode, decodeInstruction } from "./encoding";
import { Field, type Simulator } from "./simulator";

export type UOps = Record<string, (st: Simulator) => void>;

export const I32_MAX = 2147483647;
export const I32_MIN = -2147483648;

export const UOPS = {
  accToMbr(st) {
    st.save(Field.MBR, st.mbr);
    st.saveCount(1);
    st.mbr = st.acc;
  },
  mbrToAcc(st) {
    st.save(Field.ACC, st.acc);
    st.saveCount(1);
    st.acc = st.mbr;
  },
  pcToMar(st) {
    st.save(Field.MAR, st.mar);
    st.saveCount(1);
    st.mar = st.pc;
  },
  marToPc(st) {
    st.save(Field.PC, st.pc);
    st.saveCount(1);
    st.pc = st.mar;
  },
  mbrToPc(st) {
    st.save(Field.PC, st.pc);
    st.saveCount(1);
    st.pc = st.mbr;
  },
  pcToMbr(st) {
    st.save(Field.MBR, st.mbr);
    st.saveCount(1);
    st.mbr = st.pc;
  },
  mbrToIr(st) {
    st.save(Field.IR, st.ir);
    st.saveCount(1);
    st.ir = st.mbr;
  },
  irToMbr(st) {
    st.save(Field.MBR, st.mbr);
    st.saveCount(1);
    const operand = st.decodedInstruction?.operand;
    if (operand === undefined) {
      throw new Error("No decoded instruction to get operand from");
    }
    // The operand field is a signed 24-bit value; sign-extend it to 32 bits.
    st.mbr = ((operand << 8) >> 8) >>> 0;
  },
  marToMbr(st) {
    st.save(Field.MBR, st.mbr);
    st.saveCount(1);
    st.mbr = st.mar;
  },
  mbrToMar(st) {
    st.save(Field.MAR, st.mar);
    st.saveCount(1);
    st.mar = st.mbr;
  },

  readMem(st) {
    st.save(Field.MBR, st.mbr);
    st.saveCount(1);
    st.checkAddress(st.mar);
    if (!st.isInitialized(st.mar)) {
      st.halted = true;
      throw new Error(`Read from uninitialized memory: ${st.mar}`);
    }
    st.mbr = st.memory[st.mar];
  },
  writeMem(st) {
    st.save(st.mar, st.memory[st.mar]);
    st.saveCount(1);
    st.checkAddress(st.mar);
    st.markInitialized(st.mar);
    st.memory[st.mar] = st.mbr;
  },

  incrementPc(st) {
    st.save(Field.PC, st.pc);
    st.saveCount(1);
    st.pc = (st.pc + 1) >>> 0;
  },

  decode(st) {
    st.saveCount(0);
    st.decodedInstruction = decodeInstruction(st.ir);
    const operation = st.compiledOps[st.decodedInstruction.opcode];
    const definition = st.opcodes?.uops[st.decodedInstruction.opcode];
    let variant: ((st: Simulator, ops: UOps) => IterableIterator<number>) | undefined;
    let variantUops: UOp[] | undefined;
    switch (st.decodedInstruction.addressMode) {
      case AddressMode.Immediate:
        variant = operation.immediate;
        variantUops = definition?.immediate;
        break;
      case AddressMode.Direct:
        variant = operation.direct;
        variantUops = definition?.direct;
        break;
      case AddressMode.Indirect:
        variant = operation.indirect;
        variantUops = definition?.indirect;
        break;
    }
    if (!variant) {
      throw new Error(
        `No variant for opcode ${st.decodedInstruction.opcode} with address mode ${st.decodedInstruction.addressMode}`,
      );
    }
    st.currentOp = variant(st, UOPS);
    st.setVariantUops(variantUops ?? []);
  },

  mSub(st) {
    st.save(Field.ACC, st.acc);
    st.save(Field.SR, st.srValue());
    st.saveCount(2);
    const a = st.acc | 0;
    const b = st.mbr | 0;
    const result = (a - b) | 0;
    st.of = result !== a - b;
    st.sf = result < 0;
    st.acc = result;
  },
  mAdd(st) {
    st.save(Field.ACC, st.acc);
    st.save(Field.SR, st.srValue());
    st.saveCount(2);
    const a = st.acc | 0;
    const b = st.mbr | 0;
    const result = (a + b) | 0;
    st.of = result !== a + b;
    st.sf = result < 0;
    st.acc = result;
  },
  mMul(st) {
    st.save(Field.ACC, st.acc);
    st.save(Field.SR, st.srValue());
    st.saveCount(2);
    const a = st.acc | 0;
    const b = st.mbr | 0;
    const result = Math.imul(a, b);
    st.of = result !== a * b;
    st.sf = result < 0;
    st.acc = result;
  },
  mDiv(st) {
    st.save(Field.ACC, st.acc);
    st.save(Field.SR, st.srValue());
    st.saveCount(2);
    const divisor = st.mbr | 0;
    if (divisor === 0) {
      st.acc = 0;
      st.of = true;
      return;
    }
    const dividend = st.acc | 0;
    const overflows = dividend === I32_MIN && divisor === -1;
    const result = overflows ? I32_MIN : (dividend / divisor) | 0;
    st.of = overflows;
    st.sf = result < 0;
    st.acc = result;
  },

  notAcc(st) {
    st.save(Field.ACC, st.acc);
    st.saveCount(1);
    st.acc = ~st.acc >>> 0;
  },
  mAnd(st) {
    st.save(Field.ACC, st.acc);
    st.saveCount(1);
    st.acc = (st.acc & st.mbr) >>> 0;
  },
  mOr(st) {
    st.save(Field.ACC, st.acc);
    st.saveCount(1);
    st.acc = (st.acc | st.mbr) >>> 0;
  },
  mXor(st) {
    st.save(Field.ACC, st.acc);
    st.saveCount(1);
    st.acc = (st.acc ^ st.mbr) >>> 0;
  },

  cmp(st) {
    st.save(Field.SR, st.srValue());
    st.saveCount(1);
    st.cf = st.acc == st.mbr;
  },

  testAcc(st) {
    st.saveCount(0);
    if (st.acc === 0) {
      st.skipNext = true;
    }
  },
  testNotAcc(st) {
    st.saveCount(0);
    if (st.acc !== 0) {
      st.skipNext = true;
    }
  },
  testCf(st) {
    st.saveCount(0);
    if (st.cf) {
      st.skipNext = true;
    }
  },
  testNotCf(st) {
    st.saveCount(0);
    if (!st.cf) {
      st.skipNext = true;
    }
  },

  incrementAcc(st) {
    st.save(Field.ACC, st.acc);
    st.saveCount(1);
    st.acc = (st.acc + 1) >>> 0;
  },
  decrementAcc(st) {
    st.save(Field.ACC, st.acc);
    st.saveCount(1);
    st.acc = (st.acc - 1) >>> 0;
  },

  lshiftAcc(st) {
    st.save(Field.ACC, st.acc);
    st.save(Field.SR, st.srValue());
    st.saveCount(2);
    st.of = (st.acc & (1 << 31)) != 0;
    st.acc = (st.acc << 1) >>> 0;
  },
  rshiftAcc(st) {
    st.save(Field.ACC, st.acc);
    st.save(Field.SR, st.srValue());
    st.saveCount(2);
    st.of = (st.acc & 1) != 0;
    st.acc = (st.acc >>> 1) >>> 0;
  },
  lshiftAccOf(st) {
    st.save(Field.ACC, st.acc);
    st.save(Field.SR, st.srValue());
    st.saveCount(2);
    let result = (st.acc << 1) >>> 0;
    if (st.of) {
      result |= 1;
    }
    st.of = ((st.acc >> 31) & 1) == 1;
    st.acc = result;
  },
  rshiftAccOf(st) {
    st.save(Field.ACC, st.acc);
    st.save(Field.SR, st.srValue());
    st.saveCount(2);
    let result = (st.acc >> 1) >>> 0;
    if (st.of) {
      result |= 1 << 31;
    }
    st.of = (st.acc & 1) == 1;
    st.acc = result;
  },

  clearSr(st) {
    st.save(Field.SR, st.srValue());
    st.saveCount(1);
    st.cf = false;
    st.zf = false;
    st.sf = false;
    st.of = false;
  },

  setCf(st) {
    st.save(Field.SR, st.srValue());
    st.saveCount(1);
    st.cf = true;
  },
  setZf(st) {
    st.save(Field.SR, st.srValue());
    st.saveCount(1);
    st.zf = true;
  },
  setSf(st) {
    st.save(Field.SR, st.srValue());
    st.saveCount(1);
    st.sf = true;
  },
  setOf(st) {
    st.save(Field.SR, st.srValue());
    st.saveCount(1);
    st.of = true;
  },

  srToAcc(st) {
    st.save(Field.ACC, st.acc);
    st.saveCount(1);
    st.acc = st.srValue();
  },

  nop(st) {
    st.saveCount(0);
  },

  halt(st) {
    st.saveCount(0);
    st.halted = true;
  },
} satisfies UOps;

export type UOp = keyof typeof UOPS;

// List of UOps that might need to skip ahead
export const BRANCHY_UOPS: UOp[] = ["testAcc", "testNotAcc", "testCf", "testNotCf"];

// Maps ID to human readable name
export const NAME_TO_UOP = {
  irToMbr: "IR op. => MBR",
  mbrToIr: "MBR => IR",
  mbrToMar: "MBR => MAR",
  marToMbr: "MAR => MBR",
  accToMbr: "ACC => MBR",
  mbrToAcc: "MBR => ACC",
  pcToMar: "PC => MAR",
  marToPc: "MAR => PC",
  pcToMbr: "PC => MBR",
  mbrToPc: "MBR => PC",
  readMem: "READ MEM",
  writeMem: "WRITE MEM",
  halt: "HALT",
  mAdd: "mADD",
  mSub: "mSUB",
  mMul: "mMUL",
  mDiv: "mDIV",
  notAcc: "NOT ACC",
  mAnd: "mAND",
  mOr: "mOR",
  mXor: "mXOR",
  cmp: "CMP",
  testAcc: "TEST ACC",
  testNotAcc: "TESTN ACC",
  incrementAcc: "INCREMENT ACC",
  decrementAcc: "DECREMENT ACC",
  lshiftAcc: "LSHIFT ACC",
  rshiftAcc: "RSHIFT ACC",
  nop: "NOP",
  testCf: "TEST CF",
  testNotCf: "TESTN CF",
  lshiftAccOf: "LSHIFT ACC VF",
  rshiftAccOf: "RSHIFT ACC VF",
  clearSr: "CLEAR SR",
  incrementPc: "INCREMENT PC",
  decode: "DECODE",
  setCf: "SET CF",
  setZf: "SET ZF",
  setSf: "SET SF",
  setOf: "SET OF",
  srToAcc: "SR => ACC",
} satisfies Record<UOp, string>;
