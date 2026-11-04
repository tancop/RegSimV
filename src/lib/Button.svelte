<script lang="ts">
  import type { MouseEventHandler } from "svelte/elements";

  const { onclick, text }: { onclick: MouseEventHandler<HTMLButtonElement>; text: string } =
    $props();
</script>

<button class="px-4 py-1 size-fit bg-slate-200 rounded-md" {onclick}>{text}</button>
