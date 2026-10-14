import type { Simulator } from "./simulator";
import { comptime } from "comptime.ts" with { type: "comptime" };

// Maps human readable name to ID
export const NAME_TO_UOP = {
  "IR adr. => MBR": "irToMbr",
  "MBR adr. => MAR": "mbrToMar",
  "ACC => MBR": "accToMbr",
  "MBR => ACC": "mbrToAcc",
  "PC => MAR": "pcToMar",
  "READ MEM": "readMem",
  "WRITE MEM": "writeMem",
  HALT: "halt",
  mADD: "mAdd",
  mSUB: "mSub",
  mMUL: "mMul",
  mDIV: "mDiv",
  "NOT ACC": "notAcc",
  mAND: "mAnd",
  mOR: "mOr",
  mXOR: "mXor",
  CMP: "cmp",
  "MBR => PC": "mbrToPc",
  "TEST ACC": "testAcc",
  "TESTN ACC": "testNotAcc",
  "INCREMENT ACC": "incrementAcc",
  "DECREMENT ACC": "decrementAcc",
  "LSHIFT ACC": "lshiftAcc",
  "RSHIFT ACC": "rshiftAcc",
  NOP: "nop",
  "TEST CF": "testCf",
  "TESTN CF": "testNotCf",
  "LSHIFT ACC VF": "lshiftAccVf",
  "RSHIFT ACC VF": "rshiftAccVf",
  "CLEAR SR": "clearSr",
} satisfies Record<string, string>;

// Maps ID to uop name
export const UOP_TO_NAME = comptime(
  (() => {
    const result: Record<string, string> = {};
    for (const [name, uop] of Object.entries(NAME_TO_UOP)) {
      result[uop] = name;
    }
    return result;
  })(),
);

export type UOpName = keyof typeof NAME_TO_UOP;

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
  mSub(st) {
    st.acc = (st.acc - st.mbr) >>> 0;
  },
  mAdd(st) {
    st.acc = (st.acc + st.mbr) >>> 0;
  },
  readMem(st) {
    st.checkAddress(st.mar);
    st.mbr = st.memory[st.mar];
  },
} satisfies UOps;

export type UOp = keyof typeof UOPS;
