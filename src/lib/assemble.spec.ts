import { describe, expect, it } from "vitest";
import { assemble } from "./assemble";
import { AddressMode, decodeInstruction, type Instruction } from "./encoding";
import { BUILTIN_OPCODES } from "./opcodes";
import { Simulator } from "./simulator";

/** Assembles a single instruction and decodes it back. */
function assembleOne(source: string): Instruction {
  const words = assemble(source, BUILTIN_OPCODES);
  expect(words).toHaveLength(1);
  return decodeInstruction(words[0]);
}

describe("assemble", () => {
  it("encodes a bare number as immediate", () => {
    expect.assertions(2);
    expect(assembleOne("add 5")).toEqual({
      opcode: 0,
      operand: 5,
      addressMode: AddressMode.Immediate,
    } satisfies Instruction);
  });

  it("encodes immediate zero", () => {
    expect.assertions(2);
    expect(assembleOne("add 0")).toEqual({
      opcode: 0,
      operand: 0,
      addressMode: AddressMode.Immediate,
    } satisfies Instruction);
  });

  it("accepts the full 24-bit operand range", () => {
    expect.assertions(2);
    expect(assembleOne("add 16777215").operand).toBe(0xffffff);
  });

  it("encodes [x] as direct", () => {
    expect.assertions(2);
    expect(assembleOne("load [1024]")).toEqual({
      opcode: 2,
      operand: 1024,
      addressMode: AddressMode.Direct,
    } satisfies Instruction);
  });

  it("allows whitespace inside direct brackets", () => {
    expect.assertions(2);
    expect(assembleOne("load [ 1024 ]")).toEqual({
      opcode: 2,
      operand: 1024,
      addressMode: AddressMode.Direct,
    } satisfies Instruction);
  });

  it("encodes [mem x] as indirect", () => {
    expect.assertions(2);
    expect(assembleOne("store [mem 1025]")).toEqual({
      opcode: 1,
      operand: 1025,
      addressMode: AddressMode.Indirect,
    } satisfies Instruction);
  });

  it("encodes [memx] without a space", () => {
    expect.assertions(2);
    expect(assembleOne("load [mem302]")).toEqual({
      opcode: 2,
      operand: 302,
      addressMode: AddressMode.Indirect,
    } satisfies Instruction);
  });

  it("encodes [ mem 302 ] with extra whitespace", () => {
    expect.assertions(2);
    expect(assembleOne("load [ mem 302 ]")).toEqual({
      opcode: 2,
      operand: 302,
      addressMode: AddressMode.Indirect,
    } satisfies Instruction);
  });

  it("accepts uppercase MEM", () => {
    expect.assertions(2);
    expect(assembleOne("load [MEM 302]")).toEqual({
      opcode: 2,
      operand: 302,
      addressMode: AddressMode.Indirect,
    } satisfies Instruction);
  });

  it("encodes zero-argument instructions without an operand", () => {
    expect.assertions(2);
    expect(assembleOne("halt")).toEqual({
      opcode: 3,
      operand: 0,
      addressMode: AddressMode.Immediate,
    } satisfies Instruction);
  });

  it("accepts any mnemonic casing", () => {
    expect.assertions(2);
    expect(assembleOne("HaLt")).toEqual({
      opcode: 3,
      operand: 0,
      addressMode: AddressMode.Immediate,
    } satisfies Instruction);
  });

  it("assembles a multi-line program and skips blank lines", () => {
    expect.assertions(1);
    expect(assemble("\nadd 5\n\n   \nhalt\n", BUILTIN_OPCODES).map(decodeInstruction)).toEqual([
      { opcode: 0, operand: 5, addressMode: AddressMode.Immediate },
      { opcode: 3, operand: 0, addressMode: AddressMode.Immediate },
    ] satisfies Instruction[]);
  });

  it("strips full-line and trailing comments", () => {
    expect.assertions(1);
    expect(
      assemble("# a comment\nadd 5 # trailing comment\nhalt", BUILTIN_OPCODES).map(
        decodeInstruction,
      ),
    ).toEqual([
      { opcode: 0, operand: 5, addressMode: AddressMode.Immediate },
      { opcode: 3, operand: 0, addressMode: AddressMode.Immediate },
    ] satisfies Instruction[]);
  });

  it("rejects an unknown mnemonic", () => {
    expect.assertions(1);
    expect(() => assemble("frobnicate 5", BUILTIN_OPCODES)).toThrow(
      'Line 1: unknown mnemonic "frobnicate"',
    );
  });

  it("rejects a missing operand", () => {
    expect.assertions(2);
    expect(() => assemble("add", BUILTIN_OPCODES)).toThrow("Line 1: ADD needs an operand");
    expect(() => assemble("load", BUILTIN_OPCODES)).toThrow("Line 1: LOAD needs an operand");
  });

  it("rejects malformed bracket operands", () => {
    expect.assertions(3);
    expect(() => assemble("load [mem]", BUILTIN_OPCODES)).toThrow(
      'Line 1: malformed operand "[mem]"',
    );
    expect(() => assemble("load [mem abc]", BUILTIN_OPCODES)).toThrow(
      'Line 1: malformed operand "[mem abc]"',
    );
    expect(() => assemble("load [x]", BUILTIN_OPCODES)).toThrow('Line 1: malformed operand "[x]"');
  });

  it("rejects non-integer operands", () => {
    expect.assertions(2);
    expect(() => assemble("add -1", BUILTIN_OPCODES)).toThrow(
      "Line 1: operand must be an integer 0..16777215",
    );
    expect(() => assemble("add 1.5", BUILTIN_OPCODES)).toThrow(
      "Line 1: operand must be an integer 0..16777215",
    );
  });

  it("rejects operands over 24 bits", () => {
    expect.assertions(1);
    expect(() => assemble("add 16777216", BUILTIN_OPCODES)).toThrow(
      "Line 1: operand must be an integer 0..16777215",
    );
  });

  it("reports the line number of the offending line", () => {
    expect.assertions(1);
    expect(() => assemble("add 5\nload [x]", BUILTIN_OPCODES)).toThrow("Line 2: malformed operand");
  });

  it("rejects an address mode the instruction does not support", () => {
    expect.assertions(4);
    expect(() => assemble("store 1025", BUILTIN_OPCODES)).toThrow(
      "Line 1: STORE does not support the immediate address mode (supported: direct, indirect)",
    );
    expect(() => assemble("jmp [5]", BUILTIN_OPCODES)).toThrow(
      "Line 1: JMP does not support the direct address mode (supported: immediate)",
    );
    expect(() => assemble("shl [mem 5]", BUILTIN_OPCODES)).toThrow(
      "Line 1: SHL does not support the indirect address mode (supported: immediate)",
    );
    // zero-argument instructions only accept the operand-less immediate form
    expect(() => assemble("halt [5]", BUILTIN_OPCODES)).toThrow(
      "Line 1: HALT does not support the direct address mode (supported: immediate)",
    );
  });

  it("reports the line number of an unsupported address mode", () => {
    expect.assertions(1);
    expect(() => assemble("add 5\nstore 6", BUILTIN_OPCODES)).toThrow(
      "Line 2: STORE does not support the immediate address mode",
    );
  });

  it("loadProgram stores ACC through the pointer given by [mem x]", () => {
    expect.assertions(3);
    const sim = new Simulator();
    sim.loadProgram(BUILTIN_OPCODES, assemble("add 7\nstore [mem 1025]\nhalt", BUILTIN_OPCODES));
    sim.memory[1025] = 1026; // pointer cell: mem[1025] holds the target address

    sim.run();

    expect(sim.halted).toBe(true);
    expect(sim.memory[1026]).toBe(7); // stored through the pointer, not at 1025
    expect(sim.memory[1025]).toBe(1026); // pointer cell itself untouched
  });
});
