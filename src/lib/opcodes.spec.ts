import { describe, expect, it } from "vitest";
import { BUILTIN_OPCODES, createOpcodeTable, type OpcodeDefinition } from "./opcodes";

describe("opcode table", () => {
  it("assigns opcode numbers in definition order", () => {
    expect.assertions(5);
    const table = createOpcodeTable(BUILTIN_OPCODES);
    expect(table.nameToIndex.ADD).toBe(0);
    expect(table.nameToIndex.STORE).toBe(1);
    expect(table.nameToIndex.LOAD).toBe(2);
    expect(table.nameToIndex.HALT).toBe(3);
    expect(table.indexToName[0]).toBe("ADD");
  });

  it("keeps builtins stable when custom opcodes are appended", () => {
    expect.assertions(BUILTIN_OPCODES.length + 1);
    const table = createOpcodeTable([
      ...BUILTIN_OPCODES,
      { name: "SET", uops: { immediate: ["irToMbr", "mbrToAcc"] } },
    ]);

    for (let i = 0; i < BUILTIN_OPCODES.length; i++) {
      expect(table.nameToIndex[BUILTIN_OPCODES[i].name]).toBe(i);
    }
    expect(table.nameToIndex.SET).toBe(BUILTIN_OPCODES.length);
  });

  it("maps opcode numbers back to uops", () => {
    expect.assertions(BUILTIN_OPCODES.length);
    const table = createOpcodeTable(BUILTIN_OPCODES);

    for (let i = 0; i < BUILTIN_OPCODES.length; i++) {
      expect(table.uops[i]).toBe(BUILTIN_OPCODES[i].uops);
    }
  });

  it("normalizes names to uppercase", () => {
    expect.assertions(2);
    const table = createOpcodeTable([{ name: "set", uops: { immediate: ["mbrToAcc"] } }]);
    expect(table.nameToIndex.SET).toBe(0);
    expect(table.indexToName).toEqual(["SET"]);
  });

  it("rejects duplicate names", () => {
    expect.assertions(1);
    expect(() =>
      createOpcodeTable([
        { name: "ADD", uops: { immediate: ["mAdd"] } },
        { name: "add", uops: { immediate: ["mAdd"] } },
      ]),
    ).toThrow(/Duplicate opcode name: ADD/);
  });

  it("rejects definitions that do not fit in 6 bits", () => {
    expect.assertions(1);
    const definitions: OpcodeDefinition[] = Array.from({ length: 65 }, (_, i) => ({
      name: `OP${i}`,
      uops: { immediate: ["nop"] },
    }));
    expect(() => createOpcodeTable(definitions)).toThrow(RangeError);
  });
});
