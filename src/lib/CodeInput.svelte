<script lang="ts">
  import { EditorState, Range, RangeSet } from "@codemirror/state";
  import { Decoration, EditorView, keymap } from "@codemirror/view";
  import { defaultKeymap } from "@codemirror/commands";
  import { untrack } from "svelte";

  interface Props {
    source: string[];
    errorLines: number[];
  }

  let { source = $bindable(), errorLines }: Props = $props();

  let node = $state<HTMLDivElement>();

  // This is always defined after page load
  let view = $state<EditorView>()!;

  $effect(() => {
    let editorState = EditorState.create({
      doc: `load [1024]\nadd 5\nadd 7\nstore [1024]\nhalt`,
      extensions: [
        keymap.of(defaultKeymap),
        EditorView.updateListener.of((update) => {
          source = [...update.state.doc.iterLines()];
        }),
        EditorView.decorations.of((view) => {
          return Decoration.set(
            errorLines.map((idx) => {
              const line = view.state.doc.line(idx + 1);
              return Decoration.line({ class: "underline decoration-red-500" }).range(
                line.from,
                line.from,
              );
            }),
          );
        }),
      ],
    });

    view = new EditorView({
      state: editorState,
    });

    untrack(() => node?.appendChild(view.dom));
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
