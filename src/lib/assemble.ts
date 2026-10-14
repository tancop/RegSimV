import { AddressMode, encodeInstruction } from "./encoding";
import { opcodeNumber, type Operation } from "./opcodes";

/**
 * Minimal assembler for the subset implemented by Simulator.
 * One instruction per line: `MNEMONIC [operand]`, `[ ]` = direct,
 * `[mem ]` = indirect, bare number = immediate.
 * `#` starts a comment. Returns 32-bit words.
 */
export function assemble(source: string, opcodes: Record<string, Operation>): number[] {
  const program: number[] = [];
  const lines = source.split("\n");

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].split("#")[0].trim();
    if (!line) continue;

    const [mnemonicRaw, operandRaw, extra] = line.split(/\s+/);
    if (extra !== undefined) {
      throw new Error(`Line ${i + 1}: too many tokens`);
    }

    const mnemonic = mnemonicRaw.toUpperCase();
    const op = opcodes[mnemonic];

    if (op === undefined) {
      throw new Error(
        `Line ${i + 1}: unknown mnemonic "${mnemonicRaw}" (supported: ${Object.keys(OPCODES).join(", ")})`,
      );
    }

    if (op.isZeroArgument) {
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
      let text = operandRaw;

      if (text.startsWith("[mem ")) {
        addressMode = AddressMode.Indirect;
        text = text.slice(5, -2); // remove "[mem " and "]"
      } else if (text.startsWith("[")) {
        addressMode = AddressMode.Direct;
        text = text.slice(1, -1); // remove "[" and "]"
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
