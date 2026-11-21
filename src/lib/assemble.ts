import { splitLabels, type Labels } from "./assembler/labels";
import { MAX_OPERAND, MIN_OPERAND, parseOperand } from "./assembler/operand";
import { encodeInstruction } from "./encoding";
import type { OpcodeTable } from "./opcodes";

export enum AssembleErrorType {
  /** A line contains more than one `:` label separator. */
  TooManyColons,
  /** A label is empty or starts with a digit. */
  MalformedLabel,
  /** The label referenced in operand is not defined. */
  UndefinedLabel,
  /** The mnemonic is not in the supplied opcode table. */
  UnknownMnemonic,
  /** The instruction requires an operand but none was given. */
  MissingOperand,
  /** The instruction has no uops for the operand's address mode. */
  UnsupportedAddressMode,
  /** A bracketed operand is neither a label nor an integer. */
  MalformedOperand,
  /** The operand is an integer not in `-8388608..8388607`. */
  OperandOutOfRange,
  /** The instruction has more than 2 elements separated by spaces. */
  TooManyOperands,
}

export interface AssembleError {
  type: AssembleErrorType;
  lineNum: number;
  message: string;
}

type AssembleResult = { code: (number | undefined)[] } | { errors: AssembleError[] };

// Removes all characters after "#"
const COMMENT_REGEX = /(.*)#.*$|(.*)$/;

// Matches cases like `add [mem 1024] 2`
const TOO_MANY_OPERANDS_REGEX = /\w+\s+\[.*\]\s+\S+/;

export function assemble(source: string, opcodes: OpcodeTable, dataLabels: Labels): AssembleResult {
  const rawLines = source
    .split("\n")
    .map((v) => v.match(COMMENT_REGEX))
    .map((v) => (v ? (v[1] ?? v[2]).trim() : ""));

  const [lines, labels, errors] = splitLabels(rawLines);

  const code = [] as (number | undefined)[];

  for (const [lineNum, line] of lines.entries()) {
    if (line.match(TOO_MANY_OPERANDS_REGEX)) {
      // More tokens after a direct/indirect operand
      errors.push({
        type: AssembleErrorType.TooManyOperands,
        lineNum,
        message: `Instructions cannot have more than one operand`,
      });
      continue;
    }

    const [mnemonic, ...rest] = line.split(" ");
    const operandStr = rest.join(" ");

    if (rest.length > 1 && !operandStr.includes("[")) {
      // Immediate mode should always have only one token
      errors.push({
        type: AssembleErrorType.TooManyOperands,
        lineNum,
        message: `Instructions cannot have more than one operand`,
      });
      continue;
    }

    if (!mnemonic.length) {
      code.push(undefined);
      continue;
    }

    const opcode = opcodes.nameToIndex[mnemonic.toUpperCase()];
    if (opcode !== undefined) {
      const result = parseOperand(operandStr, lineNum);

      if ("error" in result) {
        errors.push(result.error);
      } else {
        const operand = result.value;

        let operandValue = 0;

        if ("nullOperand" in operand) {
          if (!opcodes.uops[opcode].isZeroArgument) {
            errors.push({
              type: AssembleErrorType.MissingOperand,
              lineNum,
              message: `"${mnemonic.toUpperCase()}" requires an operand but none was provided`,
            });
            continue;
          }
        } else if ("label" in operand) {
          const address = labels[operand.label];

          if (address === undefined) {
            errors.push({
              type: AssembleErrorType.UndefinedLabel,
              lineNum,
              message: `Label "${operand.label}" is not defined`,
            });
          }
        } else {
          if (operand.literal > MAX_OPERAND) {
            errors.push({
              type: AssembleErrorType.OperandOutOfRange,
              lineNum,
              message: `Operand must be ${MAX_OPERAND} or less`,
            });
            continue;
          } else if (operand.literal < MIN_OPERAND) {
            errors.push({
              type: AssembleErrorType.OperandOutOfRange,
              lineNum,
              message: `Operand must be ${MIN_OPERAND} or greater`,
            });
            continue;
          }
          operandValue = operand.literal;
        }

        code.push(
          encodeInstruction({
            opcode,
            operand: operandValue,
            addressMode: operand.mode,
          }),
        );
      }
    } else {
      errors.push({
        type: AssembleErrorType.UnknownMnemonic,
        lineNum,
        message: `Unknown instruction "${mnemonic}"`,
      });
    }
  }

  if (errors.length) {
    return { errors };
  } else {
    return { code };
  }
}
