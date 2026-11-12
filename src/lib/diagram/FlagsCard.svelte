<script lang="ts">
  interface Props {
    cf: boolean;
    zf: boolean;
    sf: boolean;
    of: boolean;
  }

  const { cf, zf, sf, of }: Props = $props();
</script>

<section class="flex flex-col w-65 h-20 font-mono border border-black">
  <h2 class="px-1 font-sans font-bold">FLAGS:</h2>
  <div class="flex px-1 w-full justify-between">
    <p class="w-full text-center">{cf ? "1" : "0"}</p>
    <p class="w-full text-center">{zf ? "1" : "0"}</p>
    <p class="w-full text-center">{sf ? "1" : "0"}</p>
    <p class="w-full text-center">{of ? "1" : "0"}</p>
  </div>
  <div class="flex px-1 w-full justify-between">
    <p class="w-full text-center">C</p>
    <p class="w-full text-center">Z</p>
    <p class="w-full text-center">S</p>
    <p class="w-full text-center">O</p>
  </div>
</section>
