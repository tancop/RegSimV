export const MEMORY_SIZE = 2048;

export class Simulator {
  // Registers
  mar = 0;
  mbr = 0;
  pc = 0;
  ir = 0;
  acc = 0;

  // Flag register
  sr = 0;

  // Memory
  memory = new Uint32Array(MEMORY_SIZE);
  dataMemoryStart = 1024;
}
