<script lang="ts">
  import { assemble, AssembleError } from "#lib/assemble";
  import Button from "#lib/Button.svelte";
  import CpuDiagram, { type Registers } from "#lib/diagram/CpuDiagram.svelte";
  import { BUILTIN_OPCODES, createOpcodeTable } from "#lib/opcodes.ts";
  import { MEMORY_SIZE, Simulator } from "#lib/simulator";
  import { SvelteMap } from "svelte/reactivity";
  import ErrorText from "../ErrorText.svelte";
  import { onMount } from "svelte";
  import { range } from "#lib/range.ts";
  import CodeInput from "#lib/CodeInput.svelte";

  const OPCODES = createOpcodeTable(BUILTIN_OPCODES);

  const DEMO = ["# Hi there!", "load [1024]", "add 5", "add 7", "store [1024]", "halt"].join("\n");

  const CURRENT_PROGRAM_KEY = "currentProgram";

  interface SavedProgram {
    source: string;
    memory: [number, number][];
    dataMemoryStart: number;
  }

  function validateSavedProgram(obj: unknown): obj is SavedProgram {
    if (typeof obj !== "object" || obj === null) return false;
    const o = obj as Record<string, unknown>;
    if (typeof o.source !== "string") return false;
    if (!Array.isArray(o.memory)) return false;
    if (typeof o.dataMemoryStart !== "number") return false;
    return true;
  }

  onMount(() => {
    const saved = JSON.parse(localStorage.getItem(CURRENT_PROGRAM_KEY) ?? "{}");
    if (validateSavedProgram(saved)) {
      source = saved.source;
      memory = new SvelteMap<number, number>(saved.memory);
      dataMemoryStart = saved.dataMemoryStart;
    }
  });

  let running = $state(false);
  let sim = $state(new Simulator());
  let source = $state(DEMO);
  let runtimeError = $state("");
  let memory = $state(new SvelteMap<number, number>([[0, 0]]));
  let dataMemoryStart = $state(1024);
  let tick = $state(0);

  let [program, assembleError] = $derived.by(() => {
    try {
      return [assemble(source, OPCODES), undefined];
    } catch (e) {
      return [undefined, e as AssembleError];
    }
  });

  $effect(() => {
    if (!program) return;

    localStorage.setItem(
      CURRENT_PROGRAM_KEY,
      JSON.stringify({
        source,
        memory: Array.from(memory.entries()),
        dataMemoryStart,
      } satisfies SavedProgram),
    );
  });

  function refresh() {
    tick++;
  }

  function load() {
    if (!program) return;
    sim.reset();
    sim.dataMemoryStart = dataMemoryStart;
    sim.loadProgram(OPCODES, program);

    for (const [k, v] of memory.entries()) {
      sim.memory[dataMemoryStart + k] = v;
      sim.markInitialized(dataMemoryStart + k);
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
      sim.run(1_000_000);
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

  let registers = $derived.by<Registers>(() => {
    void tick;
    const opcode = sim.decodedInstruction?.opcode;
    return {
      pc: sim.pc,
      acc: sim.acc,
      mar: sim.mar,
      mbr: sim.mbr,
      ir: sim.ir,
      sr: sim.srValue(),
      ins: opcode !== undefined ? OPCODES.indexToName[opcode] : "[none]",
      uop: sim.uopNames[sim.uopIndex] ?? "[none]",
      ef: sim.ef,
      zf: sim.zf,
      nf: sim.nf,
      of: sim.of,
    };
  });

  let memoryView = $derived.by(() => {
    void tick;
    return range(MEMORY_SIZE - dataMemoryStart).map((idx) => {
      if (running) {
        return {
          idx,
          value: sim.memory[dataMemoryStart + idx],
          initialized: sim.isInitialized(dataMemoryStart + idx),
        };
      }
      const value = memory.get(idx);
      return { idx, value, initialized: value !== undefined };
    });
  });
</script>

<main class="mx-auto grid main-grid p-5 size-full">
  <CodeInput bind:source errorLine={assembleError?.line} />
  <div class="w-full flex flex-col">
    <CpuDiagram {registers} />
    <div class="flex gap-3 items-start">
      <Button onclick={uStep} text="Micro" />
      <Button onclick={step} text="Step" />
      <Button onclick={run} text="Run" />
      <Button onclick={reset} text="Reset" />
    </div>
  </div>
  <div class="size-full overflow-hidden">
    {#if assembleError}
      <ErrorText error={assembleError.message} />
    {:else if runtimeError}
      <ErrorText error={runtimeError} />
    {/if}
    <p>ins = {registers.ins}</p>
    <p>uop = {registers.uop}</p>
    <p>RegSimV</p>
  </div>
  <div class="w-full h-full flex min-h-0 overflow-y-scroll">
    <div class="h-full min-w-15">
      {#each range(Math.ceil((MEMORY_SIZE - dataMemoryStart) / 8)) as idx}
        <p class="h-6 text-md/6 text-gray-600 font-mono text-start">{dataMemoryStart + idx * 8}</p>
      {/each}
    </div>
    <div class="size-full grid grid-cols-8">
      {#each memoryView as { idx, value, initialized }}
        <input
          class="h-6 focus:outline-none"
          placeholder="-"
          value={initialized ? String(value) : undefined}
          onchange={(e) => {
            let value = e.currentTarget.value;
            if (value === undefined || value.trim() === "") {
              memory.delete(idx);
              return;
            }
            memory.set(idx, parseInt(e.currentTarget.value));
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
