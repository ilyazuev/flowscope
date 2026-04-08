import { useMemo } from 'react';
import { EditorView, GutterMarker, gutter, keymap } from '@codemirror/view';
import { EditorSelection, Extension } from '@codemirror/state';
import { StateEffect, StateField, RangeSet } from '@codemirror/state';

type ToggleBookmarkEffect = { pos: number; on: boolean };

const bookmarkEffect = StateEffect.define<ToggleBookmarkEffect>({
  map: (value, mapping) => ({
    pos: mapping.mapPos(value.pos),
    on: value.on,
  }),
});

class BookmarkMarker extends GutterMarker {
  toDOM() {
    const el = document.createElement('span');
    el.textContent = '🔖';
    el.style.fontSize = '12px';
    el.style.marginLeft = '-8px';
    return el;
  }
}

const bookmarkMarker = new BookmarkMarker();

const bookmarkState = StateField.define<RangeSet<GutterMarker>>({
  create() {
    return RangeSet.empty;
  },
  update(set, tr) {
    set = set.map(tr.changes);

    for (const effect of tr.effects) {
      if (effect.is(bookmarkEffect)) {
        const { pos, on } = effect.value;

        if (on) {
          set = set.update({
            add: [bookmarkMarker.range(pos)],
          });
        } else {
          set = set.update({
            filter: (from) => from !== pos,
          });
        }
      }
    }

    return set;
  },
});

function hasBookmark(view: EditorView, lineFrom: number): boolean {
  let found = false;
  view.state.field(bookmarkState).between(lineFrom, lineFrom, () => {
    found = true;
  });
  return found;
}

function toggleBookmark(view: EditorView, lineFrom: number) {
  const exists = hasBookmark(view, lineFrom);

  view.dispatch({
    effects: bookmarkEffect.of({
      pos: lineFrom,
      on: !exists,
    }),
  });
}

function getBookmarkLines(view: EditorView): number[] {
  const lines: number[] = [];
  view.state.field(bookmarkState).between(0, view.state.doc.length, (from) => {
    lines.push(from);
  });
  return lines.sort((a, b) => a - b);
}

function goToNextBookmark(view: EditorView): boolean {
  const currentPos = view.state.selection.main.head;
  const bookmarks = getBookmarkLines(view);

  if (!bookmarks.length) return true;

  const next = bookmarks.find((pos) => pos > currentPos) ?? bookmarks[0]; // cyclic transition

  view.dispatch({
    selection: EditorSelection.cursor(next),
    scrollIntoView: true,
  });

  view.focus();
  return true;
}

function goToPrevBookmark(view: EditorView): boolean {
  const currentPos = view.state.selection.main.head;
  const bookmarks = getBookmarkLines(view);

  if (!bookmarks.length) return true;

  const prev =
    [...bookmarks].reverse().find((pos) => pos < currentPos) ?? bookmarks[bookmarks.length - 1]; // циклический переход

  view.dispatch({
    selection: EditorSelection.cursor(prev),
    scrollIntoView: true,
  });

  view.focus();
  return true;
}

function toggleBookmarkAtCursor(view: EditorView): boolean {
  const line = view.state.doc.lineAt(view.state.selection.main.head);
  toggleBookmark(view, line.from);
  return true;
}

export function useBookmarkExtension(): Extension {
  return useMemo(
    () => [
      bookmarkState,
      gutter({
        class: 'cm-bookmark-gutter',
        markers: (view) => view.state.field(bookmarkState),
        initialSpacer: () => bookmarkMarker,
        domEventHandlers: {
          mousedown(view, line) {
            toggleBookmark(view, line.from);
            return true;
          },
        },
      }),
      keymap.of([
        { key: 'Ctrl-F2', run: toggleBookmarkAtCursor },
        { key: 'Mod-F2', run: toggleBookmarkAtCursor },
        { key: 'F2', run: goToNextBookmark },
        { key: 'Shift-F2', run: goToPrevBookmark },
      ]),
      EditorView.baseTheme({
        '.cm-bookmark-gutter': {
          width: '20px',
        },
        '.cm-bookmark-gutter .cm-gutterElement': {
          cursor: 'pointer',
          paddingLeft: '4px',
        },
      }),
    ],
    []
  );
}
