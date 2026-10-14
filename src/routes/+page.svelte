<script lang="ts">
  import { assemble } from "#lib/assemble";
  import { Simulator } from "#lib/simulator";

  const DEMO = `# Demo: 5 + 7 stored at 1024\nLOAD 0\nADD 5\nADD 7\nSTORE [1024]\nHALT`;

  let sim = new Simulator();
  let source = $state(DEMO);
  let error = $state("");
  // Bumps on every mutation so class fields re-render.
  let tick = $state(0);

  function refresh() {
    tick++;
  }

  function load() {
    error = "";
    try {
      const program = assemble(source);
      sim.reset();
      sim.loadProgram(program);
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    refresh();
  }

  function step() {
    error = "";
    try {
      sim.step();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    refresh();
  }

  function run() {
    error = "";
    try {
      sim.run();
    } catch (e) {
      error = e instanceof Error ? e.message : String(e);
    }
    refresh();
  }

  function reset() {
    error = "";
    sim.reset();
    refresh();
  }

  // Keep tick referenced so template updates on mutation.
  $effect(() => {
    void tick;
  });
</script>

<main class="mx-auto flex max-w-2xl flex-col gap-4 p-5">
  <h1 class="text-3xl font-bold">RegSim</h1>

  <label class="flex flex-col gap-1">
    <span class="text-sm font-medium">Program</span>
    <textarea class="min-h-40 rounded border p-2 font-mono text-sm" bind:value={source}></textarea>
  </label>

  <div class="flex flex-wrap gap-2">
    <button class="rounded bg-blue-600 px-3 py-1 text-white" onclick={load}
      >Assemble &amp; Load</button
    >
    <button class="rounded border px-3 py-1" onclick={step}>Step</button>
    <button class="rounded border px-3 py-1" onclick={run}>Run</button>
    <button class="rounded border px-3 py-1" onclick={reset}>Reset</button>
  </div>

  {#if error}
    <p class="rounded border border-red-400 p-2 text-sm text-red-600">{error}</p>
  {/if}

  <dl class="grid grid-cols-2 gap-1 font-mono text-sm sm:grid-cols-3">
    <dt class="opacity-60">ACC</dt>
    <dd>{sim.acc}</dd>
    <dt class="opacity-60">PC</dt>
    <dd>{sim.pc}</dd>
    <dt class="opacity-60">IR</dt>
    <dd>{sim.ir}</dd>
    <dt class="opacity-60">Halted</dt>
    <dd>{sim.halted ? "yes" : "no"}</dd>
    <dt class="opacity-60">MEM[1024]</dt>
    <dd>{sim.memory[1024]}</dd>
    <dt class="opacity-60">MEM[1025]</dt>
    <dd>{sim.memory[1025]}</dd>
  </dl>
</main>
