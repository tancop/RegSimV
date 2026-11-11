<script>
  import Alu from "#lib/assets/alu.svg.svelte";
  import RegisterCard from "./RegisterCard.svelte";
</script>

<div class="flex size-full justify-between bg-white">
  <div class="flex flex-col h-full justify-between py-3">
    <RegisterCard name="MBR" value={42} />
    <RegisterCard name="MAR" value={42} />
    <RegisterCard name="ACC" value={42} />
  </div>

  <Alu className="w-40" />

  <div class="flex flex-col h-full justify-between py-3">
    <RegisterCard name="IR" value={42} />
    <RegisterCard name="FLAGS" value={42} />
  </div>
</div>
