<script lang="ts">
  import Alu from "#lib/assets/alu.svg.svelte";
  import FlagsCard from "./FlagsCard.svelte";
  import RegisterCard from "./RegisterCard.svelte";

  export interface Registers {
    pc: number;
    acc: number;
    mar: number;
    mbr: number;
    ir: number;
    sr: number;
    ins: string;
    uop: string;

    ef: boolean;
    zf: boolean;
    nf: boolean;
    of: boolean;
  }

  interface Props {
    registers: Registers;
  }

  const { registers }: Props = $props();
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
    <FlagsCard ef={registers.ef} zf={registers.zf} nf={registers.nf} of={registers.of} />
    <RegisterCard name="IR" value={registers.ir} />
  </div>
</div>
