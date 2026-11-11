<script lang="ts">
  import Alu from "#lib/assets/alu.svg.svelte";
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
  }

  interface Props {
    registers: Registers;
  }

  const { registers }: Props = $props();
</script>

<div class="flex size-full justify-between bg-white">
  <div class="flex flex-col h-full justify-between py-3">
    <RegisterCard name="MBR" value={registers.mbr} />
    <RegisterCard name="MAR" value={registers.mar} />
    <RegisterCard name="ACC" value={registers.acc} />
  </div>

  <Alu className="w-40" />

  <div class="flex flex-col h-full justify-between py-3">
    <RegisterCard name="IR" value={registers.ir} />
    <RegisterCard name="FLAGS" value={registers.sr} />
  </div>
</div>
