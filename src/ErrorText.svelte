<script lang="ts">
  const { error }: { error: string } = $props();
</script>

<p class="text-red-500 font-bold">{error}</p>
