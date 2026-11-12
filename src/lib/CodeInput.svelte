<script lang="ts">
  import { range } from "./range";

  interface Props {
    source: string;
    errorLine?: number;
  }

  let { source = $bindable(), errorLine }: Props = $props();

  let lineCount = $derived(source.split("\n").length);
</script>

<div class="flex gap-2 size-full">
  <div class="flex flex-col">
    {#each range(lineCount) as idx}
      <p
        class="h-6 text-md/6 font-mono text-start
        {errorLine === idx ? 'text-red-500' : 'text-gray-600'}"
      >
        {idx}
      </p>
    {/each}
  </div>
  <textarea
    class="w-full h-full resize-none bg-transparent text-md/6 text-gray-900 font-mono
    focus:outline-none overflow-y-hidden overflow-x-auto whitespace-pre"
    spellcheck="false"
    bind:value={source}></textarea>
</div>
