<script lang="ts">
  interface Props {
    value: string;
  }

  const { value }: Props = $props();
</script>

<section class="flex flex-col w-40 pb-1 font-mono border border-black">
  <h2 class="px-1 font-sans font-bold">Control Unit</h2>
  <div class="flex px-1 w-full justify-between">
    <p class="w-full text-center">{value}</p>
  </div>
</section>
