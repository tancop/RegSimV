import { decodeInstruction } from "./encoding";
import { BUILTIN_OPCODES, type Operation } from "./opcodes";

export const MEMORY_SIZE = 2048;

export class Simulator {
  // Registers
  mar = 0;
  mbr = 0;
  pc = 0;
  ir = 0;
  acc = 0;

  // Flag register
  sr = 0;

  // Memory
  memory = new Uint32Array(MEMORY_SIZE);
  dataMemoryStart = 1024;

  halted = false;

  opcodes: Record<string, Operation> = BUILTIN_OPCODES;

  reset(): void {
    this.mar = 0;
    this.mbr = 0;
    this.pc = 0;
    this.ir = 0;
    this.acc = 0;
    this.sr = 0;
    this.halted = false;
    this.memory.fill(0);
  }

  loadProgram(program: ArrayLike<number>, start = 0): void {
    if (start < 0 || start + program.length > MEMORY_SIZE) {
      throw new RangeError("Program does not fit in memory");
    }
    for (let i = 0; i < program.length; i++) {
      this.memory[start + i] = program[i] >>> 0;
    }
    this.pc = start;
    this.halted = false;
  }

  checkAddress(addr: number): void {
    if (!Number.isInteger(addr) || addr < 0 || addr >= MEMORY_SIZE) {
      throw new RangeError(`Memory address out of range: ${addr}`);
    }
  }

  /** Execute a single fetch-decode-execute cycle. No-op once halted. */
  step(): void {
    if (this.halted) return;
    this.checkAddress(this.pc);
    const raw = this.memory[this.pc];
    this.ir = raw;
    this.pc = (this.pc + 1) % MEMORY_SIZE;

    const { opcode, operand, addressMode } = decodeInstruction(raw);

    // TODO
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
