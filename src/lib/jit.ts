import type { Simulator } from "./simulator";
import type { UOp, UOps } from "./uops";

export interface CompiledOperation {
  immediate?: (st: Simulator, ops: UOps) => IterableIterator<number>;
  direct?: (st: Simulator, ops: UOps) => IterableIterator<number>;
  indirect?: (st: Simulator, ops: UOps) => IterableIterator<number>;
  isZeroArgument?: boolean;
}

export function compile(source: UOp[]): (st: Simulator, ops: UOps) => IterableIterator<number> {
  let fnText = "(function* (st,ops) {";
  for (const op of source) {
    fnText += `yield ops.${op}(st);`;
  }
  fnText += "})";
  return new Function("st", "ops", fnText) as (st: Simulator) => IterableIterator<number>;
}
