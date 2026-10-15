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
});

function fillMemory(memory: Uint32Array, fields: Record<number, number>): Uint32Array {
  for (const [address, value] of Object.entries(fields)) {
    memory[parseInt(address)] = value;
  }
  return memory;
}

function checkMemory(memory: Uint32Array, fields: Record<number, number>): void {
  for (const [address, value] of Object.entries(fields)) {
    expect(memory[parseInt(address)]).toBe(value);
  }
}

function program(lines: string[]): number[] {
  return assemble(
    lines
      .flatMap((line, idx) => {
        if (line.trim().startsWith("@skipto ")) {
          return Array.from({ length: parseInt(line.slice(8)) - idx }, () => "NOP");
        }
        return [line];
      })
      .join("\n"),
    BUILTIN_OPCODES,
  );
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

    const initialMemory = {
      300: 3,
      301: 3,
      302: 305,
      305: 1,
      306: 1,
      307: 1,
      308: 2,
      309: 2,
      310: 2,
      311: 3,
      312: 3,
      313: 3,
      314: 3,
      315: 3,
      316: 4,
      317: 4,
      318: 4,
      319: 4,
      320: 4,
      321: 0,
    };
    fillMemory(sim.memory, initialMemory);

    sim.run();

    const finalMemory = initialMemory;
    finalMemory[300] = 5;
    finalMemory[301] = 1;
    finalMemory[302] = 321;

    checkMemory(sim.memory, finalMemory);

    expect(sim.pc).toBe(10);
    expect(sim.acc).toBe(0);
    expect(sim.mar).toBe(9);
    expect(sim.mbr).toBe(3);
  });
});
