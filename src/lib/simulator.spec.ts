import { describe, expect, it } from "vitest";
import { assemble } from "./assemble";
import { Simulator } from "./simulator";
import { BUILTIN_OPCODES, type Operation } from "./opcodes";
import { I32_MIN } from "./uops";

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

  it("runs 1 million loops in less than 100 ms", () => {
    // Split into nested loops because of limited memory
    const innerCount = 1000;
    const outerCount = 1000;

    const sim = new Simulator();
    sim.loadProgram(
      BUILTIN_OPCODES,
      program([
        "outer: load [1026]",
        `cmp ${outerCount}`,
        "jc end",
        "inc [1026]",

        "inner: load [1024]",
        `cmp ${innerCount}`,
        "jc outer",
        "store [mem 1025]",
        "inc [1025]",
        "inc [1024]",
        "jmp inner",

        "jmp outer",

        "end: halt",
      ]),
    );

    data(sim.memory, ["@skipto 1024", 0, 1027, 0]);

    performance.mark("start");
    sim.run(1000000);
    performance.mark("end");

    expect(sim.halted).toBe(true);
    expect(sim.memory[1024]).toBe(innerCount);
    expect(sim.memory[1026]).toBe(outerCount);

    const total = performance.measure("duration", "start", "end").duration;
    console.log(`speed test: ${outerCount * innerCount} loops took ${total.toFixed(3)} ms`);
    expect(total).toBeLessThan(100);
  });

  it("divides two positive numbers", () => {
    const sim = new Simulator();
    sim.loadProgram(BUILTIN_OPCODES, assemble("load [1024]\ndiv 43\nhalt", BUILTIN_OPCODES));
    sim.memory[1024] = 4085;

    sim.run();

    expect(sim.acc).toBe(95);
    expect(sim.of).toBe(false);
  });

  it("uses floor division", () => {
    const sim = new Simulator();
    sim.loadProgram(BUILTIN_OPCODES, assemble("load [1024]\ndiv 63\nhalt", BUILTIN_OPCODES));
    sim.memory[1024] = 1738;

    sim.run();

    expect(sim.acc).toBe(27);
    expect(sim.of).toBe(false);
  });

  it("divides by a negative number", () => {
    const sim = new Simulator();
    sim.loadProgram(BUILTIN_OPCODES, assemble("load [1024]\ndiv -63\nhalt", BUILTIN_OPCODES));
    sim.memory[1024] = 1738;

    sim.run();

    expect(sim.acc).toBe(-27);
    expect(sim.of).toBe(false);
  });

  it("divides two large negative numbers", () => {
    const sim = new Simulator();
    sim.loadProgram(BUILTIN_OPCODES, assemble("load [1024]\ndiv -808\nhalt", BUILTIN_OPCODES));
    sim.memory[1024] = -7355608;

    sim.run();

    expect(sim.acc).toBe(9103);
    expect(sim.of).toBe(false);
  });

  it("sets OF=1 and ACC=0 on division by zero", () => {
    const sim = new Simulator();
    sim.loadProgram(BUILTIN_OPCODES, assemble("load [1024]\ndiv 0\nhalt", BUILTIN_OPCODES));
    sim.memory[1024] = 1738;

    sim.run();

    expect(sim.acc).toBe(0);
    expect(sim.of).toBe(true);
  });

  it("sets OF=1 and leaves ACC unchanged on overflowing division", () => {
    const sim = new Simulator();
    sim.loadProgram(BUILTIN_OPCODES, assemble("load [1024]\ndiv -1\nhalt", BUILTIN_OPCODES));
    sim.memory[1024] = I32_MIN;

    sim.run();

    expect(sim.acc).toBe(I32_MIN);
    expect(sim.of).toBe(true);
  });

  it("multiplies two positive numbers", () => {
    const sim = new Simulator();
    sim.loadProgram(BUILTIN_OPCODES, assemble("load [1024]\nmul 831\nhalt", BUILTIN_OPCODES));
    sim.memory[1024] = 821;

    sim.run();

    expect(sim.acc).toBe(682251);
    expect(sim.of).toBe(false);
  });

  it("multiplies with a negative number", () => {
    const sim = new Simulator();
    sim.loadProgram(BUILTIN_OPCODES, assemble("load [1024]\nmul -831\nhalt", BUILTIN_OPCODES));
    sim.memory[1024] = 821;

    sim.run();

    expect(sim.acc).toBe(-682251);
    expect(sim.of).toBe(false);
  });

  it("multiplies two negative numbers", () => {
    const sim = new Simulator();
    sim.loadProgram(BUILTIN_OPCODES, assemble("load [1024]\nmul -831\nhalt", BUILTIN_OPCODES));
    sim.memory[1024] = -821;

    sim.run();

    expect(sim.acc).toBe(682251);
    expect(sim.of).toBe(false);
  });

  it("sets OF=1 and NF=1 on overflowing multiply", () => {
    const sim = new Simulator();
    sim.loadProgram(BUILTIN_OPCODES, assemble("load [1024]\nmul [1025]\nhalt", BUILTIN_OPCODES));
    sim.memory[1024] = 1738;
    sim.memory[1025] = 7183015;

    sim.run();

    expect(sim.acc).toBe(-400821818);
    expect(sim.of).toBe(true);
    expect(sim.sf).toBe(true);
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

function program(lines: string[], opcodes: Record<string, Operation> = BUILTIN_OPCODES): number[] {
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
  return assemble(expanded.join("\n"), opcodes);
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

  it("runs zadanie4_53.regs", () => {
    const sim = new Simulator();
    sim.loadProgram(
      BUILTIN_OPCODES,
      program([
        "JMP 31",
        "LOAD [mem 425]",
        "CMP 1",
        "JC 15",
        "CMP 2",
        "JC 27",
        "CMP 3",
        "JC 19",
        "CMP 4",
        "JC 23",
        "JNC 51",
        "LOAD [425]",
        "INC",
        "STORE [425]",
        "JMP 0",
        "LOAD [301]",
        "DEC",
        "STORE [301]",
        "JMP 11",
        "LOAD [301]",
        "INC",
        "STORE [301]",
        "JMP 11",
        "LOAD [300]",
        "DEC",
        "STORE [300]",
        "JMP 11",
        "LOAD [300]",
        "INC",
        "STORE [300]",
        "JMP 11",
        "LOAD [301]",
        "DEC",
        "MUL 5",
        "ADD [300]",
        "DEC",
        "ADD 400",
        "STORE [303]",
        "LOAD [mem 303]",
        "JNZ 45",
        "INC",
        "STORE [mem 303]",
        "LOAD [304]",
        "INC",
        "STORE [304]",
        "CMP 12",
        "JNC 50",
        "LOAD [302]",
        "INC",
        "STORE [302]",
        "JMP 1",
        "HALT",
      ]),
    );

    data(sim.memory, [
      "@skipto 300",
      2,
      2,
      0,
      "@skipto 304",
      5,
      4,
      1,
      [2, 3],
      3,
      2,
      1,
      0,
      "@skipto 400",
      1,
      [0, 4],
      1,
      [0, 4],
      1,
      [0, 4],
      1,
      [0, 4],
      1,
      [0, 4],
      305,
    ]);

    sim.run();

    checkMemory(sim.memory, [
      "@skipto 300",
      5,
      1,
      1,
      404,
      12,
      4,
      1,
      [2, 3],
      3,
      2,
      1,
      0,
      "@skipto 400",
      [1, 7],
      0,
      [1, 3],
      [0, 4],
      1,
      [0, 4],
      1,
      [0, 4],
      313,
    ]);

    expect(sim.pc).toBe(52);
    expect(sim.acc).toBe(0);
    expect(sim.mar).toBe(51);
    expect(sim.mbr).toBe(3);
  });

  it("runs zadanie4_m.regs with custom instruction", () => {
    const opcodes: Record<string, Operation> = {
      ...BUILTIN_OPCODES,
      SET: {
        immediate: ["irToMbr", "mbrToAcc"],
      },
    };

    const sim = new Simulator();
    sim.dataMemoryStart = 300;
    sim.loadProgram(
      opcodes,
      program(
        [
          "load [300]",
          "mul 5",
          "add [301]",
          "add 495",
          "store [500]",
          "load [mem 500]",
          "cmp 1",
          "jc 10",
          "inc [mem 500]",
          "inc [499]",
          "load [499]",
          "cmp 14",
          "jnc 15",
          "set 1",
          "store [302]",
          "load [mem 303]",
          "cmp 1",
          "jc 35",
          "cmp 2",
          "jc 40",
          "cmp 3",
          "jc 45",
          "cmp 4",
          "jc 50",
          "halt",

          "@skipto 30",
          "inc [303]",
          "jmp 0",

          "@skipto 35",
          "dec [300]",
          "jmp 30",

          "@skipto 40",
          "inc [301]",
          "jmp 30",

          "@skipto 45",
          "inc [300]",
          "jmp 30",

          "@skipto 50",
          "dec [301]",
          "jmp 30",
        ],
        opcodes,
      ),
    );

    data(sim.memory, [
      "@skipto 300",
      3,
      3,
      0,
      305,
      "@skipto 305",
      [2, 2],
      [3, 2],
      [4, 4],
      1,
      0,
      "@skipto 499",
      7,
      "@skipto 501",
      [1, 6],
      [0, 4],
      1,
      [0, 14],
    ]);

    sim.run();

    checkMemory(sim.memory, ["@skipto 300", 4, 1, 1, 314, "@skipto 499", 17, 516]);

    expect(sim.halted).toBe(true);
    expect(sim.pc).toBe(25);
    expect(sim.acc).toBe(0);
    expect(sim.mar).toBe(24);
    expect(sim.mbr).toBe(3);
  });

  it("runs zadanie4_p.regs", () => {
    const sim = new Simulator();
    sim.dataMemoryStart = 300;
    sim.loadProgram(
      BUILTIN_OPCODES,
      program([
        "load [300]",
        "cmp 5",
        "jc 9",
        "cmp 3",
        "jc 13",
        "cmp 2",
        "jc 17",
        "jmp 33",

        "@skipto 9",
        "load [301]",
        "cmp 1",
        "jc 23",
        "jmp 33",
        "load [301]",
        "cmp 3",
        "jc 23",
        "jmp 33",
        "load [301]",
        "cmp 4",
        "jc 29",
        "jmp 33",

        "@skipto 23",
        "load [302]",
        "add 2",
        "store [302]",
        "halt",

        "@skipto 29",
        "inc [302]",
        "halt",

        "@skipto 33",
        "load [mem 303]",
        "cmp 1",
        "jc 46",
        "cmp 2",
        "jc 62",
        "cmp 3",
        "jc 71",
        "cmp 4",
        "jc 87",
        "halt",

        "@skipto 46",
        "load [300]",
        "cmp 1",
        "jnc 50",
        "add 5",
        "sub 1",
        "store [300]",
        "load [301]",
        "cmp 5",
        "jnc 56",
        "sub 5",
        "add 1",
        "store [301]",
        "inc [303]",
        "jmp 0",

        "@skipto 62",
        "load [300]",
        "cmp 5",
        "jnc 66",
        "sub 5",
        "add 1",
        "store [300]",
        "jc 52",

        "@skipto 71",
        "load [300]",
        "cmp 5",
        "jnc 75",
        "sub 5",
        "add 1",
        "store [300]",
        "load [301]",
        "cmp 1",
        "jnc 81",
        "add 5",
        "sub 1",
        "store [301]",
        "inc [303]",
        "jmp 0",

        "@skipto 87",
        "load [300]",
        "cmp 1",
        "jnc 91",
        "add 5",
        "sub 1",
        "store [300]",
        "jc 77",
      ]),
    );

    data(sim.memory, ["@skipto 300", 1, 5, 0, 305, "@skipto 305", 1, 0]);

    sim.run();

    checkMemory(sim.memory, ["@skipto 300", 5, 1, 2, 306, "@skipto 305", 1, 0]);

    expect(sim.halted).toBe(true);
    expect(sim.cf).toBe(true);
    expect(sim.pc).toBe(27);
    expect(sim.acc).toBe(2);
    expect(sim.mar).toBe(26);
    expect(sim.mbr).toBe(3);
  });
});
