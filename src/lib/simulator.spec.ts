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
