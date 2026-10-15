import { decodeInstruction } from "./encoding";
import type { Simulator } from "./simulator";

export type UOps = Record<string, (st: Simulator) => void>;

export const UOPS = {
  accToMbr(st) {
    st.mbr = st.acc;
  },
  mbrToAcc(st) {
    st.acc = st.mbr;
  },
  pcToMar(st) {
    st.mar = st.pc;
  },
  marToPc(st) {
    st.pc = st.mar;
  },
  mbrToPc(st) {
    st.pc = st.mbr;
  },
  pcToMbr(st) {
    st.mbr = st.pc;
  },
  mbrToIr(st) {
    st.ir = st.mbr;
  },
  irToMbr(st) {
    st.mbr = decodeInstruction(st.ir).operand;
  },
  marToMbr(st) {
    st.mbr = st.mar;
  },
  mbrToMar(st) {
    st.mar = st.mbr;
  },

  readMem(st) {
    st.checkAddress(st.mar);
    st.mbr = st.memory[st.mar];
  },
  writeMem(st) {
    st.checkAddress(st.mar);
    st.memory[st.mar] = st.mbr;
  },

  incrementPc(st) {
    st.pc = (st.pc + 1) >>> 0;
  },

  decode(st) {
    st.decodedInstruction = decodeInstruction(st.ir);
  },

  mSub(st) {
    st.acc = (st.acc - st.mbr) >>> 0;
  },
  mAdd(st) {
    st.acc = (st.acc + st.mbr) >>> 0;
  },
  mMul(st) {
    st.acc = (st.acc * st.mbr) >>> 0;
  },
  mDiv(st) {
    if (st.mbr === 0) {
      throw new Error("Division by zero");
    }
    st.acc = Math.floor(st.acc / st.mbr) >>> 0;
  },

  notAcc(st) {
    st.acc = ~st.acc >>> 0;
  },
  mAnd(st) {
    st.acc = (st.acc & st.mbr) >>> 0;
  },
  mOr(st) {
    st.acc = (st.acc | st.mbr) >>> 0;
  },
  mXor(st) {
    st.acc = (st.acc ^ st.mbr) >>> 0;
  },

  cmp(st) {
    const result = (st.acc - st.mbr) >>> 0;
    st.zf = result === 0;
    st.sf = (result & 0x80000000) !== 0;
    st.cf = st.acc < st.mbr;
    st.of = ((st.acc ^ st.mbr) & (st.acc ^ result) & 0x80000000) !== 0;
  },

  testAcc(st) {
    if (st.zf) {
      st.skipNext = true;
    }
  },
  testNotAcc(st) {
    if (!st.zf) {
      st.skipNext = true;
    }
  },
  testCf(st) {
    if (st.cf) {
      st.skipNext = true;
    }
  },
  testNotCf(st) {
    if (!st.cf) {
      st.skipNext = true;
    }
  },

  incrementAcc(st) {
    st.acc = (st.acc + 1) >>> 0;
  },
  decrementAcc(st) {
    st.acc = (st.acc - 1) >>> 0;
  },

  lshiftAcc(st) {
    st.acc = (st.acc << 1) >>> 0;
  },
  rshiftAcc(st) {
    st.acc = (st.acc >>> 1) >>> 0;
  },
  lshiftAccOf(st) {
    const result = (st.acc << 1) >>> 0;
    st.of = (st.acc & 0x80000000) !== (result & 0x80000000);
    st.acc = result;
  },
  rshiftAccOf(st) {
    const result = (st.acc >>> 1) >>> 0;
    st.of = (st.acc & 0x80000000) !== (result & 0x80000000);
    st.acc = result;
  },

  clearSr(st) {
    st.cf = false;
    st.zf = false;
    st.sf = false;
    st.of = false;
  },

  nop(_st) {},

  halt(st) {
    st.halted = true;
  },
} satisfies UOps;

export type UOp = keyof typeof UOPS;

// List of UOps that might need to skip ahead
export const BRANCHY_UOPS: UOp[] = ["testAcc", "testNotAcc", "testCf", "testNotCf"];

// Maps ID to human readable name
export const NAME_TO_UOP = {
  irToMbr: "IR adr. => MBR",
  mbrToIr: "MBR => IR",
  mbrToMar: "MBR  => MAR",
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
} satisfies Record<UOp, string>;
