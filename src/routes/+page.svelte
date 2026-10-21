<script lang="ts">
  import { assemble, AssembleError } from "#lib/assemble";
  import { BUILTIN_OPCODES, createOpcodeTable } from "#lib/opcodes.ts";
  import { Simulator } from "#lib/simulator";

  const OPCODES = createOpcodeTable(BUILTIN_OPCODES);

  const DEMO = `# Demo: 5 + 7 stored at 1024\nLOAD [1024]\nADD 5\nADD 7\nSTORE [1024]\nHALT`;

  let running = $state(false);
  let sim = $state(new Simulator());
  let source = $state(DEMO);
  let runtimeError = $state("");
  let data = $state("");
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
    for (const line of data.split("\n")) {
      const [addressStr, valueStr] = line.split(" ");
      if (addressStr && valueStr) {
        const address = parseInt(addressStr.trim(), 10);
        const value = parseInt(valueStr.trim(), 10);
        sim.memory[address] = value;
      }
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
</script>

<main class="mx-auto flex max-w-2xl flex-col gap-4 p-5">
  <h1 class="text-3xl font-bold">RegSim</h1>

  <div class="flex">
    <label class="flex flex-col gap-1">
      <span class="text-sm font-medium">Program</span>
      <textarea class="min-h-40 rounded border p-2 font-mono text-sm" bind:value={source}
      ></textarea>
    </label>
    <label class="flex flex-col gap-1">
      <span class="text-sm font-medium">Data</span>
      <textarea class="min-h-40 rounded border p-2 font-mono text-sm" bind:value={data}></textarea>
    </label>
  </div>

  <div class="flex flex-wrap gap-2">
    <button class="rounded border px-3 py-1" onclick={step}>Step</button>
    <button class="rounded border px-3 py-1" onclick={uStep}>Step Micro</button>
    <button class="rounded border px-3 py-1" onclick={run}>Run</button>
    <button class="rounded border px-3 py-1" onclick={reset}>Reset</button>
  </div>

  {#if assembleError}
    <p class="rounded border border-red-400 p-2 text-sm text-red-600">{assembleError}</p>
  {/if}

  {#if runtimeError}
    <p class="rounded border border-red-400 p-2 text-sm text-red-600">{runtimeError}</p>
  {/if}

  {#key tick}
    <dl class="grid grid-cols-2 gap-1 font-mono text-sm">
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
  {/key}
</main>
