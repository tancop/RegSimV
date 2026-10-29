import { type Instruction } from "./encoding";
import { compile, compileVariant, type CompiledOperation } from "./jit";
import type { OpcodeTable } from "./opcodes";
import { UOPS, type UOp } from "./uops";

export const MEMORY_SIZE = 2048;

const DECODE_SEQUENCE = ["pcToMar", "readMem", "mbrToIr", "incrementPc", "decode"] satisfies UOp[];

const HISTORY_ARRAY_LENGTH = 32768;

export enum Field {
  MAR = -1,
  MBR = -2,
  PC = -3,
  IR = -4,
  SR = -5,
  ACC = -6,
}

export class Simulator {
  // Registers
  mar = 0;
  mbr = 0;
  pc = 0;
  ir = 0;
  acc = 0;

  // Flags
  cf = false; // Carry Flag
  zf = false; // Zero Flag
  sf = false; // Sign Flag
  of = false; // Overflow Flag

  // Memory
  memory = new Uint32Array(MEMORY_SIZE);
  dataMemoryStart = 1024;

  // Control
  halted = false;
  skipNext = false;

  decodedInstruction?: Instruction;

  compiledOps: CompiledOperation[] = [];
  currentOp?: IterableIterator<number>;

  // Statistics
  uopsExecuted = 0;

  decodeSequence: (st: Simulator, ops: typeof UOPS) => IterableIterator<number> =
    compileVariant(DECODE_SEQUENCE);

  // History

  historyCounts = new Uint8Array(HISTORY_ARRAY_LENGTH);
  historyFields = new Int16Array(HISTORY_ARRAY_LENGTH);
  historyValues = new Int32Array(HISTORY_ARRAY_LENGTH);

  prevHistoryCounts: Uint8Array[] = [];
  prevHistoryFields: Int16Array[] = [];
  prevHistoryValues: Int32Array[] = [];

  historyCountsIdx = 0;
  historyFieldsIdx = 0;
  historyValuesIdx = 0;

  // Records a field that is about to be modified. `field` is either a
  // non-negative memory cell number or a negative `Field` enum member; `value`
  // must be the field's value before the modification happens.
  save(field: number, value: number): void {
    if (this.historyFieldsIdx === HISTORY_ARRAY_LENGTH) {
      this.prevHistoryFields.push(this.historyFields);
      this.historyFields = new Int16Array(HISTORY_ARRAY_LENGTH);
      this.historyFieldsIdx = 0;
    }
    this.historyFields[this.historyFieldsIdx++] = field;

    if (this.historyValuesIdx === HISTORY_ARRAY_LENGTH) {
      this.prevHistoryValues.push(this.historyValues);
      this.historyValues = new Int32Array(HISTORY_ARRAY_LENGTH);
      this.historyValuesIdx = 0;
    }
    this.historyValues[this.historyValuesIdx++] = value;
  }

  saveCount(count: number): void {
    if (this.historyCountsIdx === HISTORY_ARRAY_LENGTH) {
      this.prevHistoryCounts.push(this.historyCounts);
      this.historyCounts = new Uint8Array(HISTORY_ARRAY_LENGTH);
      this.historyCountsIdx = 0;
    }
    this.historyCounts[this.historyCountsIdx++] = count;
  }

  // Undoes the most recently executed uop, restoring the fields it recorded.
  restore(): void {
    if (this.historyCountsIdx === 0) {
      if (this.prevHistoryCounts.length === 0) {
        throw new Error("No history to restore");
      }
      this.historyCounts = this.prevHistoryCounts.pop() as Uint8Array<ArrayBuffer>;
      this.historyCountsIdx = HISTORY_ARRAY_LENGTH;
    }
    const count = this.historyCounts[--this.historyCountsIdx];

    for (let i = 0; i < count; i++) {
      const field = this.popHistoryField();
      const value = this.popHistoryValue();
      if (field >= 0) {
        this.memory[field] = value;
        continue;
      }
      switch (field) {
        case Field.MAR:
          this.mar = value;
          break;
        case Field.MBR:
          this.mbr = value;
          break;
        case Field.PC:
          this.pc = value;
          break;
        case Field.IR:
          this.ir = value;
          break;
        case Field.SR:
          this.cf = (value & 0b1000) !== 0;
          this.of = (value & 0b0100) !== 0;
          this.sf = (value & 0b0010) !== 0;
          this.zf = (value & 0b0001) !== 0;
          break;
        case Field.ACC:
          this.acc = value;
          break;
      }
    }
  }

  reset(): void {
    this.mar = 0;
    this.mbr = 0;
    this.pc = 0;
    this.ir = 0;
    this.acc = 0;
    this.cf = false;
    this.zf = false;
    this.sf = false;
    this.of = false;
    this.halted = false;
    this.skipNext = false;
    this.decodedInstruction = undefined;
    this.memory.fill(0);
    this.uopsExecuted = 0;
  }

  loadProgram(opcodes: OpcodeTable, program: ArrayLike<number>, start = 0): void {
    if (start < 0 || start + program.length > MEMORY_SIZE) {
      throw new RangeError("Program does not fit in memory");
    }
    for (let i = 0; i < program.length; i++) {
      this.memory[start + i] = program[i] >>> 0;
    }
    this.pc = start;
    this.halted = false;

    this.compiledOps = compile(opcodes.uops);
  }

  checkAddress(addr: number): void {
    if (!Number.isInteger(addr) || addr < 0 || addr >= MEMORY_SIZE) {
      throw new RangeError(`Memory address out of range: ${addr}`);
    }
  }

  // Returns true if instruction is complete, false if more steps are needed
  uStep(): boolean {
    if (this.halted) return true;
    if (!this.currentOp) {
      throw new Error("No current operation");
    }
    const result = this.currentOp.next();
    return result.done ?? false;
  }

  step(): void {
    this.currentOp = this.decodeSequence(this, UOPS);
    while (!this.uStep()) {} // decode instruction
    while (!this.uStep()) {} // execute instruction
  }

  run(maxSteps = 10_000): number {
    let steps = 0;
    while (!this.halted && steps < maxSteps) {
      this.step();
      steps++;
    }
    if (!this.halted) {
      throw new Error(`Did not halt within ${maxSteps} steps`);
    }
    return steps;
  }

  // Takes the most recent rotated-out array back as the current one. Returns
  // null if nothing was rotated out.
  private popHistoryFieldsArray(): Int16Array | null {
    const prev = this.prevHistoryFields.pop() as Int16Array<ArrayBuffer>;
    if (!prev) {
      return null;
    }
    this.historyFields = prev;
    this.historyFieldsIdx = HISTORY_ARRAY_LENGTH;
    return prev;
  }

  private popHistoryValuesArray(): Int32Array | null {
    const prev = this.prevHistoryValues.pop() as Int32Array<ArrayBuffer>;
    if (!prev) {
      return null;
    }
    this.historyValues = prev;
    this.historyValuesIdx = HISTORY_ARRAY_LENGTH;
    return prev;
  }

  private popHistoryField(): number {
    if (this.historyFieldsIdx === 0 && this.popHistoryFieldsArray() === null) {
      throw new Error("No history to restore");
    }
    return this.historyFields[--this.historyFieldsIdx];
  }

  private popHistoryValue(): number {
    if (this.historyValuesIdx === 0 && this.popHistoryValuesArray() === null) {
      throw new Error("No history to restore");
    }
    return this.historyValues[--this.historyValuesIdx];
  }
}
