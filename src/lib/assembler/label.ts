import { AssembleErrorType, type AssembleError } from "#lib/assemble.ts";

export type Labels = Record<string, number>;

export function splitLabels(lines: string[]): [string[], Labels, AssembleError[]] {
  const result = [];
  const labels = {} as Labels;
  const errors = [] as AssembleError[];

  for (const [idx, line] of lines.entries()) {
    const [first, ...rest] = line.split(":");
    if (rest.length === 0) {
      // No label on this line
      result.push(first);
    } else if (rest.length == 1) {
      // `first` is a label
      const label = first.trim();
      if (!label.length) {
        errors.push({
          type: AssembleErrorType.MalformedLabel,
          lineNum: idx,
          message: `Label cannot be empty`,
        });
      } else if (label[0].match(/[0-9]/)) {
        errors.push({
          type: AssembleErrorType.MalformedLabel,
          lineNum: idx,
          message: `Label cannot start with a digit`,
        });
      } else if (label.toLowerCase() == "mem") {
        errors.push({
          type: AssembleErrorType.MalformedLabel,
          lineNum: idx,
          message: `"mem" is a reserved name`,
        });
      } else if (!label.match(VALID_LABEL_REGEX)) {
        errors.push({
          type: AssembleErrorType.MalformedLabel,
          lineNum: idx,
          message: `Label must not contain square brackets`,
        });
      } else {
        labels[first] = idx;
      }
      result.push(rest[0].trim());
    } else {
      // multiple colons
      errors.push({
        type: AssembleErrorType.TooManyColons,
        lineNum: idx,
        message: `Too many label definitions`,
      });
      result.push(rest[rest.length - 1].trim());
    }
  }

  return [result, labels, errors];
}

const VALID_LABEL_REGEX = /^[^0-9[\]][^[\]]*$/;

export function isValidLabel(label: string): boolean {
  return !!label.match(VALID_LABEL_REGEX) && !(label.toLowerCase() == "mem");
}
