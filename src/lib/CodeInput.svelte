<script lang="ts">
  import { EditorState, StateEffect, StateField, type RangeSet } from "@codemirror/state";
  import { Decoration, EditorView, keymap, lineNumbers } from "@codemirror/view";
  import { defaultKeymap } from "@codemirror/commands";
  import { untrack } from "svelte";

  interface Props {
    source: string[];
    errorLines: number[];
  }

  let { source = $bindable(), errorLines }: Props = $props();

  let node = $state<HTMLDivElement>();
  let view = $state<EditorView>();

  const setErrorLines = StateEffect.define<number[]>();

  const errorLineDecoration = Decoration.line({ class: "error-line" });

  const errorLineField = StateField.define<RangeSet<Decoration>>({
    create: () => Decoration.none,
    update(decorations, tr) {
      decorations = decorations.map(tr.changes);
      for (const effect of tr.effects) {
        if (effect.is(setErrorLines)) {
          const ranges = effect.value
            .filter((idx) => idx >= 0 && idx < tr.state.doc.lines)
            .map((idx) => errorLineDecoration.range(tr.state.doc.line(idx + 1).from));
          decorations = Decoration.set(ranges);
        }
      }
      return decorations;
    },
  });

  $effect(() => {
    const editorState = EditorState.create({
      doc: `load [1024]\nadd 5\nadd 7\nstore [1024]\nhalt`,
      extensions: [
        keymap.of(defaultKeymap),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return;
          source = [...update.state.doc.iterLines()];
        }),
        errorLineField,
        EditorView.decorations.from(errorLineField),
        lineNumbers({
          formatNumber(lineNo, state) {
            return (lineNo - 1).toString();
          },
        }),
      ],
    });

    const editorView = new EditorView({ state: editorState });
    view = editorView;

    untrack(() => node?.appendChild(editorView.dom));

    return () => editorView.destroy();
  });

  $effect(() => {
    const lines = errorLines;
    view?.dispatch({ effects: setErrorLines.of(lines) });
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
      .error-line {
        @apply underline decoration-red-500 decoration-wavy;
      }
      .cm-gutterElement {
        @apply font-mono text-base text-left w-7;
      }
    }
  }
</style>
