<script lang="ts">
  import { assemble, AssembleError } from "#lib/assemble";
  import { BUILTIN_OPCODES, createOpcodeTable } from "#lib/opcodes.ts";
  import { MEMORY_SIZE, Simulator } from "#lib/simulator";

  const OPCODES = createOpcodeTable(BUILTIN_OPCODES);

  const DEMO = `# Demo: 5 + 7 stored at 1024\nLOAD [1024]\nADD 5\nADD 7\nSTORE [1024]\nHALT`;

  let running = $state(false);
  let sim = $state(new Simulator());
  let source = $state(DEMO);
  let runtimeError = $state("");
  let memory: number[] = [];
  let tick = $state(0);

  let [program, assembleError] = $derived.by(() => {
    try {
      return [assemble(source, OPCODES), undefined];
    } catch (e) {
      return [undefined, (e as AssembleError).message];
    }
  });

  function refresh() {
    tick++;
  }

  function load() {
    if (!program) return;
    sim.reset();
    sim.loadProgram(OPCODES, program);

    for (const [k, v] of memory.entries()) {
      sim.memory[k] = v;
      sim.markInitialized(k);
    }
  }

  function step() {
    if (!program) return;
    console.log("step");
    runtimeError = "";

    if (!running) {
      try {
        load();
        running = true;
      } catch (e) {
        runtimeError = e instanceof Error ? e.message : String(e);
        return;
      }
    }

    try {
      sim.step();
    } catch (e) {
      runtimeError = e instanceof Error ? e.message : String(e);
    }

    refresh();
  }

  function uStep() {
    if (!program) return;
    runtimeError = "";

    if (!running) {
      try {
        load();
        running = true;
      } catch (e) {
        runtimeError = e instanceof Error ? e.message : String(e);
        return;
      }
    }

    try {
      sim.uStep();
    } catch (e) {
      runtimeError = e instanceof Error ? e.message : String(e);
    }

    refresh();
  }

  function run() {
    if (!program) return;
    runtimeError = "";

    try {
      load();
      running = true;
    } catch (e) {
      runtimeError = e instanceof Error ? e.message : String(e);
      return;
    }

    try {
      sim.run();
    } catch (e) {
      runtimeError = e instanceof Error ? e.message : String(e);
    }

    refresh();
  }

  function reset() {
    runtimeError = "";
    sim.reset();
    running = false;
    refresh();
  }

  function range(n: number): number[] {
    return [...Array(n).keys()];
  }
</script>

<main class="mx-auto grid main-grid p-5 size-full">
  <textarea class="size-full resize-none font-mono" bind:value={source}></textarea>
  <div class="w-full flex gap-2 items-end bg-green-400">
    <button class="px-4 py-1 size-fit bg-slate-200 rounded-md" onclick={step}>Step</button>
    <button class="px-4 py-1 size-fit bg-slate-200 rounded-md" onclick={reset}>Reset</button>
  </div>
  <div class="size-full">
    {#if assembleError}
      <p class="text-red-500 font-bold">{assembleError}</p>
    {/if}
    {#if runtimeError}
      <p class="text-red-500 font-bold">{runtimeError}</p>
    {/if}
    <p>acc = {sim.acc}</p>
    <p>mar = {sim.mar}</p>
    <p>mbr = {sim.mbr}</p>
    <p>ins = {sim.decodedInstruction?.opcode}</p>
    <p>RegSimV</p>
  </div>
  <div class="w-full h-40 bg-amber-400">
    <div class="size-full grid grid-cols-10 overflow-y-scroll">
      {let entries = running
        ? sim.memory.slice(sim.dataMemoryStart).entries()
        : range(MEMORY_SIZE - sim.dataMemoryStart).map((k) => [k, memory[k]])}
      {#each entries as [idx, val]}
        {let isInitialized = running ? sim.isInitialized(idx) : val !== undefined}
        <input
          value={isInitialized ? val.toString() : "-"}
          onchange={(e) => {
            memory[idx] = parseInt(e.currentTarget.value);
          }}
        />
      {/each}
    </div>
  </div>
</main>

<style>
  .main-grid {
    grid-template-columns: 1fr 4fr;
    grid-template-rows: 2fr 1fr;
  }
</style>
