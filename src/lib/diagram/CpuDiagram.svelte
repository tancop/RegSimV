<script lang="ts">
  import Alu from "#lib/assets/alu.svg.svelte";
  import type { Instruction } from "#lib/encoding.ts";
  import type { OpcodeTable } from "#lib/opcodes.ts";
  import DecoderCard from "./DecoderCard.svelte";
  import FlagsCard from "./FlagsCard.svelte";
  import RegisterCard from "./RegisterCard.svelte";

  export interface Registers {
    pc: number;
    acc: number;
    mar: number;
    mbr: number;
    ir: number;
    sr: number;

    instruction?: Instruction;
    uop: string;

    ef: boolean;
    zf: boolean;
    nf: boolean;
    of: boolean;
    cf: boolean;
  }

  interface Props {
    registers: Registers;
    opcodes: OpcodeTable;
  }

  const { registers, opcodes }: Props = $props();
</script>

<div class="flex size-full justify-around bg-white">
  <div class="flex flex-col h-full justify-between py-3">
    <RegisterCard name="MBR" value={registers.mbr} />
    <RegisterCard name="MAR" value={registers.mar} />
    <RegisterCard name="PC" value={registers.pc} />
  </div>

  <Alu className="w-40" />

  <div class="flex flex-col h-full justify-between py-3">
    <RegisterCard name="ACC" value={registers.acc} />
    <FlagsCard
      ef={registers.ef}
      zf={registers.zf}
      nf={registers.nf}
      of={registers.of}
      cf={registers.cf}
    />
    <RegisterCard name="IR" value={registers.ir} />
    <DecoderCard {opcodes} value={registers.instruction} />
  </div>
</div>
