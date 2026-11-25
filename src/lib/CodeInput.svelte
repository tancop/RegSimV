<script lang="ts">
  import {
    EditorState,
    StateEffect,
    StateField,
    type RangeSet,
    type Text,
  } from "@codemirror/state";
  import { Decoration, EditorView, keymap, lineNumbers } from "@codemirror/view";
  import { defaultKeymap } from "@codemirror/commands";
  import { untrack } from "svelte";

  interface Props {
    source: string[];
    errorLines: number[];
    lineCount: number;
  }

  let { source = $bindable(), errorLines, lineCount }: Props = $props();

  let node = $state<HTMLDivElement>();
  let view = $state<EditorView>();

  let lastEmitted: string[] | undefined;
  let lastLineCount = -1;

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

  function toDoc(lines: string[], count: number): string {
    const kept = Math.max(0, Math.min(lines.length, count));
    if (kept === 0) return "\n".repeat(Math.max(0, count - 1));
    return lines.slice(0, kept).join("\n") + "\n".repeat(count - kept);
  }

  function fromDoc(doc: Text): string[] {
    const lines: string[] = [];
    let end = 0;
    for (const text of doc.iterLines()) {
      lines.push(text);
      if (text.trim() !== "") end = lines.length;
    }
    lines.length = end;
    return lines;
  }

  function sameLines(a: string[], b: string[]): boolean {
    return a.length === b.length && a.every((line, i) => line === b[i]);
  }

  function moveDownOnEnter(editor: EditorView): boolean {
    const { state } = editor;
    const line = state.doc.lineAt(state.selection.main.head);
    if (line.number < state.doc.lines) {
      editor.dispatch({ selection: { anchor: state.doc.line(line.number + 1).from } });
    }
    return true;
  }

  $effect(() => {
    const editorState = EditorState.create({
      doc: untrack(() => toDoc(source, lineCount)),
      extensions: [
        keymap.of([{ key: "Enter", run: moveDownOnEnter }]),
        keymap.of(defaultKeymap),
        EditorState.transactionFilter.of((tr) => (tr.newDoc.lines === lineCount ? tr : [])),
        EditorView.updateListener.of((update) => {
          if (!update.docChanged) return;
          const next = fromDoc(update.state.doc);
          lastEmitted = next;
          source = next;
        }),
        errorLineField,
        EditorView.decorations.from(errorLineField),
        lineNumbers({
          formatNumber(lineNo) {
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
    const desired = source;
    const count = lineCount;
    const editor = view;
    if (!editor) return;
    if (desired === lastEmitted && count === lastLineCount) return;
    lastLineCount = count;
    if (editor.state.doc.lines === count && sameLines(desired, fromDoc(editor.state.doc))) {
      return;
    }
    editor.dispatch({
      changes: { from: 0, to: editor.state.doc.length, insert: toDoc(desired, count) },
    });
  });

  $effect(() => {
    const lines = errorLines;
    view?.dispatch({ effects: setErrorLines.of(lines) });
  });
</script>

<div class="overflow-auto" bind:this={node}></div>

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
      .cm-lineNumbers {
        @apply font-mono text-base text-left w-12;
      }
    }
  }
</style>
