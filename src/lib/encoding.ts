export enum AddressMode {
  Immediate,
  Direct,
  Indirect,
}

export interface Instruction {
  opcode: number;
  operand: number;
  addressMode: AddressMode;
}

export function decodeInstruction(ins: number): Instruction {
  if (ins > 0xffffffff) {
    throw new RangeError("Instruction must be a 32-bit number");
  }

  const opcode = ins & 0x3f;
  const addressMode = ((ins >> 6) & 0x03) as AddressMode;
  const operand = (ins >> 8) & 0xffffff;

  return {
    opcode,
    operand,
    addressMode,
  };
}

export function encodeInstruction(ins: Instruction): number {
  if (ins.opcode < 0 || ins.opcode > 0x3f) {
    throw new RangeError("Opcode must be a 6-bit number");
  }
  if (ins.operand < 0 || ins.operand > 0xffffff) {
    throw new RangeError("Operand must be a 24-bit number");
  }
  if (ins.addressMode < AddressMode.Immediate || ins.addressMode > AddressMode.Indirect) {
    throw new RangeError("Address mode must be one of Immediate = 0, Direct = 1, or Indirect = 2");
  }

  return (ins.addressMode << 6) | (ins.opcode & 0x3f) | ((ins.operand & 0xffffff) << 8);
}
