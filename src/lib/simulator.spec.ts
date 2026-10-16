import { describe, expect, it } from "vitest";
import { assemble } from "./assemble";
import { Simulator } from "./simulator";
import { BUILTIN_OPCODES } from "./opcodes";

describe("simulator", () => {
  it("runs ADD immediate then HALT", () => {
    expect.assertions(2);
    const sim = new Simulator();
    sim.loadProgram(BUILTIN_OPCODES, assemble("ADD 5\nHALT", BUILTIN_OPCODES));
    const steps = sim.run();
    expect(sim.acc).toBe(5);
    expect(steps).toBe(2);
  });

  it("rejects out-of-range memory access", () => {
    expect.assertions(1);
    const sim = new Simulator();
    sim.loadProgram(BUILTIN_OPCODES, assemble("LOAD [5000]", BUILTIN_OPCODES));
    expect(() => sim.step()).toThrow(RangeError);
  });

  it("runs loop with INC and CMP", () => {
    const sim = new Simulator();
    sim.loadProgram(
      BUILTIN_OPCODES,
      assemble("load [1024]\ncmp 5\njc 5\ninc [1024]\njmp 0\nhalt", BUILTIN_OPCODES),
    );
    sim.run();
    expect(sim.halted).toBe(true);
    expect(sim.memory[1024]).toBe(5);
  });
});

type DataChunk = number | [value: number, count: number] | string;

function parseSkipto(chunk: string, memoryLength: number): number {
  const trimmed = chunk.trim();
  if (!trimmed.startsWith("@skipto ")) {
    throw new Error(`Unknown data directive "${chunk}" (supported: "@skipto n")`);
  }
  const target = parseInt(trimmed.slice(8).trim(), 10);
  if (!Number.isInteger(target) || target < 0 || target > memoryLength) {
    throw new RangeError(`@skipto target out of range: ${trimmed.slice(8).trim()}`);
  }
  return target;
}

function* walkChunks(chunks: DataChunk[], memoryLength: number): Generator<[number, number]> {
  let cursor = 0;
  for (const chunk of chunks) {
    if (typeof chunk === "number") {
      if (cursor < 0 || cursor >= memoryLength) {
        throw new RangeError(`Data address out of range: ${cursor}`);
      }
      yield [cursor++, chunk];
    } else if (Array.isArray(chunk)) {
      const [value, count] = chunk;
      if (!Number.isInteger(count) || count < 0) {
        throw new Error(`Repeat count must be a non-negative integer, got ${count}`);
      }
      for (let i = 0; i < count; i++) {
        if (cursor < 0 || cursor >= memoryLength) {
          throw new RangeError(`Data address out of range: ${cursor}`);
        }
        yield [cursor++, value];
      }
    } else {
      cursor = parseSkipto(chunk, memoryLength);
    }
  }
}

function data(memory: Uint32Array, chunks: DataChunk[]): Uint32Array {
  for (const [address, value] of walkChunks(chunks, memory.length)) {
    memory[address] = value;
  }
  return memory;
}

function checkMemory(memory: Uint32Array, chunks: DataChunk[]): void {
  for (const [address, value] of walkChunks(chunks, memory.length)) {
    expect(memory[address], `memory[${address}]`).toBe(value);
  }
}

function program(lines: string[]): number[] {
  const expanded: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("@skipto ")) {
      const target = parseInt(trimmed.slice(8).trim(), 10);
      const pad = target - expanded.length;
      if (!Number.isInteger(target) || pad < 0) {
        throw new Error(
          `@skipto target ${trimmed.slice(8).trim()} is behind current address ${expanded.length}`,
        );
      }
      expanded.push(...Array.from({ length: pad }, () => "NOP"));
    } else {
      expanded.push(line);
    }
  }
  return assemble(expanded.join("\n"), BUILTIN_OPCODES);
}

describe("simulator golden tests", () => {
  it("runs 2024_vzor_priklad_RegSim_pohyb_po_sachovnici.regs", () => {
    const sim = new Simulator();
    sim.dataMemoryStart = 300;
    sim.loadProgram(
      BUILTIN_OPCODES,
      program([
        "LOAD [mem 302]",
        "CMP 1",
        "JC 20",
        "CMP 2",
        "JC 40",
        "CMP 3",
        "JC 60",
        "CMP 4",
        "JC 80",
        "HALT",
        "@skipto 12",
        "INC [302]",
        "JMP 0",
        "@skipto 20",
        "LOAD [300]",
        "CMP 1",
        "JC 12",
        "DEC [300]",
        "JMP 12",
        "@skipto 40",
        "LOAD [301]",
        "CMP 5",
        "JC 12",
        "INC [301]",
        "JMP 12",
        "@skipto 60",
        "LOAD [300]",
        "CMP 5",
        "JC 12",
        "INC [300]",
        "JMP 12",
        "@skipto 80",
        "LOAD [301]",
        "CMP 1",
        "JC 12",
        "DEC [301]",
        "JMP 12",
      ]),
      0,
    );

    data(sim.memory, ["@skipto 300", 3, 3, 305, "@skipto 305", [1, 3], [2, 3], [3, 5], [4, 5], 0]);

    sim.run();

    checkMemory(sim.memory, [
      "@skipto 300",
      5,
      1,
      321,
      "@skipto 305",
      [1, 3],
      [2, 3],
      [3, 5],
      [4, 5],
      0,
    ]);

    expect(sim.pc).toBe(10);
    expect(sim.acc).toBe(0);
    expect(sim.mar).toBe(9);
    expect(sim.mbr).toBe(3);
  });
});
