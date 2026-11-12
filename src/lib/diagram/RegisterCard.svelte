<script lang="ts">
  interface Props {
    name: string;
    value: number;
  }

  const { name, value }: Props = $props();

  const binValue = $derived.by(() => {
    let v = value.toString(2).padStart(32, "0");
    return [v.slice(1, 8), v.slice(9, 16), v.slice(17, 24), v.slice(25, 32)].join(" ");
  });
</script>

<section class="flex flex-col w-65 h-20 font-mono border border-black">
  <div class="flex px-1 w-full justify-between">
    <h2 class="flex-1 font-sans font-bold">{name}:</h2>
    <p class="flex-1 text-center">{value}</p>
    <p class="flex-1 text-right">0x{value.toString(16)}</p>
  </div>
  <p class="text-sm tracking-tight w-full text-center">{binValue}</p>
</section>
