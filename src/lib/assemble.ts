import { AddressMode, encodeInstruction } from "./encoding";
import { opcodeNumber, type Operation } from "./opcodes";

/** Address mode -> the `Operation` key holding the uops for that mode. */
const MODE_KEYS = {
  [AddressMode.Immediate]: "immediate",
  [AddressMode.Direct]: "direct",
  [AddressMode.Indirect]: "indirect",
} as const;

type ModeKey = (typeof MODE_KEYS)[keyof typeof MODE_KEYS];

const ALL_MODE_KEYS: ModeKey[] = ["immediate", "direct", "indirect"];

function assertModeSupported(
  op: Operation,
  addressMode: AddressMode,
  mnemonic: string,
  lineNumber: number,
): void {
  const modeKey: ModeKey = MODE_KEYS[addressMode];
  if (op[modeKey] === undefined) {
    const supported = ALL_MODE_KEYS.filter((key) => op[key] !== undefined);
    throw new Error(
      `Line ${lineNumber}: ${mnemonic} does not support the ${modeKey} address mode` +
        ` (supported: ${supported.length > 0 ? supported.join(", ") : "none"})`,
    );
  }
}

/**
 * Minimal assembler for the subset implemented by Simulator.
 * One instruction per line: `MNEMONIC [operand]`, `[x]` = direct,
 * `[mem x]` = indirect (whitespace inside brackets is flexible,
 * e.g. `[mem 302]`, `[mem302]`, `[ mem 302 ]`), bare number = immediate.
 * `#` starts a comment. Returns 32-bit words.
 * Throws if the instruction has no uops for the chosen address mode.
 */
export function assemble(source: string, opcodes: Record<string, Operation>): number[] {
  const program: number[] = [];
  const lines = source.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].split("#")[0].trim();
    if (!line) continue;

    const firstSpace = line.search(/\s/);
    const mnemonicRaw = firstSpace === -1 ? line : line.slice(0, firstSpace);
    const operandRaw = firstSpace === -1 ? undefined : line.slice(firstSpace).trim() || undefined;

    const mnemonic = mnemonicRaw.toUpperCase();
    const op = opcodes[mnemonic];

    if (op === undefined) {
      throw new Error(
        `Line ${i + 1}: unknown mnemonic "${mnemonicRaw}" (supported: ${Object.keys(opcodes).join(", ")})`,
      );
    }

    let addressMode: AddressMode;
    let text: string | undefined;

    if (op.isZeroArgument && operandRaw === undefined) {
      addressMode = AddressMode.Immediate;
    } else {
      if (operandRaw === undefined) throw new Error(`Line ${i + 1}: ${mnemonic} needs an operand`);

      addressMode = AddressMode.Immediate;

      const indirectMatch = operandRaw.match(/^\[\s*mem\s*(\d+)\s*\]$/i);
      const directMatch = operandRaw.match(/^\[\s*(\d+)\s*\]$/);
      if (indirectMatch) {
        addressMode = AddressMode.Indirect;
        text = indirectMatch[1];
      } else if (directMatch) {
        addressMode = AddressMode.Direct;
        text = directMatch[1];
      } else if (/^\d+$/.test(operandRaw)) {
        text = operandRaw;
      } else if (operandRaw.startsWith("[") && operandRaw.endsWith("]")) {
        throw new Error(`Line ${i + 1}: malformed operand "${operandRaw}"`);
      } else {
        throw new Error(`Line ${i + 1}: operand must be an integer 0..16777215`);
      }
    }

    assertModeSupported(op, addressMode, mnemonic, i + 1);

    let operand = 0;
    if (text !== undefined) {
      operand = parseInt(text, 10);
      if (!Number.isInteger(operand) || operand < 0 || operand > 0xffffff) {
        throw new Error(`Line ${i + 1}: operand must be an integer 0..16777215`);
      }
    }

    program.push(
      encodeInstruction({ opcode: opcodeNumber(mnemonic, opcodes), operand, addressMode }),
    );
  }
  return program;
}
