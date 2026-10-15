import { AddressMode, encodeInstruction } from "./encoding";
import { opcodeNumber, type Operation } from "./opcodes";

/**
 * Minimal assembler for the subset implemented by Simulator.
 * One instruction per line: `MNEMONIC [operand]`, `[x]` = direct,
 * `[mem x]` = indirect (whitespace inside brackets is flexible,
 * e.g. `[mem 302]`, `[mem302]`, `[ mem 302 ]`), bare number = immediate.
 * `#` starts a comment. Returns 32-bit words.
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

    if (op.isZeroArgument && operandRaw === undefined) {
      program.push(
        encodeInstruction({
          opcode: opcodeNumber(mnemonic, opcodes),
          operand: 0,
          addressMode: AddressMode.Immediate,
        }),
      );
    } else {
      if (operandRaw === undefined) throw new Error(`Line ${i + 1}: ${mnemonic} needs an operand`);

      let addressMode = AddressMode.Immediate;
      let text: string;

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

      let operand = parseInt(text, 10);

      if (!Number.isInteger(operand) || operand < 0 || operand > 0xffffff) {
        throw new Error(`Line ${i + 1}: operand must be an integer 0..16777215`);
      }

      program.push(
        encodeInstruction({ opcode: opcodeNumber(mnemonic, opcodes), operand, addressMode }),
      );
    }
  }
  return program;
}
