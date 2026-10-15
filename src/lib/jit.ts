import type { Operation } from "./opcodes";
import type { Simulator } from "./simulator";
import { BRANCHY_UOPS, type UOp, type UOps } from "./uops";

export interface CompiledOperation {
  immediate?: (st: Simulator, ops: UOps) => IterableIterator<number>;
  direct?: (st: Simulator, ops: UOps) => IterableIterator<number>;
  indirect?: (st: Simulator, ops: UOps) => IterableIterator<number>;
  isZeroArgument?: boolean;
}

export function compileVariant(
  source: UOp[],
): (st: Simulator, ops: UOps) => IterableIterator<number> {
  let fnText = "return(function*(){";
  for (const op of source) {
    if (BRANCHY_UOPS.includes(op)) {
      fnText += `if(st.skipNext){st.skipNext=false;yield;}else{yield ops.${op}(st);}`;
    }
    fnText += `yield ops.${op}(st);`;
  }
  fnText += "})()";
  return new Function("st", "ops", fnText) as (st: Simulator) => IterableIterator<number>;
}

export function compile(op: Operation): CompiledOperation {
  const result: CompiledOperation = {};

  if (op.immediate) result.immediate = compileVariant(op.immediate);
  if (op.direct) result.direct = compileVariant(op.direct);
  if (op.indirect) result.indirect = compileVariant(op.indirect);
  result.isZeroArgument = op.isZeroArgument;

  return result;
}
