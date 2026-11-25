<script lang="ts">
  import { EditorState } from "@codemirror/state";
  import { EditorView, keymap } from "@codemirror/view";
  import { defaultKeymap } from "@codemirror/commands";

  interface Props {
    source: string[];
    errorLines: number[];
  }

  let { source = $bindable(), errorLines }: Props = $props();
  let lineCount = $derived(source.length);

  let node = $state<HTMLDivElement>();

  $effect(() => {
    let editorState = EditorState.create({
      doc: `load [1024]\nadd 5\nadd 7\nstore [1024]\nhalt`,
      extensions: [
        keymap.of(defaultKeymap),
        EditorView.updateListener.of((update) => {
          source = [...update.state.doc.iterLines()];
        }),
      ],
    });

    let view = new EditorView({
      state: editorState,
    });

    node?.appendChild(view.dom);
  });
</script>

<div bind:this={node}></div>

<style>
  @reference "../routes/layout.css";

  :global {
    @layer components {
      .cm-editor {
        @apply pt-1;
      }
      .cm-content {
        @apply font-mono text-base;
      }
    }
  }
</style>
