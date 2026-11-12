import { AddressMode, encodeInstruction } from "./encoding";
import type { OpcodeTable, Operation } from "./opcodes";

/** Machine-readable classification of an assembly failure. */
export enum AssembleErrorType {
  /** A line contains more than one `:` label separator. */
  TooManyColons = "too-many-colons",
  /** A label is empty or starts with a digit. */
  InvalidLabel = "invalid-label",
  /** The mnemonic is not in the supplied opcode table. */
  UnknownMnemonic = "unknown-mnemonic",
  /** The instruction requires an operand but none was given. */
  MissingOperand = "missing-operand",
  /** The instruction has no uops for the operand's address mode. */
  UnsupportedAddressMode = "unsupported-address-mode",
  /** A bracketed operand is neither a label nor an integer. */
  MalformedOperand = "malformed-operand",
  /** The operand is neither a label nor an integer in `-8388608..8388607`. */
  InvalidOperand = "invalid-operand",
}

/**
 * Error thrown by {@link assemble} when the source cannot be assembled.
 * `type` and `line` are stable and safe to branch on; `message` is
 * human-readable and subject to change.
 */
export class AssembleError extends Error {
  readonly type: AssembleErrorType;
  /** 1-based number of the source line the error occurred on. */
  readonly line: number;

  constructor(type: AssembleErrorType, line: number, message: string) {
    super(message);
    this.name = "AssembleError";
    this.type = type;
    this.line = line;
  }
}

/** Address mode -> the `Operation` key holding the uops for that mode. */
const MODE_KEYS = {
  [AddressMode.Immediate]: "immediate",
  [AddressMode.Direct]: "direct",
  [AddressMode.Indirect]: "indirect",
} as const;

type ModeKey = (typeof MODE_KEYS)[keyof typeof MODE_KEYS];

const ALL_MODE_KEYS: ModeKey[] = ["immediate", "direct", "indirect"];

/** Inclusive bounds of a signed 24-bit operand. */
const MIN_OPERAND = -0x800000;
const MAX_OPERAND = 0x7fffff;
/** Mask turning a signed 24-bit operand into its unsigned encoding. */
const OPERAND_MASK = 0xffffff;

function assertModeSupported(
  op: Operation,
  addressMode: AddressMode,
  mnemonic: string,
  lineNumber: number,
): void {
  const modeKey: ModeKey = MODE_KEYS[addressMode];
  if (op[modeKey] === undefined) {
    const supported = ALL_MODE_KEYS.filter((key) => op[key] !== undefined);
    throw new AssembleError(
      AssembleErrorType.UnsupportedAddressMode,
      lineNumber,
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
 * Numeric operands are signed and must fit in 24 bits (`-8388608..8388607`);
 * negative values are encoded as two's complement.
 * `#` starts a comment. Returns 32-bit words; blank lines reserve one word
 * each, emitted as `undefined` so the cell stays uninitialized (reads trap).
 * Throws {@link AssembleError} on invalid input; see {@link AssembleErrorType}.
 */
export function assemble(source: string, opcodes: OpcodeTable): (number | undefined)[] {
  const program: (number | undefined)[] = [];
  // A single trailing newline terminates the last line rather than opening
  // a new blank one, so it does not reserve a word.
  const lines = source.replace(/\n$/, "").split("\n");
  const labels: Record<string, number> = {};
  // Address of the next word to be emitted. Blank lines reserve one word
  // each; comment-only lines and label-only lines emit nothing.
  let address = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].split("#")[0].trim();
    if (!line) {
      if (lines[i].trim() === "") address++;
      continue;
    }

    const [label, rest, bad] = line.split(":").map((s) => s.trim());

    if (bad) {
      throw new AssembleError(
        AssembleErrorType.TooManyColons,
        i,
        `Line ${i}: too many ':' characters on line`,
      );
    }

    if (rest) {
      if (label.length === 0 || /\d/.test(label[0])) {
        throw new AssembleError(
          AssembleErrorType.InvalidLabel,
          i,
          `Line ${i}: invalid label "${label}" (labels cannot be empty or start with a digit)`,
        );
      }

      labels[label.toLowerCase()] = address;
      lines[i] = rest;
      address++;
    }
    // Plain instruction lines without a label also emit one word.
    else if (!line.includes(":")) address++;
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].split("#")[0].trim();
    if (!line) {
      if (lines[i].trim() === "") program.push(undefined);
      continue;
    }

    const firstSpace = line.search(/\s/);
    const mnemonicRaw = firstSpace === -1 ? line : line.slice(0, firstSpace);
    const operandRaw = firstSpace === -1 ? undefined : line.slice(firstSpace).trim() || undefined;

    const mnemonic = mnemonicRaw.toUpperCase();
    const opcode = opcodes.nameToIndex[mnemonic];
    const op = opcode === undefined ? undefined : opcodes.uops[opcode];

    if (op === undefined) {
      throw new AssembleError(
        AssembleErrorType.UnknownMnemonic,
        i,
        `Line ${i}: unknown mnemonic "${mnemonicRaw}"`,
      );
    }

    let addressMode: AddressMode;
    let text: string | undefined;

    if (op.isZeroArgument && operandRaw === undefined) {
      addressMode = AddressMode.Immediate;
    } else {
      if (operandRaw === undefined) {
        throw new AssembleError(
          AssembleErrorType.MissingOperand,
          i,
          `Line ${i}: ${mnemonic} needs an operand`,
        );
      }

      addressMode = AddressMode.Immediate;

      const indirectMatch = operandRaw.match(/^\[\s*mem\s*(-?[a-z0-9]+)\s*\]$/i);
      const directMatch = operandRaw.match(/^\[\s*(-?[a-z0-9]+)\s*\]$/);

      if (indirectMatch) {
        addressMode = AddressMode.Indirect;
        text = indirectMatch[1];
      } else if (directMatch) {
        addressMode = AddressMode.Direct;
        text = directMatch[1];
      } else if (operandRaw.includes("[") || operandRaw.includes("]")) {
        // Bracket characters that do not form a valid `[x]` or `[mem x]`
        // operand, e.g. `[mem]`, `[x]`, or an unbalanced `1024]`.
        throw new AssembleError(
          AssembleErrorType.MalformedOperand,
          i,
          `Line ${i}: malformed operand "${operandRaw}"`,
        );
      } else {
        text = operandRaw;
      }
    }

    assertModeSupported(op, addressMode, mnemonic, i);

    let operand = 0;

    if (text !== undefined) {
      const bracketed = addressMode !== AddressMode.Immediate;
      const numeric = /^-?\d+$/.test(text);
      const parsed = numeric ? Number(text) : Number.NaN;

      if (labels[text] !== undefined) {
        operand = labels[text];
      } else if (numeric) {
        if (parsed < MIN_OPERAND || parsed > MAX_OPERAND) {
          throw new AssembleError(
            AssembleErrorType.InvalidOperand,
            i,
            `Line ${i}: operand ${text} is out of range -8388608..8388607`,
          );
        }
        operand = parsed & OPERAND_MASK;
      } else if (bracketed) {
        throw new AssembleError(
          AssembleErrorType.MalformedOperand,
          i,
          `Line ${i}: malformed operand "${operandRaw}"`,
        );
      } else {
        throw new AssembleError(
          AssembleErrorType.InvalidOperand,
          i,
          `Line ${i}: operand must be a label or an integer -8388608..8388607`,
        );
      }
    }

    program.push(encodeInstruction({ opcode, operand, addressMode }));
    address++;
  }
  return program;
}
