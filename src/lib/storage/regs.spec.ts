import testFile from "#lib/data/milionplus.regs?raw";
import crlfTestFile from "#lib/data/milionplus-crlf.regs?raw";
import { describe, expect, it } from "vitest";
import { RegsSerializer } from "./regs";

const testCode = [
  "load [1026]",
  "cmp 100",
  "jc 13",
  "load [1024]",
  "store [1025]",
  "inc [1026]",
  "load [1025]",
  "cmp 1000",
  "jc 0",
  "inc [1027]",
  "inc [1025]",
  "jmp 6",
  "jmp 0",
  "halt",
];

describe("RegSim import", () => {
  it("loads milionplus.regs properly", () => {
    const result = RegsSerializer.import(testFile);

    expect(result.dataMemoryStart).toBe(1024);
    expect(result.memory).toEqual([
      [1024, 0],
      [1025, 0],
      [1026, 0],
      [1027, 0],
    ]);
    expect(result.source).toEqual(testCode);
    expect(result.customInstructions.length).toBe(0);
  });

  it("accepts file with CRLF line endings", () => {
    const result = RegsSerializer.import(crlfTestFile);

    expect(result.dataMemoryStart).toBe(1024);
    expect(result.memory).toEqual([
      [1024, 0],
      [1025, 0],
      [1026, 0],
      [1027, 0],
    ]);
    expect(result.source).toEqual(testCode);
    expect(result.customInstructions.length).toBe(0);
  });
});

describe("RegSim export", () => {
  it("stores milionplus.regs identical to original", () => {
    const result = RegsSerializer.export({
      source: testCode,
      memory: [
        [1024, 0],
        [1025, 0],
        [1026, 0],
        [1027, 0],
      ],
      dataMemoryStart: 1024,
      customInstructions: [],
    });

    expect(result).toEqual(testFile);
  });
});
