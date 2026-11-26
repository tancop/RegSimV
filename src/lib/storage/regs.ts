import { assemble } from "#lib/assemble.ts";
import { decodeInstruction, printInstruction } from "#lib/encoding.ts";
import { BUILTIN_OPCODES, createOpcodeTable } from "#lib/opcodes.ts";
import { MEMORY_SIZE } from "#lib/simulator.ts";
import type { SavedProgram } from "./savedProgram";
import type { Serializer } from "./serializer";

function parseInt(s: string, radix: number = 10): number {
  const res = Number.parseInt(s.trim(), radix);
  if (!Number.isInteger(res)) {
    throw new TypeError(`"${s}" is not an integer`);
  }
  return res;
}

function parseBool(s: string): boolean {
  switch (s.trim().toLowerCase()) {
    case "true":
      return true;
    case "false":
      return false;
    default:
      throw new TypeError(`"${s}" is not a boolean`);
  }
}

function* every<T>(count: number, arr: T[]): Generator<T[], void, void> {
  if (arr.length % count != 0) throw new Error(`Array must have length divisible by ${count}`);

  for (let i = 0; i < arr.length; i += count) {
    let res = [];
    for (let j = 0; j < count; j++) {
      res.push(arr[i + j]);
    }
    yield res;
  }
}

export const RegsSerializer = {
  import: function (saved: string): SavedProgram {
    // remove final "YYYYYYYYYY"
    const [first, ...lines] = saved.trimEnd().split("\n").slice(0, -1);
    const dataMemoryStart = parseInt(first);

    if (dataMemoryStart > MEMORY_SIZE) {
      throw new RangeError(`Data memory cannot start at ${dataMemoryStart}`);
    }

    let source = [] as string[];
    let memory = [] as [number, number][];

    // TODO support loading instructions from file
    const opcodes = createOpcodeTable(BUILTIN_OPCODES);

    let idx = 0;
    let emptyLines = 0;

    for (const [a, b, c] of every(3, lines)) {
      const code = parseInt(a);
      const isInit = parseBool(b);
      const _isBreakpoint = parseBool(c);

      if (idx < dataMemoryStart) {
        if (isInit) {
          if (emptyLines > 0) {
            for (let i = 0; i < emptyLines; i++) source.push("");
            emptyLines = 0;
          }

          const ins = decodeInstruction(code);
          source.push(printInstruction(ins, opcodes, true));
        } else {
          emptyLines++;
        }
      } else if (isInit) {
        memory.push([idx, code]);
      }

      idx++;
    }

    return {
      source,
      memory,
      dataMemoryStart,
      customInstructions: [],
    };
  },

  export: function (program: SavedProgram): string {
    let result = program.dataMemoryStart.toString() + "\r\n";

    const opcodes = createOpcodeTable(BUILTIN_OPCODES.concat(program.customInstructions));
    const assembled = assemble(program.source, opcodes, {});

    if ("errors" in assembled) throw new Error("Failed to assemble code for export");

    const codeEnd = Math.min(program.dataMemoryStart, program.source.length);

    // Assemble code
    for (let i = 0; i < codeEnd; i++) {
      const ins = assembled.code[i];

      if (ins === undefined) {
        result += `0\r\nfalse\r\nfalse\r\n`;
      } else {
        result += `${ins}\r\ntrue\r\nfalse\r\n`;
      }
    }

    // Fill empty space after code
    for (let i = codeEnd; i < program.dataMemoryStart; i++) {
      result += `0\r\nfalse\r\nfalse\r\n`;
    }

    const data = new Map<number, number>(program.memory);

    // Fill data memory
    for (let i = program.dataMemoryStart; i < MEMORY_SIZE; i++) {
      if (data.has(i)) {
        result += `${data.get(i)!}\r\ntrue\r\nfalse\r\n`;
      } else {
        result += `0\r\nfalse\r\nfalse\r\n`;
      }
    }

    // Terminator
    result += `YYYYYYYYYY\r\n`;

    return result;
  },
} satisfies Serializer;
