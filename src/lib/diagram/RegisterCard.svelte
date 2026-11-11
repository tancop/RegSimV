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

<section class="flex flex-col w-60 h-20 border border-black bg-white">
  <div class="flex gap-5">
    <h2>{name}</h2>
    <p>{value}</p>
    <p>0x{value.toString(16)}</p>
  </div>
  <p>{binValue}</p>
</section>
