<script lang="ts">
  import { AddressMode, type Instruction } from "#lib/encoding.ts";
  import type { OpcodeTable } from "#lib/opcodes.ts";

  interface Props {
    value?: Instruction;
    opcodes: OpcodeTable;
  }

  const { value, opcodes }: Props = $props();

  const opcode = $derived(value !== undefined ? opcodes.indexToName[value.opcode] : "");

  const addressMode = $derived.by(() => {
    switch (value?.addressMode) {
      case AddressMode.Immediate:
        return "IM";
      case AddressMode.Direct:
        return "DI";
      case AddressMode.Indirect:
        return "IN";
      default:
        return "";
    }
  });
</script>

<section class="flex flex-col w-65 pb-1 font-mono border border-black">
  <h2 class="px-1 font-sans font-bold">Decoder</h2>
  <div class="flex px-1 w-full justify-between">
    {#if value}
      <p class="w-full">{opcode}</p>
      <p class="w-full text-center">{value.operand}</p>
      <p class="w-full text-right">{addressMode}</p>
    {:else}
      <p class="w-full text-center">...</p>
    {/if}
  </div>
</section>
