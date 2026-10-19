import { describe, expect, it } from "vitest";
import { assemble, AssembleError, AssembleErrorType } from "./assemble";
import { AddressMode, decodeInstruction, type Instruction } from "./encoding";
import { BUILTIN_OPCODES } from "./opcodes";
import { Simulator } from "./simulator";

/** Assembles a single instruction and decodes it back. */
function assembleOne(source: string): Instruction {
  const words = assemble(source, BUILTIN_OPCODES);
  expect(words).toHaveLength(1);
  return decodeInstruction(words[0]);
}

/** Assembles source and returns the thrown AssembleError (fails the test otherwise). */
function assembleError(source: string): AssembleError {
  try {
    assemble(source, BUILTIN_OPCODES);
  } catch (error) {
    if (error instanceof AssembleError) return error;
    throw error; // unexpected error type
  }
  throw new Error(`expected assemble(${JSON.stringify(source)}) to throw an AssembleError`);
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

  it("accepts the full signed 24-bit operand range", () => {
    expect.assertions(4);
    expect(assembleOne("add 8388607").operand).toBe(0x7fffff);
    expect(assembleOne("add -8388608").operand).toBe(0x800000);
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
    expect(assembleError("frobnicate 5").type).toBe(AssembleErrorType.UnknownMnemonic);
  });

  it("rejects a missing operand", () => {
    expect.assertions(2);
    expect(assembleError("add").type).toBe(AssembleErrorType.MissingOperand);
    expect(assembleError("load").type).toBe(AssembleErrorType.MissingOperand);
  });

  it("rejects malformed bracket operands", () => {
    expect.assertions(3);
    expect(assembleError("load [mem]").type).toBe(AssembleErrorType.MalformedOperand);
    expect(assembleError("load [mem abc]").type).toBe(AssembleErrorType.MalformedOperand);
    expect(assembleError("load [x]").type).toBe(AssembleErrorType.MalformedOperand);
  });

  it("rejects non-integer operands", () => {
    expect.assertions(1);
    expect(assembleError("add 1.5").type).toBe(AssembleErrorType.InvalidOperand);
  });

  it("encodes negative integer operands as two's complement", () => {
    expect.assertions(5);
    expect(() => assemble("add -1", BUILTIN_OPCODES)).not.toThrow();
    expect(assembleOne("add -1").operand).toBe(0xffffff);
    expect(assembleOne("load [-1]").addressMode).toBe(AddressMode.Direct);
  });

  it("rejects operands over 24 bits", () => {
    expect.assertions(2);
    expect(assembleError("add 8388608").type).toBe(AssembleErrorType.InvalidOperand);
    expect(assembleError("add -8388609").type).toBe(AssembleErrorType.InvalidOperand);
  });

  it("reports the line number of the offending line", () => {
    expect.assertions(2);
    const error = assembleError("add 5\nload [x]");
    expect(error.type).toBe(AssembleErrorType.MalformedOperand);
    expect(error.line).toBe(2);
  });

  it("rejects an address mode the instruction does not support", () => {
    expect.assertions(4);
    expect(assembleError("store 1025").type).toBe(AssembleErrorType.UnsupportedAddressMode);
    expect(assembleError("jmp [5]").type).toBe(AssembleErrorType.UnsupportedAddressMode);
    expect(assembleError("shl [mem 5]").type).toBe(AssembleErrorType.UnsupportedAddressMode);
    // zero-argument instructions only accept the operand-less immediate form
    expect(assembleError("halt [5]").type).toBe(AssembleErrorType.UnsupportedAddressMode);
  });

  it("reports the line number of an unsupported address mode", () => {
    expect.assertions(2);
    const error = assembleError("add 5\nstore 6");
    expect(error.type).toBe(AssembleErrorType.UnsupportedAddressMode);
    expect(error.line).toBe(2);
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

  it("rejects label starting with number", () => {
    expect.assertions(1);
    expect(assembleError("6ix9ine: nop").type).toBe(AssembleErrorType.InvalidLabel);
  });

  it("accepts label including number", () => {
    expect(() => assemble("agent47: nop", BUILTIN_OPCODES)).not.toThrow();
  });

  it("rejects double label", () => {
    expect.assertions(1);
    expect(assembleError("first: second: nop").type).toBe(AssembleErrorType.TooManyColons);
  });

  it("assembles program with jump to label correctly", () => {
    const sim = new Simulator();

    sim.loadProgram(
      BUILTIN_OPCODES,
      assemble(
        "start: load [1024]\ncmp 5\njc end\ninc [1024]\ninc [1025]\njmp start\nend: halt",
        BUILTIN_OPCODES,
      ),
    );

    sim.run();

    expect(sim.halted).toBe(true);
    expect(sim.memory[1025]).toBe(5);
  });

  it("rejects jump to unknown label", () => {
    expect.assertions(1);
    expect(assembleError("jmp test").type).toBe(AssembleErrorType.InvalidOperand);
  });

  it("rejects broken operand with trailing bracket as malformed", () => {
    expect.assertions(1);
    expect(assembleError("load 1024]").type).toBe(AssembleErrorType.MalformedOperand);
  });
});
