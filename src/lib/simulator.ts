import { AddressMode, decodeInstruction, type Instruction } from "./encoding";
import { BUILTIN_OPCODES, createOpcodeTable, type OpcodeTable } from "./opcodes";
import { BRANCHY_UOPS, NAME_TO_UOP, UOPS, type UOp } from "./uops";

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
  SKIP = -7,
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
    case Field.SKIP:
      return `SKIP=${value}`;
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
  ef = false; // Equal
  zf = false; // Zero
  nf = false; // Negative
  of = false; // Overflow
  cf = false; // Compare (<)

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

  opcodes: OpcodeTable = createOpcodeTable(BUILTIN_OPCODES);

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

  // Micro-ops for `instruction`'s address-mode variant. Throws when the opcode
  // table has no variant for that address mode.
  variantUopsFor(instruction: Instruction): UOp[] {
    const operation = this.opcodes.uops[instruction.opcode];
    let variant: UOp[] | undefined;
    switch (instruction.addressMode) {
      case AddressMode.Immediate:
        variant = operation?.immediate;
        break;
      case AddressMode.Direct:
        variant = operation?.direct;
        break;
      case AddressMode.Indirect:
        variant = operation?.indirect;
        break;
    }
    if (!variant) {
      throw new Error(
        `No variant for opcode ${instruction.opcode} with address mode ${instruction.addressMode}`,
      );
    }
    return variant;
  }

  // Statistics
  uopsExecuted = 0;

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

  // Non-destructive backward scan for the most recent write to `field`,
  // rotated-out history arrays included. Plain iteration: nothing is popped.
  private hasHistoryField(field: number): boolean {
    for (let i = this.historyFieldsIdx - 1; i >= 0; i--) {
      if (this.historyFields[i] === field) return true;
    }
    for (let a = this.prevHistoryFields.length - 1; a >= 0; a--) {
      const fields = this.prevHistoryFields[a];
      for (let i = fields.length - 1; i >= 0; i--) {
        if (fields[i] === field) return true;
      }
    }
    return false;
  }

  // Restores the decoder and micro-op cursor when a backward step crosses an
  // instruction boundary. The live IR still holds the instruction that just
  // finished, so decode it and point at that instruction's final micro-op.
  // With no IR write in history the cursor falls back to the initial boundary.
  private restorePreviousInstruction(): void {
    if (!this.hasHistoryField(Field.IR)) {
      this.decodedInstruction = undefined;
      this.currentUops = [];
      this.uopIndex = -1;
      return;
    }
    const instruction = decodeInstruction(this.ir);
    this.decodedInstruction = instruction;
    this.setVariantUops(this.variantUopsFor(instruction));
    this.uopIndex = this.currentUops.length - 1;
  }

  // Undoes the most recently executed uop, restoring the fields it recorded.
  uBack(): void {
    const crossedBoundary = this.uopIndex === 0;
    if (crossedBoundary) {
      this.restorePreviousInstruction();
    }
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
          this.cf = (value & 0b10000) !== 0;
          this.ef = (value & 0b01000) !== 0;
          this.of = (value & 0b00100) !== 0;
          this.nf = (value & 0b00010) !== 0;
          this.zf = (value & 0b00001) !== 0;
          break;
        case Field.ACC:
          this.acc = value;
          break;
        case Field.SKIP:
          this.skipNext = value !== 0;
          break;
      }
    }

    // Move the micro-op cursor back so the display matches the restored state.
    // A boundary crossing already placed the cursor on the previous
    // instruction's final micro-op, so it must not be decremented again.
    if (!crossedBoundary && this.uopIndex >= 0) this.uopIndex--;

    this.halted = false;
  }

  back(): void {
    if (this.uopIndex < 0) return;
    // Run the current instruction back to its first micro-op without crossing.
    while (this.uopIndex > 0) {
      this.uBack();
    }
    // One more step crosses the boundary and restores the previous instruction.
    this.uBack();
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
    this.ef = false;
    this.zf = false;
    this.nf = false;
    this.of = false;

    this.halted = false;

    this.skipNext = false;
    this.decodedInstruction = undefined;
    this.currentUops = [];
    this.uopIndex = -1;

    this.memory.fill(0);
    this.initBoundaries.length = 0;
    this.uopsExecuted = 0;

    this.historyCountsIdx = 0;
    this.historyFieldsIdx = 0;
    this.historyValuesIdx = 0;
    this.prevHistoryCounts.length = 0;
    this.prevHistoryFields.length = 0;
    this.prevHistoryValues.length = 0;
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
    return (+this.cf << 4) | (+this.ef << 3) | (+this.of << 2) | (+this.nf << 1) | +this.zf;
  }

  // Installs a fresh fetch/decode microprogram and points the uop cursor just
  // before its first micro-op.
  private startDecode(): void {
    this.currentUops = DECODE_SEQUENCE;
    this.uopIndex = -1;
  }

  // Executes one micro-op directly from `currentUops`, mirroring the branchy
  // skip rule: a uop following a branchy uop is skipped while `skipNext` is
  // set. A skipped uop still records an empty (skip-flag) history entry so
  // that backward steps stay aligned.
  private executeUop(index: number): void {
    const branchyPredecessor = index > 0 && BRANCHY_UOPS.includes(this.currentUops[index - 1]);
    if (branchyPredecessor && this.skipNext) {
      this.save(Field.SKIP, 1);
      this.skipNext = false;
      this.saveCount(1);
      return;
    }
    UOPS[this.currentUops[index]](this);
  }

  // Advances one micro-op. Starts a new instruction's fetch/decode sequence
  // when none is in progress. When the previous instruction finishes, the
  // next instruction's fetch begins in the same call (its first micro-op is
  // executed immediately) so there is no idle step at the boundary, and the
  // uop index restarts at 0 for the new instruction. Returns true once an
  // instruction has fully executed (or the simulator is halted).
  uStep(): boolean {
    if (this.halted) return true;
    if (this.currentUops.length === 0) {
      this.startDecode();
      this.executeUop(0);
      this.uopIndex = 0;
      return false;
    }
    const next = this.uopIndex + 1;
    if (next >= this.currentUops.length) {
      // The instruction just finished; begin the next one right away.
      this.uopsExecuted += this.currentUops.length;
      this.startDecode();
      this.executeUop(0);
      this.uopIndex = 0;
      return true;
    }
    this.executeUop(next);
    this.uopIndex = next;
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
