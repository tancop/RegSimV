<script lang="ts">
  import { assemble, AssembleError } from "#lib/assemble";
  import { BUILTIN_OPCODES, createOpcodeTable } from "#lib/opcodes.ts";
  import { MEMORY_SIZE, Simulator } from "#lib/simulator";

  const OPCODES = createOpcodeTable(BUILTIN_OPCODES);

  const DEMO = `# Hi there!\nload [1024]\nadd 5\nadd 7\nstore [1024]\nhalt`;

  let running = $state(false);
  let sim = $state(new Simulator());
  let source = $state(DEMO);
  let runtimeError = $state("");
  let memory = [0];
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
      sim.memory[sim.dataMemoryStart + k] = v;
      sim.markInitialized(sim.dataMemoryStart + k);
    }
  }

  function step() {
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

  let registers = $derived.by(() => {
    void tick;
    let opcode = sim.decodedInstruction?.opcode;
    if (opcode !== undefined) {
      return {
        acc: sim.acc,
        mar: sim.mar,
        mbr: sim.mbr,
        ins: OPCODES.indexToName[opcode],
      };
    }
    return {
      acc: sim.acc,
      mar: sim.mar,
      mbr: sim.mbr,
      ins: "[none]",
    };
  });

  let memoryView = $derived.by(() => {
    void tick;
    return range(MEMORY_SIZE - sim.dataMemoryStart).map((idx) => {
      if (running) {
        return {
          idx,
          value: sim.memory[sim.dataMemoryStart + idx],
          initialized: sim.isInitialized(sim.dataMemoryStart + idx),
        };
      }
      const value = memory[idx];
      return { idx, value, initialized: value !== undefined };
    });
  });
</script>

<main class="mx-auto grid main-grid p-5 size-full">
  <textarea class="size-full resize-none font-mono" bind:value={source}></textarea>
  <div class="w-full flex gap-2 items-end bg-green-400">
    <button class="px-4 py-1 size-fit bg-slate-200 rounded-md" onclick={uStep}>Micro</button>
    <button class="px-4 py-1 size-fit bg-slate-200 rounded-md" onclick={step}>Step</button>
    <button class="px-4 py-1 size-fit bg-slate-200 rounded-md" onclick={run}>Run</button>
    <button class="px-4 py-1 size-fit bg-slate-200 rounded-md" onclick={reset}>Reset</button>
  </div>
  <div class="size-full">
    {#if assembleError}
      <p class="text-red-500 font-bold">{assembleError}</p>
    {/if}
    {#if runtimeError}
      <p class="text-red-500 font-bold">{runtimeError}</p>
    {/if}
    <p>acc = {registers.acc}</p>
    <p>mar = {registers.mar}</p>
    <p>mbr = {registers.mbr}</p>
    <p>ins = {registers.ins}</p>
    <p>RegSimV</p>
  </div>
  <div class="w-full h-40 bg-amber-400">
    <div class="size-full grid grid-cols-8 overflow-y-scroll">
      {#each memoryView as { idx, value, initialized }}
        <input
          value={initialized ? String(value) : "-"}
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
