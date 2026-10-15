import { type Instruction } from "./encoding";
import { compile, compileVariant, type CompiledOperation } from "./jit";
import type { Operation } from "./opcodes";
import { UOPS, type UOp } from "./uops";

export const MEMORY_SIZE = 2048;

const DECODE_SEQUENCE = ["pcToMar", "readMem", "mbrToIr", "incrementPc", "decode"] satisfies UOp[];

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

  decodeSequence: (st: Simulator, ops: typeof UOPS) => IterableIterator<number> =
    compileVariant(DECODE_SEQUENCE);

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
  }

  loadProgram(opcodes: Record<string, Operation>, program: ArrayLike<number>, start = 0): void {
    if (start < 0 || start + program.length > MEMORY_SIZE) {
      throw new RangeError("Program does not fit in memory");
    }
    for (let i = 0; i < program.length; i++) {
      this.memory[start + i] = program[i] >>> 0;
    }
    this.pc = start;
    this.halted = false;

    for (const op of Object.values(opcodes)) {
      this.compiledOps.push(compile(op));
    }
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
}
