import { describe, expect, it } from "vitest";
import { AddressMode, decodeInstruction, encodeInstruction, type Instruction } from "./encoding";

describe("encoding", () => {
  it("decodes immediate ADD", () => {
    let encoded = 0b00000000_00000000_01000011_00_000000;

    expect(decodeInstruction(encoded)).toEqual({
      opcode: 0,
      operand: 67,
      addressMode: AddressMode.Immediate,
    } satisfies Instruction);
  });

  it("encodes immediate SUB", () => {
    let ins: Instruction = {
      opcode: 0b100,
      operand: 42,
      addressMode: AddressMode.Immediate,
    };
    expect(encodeInstruction(ins)).toEqual(0b00000000_00000000_00101010_00_000100);
  });

  it("decodes direct LOAD", () => {
    let encoded = 0b00000000_00000100_00011100_01_000010;

    expect(decodeInstruction(encoded)).toEqual({
      opcode: 0b10,
      operand: 1052,
      addressMode: AddressMode.Direct,
    } satisfies Instruction);
  });

  it("round trips an instruction", () => {
    let ins: Instruction = {
      opcode: 0x1f,
      operand: 0xdeadf0,
      addressMode: AddressMode.Immediate,
    };

    expect(decodeInstruction(encodeInstruction(ins))).toEqual(ins);
  });

  it("rejects a number over 32 bits", () => {
    let ins = 0x1_0000_0000;
    expect(() => decodeInstruction(ins)).toThrow(RangeError);
  });

  it("rejects out of range opcode", () => {
    let ins: Instruction = {
      opcode: 0x40,
      operand: 0,
      addressMode: AddressMode.Immediate,
    };
    expect(() => encodeInstruction(ins)).toThrow(RangeError);
  });

  it("rejects out of range operand", () => {
    let ins: Instruction = {
      opcode: 0x01,
      operand: 0x1_0000_0000,
      addressMode: AddressMode.Immediate,
    };
    expect(() => encodeInstruction(ins)).toThrow(RangeError);
  });

  it("rejects invalid address mode", () => {
    let ins: Instruction = {
      opcode: 0,
      operand: 0,
      addressMode: 3 as AddressMode,
    };
    expect(() => encodeInstruction(ins)).toThrow(RangeError);
  });
});
