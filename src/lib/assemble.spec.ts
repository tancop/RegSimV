import { describe, expect, it } from "vitest";
import { assemble, type AssembleError, AssembleErrorType, forceAssemble } from "./assemble";
import { AddressMode, decodeInstruction, encodeInstruction, type Instruction } from "./encoding";
import { BUILTIN_OPCODES, createOpcodeTable } from "./opcodes";
import { Simulator } from "./simulator";

const OPCODES = createOpcodeTable(BUILTIN_OPCODES);

/** Assembles a single instruction and decodes it back. */
function assembleOne(source: string): Instruction {
  const result = forceAssemble(source, OPCODES, {});

  expect(result).toHaveLength(1);
  return decodeInstruction(result[0]!);
}

/** Assembles source and returns the thrown AssembleErrors (fails the test otherwise). */
function assembleErrors(source: string): AssembleError[] {
  const result = assemble(source, OPCODES, {});

  if ("code" in result) {
    throw new Error(`expected assemble(${JSON.stringify(source)}) to return errors`);
  }

  return result.errors;
}

describe("assemble", () => {
  it("encodes a bare number as immediate", () => {
    expect(assembleOne("add 5")).toEqual({
      opcode: 0,
      operand: 5,
      addressMode: AddressMode.Immediate,
    } satisfies Instruction);
  });

  it("encodes immediate zero", () => {
    expect(assembleOne("add 0")).toEqual({
      opcode: 0,
      operand: 0,
      addressMode: AddressMode.Immediate,
    } satisfies Instruction);
  });

  it("accepts the full signed 24-bit operand range", () => {
    expect(assembleOne("add 8388607").operand).toBe(0x7fffff);
    expect(assembleOne("add -8388608").operand).toBe(0x800000);
  });

  it("encodes [x] as direct", () => {
    expect(assembleOne("load [1024]")).toEqual({
      opcode: 2,
      operand: 1024,
      addressMode: AddressMode.Direct,
    } satisfies Instruction);
  });

  it("allows whitespace inside direct brackets", () => {
    expect(assembleOne("load [ 1024 ]")).toEqual({
      opcode: 2,
      operand: 1024,
      addressMode: AddressMode.Direct,
    } satisfies Instruction);
  });

  it("encodes [mem x] as indirect", () => {
    expect(assembleOne("store [mem 1025]")).toEqual({
      opcode: 1,
      operand: 1025,
      addressMode: AddressMode.Indirect,
    } satisfies Instruction);
  });

  it("rejects [memx] without a space", () => {
    // "mem302" is a valid label name but not defined in the program
    expect(assembleErrors("load [mem302]")[0].type).toEqual(AssembleErrorType.UndefinedLabel);
  });

  it("encodes [ mem 302 ] with extra whitespace", () => {
    expect(assembleOne("load [ mem 302 ]")).toEqual({
      opcode: 2,
      operand: 302,
      addressMode: AddressMode.Indirect,
    } satisfies Instruction);
  });

  it("accepts uppercase MEM", () => {
    expect(assembleOne("load [MEM 302]")).toEqual({
      opcode: 2,
      operand: 302,
      addressMode: AddressMode.Indirect,
    } satisfies Instruction);
  });

  it("encodes zero-argument instructions without an operand", () => {
    expect(assembleOne("halt")).toEqual({
      opcode: 3,
      operand: 0,
      addressMode: AddressMode.Immediate,
    } satisfies Instruction);
  });

  it("accepts any mnemonic casing", () => {
    expect(assembleOne("HaLt")).toEqual({
      opcode: 3,
      operand: 0,
      addressMode: AddressMode.Immediate,
    } satisfies Instruction);
  });

  it("assembles a multi-line program, reserving blank lines as uninitialized words", () => {
    expect(forceAssemble("\nadd 5\n\n   \nhalt\n", OPCODES)).toEqual([
      undefined,
      encodeInstruction({ opcode: 0, operand: 5, addressMode: AddressMode.Immediate }),
      undefined,
      undefined,
      encodeInstruction({ opcode: 3, operand: 0, addressMode: AddressMode.Immediate }),
    ]);
  });

  it("leaves blank space for comment-only lines", () => {
    expect(forceAssemble("add 5\n# comment\n   # another\nhalt", OPCODES)).toHaveLength(4);
  });

  it("labels point at the next emitted word across blank lines", () => {
    const words = forceAssemble("jmp start\n\nstart: add 1\nhalt", OPCODES, {});
    expect(decodeInstruction(words[0] as number)).toEqual({
      opcode: 12,
      operand: 2,
      addressMode: AddressMode.Immediate,
    } satisfies Instruction);
  });

  it("strips trailing comments", () => {
    expect(
      forceAssemble("# a comment\nadd 5 # trailing comment\nhalt", OPCODES, {}).map((i) =>
        i ? decodeInstruction(i) : undefined,
      ),
    ).toEqual([
      undefined,
      { opcode: 0, operand: 5, addressMode: AddressMode.Immediate },
      { opcode: 3, operand: 0, addressMode: AddressMode.Immediate },
    ] satisfies (Instruction | undefined)[]);
  });

  it("rejects an unknown mnemonic", () => {
    expect(assembleErrors("frobnicate 5")[0].type).toBe(AssembleErrorType.UnknownMnemonic);
  });

  it("rejects a missing operand", () => {
    expect(assembleErrors("add")[0].type).toBe(AssembleErrorType.MissingOperand);
    expect(assembleErrors("load")[0].type).toBe(AssembleErrorType.MissingOperand);
  });

  it("rejects malformed indirect operand", () => {
    expect(assembleErrors("load [mem]")[0].type).toBe(AssembleErrorType.MalformedOperand);
  });

  it("rejects non-integer operands", () => {
    expect(assembleErrors("add 1.5")[0].type).toBe(AssembleErrorType.MalformedOperand);
  });

  it("encodes negative integer operands as two's complement", () => {
    expect(() => assemble("add -1", OPCODES, {})).not.toThrow();
    expect(assembleOne("add -1").operand).toBe(0xffffff);
    expect(assembleOne("load [-1]").addressMode).toBe(AddressMode.Direct);
  });

  it("rejects operands over 24 bits", () => {
    expect(assembleErrors("add 8388608")[0].type).toBe(AssembleErrorType.OperandOutOfRange);
    expect(assembleErrors("add -8388609")[0].type).toBe(AssembleErrorType.OperandOutOfRange);
  });

  it("reports the line number of the offending line", () => {
    const error = assembleErrors("add 5\nload [x]");
    expect(error[0].type).toBe(AssembleErrorType.UndefinedLabel);
    expect(error[0].lineNum).toBe(1);
  });

  it("rejects an address mode the instruction does not support", () => {
    expect(assembleErrors("store 1025")[0].type).toBe(AssembleErrorType.UnsupportedAddressMode);
    expect(assembleErrors("jmp [5]")[0].type).toBe(AssembleErrorType.UnsupportedAddressMode);
    expect(assembleErrors("shl [mem 5]")[0].type).toBe(AssembleErrorType.UnsupportedAddressMode);
    // zero-argument instructions only accept the operand-less immediate form
    expect(assembleErrors("halt [5]")[0].type).toBe(AssembleErrorType.UnsupportedAddressMode);
  });

  it("reports the line number of an unsupported address mode", () => {
    const errors = assembleErrors("add 5\nstore 6");
    expect(errors[0].type).toBe(AssembleErrorType.UnsupportedAddressMode);
    expect(errors[0].lineNum).toBe(1);
  });

  it("loadProgram stores ACC through the pointer given by [mem x]", () => {
    const sim = new Simulator();
    sim.loadProgram(OPCODES, forceAssemble("add 7\nstore [mem 1025]\nhalt", OPCODES, {}));
    sim.store(1025, 1026); // pointer cell: mem[1025] holds the target address
    expect(sim.initBoundaries).toEqual([2, 1024, 1025]); // program 0-2, pointer cell 1025

    sim.run();

    expect(sim.halted).toBe(true);
    expect(sim.memory[1026]).toBe(7); // stored through the pointer, not at 1025
    expect(sim.memory[1025]).toBe(1026); // pointer cell itself untouched
  });

  it("rejects label starting with number", () => {
    expect(assembleErrors("6ix9ine: nop")[0].type).toBe(AssembleErrorType.MalformedLabel);
  });

  it("accepts label including number", () => {
    expect(() => assemble("agent47: nop", OPCODES, {})).not.toThrow();
  });

  it("rejects double label", () => {
    expect(assembleErrors("first: second: nop")[0].type).toBe(AssembleErrorType.TooManyColons);
  });

  it("assembles program with jump to label correctly", () => {
    const sim = new Simulator();

    sim.loadProgram(
      OPCODES,
      forceAssemble(
        "start: load [1024]\ncmp 5\njc end\ninc [1024]\ninc [1025]\njmp start\nend: halt",
        OPCODES,
      ),
    );

    sim.store(1024, 0); // INC reads before writing, so pre-initialize both.
    sim.store(1025, 0);

    sim.run();

    expect(sim.halted).toBe(true);
    expect(sim.memory[1025]).toBe(5);
  });

  it("rejects jump to unknown label", () => {
    expect(assembleErrors("jmp test")[0].type).toBe(AssembleErrorType.UndefinedLabel);
  });

  it("rejects broken operand with trailing bracket as malformed", () => {
    expect(assembleErrors("load 1024]")[0].type).toBe(AssembleErrorType.MalformedOperand);
  });

  it("rejects label reference with square brackets", () => {
    expect(assembleErrors("jmp bad[1024]")[0].type).toBe(AssembleErrorType.MalformedOperand);
  });

  it("rejects label definition with square brackets", () => {
    expect(assembleErrors("bad[1]: add 67")[0].type).toBe(AssembleErrorType.MalformedLabel);
  });
});
