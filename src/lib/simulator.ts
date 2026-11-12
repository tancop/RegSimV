import { AddressMode, decodeInstruction, type Instruction } from "./encoding";
import type { OpcodeTable } from "./opcodes";
import { compile, compileVariant, type CompiledOperation } from "./jit";
import { NAME_TO_UOP, UOPS, type UOp } from "./uops";

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

/**
 * Formats a 32-bit instruction word in normal assembler syntax, like
 * `ADD 4` (immediate), `ADD [4]` (direct) or `ADD [mem 4]` (indirect).
 * Operands are printed sign-extended, mirroring the assembler's signed
 * 24-bit operand encoding. Falls back to `OP<n>` without an opcode table.
 */
export function formatInstruction(ins: number, opcodes?: OpcodeTable): string {
  const { opcode, operand, addressMode } = decodeInstruction(ins);
  const name = opcodes?.indexToName[opcode] ?? `OP${opcode}`;
  if (opcodes?.uops[opcode]?.isZeroArgument) {
    return name;
  }
  // The operand field is a signed 24-bit value; sign-extend for display.
  const value = (operand << 8) >> 8;
  switch (addressMode) {
    case AddressMode.Immediate:
      return `${name} ${value}`;
    case AddressMode.Direct:
      return `${name} [${value}]`;
    case AddressMode.Indirect:
      return `${name} [mem ${value}]`;
  }
}

