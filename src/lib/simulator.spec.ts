import { describe, expect, it } from "vitest";
import { assemble } from "./assemble";
import { AddressMode, encodeInstruction } from "./encoding";
import { Simulator, Field, formatInstruction } from "./simulator";
import { BUILTIN_OPCODES, createOpcodeTable, type OpcodeTable } from "./opcodes";
import { I32_MIN, UOPS } from "./uops";

const OPCODES = createOpcodeTable(BUILTIN_OPCODES);

const PERF_BUDGET_MS = 5000;

describe("simulator", () => {
  it("runs ADD immediate then HALT", () => {
    expect.assertions(2);
    const sim = new Simulator();
    sim.loadProgram(OPCODES, assemble("ADD 5\nHALT", OPCODES));
    const steps = sim.run();
    expect(sim.acc).toBe(5);
    expect(steps).toBe(2);
  });

  it("rejects out-of-range memory access", () => {
    expect.assertions(1);
    const sim = new Simulator();
    sim.loadProgram(OPCODES, assemble("LOAD [5000]", OPCODES));
    expect(() => sim.step()).toThrow(RangeError);
  });

  it("tracks initialized spans as boundary addresses", () => {
    expect.assertions(3);
    const sim = new Simulator();
    for (let i = 0; i <= 10; i++) sim.store(i, i);
    sim.store(14, 14);
    for (let i = 17; i <= 25; i++) sim.store(i, i);
    expect(sim.initBoundaries).toEqual([10, 13, 14, 16, 25]);
    expect([0, 5, 10, 14, 17, 25].every((a) => sim.isInitialized(a))).toBe(true);
    expect([11, 12, 13, 15, 16, 26, 2047].every((a) => !sim.isInitialized(a))).toBe(true);
  });

  it("edits boundaries instead of rebuilding when writing new locations", () => {
    expect.assertions(7);
    const sim = new Simulator();
    sim.store(12, 1); // First write: leading uninitialized span, then a singleton.
    expect(sim.initBoundaries).toEqual([11, 12]);
    sim.store(13, 1); // Extends the open initialized span.
    expect(sim.initBoundaries).toEqual([11, 13]);
    sim.store(10, 1); // Singleton strictly inside an uninitialized span.
    expect(sim.initBoundaries).toEqual([9, 10, 11, 13]);
    sim.store(11, 1); // Closes the gap: both neighboring boundaries merge.
    expect(sim.initBoundaries).toEqual([9, 13]);
    sim.store(20, 1); // New span past the last boundary.
    expect(sim.initBoundaries).toEqual([9, 13, 19, 20]);
    sim.store(14, 1); // Extends the boundary span ending at 13.
    expect(sim.initBoundaries).toEqual([9, 14, 19, 20]);
    sim.store(19, 1); // Merges with the initialized span above 19.
    expect(sim.initBoundaries).toEqual([9, 14, 18, 20]);
  });

  it("halts on a read from uninitialized memory", () => {
    expect.assertions(3);
    const sim = new Simulator();
    sim.loadProgram(OPCODES, assemble("LOAD [2000]\nHALT", OPCODES));
    expect(() => sim.run()).toThrow(/uninitialized/i);
    expect(sim.halted).toBe(true);
    sim.step(); // Stays halted instead of re-executing the instruction.
    expect(sim.pc).toBe(1); // PC already advanced past the instruction.
  });

  it("reads data initialized through store", () => {
    expect.assertions(1);
    const sim = new Simulator();
    sim.loadProgram(OPCODES, assemble("LOAD [1024]\nHALT", OPCODES));
    sim.store(1024, 41);
    sim.run();
    expect(sim.acc).toBe(41);
  });

  it("runs loop with INC and CMP", () => {
    const sim = new Simulator();
    sim.loadProgram(
      OPCODES,
      assemble("load [1024]\ncmp 5\njc 5\ninc [1024]\njmp 0\nhalt", OPCODES),
    );
    sim.store(1024, 0);
    sim.run();
    expect(sim.halted).toBe(true);
    expect(sim.memory[1024]).toBe(5);
  });

  it("runs the nested loop workload within the performance budget", () => {
    // Split into nested loops because of limited memory
    const innerCount = 1000;
    const outerCount = 100;

    const sim = new Simulator();
    sim.loadProgram(
      OPCODES,
      program([
        "outer: load [1026]",
        `cmp ${outerCount}`,
        "jc end",
        "load [1024]",
        "store [1025]",
        "inc [1026]",

        "inner: load [1025]",
        `cmp ${innerCount}`,
        "jc outer",
        "inc [1027]",
        "inc [1025]",
        "jmp inner",

        "jmp outer",

        "end: halt",
      ]),
    );

    data(sim, ["@skipto 1024", 0, 0, 0, 0]);

    const start = performance.now();
    const steps = sim.run(10_000_000);
    const time = performance.now() - start;

    const nsPerInstruction = (time * 1e6) / steps;

    console.log(
      `speed test: ${steps} instructions, ${sim.uopsExecuted} uOps in ${time.toFixed(3)} ms (${nsPerInstruction.toFixed(0)} ns/instruction)`,
    );

    expect(time).toBeLessThan(PERF_BUDGET_MS);
  });

  it("divides two positive numbers", () => {
    const sim = new Simulator();
    sim.loadProgram(OPCODES, assemble("load [1024]\ndiv 43\nhalt", OPCODES));
    sim.store(1024, 4085);

    sim.run();

    expect(sim.acc).toBe(95);
    expect(sim.of).toBe(false);
  });

  it("uses floor division", () => {
    const sim = new Simulator();
    sim.loadProgram(OPCODES, assemble("load [1024]\ndiv 63\nhalt", OPCODES));
    sim.store(1024, 1738);

    sim.run();

    expect(sim.acc).toBe(27);
    expect(sim.of).toBe(false);
  });

  it("divides by a negative number", () => {
    const sim = new Simulator();
    sim.loadProgram(OPCODES, assemble("load [1024]\ndiv -63\nhalt", OPCODES));
    sim.store(1024, 1738);

    sim.run();

    expect(sim.acc).toBe(-27);
    expect(sim.of).toBe(false);
  });

  it("divides two large negative numbers", () => {
    const sim = new Simulator();
    sim.loadProgram(OPCODES, assemble("load [1024]\ndiv -808\nhalt", OPCODES));
    sim.store(1024, -7355608);

    sim.run();

    expect(sim.acc).toBe(9103);
    expect(sim.of).toBe(false);
  });

  it("sets OF=1 and ACC=0 on division by zero", () => {
    const sim = new Simulator();
    sim.loadProgram(OPCODES, assemble("load [1024]\ndiv 0\nhalt", OPCODES));
    sim.store(1024, 1738);

    sim.run();

    expect(sim.acc).toBe(0);
    expect(sim.of).toBe(true);
  });

  it("sets OF=1 and leaves ACC unchanged on overflowing division", () => {
    const sim = new Simulator();
    sim.loadProgram(OPCODES, assemble("load [1024]\ndiv -1\nhalt", OPCODES));
    sim.store(1024, I32_MIN);

    sim.run();

    expect(sim.acc).toBe(I32_MIN);
    expect(sim.of).toBe(true);
  });

  it("multiplies two positive numbers", () => {
    const sim = new Simulator();
    sim.loadProgram(OPCODES, assemble("load [1024]\nmul 831\nhalt", OPCODES));
    sim.store(1024, 821);

    sim.run();

    expect(sim.acc).toBe(682251);
    expect(sim.of).toBe(false);
  });

  it("multiplies with a negative number", () => {
    const sim = new Simulator();
    sim.loadProgram(OPCODES, assemble("load [1024]\nmul -831\nhalt", OPCODES));
    sim.store(1024, 821);

    sim.run();

    expect(sim.acc).toBe(-682251);
    expect(sim.of).toBe(false);
  });

  it("multiplies two negative numbers", () => {
    const sim = new Simulator();
    sim.loadProgram(OPCODES, assemble("load [1024]\nmul -831\nhalt", OPCODES));
    sim.store(1024, -821);

    sim.run();

    expect(sim.acc).toBe(682251);
    expect(sim.of).toBe(false);
  });

  it("sets OF=1 and NF=1 on overflowing multiply", () => {
    const sim = new Simulator();
    sim.loadProgram(OPCODES, assemble("load [1024]\nmul [1025]\nhalt", OPCODES));
    sim.store(1024, 1738);
    sim.store(1025, 7183015);

    sim.run();

    expect(sim.acc).toBe(-400821818);
    expect(sim.of).toBe(true);
    expect(sim.sf).toBe(true);
  });

  // Shift and rotate

  it("shifts left normal positive number", () => {
    const sim = new Simulator();
    sim.loadProgram(OPCODES, assemble("load [1024]\nshl\nhalt", OPCODES));
    sim.store(1024, 21);

    sim.run();

    expect(sim.acc).toBe(42);
    expect(sim.of).toBe(false);
  });

  it("shifts left and sets OF when MSB is 1", () => {
    const sim = new Simulator();
    sim.loadProgram(OPCODES, assemble("load [1024]\nshl\nhalt", OPCODES));

    sim.store(1024, -2147483648);

    sim.run();

    expect(sim.acc).toBe(0);
    expect(sim.of).toBe(true);
  });

  it("shifts right normal positive number", () => {
    const sim = new Simulator();
    sim.loadProgram(OPCODES, assemble("load [1024]\nshr\nhalt", OPCODES));
    sim.store(1024, 42);

    sim.run();

    expect(sim.acc).toBe(21);
    expect(sim.of).toBe(false);
  });

  it("shifts right and sets OF when LSB is 1", () => {
    const sim = new Simulator();
    sim.loadProgram(OPCODES, assemble("load [1024]\nshr\nhalt", OPCODES));
    sim.store(1024, 1);

    sim.run();

    expect(sim.acc).toBe(0);
    expect(sim.of).toBe(true);
  });

  it("rotates left through OF without existing OF", () => {
    const sim = new Simulator();
    sim.loadProgram(OPCODES, assemble("load [1024]\nrol\nhalt", OPCODES));
    sim.store(1024, -2147483648);
    sim.of = false;

    sim.run();

    expect(sim.acc).toBe(0);
    expect(sim.of).toBe(true);
  });

  it("rotates left through OF with existing OF", () => {
    const sim = new Simulator();
    sim.loadProgram(OPCODES, assemble("load [1024]\nrol\nhalt", OPCODES));
    sim.store(1024, 0);

    sim.of = true;

    sim.run();

    expect(sim.acc).toBe(1);
    expect(sim.of).toBe(false);
  });

  it("rotates right through OF without existing OF", () => {
    const sim = new Simulator();
    sim.loadProgram(OPCODES, assemble("load [1024]\nror\nhalt", OPCODES));
    sim.store(1024, 1);
    sim.of = false;

    sim.run();

    expect(sim.acc).toBe(0);
    expect(sim.of).toBe(true);
  });

  it("rotates right through OF with existing OF", () => {
    const sim = new Simulator();
    sim.loadProgram(OPCODES, assemble("load [1024]\nror\nhalt", OPCODES));
    sim.store(1024, 0);
    sim.of = true;

    sim.run();

    expect(sim.acc).toBe(-2147483648);
    expect(sim.of).toBe(false);
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

function data(sim: Simulator, chunks: DataChunk[]): void {
  for (const [address, value] of walkChunks(chunks, sim.memory.length)) {
    sim.store(address, value);
  }
}

function checkMemory(memory: Uint32Array, chunks: DataChunk[]): void {
  for (const [address, value] of walkChunks(chunks, memory.length)) {
    expect(memory[address], `memory[${address}]`).toBe(value);
  }
}

function program(lines: string[], opcodes: OpcodeTable = OPCODES): number[] {
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

describe("simulator time travel", () => {
  it("restores a modified memory cell", () => {
    expect.assertions(2);
    const sim = new Simulator();
    sim.mar = 500;
    sim.mbr = 7;
    sim.store(500, 42);
    UOPS.writeMem(sim);
    expect(sim.memory[500]).toBe(7);
    sim.restore();
    expect(sim.memory[500]).toBe(42);
  });

  it("restores flags saved as a packed SR value", () => {
    expect.assertions(5);
    const sim = new Simulator();
    sim.cf = true;
    sim.sf = true;
    UOPS.setOf(sim);
    expect(sim.of).toBe(true);
    sim.restore();
    expect(sim.of).toBe(false);
    expect(sim.cf).toBe(true);
    expect(sim.sf).toBe(true);
    expect(sim.zf).toBe(false);
  });

  it("restores acc through the srToAcc flag format", () => {
    expect.assertions(2);
    const sim = new Simulator();
    sim.cf = true;
    sim.of = true;
    sim.sf = true;
    sim.zf = true;
    sim.acc = 123;
    UOPS.srToAcc(sim);
    expect(sim.acc).toBe(0b1111);
    sim.restore();
    expect(sim.acc).toBe(123);
  });

  it("restores the initial state by undoing a full instruction", () => {
    expect.assertions(11);
    const sim = new Simulator();
    sim.loadProgram(OPCODES, assemble("ADD 5\nHALT", OPCODES));
    sim.step();
    expect(sim.acc).toBe(5);
    expect(sim.pc).toBe(1);
    while (sim.historyCountsIdx > 0 || sim.prevHistoryCounts.length > 0) {
      sim.restore();
    }
    expect(sim.acc).toBe(0);
    expect(sim.pc).toBe(0);
    expect(sim.mar).toBe(0);
    expect(sim.mbr).toBe(0);
    expect(sim.ir).toBe(0);
    expect(sim.cf).toBe(false);
    expect(sim.zf).toBe(false);
    expect(sim.sf).toBe(false);
    expect(sim.of).toBe(false);
  });

  it("rotates history arrays into prevHistory on overflow", () => {
    expect.assertions(6);
    const sim = new Simulator();
    const len = sim.historyFields.length;
    for (let i = 0; i < len + 1; i++) {
      sim.save(Field.ACC, i);
      sim.saveCount(1);
    }
    sim.acc = 999;
    expect(sim.prevHistoryFields).toHaveLength(1);
    expect(sim.prevHistoryValues).toHaveLength(1);
    expect(sim.prevHistoryCounts).toHaveLength(1);
    for (let i = 0; i < len + 1; i++) {
      sim.restore();
    }
    expect(sim.acc).toBe(0);
    expect(sim.prevHistoryFields).toHaveLength(0);
    expect(sim.historyFieldsIdx).toBe(0);
  });

  it("throws when restoring with no history", () => {
    expect.assertions(1);
    expect(() => new Simulator().restore()).toThrow();
  });
});

describe("simulator golden tests", () => {
  it("runs 2024_vzor_priklad_RegSim_pohyb_po_sachovnici.regs", () => {
    const sim = new Simulator();
    sim.dataMemoryStart = 300;
    sim.loadProgram(
      OPCODES,
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

    data(sim, ["@skipto 300", 3, 3, 305, "@skipto 305", [1, 3], [2, 3], [3, 5], [4, 5], 0]);

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
      OPCODES,
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

    data(sim, [
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
    const opcodes = createOpcodeTable([
      ...BUILTIN_OPCODES,
      {
        name: "SET",
        uops: {
          immediate: ["irToMbr", "mbrToAcc"],
        },
      },
    ]);

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

    data(sim, [
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
      OPCODES,
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

    data(sim, ["@skipto 300", 1, 5, 0, 305, "@skipto 305", 1, 0]);

    sim.run();

    checkMemory(sim.memory, ["@skipto 300", 5, 1, 2, 306, "@skipto 305", 1, 0]);

    expect(sim.halted).toBe(true);
    expect(sim.cf).toBe(true);
    expect(sim.pc).toBe(27);
    expect(sim.acc).toBe(2);
    expect(sim.mar).toBe(26);
    expect(sim.mbr).toBe(3);
  });

  it("runs zadanie4_k with multiple custom instructions", () => {
    const opcodes = createOpcodeTable([
      ...BUILTIN_OPCODES,
      {
        name: "INCR",
        uops: {
          direct: [
            "irToMbr",
            "mbrToMar",
            "readMem",
            "mbrToAcc",
            "incrementAcc",
            "incrementAcc",
            "accToMbr",
            "writeMem",
          ],
        },
      },
      {
        name: "PENS",
        uops: {
          indirect: [
            "irToMbr",
            "mbrToMar",
            "readMem",
            "mbrToMar",
            "readMem",
            "mbrToAcc",
            "incrementAcc",
            "writeMem",
          ],
        },
      },
      {
        name: "RER",
        uops: {
          indirect: [
            "irToMbr",
            "mbrToMar",
            "readMem",
            "mbrToMar",
            "readMem",
            "mbrToAcc",
            "incrementAcc",
            "writeMem",
            "irToMbr",
            "mbrToMar",
            "readMem",
            "mbrToMar",
            "mbrToAcc",
          ],
        },
      },
      {
        name: "PAGI",
        uops: {
          direct: [
            "irToMbr",
            "mbrToMar",
            "readMem",
            "mbrToAcc",
            "rshiftAccOf",
            "rshiftAccOf",
            "accToMbr",
            "writeMem",
          ],
        },
      },
      {
        name: "SET",
        uops: {
          direct: ["irToMbr", "mbrToMar", "readMem", "clearSr", "srToAcc", "accToMbr", "writeMem"],
        },
      },
      {
        name: "PIES",
        uops: {
          direct: [
            "irToMbr",
            "mbrToMar",
            "readMem",
            "mbrToAcc",
            "incrementAcc",
            "clearSr",
            "srToAcc",
            "rshiftAcc",
            "rshiftAcc",
            "rshiftAcc",
          ],
        },
      },
      {
        name: "KKS",
        uops: {
          direct: [
            "irToMbr",
            "mbrToMar",
            "readMem",
            "mbrToAcc",
            "lshiftAcc",
            "lshiftAcc",
            "lshiftAcc",
            "lshiftAcc",
            "lshiftAcc",
            "lshiftAcc",
            "lshiftAcc",
            "writeMem",
          ],
        },
      },
      {
        name: "INCJM",
        uops: {
          direct: [
            "irToMbr",
            "mbrToMar",
            "readMem",
            "mbrToAcc",
            "incrementAcc",
            "irToMbr",
            "mbrToMar",
            "accToMbr",
            "writeMem",
            "clearSr",
            "srToAcc",
            "setSf",
            "setOf",
            "setCf",
            "srToAcc",
            "lshiftAcc",
            "accToMbr",
            "mbrToPc",
          ],
        },
      },
      {
        name: "DECJM",
        uops: {
          direct: [
            "irToMbr",
            "mbrToMar",
            "readMem",
            "mbrToAcc",
            "decrementAcc",
            "irToMbr",
            "mbrToMar",
            "accToMbr",
            "writeMem",
            "clearSr",
            "srToAcc",
            "setCf",
            "setOf",
            "setSf",
            "srToAcc",
            "lshiftAcc",
            "accToMbr",
            "mbrToPc",
          ],
        },
      },
      {
        name: "JMPST",
        uops: {
          direct: [
            "irToMbr",
            "mbrToMar",
            "readMem",
            "mbrToAcc",
            "incrementAcc",
            "irToMbr",
            "mbrToMar",
            "accToMbr",
            "writeMem",
            "clearSr",
            "srToAcc",
            "accToMbr",
            "mbrToPc",
          ],
        },
      },
    ]);

    const sim = new Simulator();
    sim.dataMemoryStart = 300;
    sim.loadProgram(
      opcodes,
      program(
        [
          "LOAD [mem 303]",
          "CMP 11",
          "JC 16",
          "CMP 12",
          "JC 19",
          "CMP 15",
          "JC 32",
          "CMP 21",
          "JC 22",
          "CMP 22",
          "JC 25",
          "CMP 25",
          "JC 34",
          "JZ 58",
          "JMP 28",
          "",
          "DECJM [300]",
          "",
          "",
          "INCJM [300]",
          "",
          "",
          "DECJM [301]",
          "",
          "",
          "INCJM [301]",
          "",
          "",
          "JMPST [303]",
          "",
          "",
          "",
          "INC [302]",
          "JMP 40",
          "INCR [302]",
          "JMP 40",
          "",
          "SET [302]",
          "JMP 28",
          "",
          "LOAD [301]",
          "CMP [300]",
          "JC 45",
          "JMP 37",
          "",
          "LOAD [mem 400]",
          "JZ 58",
          "CMP [301]",
          "JC 52",
          "INC [400]",
          "JMP 45",
          "",
          "SET [400]",
          "ADD 401",
          "STORE [400]",
          "JMP 37",
          "",
          "",
          "HALT",
        ],
        opcodes,
      ),
    );

    data(sim, [
      "@skipto 300",
      3,
      3,
      0,
      305,
      "@skipto 305",
      [11, 2],
      22,
      25,
      15,
      12,
      22,
      15,
      0,
      "@skipto 400",
      401,
      2,
      4,
      0,
    ]);

    try {
      sim.run();
    } catch {
      sim.showHistory(100000);
    }

    expect(sim.halted).toBe(true);
    expect(sim.pc).toBe(59);
    expect(sim.acc).toBe(0);
    expect(sim.mar).toBe(58);
    expect(sim.mbr).toBe(3);

    checkMemory(sim.memory, ["@skipto 300", 2, 5, 0, 313, "@skipto 400", 401, 2, 4, 0]);
  });
});

describe("showHistory", () => {
  it("prints a full run's changes oldest first, one uop per line", () => {
    expect.assertions(3);
    const sim = new Simulator();
    sim.loadProgram(OPCODES, assemble("ADD [1024]\nHALT", OPCODES));
    sim.store(1024, 42);
    sim.run();

    const lines = sim.showHistory(99);
    expect(lines).toEqual([
      "MAR=0", // pcToMar
      "MBR=0", // readMem
      "IR=ADD 0", // mbrToIr
      "PC=0", // incrementPc
      "-", // decode
      "MBR=262208", // irToMbr
      "MAR=0", // mbrToMar
      "MBR=1024", // readMem (old MBR = sign-extended operand)
      "ACC=0 C=0 O=0 N=0 Z=0", // mAdd
      "MAR=1024", // pcToMar
      "MBR=42", // readMem
      "IR=ADD [1024]", // mbrToIr
      "PC=1", // incrementPc
      "-", // decode
      "-", // halt
    ]);
    expect(sim.showHistory(3)).toEqual(["PC=1", "-", "-"]);
    expect(sim.showHistory(1)).toEqual(["-"]);
  });

  it("formats flag changes and memory writes", () => {
    expect.assertions(3);
    const sim = new Simulator();
    sim.loadProgram(OPCODES, assemble("STORE [1024]\nHALT", OPCODES));
    sim.store(1024, 31415);
    sim.run();

    const lines = sim.showHistory(15);
    expect(lines).toEqual([
      "MAR=0",
      "MBR=0",
      "IR=ADD 0",
      "PC=0",
      "-",
      "MBR=262209", // irToMbr
      "MAR=0", // mbrToMar
      "MBR=1024", // accToMbr (old MBR = sign-extended operand)
      "mem[1024]=31415", // writeMem
      "MAR=1024",
      "MBR=0", // readMem (old MBR = acc = 0)
      "IR=STORE [1024]",
      "PC=1",
      "-",
      "-",
    ]);
    const srIndex = lines.indexOf("mem[1024]=31415");
    expect(srIndex).toBe(8);
    expect(lines).not.toContain("SR=");
  });

  it("decodes IR changes into normal assembler syntax", () => {
    expect.assertions(6);
    const word = (opcode: number, operand: number, addressMode: AddressMode): number =>
      encodeInstruction({ opcode, operand, addressMode });
    expect(formatInstruction(word(0, 4, AddressMode.Immediate), OPCODES)).toBe("ADD 4");
    expect(formatInstruction(word(2, 302, AddressMode.Direct), OPCODES)).toBe("LOAD [302]");
    expect(formatInstruction(word(2, 302, AddressMode.Indirect), OPCODES)).toBe("LOAD [mem 302]");
    expect(formatInstruction(word(3, 0, AddressMode.Immediate), OPCODES)).toBe("HALT");
    // A zero operand still prints for non-zero-argument instructions.
    expect(formatInstruction(0, OPCODES)).toBe("ADD 0");
    // The assembler encodes negative operands in two's complement.
    expect(formatInstruction(word(0, 0xffffff, AddressMode.Immediate), OPCODES)).toBe("ADD -1");
  });
});
