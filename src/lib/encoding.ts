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
  return (ins.addressMode << 6) | (ins.opcode & 0x3f) | ((ins.operand & 0xffffff) << 8);
}
