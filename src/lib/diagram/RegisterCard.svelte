<script lang="ts">
  interface Props {
    name: string;
    value: number;
  }

  const { name, value }: Props = $props();

  const binValue = $derived.by(() => {
    let v = value.toString(2).padStart(32, "0");
    return [v.slice(0, 7), v.slice(8, 15), v.slice(16, 23), v.slice(24, 31)].join(" ");
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