// Formats one recorded change, `value` being the field's value before the
// modification. SR entries unpack into the four flag bits (see srValue).
function formatField(field: number, value: number, opcodes?: OpcodeTable): string {
  switch (field) {
    case Field.MAR:
      return `MAR=${value}`;
    case Field.MBR:
      return `MBR=${value}`;
    case Field.PC:
      return `PC=${value}`;
    case Field.IR:
      return `IR=${formatInstruction(value, opcodes)}`;
    case Field.SR:
      return (
        `C=${(value >> 3) & 1} O=${(value >> 2) & 1}` + ` N=${(value >> 1) & 1} Z=${value & 1}`
      );
    case Field.ACC:
      return `ACC=${value}`;
    default:
      // Non-negative fields are memory cell numbers.
      return `mem[${field}]=${value}`;
  }
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

  // Ends of the alternating initialized/uninitialized memory spans, as
  // addresses where the init state changes. Example: initialized spans
  // 0-10, 14, 17-25 are `[10, 13, 14, 16, 25]`. Past the last entry memory
  // is always uninitialized. See `isInitialized` / `markInitialized`.
  // Note: `restore` does not unwind this list, so a backstep over writeMem
  // keeps the cell marked initialized.
  initBoundaries: number[] = [];

  // Control
  halted = false;
  skipNext = false;

  decodedInstruction?: Instruction;

  opcodes?: OpcodeTable;
  compiledOps: CompiledOperation[] = [];
  currentOp?: IterableIterator<number>;

  // Micro-ops of the instruction currently executing: the fetch/decode prefix,
  // extended with the operation's address-mode variant once DECODE has run.
  // Empty while no instruction is in progress.
  currentUops: UOp[] = [];

  // Index into `currentUops` of the most recently executed micro-op. -1 when
  // none has run yet, so `uopNames[uopIndex]` is always the current one.
  uopIndex = -1;

  // Human-readable names of `currentUops`, indexed by `uopIndex`.
  get uopNames(): string[] {
    return this.currentUops.map((uop) => NAME_TO_UOP[uop]);
  }

  // Replaces the operation portion of the running microprogram after DECODE
  // picks an address-mode variant, keeping the fetch/decode prefix in place.
  setVariantUops(uops: UOp[]): void {
    this.currentUops = [...DECODE_SEQUENCE, ...uops];
  }

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

    // Move the micro-op cursor back so the display matches the restored state.
    if (this.uopIndex >= 0) this.uopIndex--;
  }

  // Prints and returns the changes recorded by the last `n` executed uops,
  // oldest first, all changes of one uop on one line: `MBR=100 MAR=-1`,
  // flags as `C=0 O=1 N=0 Z=0`, IR decoded as `ADD 4`. Uops that changed no
  // fields print a single `-`. Shows fewer than `n` lines if the history
  // does not go back that far.
  showHistory(n: number): string[] {
    // Backward cursor over the parallel history arrays, spilling into
    // rotated-out arrays exactly like `restore` does.
    let fields = this.historyFields;
    let values = this.historyValues;
    let counts = this.historyCounts;
    let fIdx = this.historyFieldsIdx;
    let vIdx = this.historyValuesIdx;
    let cIdx = this.historyCountsIdx;
    const prevFields = [...this.prevHistoryFields];
    const prevValues = [...this.prevHistoryValues];
    const prevCounts = [...this.prevHistoryCounts];

    const readField = (): number => {
      if (fIdx === 0) {
        const prev = prevFields.pop() as Int16Array<ArrayBuffer> | undefined;
        if (!prev) throw new Error("No history to show");
        fields = prev;
        fIdx = HISTORY_ARRAY_LENGTH;
      }
      return fields[--fIdx];
    };
    const readValue = (): number => {
      if (vIdx === 0) {
        const prev = prevValues.pop() as Int32Array<ArrayBuffer> | undefined;
        if (!prev) throw new Error("No history to show");
        values = prev;
        vIdx = HISTORY_ARRAY_LENGTH;
      }
      return values[--vIdx];
    };

    const groups: string[][] = [];
    for (let i = 0; i < n; i++) {
      if (cIdx === 0) {
        const prev = prevCounts.pop() as Uint8Array<ArrayBuffer> | undefined;
        if (!prev) break; // Ran out of history; show what we have.
        counts = prev;
        cIdx = HISTORY_ARRAY_LENGTH;
      }
      const count = counts[--cIdx];
      const parts: string[] = [];
      for (let j = 0; j < count; j++) {
        // Fields are read newest-first, so push and reverse after.
        parts.push(formatField(readField(), readValue(), this.opcodes));
      }
      groups.push(parts.reverse());
    }

    const lines = groups.reverse().map((parts) => parts.join(" ") || "-");
    console.log(lines.join("\n"));
    return lines;
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
    this.currentOp = undefined;
    this.currentUops = [];
    this.uopIndex = -1;
    this.memory.fill(0);
    this.initBoundaries.length = 0;
    this.uopsExecuted = 0;
  }

  loadProgram(opcodes: OpcodeTable, program: ArrayLike<number | undefined>, start = 0): void {
    if (start < 0 || start + program.length > MEMORY_SIZE) {
      throw new RangeError("Program does not fit in memory");
    }
    for (let i = 0; i < program.length; i++) {
      // `undefined` reserves the address without initializing it, so a read
      // from that cell traps via the uninitialized-memory check.
      if (program[i] !== undefined) this.store(start + i, program[i] as number);
    }
    this.pc = start;
    this.halted = false;

    this.compiledOps = compile(opcodes.uops);
    this.opcodes = opcodes;
  }

  checkAddress(addr: number): void {
    if (!Number.isInteger(addr) || addr < 0 || addr >= MEMORY_SIZE) {
      throw new RangeError(`Memory address out of range: ${addr}`);
    }
  }

  // True if `addr` has been written at least once. Walks `initBoundaries`
  // backward, inverting a boolean starting from the uninitialized state
  // past the last boundary at every boundary `>= addr` it passes.
  isInitialized(addr: number): boolean {
    let initialized = false;
    const b = this.initBoundaries;
    for (let i = b.length - 1; i >= 0 && b[i] >= addr; i--) {
      initialized = !initialized;
    }
    return initialized;
  }

  // Marks the single address `addr` as initialized by splicing
  // `initBoundaries` instead of rebuilding it with a linear scan. Walks
  // backward just like `isInitialized`; no-op when already initialized.
  markInitialized(addr: number): void {
    const b = this.initBoundaries;
    let i = b.length - 1;
    let initialized = false;
    while (i >= 0 && b[i] >= addr) {
      initialized = !initialized;
      i--;
    }
    if (initialized) {
      return;
    }
    // `addr` lies in the uninitialized span (prevEnd, ...] where prevEnd is
    // -1 when the span starts at address 0. When the span ends at b[i + 1]
    // it is followed by an initialized span, with which a write at that
    // boundary merges. A span starting past the last boundary is
    // open-ended toward higher addresses.
    const prevEnd = i >= 0 ? b[i] : -1;
    if (i === b.length - 1) {
      // Span past the last boundary.
      if (i >= 0 && addr === prevEnd + 1) {
        b[i] = addr; // Extends the final initialized span to addr.
      } else if (addr === 0) {
        b.push(addr); // First ever write: [0, 0] initialized, then uninit.
      } else {
        b.push(addr - 1, addr); // Uninit (prevEnd, addr-1], init [addr].
      }
      return;
    }
    const end = b[i + 1];
    if (addr === prevEnd + 1 && addr === end) {
      // addr bridges the initialized spans on both sides; the two
      // boundaries around the singleton uninitialized gap vanish.
      b.splice(i, 2);
    } else if (addr === end) {
      // The new initialized singleton merges with the span above `end`;
      // only the boundary between prevEnd and addr remains.
      b[i + 1] = addr - 1;
    } else if (addr === prevEnd + 1) {
      if (i >= 0) {
        // The initialized span ending at prevEnd now ends at addr, followed
        // by the still-uninitialized tail up to `end`.
        b[i] = addr;
      } else {
        b.splice(0, 0, addr); // addr = 0 starts the first initialized span.
      }
    } else {
      // New initialized singleton strictly inside the uninitialized span.
      b.splice(i + 1, 0, addr - 1, addr);
    }
  }

  // Writes a data word from outside the ISA (UI, test setup) and marks the
  // address initialized like `writeMem` does.
  store(address: number, value: number): void {
    this.checkAddress(address);
    this.markInitialized(address);
    this.memory[address] = value >>> 0;
  }

  // Returns the value of SR as a number. This is the format used by SR=>ACC.
  srValue(): number {
    return (+this.cf << 3) | (+this.of << 2) | (+this.sf << 1) | +this.zf;
  }

  // Installs a fresh fetch/decode iterator and points the uop cursor just
  // before its first micro-op.
  private startDecode(): IterableIterator<number> {
    const op = this.decodeSequence(this, UOPS);
    this.currentOp = op;
    this.currentUops = DECODE_SEQUENCE;
    this.uopIndex = -1;
    return op;
  }

  // Advances one micro-op. Starts a new instruction's fetch/decode sequence
  // when none is in progress. When the previous instruction finishes, the
  // next instruction's fetch begins in the same call (its first micro-op is
  // executed immediately) so there is no idle step at the boundary, and the
  // uop index restarts at 0 for the new instruction. Returns true once an
  // instruction has fully executed (or the simulator is halted).
  uStep(): boolean {
    if (this.halted) return true;
    let op = this.currentOp;
    if (!op) {
      op = this.startDecode();
    }
    const result = op.next();
    if (result.done) {
      // The instruction just finished; begin the next one right away.
      this.startDecode().next();
      this.uopIndex = 0;
      return true;
    }
    this.uopIndex++;
    return false;
  }

  step(): void {
    if (this.halted) return;
    // `uStep` returns true at an instruction boundary, so this runs exactly
    // one instruction — resuming one that micro-stepping left mid-way.
    while (!this.uStep()) {}
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
