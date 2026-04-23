import {
  useMemo,
  useCallback,
  useEffect,
  useRef,
  type JSX,
  useImperativeHandle,
  forwardRef,
  useState,
} from 'react';
import CodeMirror, { type ReactCodeMirrorRef } from '@uiw/react-codemirror';
import { sql } from '@codemirror/lang-sql';
import { EditorView, Decoration, type DecorationSet, keymap } from '@codemirror/view';
import { Compartment, StateField, StateEffect } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import {
  defaultKeymap,
  history,
  historyKeymap,
  redo,
  redoDepth,
  undo,
  undoDepth,
} from '@codemirror/commands';
import {
  closeSearchPanel,
  openSearchPanel,
  search,
  searchKeymap,
  searchPanelOpen,
} from '@codemirror/search';
import { Clipboard, Copy, Redo2, Scissors, Search, Undo2, WrapText } from 'lucide-react';

import { toast } from 'sonner';

import { useLineage } from '../store';
import type { SqlViewProps } from '../types';
import { useBookmarkExtension } from './SqlView.Bookmarks';
import { sqlCteFolding } from './SqlView.SqlCteFolding';

type HighlightRange = { from: number; to: number; className: string };

type ToolbarState = {
  hasSelection: boolean;
  canUndo: boolean;
  canRedo: boolean;
  isWrapped: boolean;
};

const setHighlights = StateEffect.define<HighlightRange[]>();
const lineWrappingCompartment = new Compartment();

const highlightField = StateField.define<DecorationSet>({
  create() {
    return Decoration.none;
  },
  update(highlights, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setHighlights)) {
        if (effect.value.length === 0) {
          return Decoration.none;
        }
        const marks = effect.value.map(({ from, to, className }) =>
          Decoration.mark({ class: className }).range(from, to)
        );
        return Decoration.set(marks);
      }
    }
    if (tr.docChanged) {
      return highlights.map(tr.changes);
    }
    return highlights;
  },
  provide: (f) => EditorView.decorations.from(f),
});

const baseTheme = EditorView.baseTheme({
  '.flowscope-sql-highlight-active': {
    backgroundColor: 'rgba(102, 126, 234, 0.3)',
    borderRadius: '2px',
  },
  '.flowscope-sql-highlight-error': {
    backgroundColor: 'rgba(239, 72, 111, 0.25)',
    borderRadius: '2px',
  },
  '.flowscope-sql-highlight-warning': {
    backgroundColor: 'rgba(244, 164, 98, 0.25)',
    borderRadius: '2px',
  },
  '.flowscope-sql-highlight-info': {
    backgroundColor: 'rgba(76, 97, 255, 0.15)',
    borderRadius: '2px',
  },
  '.flowscope-sql-view .cm-editor': {
    height: '100%',
  },
  '.flowscope-sql-view .cm-scroller': {
    overflow: 'auto',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, Liberation Mono, monospace',
  },
  '.flowscope-sql-view .cm-search': {
    padding: '8px',
    borderBottom: '1px solid rgba(127, 127, 127, 0.18)',
    gap: '6px',
  },
});

const toolbarButtonBaseClass =
  'inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent transition-colors duration-150 outline-none';
const toolbarButtonEnabledClass =
  'hover:bg-muted active:bg-muted/80 focus-visible:ring-2 focus-visible:ring-ring/50';
const toolbarButtonDisabledClass = 'cursor-not-allowed opacity-40';

export interface SqlViewSelection {
  from: number;
  to: number;
  head: number;
}

export type SqlViewRef = {
  getSelection: () => SqlViewSelection | undefined;
};

type ToolbarButtonProps = {
  title: string;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  active?: boolean;
  children: JSX.Element;
};

function ToolbarButton({
  title,
  onClick,
  disabled = false,
  active = false,
  children,
}: ToolbarButtonProps): JSX.Element {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      disabled={disabled}
      onMouseDown={(event) => {
        event.preventDefault();
      }}
      onClick={onClick}
      className={[
        toolbarButtonBaseClass,
        disabled ? toolbarButtonDisabledClass : toolbarButtonEnabledClass,
        active ? 'bg-muted text-foreground' : 'text-muted-foreground',
      ].join(' ')}
    >
      {children}
    </button>
  );
}

function ToolbarDivider(): JSX.Element {
  return <div className="mx-1 h-5 w-px shrink-0 bg-border" aria-hidden="true" />;
}

export const SqlView = forwardRef<SqlViewRef, SqlViewProps>(
  (
    {
      className,
      editable = false,
      onChange,
      value,
      isDark,
      highlightedSpan: highlightedSpanProp,
      lineWrapping = true,
    },
    ref
  ): JSX.Element => {
    const { state, actions } = useLineage();
    const isControlled = value !== undefined;

    // Warn in dev mode if highlightedSpan is passed without value (it will be ignored)
    if (
      process.env.NODE_ENV !== 'production' &&
      !isControlled &&
      highlightedSpanProp !== undefined
    ) {
      console.warn(
        'SqlView: `highlightedSpan` prop is ignored in uncontrolled mode. Pass a `value` prop to use controlled mode.'
      );
    }

    const sqlText = isControlled ? value : state.sql;
    // In controlled mode, prefer the prop; in uncontrolled mode, use store state
    // Normalize undefined to null for consistent type handling downstream
    const highlightedSpan = isControlled ? (highlightedSpanProp ?? null) : state.highlightedSpan;
    const issueHighlights = useMemo<HighlightRange[]>(() => {
      if (isControlled) {
        return [];
      }
      const issues = state.result?.issues ?? [];
      return issues
        .filter((issue) => issue.span)
        .map((issue) => {
          const className =
            issue.severity === 'error'
              ? 'flowscope-sql-highlight-error'
              : issue.severity === 'warning'
                ? 'flowscope-sql-highlight-warning'
                : 'flowscope-sql-highlight-info';
          return {
            from: issue.span!.start,
            to: issue.span!.end,
            className,
          };
        });
    }, [state.result, isControlled]);

    const editorRef = useRef<ReactCodeMirrorRef>(null);
    const [editorView, setEditorView] = useState<EditorView | null>(null);
    const [toolbarState, setToolbarState] = useState<ToolbarState>({
      hasSelection: false,
      canUndo: false,
      canRedo: false,
      isWrapped: lineWrapping,
    });

    const updateToolbarState = useCallback(
      (view: EditorView | null) => {
        if (!view) {
          return;
        }
        const mainSelection = view.state.selection.main;
        setToolbarState((prev) => ({
          ...prev,
          hasSelection: !mainSelection.empty,
          canUndo: editable && undoDepth(view.state) > 0,
          canRedo: editable && redoDepth(view.state) > 0,
        }));
      },
      [editable]
    );

    useImperativeHandle(ref, () => ({
      getSelection: () => {
        const view = editorRef.current?.view;
        const main = view?.state.selection.main;
        return main
          ? {
              from: main.from,
              to: main.to,
              head: main.head,
            }
          : undefined;
      },
    }));

    const bookmarkExtension = useBookmarkExtension();

    const extensions = useMemo(
      () => [
        sql({
          upperCaseKeywords: true,
        }),
        history(),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap]),
        search({ top: true }),
        highlightField,
        baseTheme,
        lineWrappingCompartment.of(lineWrapping ? [EditorView.lineWrapping] : []),
        EditorView.editable.of(editable),
        EditorView.updateListener.of((update) => {
          if (update.selectionSet || update.docChanged) {
            const mainSelection = update.state.selection.main;
            setToolbarState((prev) => ({
              ...prev,
              hasSelection: !mainSelection.empty,
              canUndo: editable && undoDepth(update.state) > 0,
              canRedo: editable && redoDepth(update.state) > 0,
            }));
          }
        }),
        bookmarkExtension,
        sqlCteFolding(),
      ],
      [editable, bookmarkExtension, lineWrapping]
    );

    const theme = useMemo(() => (isDark ? oneDark : 'light'), [isDark]);

    const handleChange = useCallback(
      (val: string) => {
        if (!isControlled) {
          actions.setSql(val);
        }
        onChange?.(val);
      },
      [actions, onChange, isControlled]
    );

    const handleUndo = useCallback(() => {
      const view = editorRef.current?.view ?? editorView;
      if (!view || !editable) {
        return;
      }
      undo(view);
      updateToolbarState(view);
      view.focus();
    }, [editable, editorView, updateToolbarState]);

    const handleRedo = useCallback(() => {
      const view = editorRef.current?.view ?? editorView;
      if (!view || !editable) {
        return;
      }
      redo(view);
      updateToolbarState(view);
      view.focus();
    }, [editable, editorView, updateToolbarState]);

    const showClipboardError = useCallback((action: 'cut' | 'copy' | 'paste', error: unknown) => {
      console.error(`Clipboard ${action} failed`, error);
      toast.error(`Failed to ${action}`, {
        description: 'Clipboard access is unavailable or blocked by the browser.',
      });
    }, []);

    const handleCopy = useCallback(async () => {
      const view = editorRef.current?.view ?? editorView;
      const selection = view?.state.selection.main;
      if (!view || !selection || selection.empty) {
        return;
      }
      try {
        const selectedText = view.state.sliceDoc(selection.from, selection.to);
        await navigator.clipboard.writeText(selectedText);
        view.focus();
      } catch (error) {
        showClipboardError('copy', error);
      }
    }, [editorView, showClipboardError]);

    const handleCut = useCallback(async () => {
      const view = editorRef.current?.view ?? editorView;
      const selection = view?.state.selection.main;
      if (!view || !editable || !selection || selection.empty) {
        return;
      }
      try {
        const selectedText = view.state.sliceDoc(selection.from, selection.to);
        await navigator.clipboard.writeText(selectedText);
        view.dispatch({
          changes: { from: selection.from, to: selection.to, insert: '' },
          selection: { anchor: selection.from },
        });
        updateToolbarState(view);
        view.focus();
      } catch (error) {
        showClipboardError('cut', error);
      }
    }, [editable, editorView, showClipboardError, updateToolbarState]);

    const handlePaste = useCallback(async () => {
      const view = editorRef.current?.view ?? editorView;
      if (!view || !editable) {
        return;
      }
      try {
        const text = await navigator.clipboard.readText();
        const selection = view.state.selection.main;
        view.dispatch({
          changes: { from: selection.from, to: selection.to, insert: text },
          selection: { anchor: selection.from + text.length },
        });
        updateToolbarState(view);
        view.focus();
      } catch (error) {
        showClipboardError('paste', error);
      }
    }, [editable, editorView, showClipboardError, updateToolbarState]);

    const handleWrapToggle = useCallback(() => {
      const view = editorRef.current?.view ?? editorView;
      if (!view) {
        return;
      }
      const nextWrapped = !toolbarState.isWrapped;
      view.dispatch({
        effects: lineWrappingCompartment.reconfigure(nextWrapped ? [EditorView.lineWrapping] : []),
      });
      setToolbarState((prev) => ({ ...prev, isWrapped: nextWrapped }));
      view.focus();
    }, [editorView, toolbarState.isWrapped]);

    const ensureReplaceVisible = useCallback((view: EditorView) => {
      requestAnimationFrame(() => {
        const searchPanel = view.dom.parentElement?.querySelector('.cm-search');
        if (!searchPanel) {
          return;
        }

        const replaceInput = searchPanel.querySelector('input[name="replace"]');
        if (replaceInput) {
          (replaceInput as HTMLInputElement).focus();
          return;
        }

        const toggleButton = searchPanel.querySelector(
          'button[name="toggleReplace"]'
        ) as HTMLButtonElement | null;
        toggleButton?.click();

        requestAnimationFrame(() => {
          const nextReplaceInput = searchPanel.querySelector(
            'input[name="replace"]'
          ) as HTMLInputElement | null;
          nextReplaceInput?.focus();
        });
      });
    }, []);

    const handleFind = useCallback(() => {
      const view = editorRef.current?.view ?? editorView;
      if (!view) {
        return;
      }

      if (searchPanelOpen(view.state)) {
        closeSearchPanel(view);
        view.focus();
        return;
      }

      openSearchPanel(view);
      ensureReplaceVisible(view);
    }, [editorView, ensureReplaceVisible]);

    useEffect(() => {
      const view = editorRef.current?.view || editorView;
      if (!view) return;

      const ranges: HighlightRange[] = [];
      if (!isControlled) {
        ranges.push(...issueHighlights);
      }
      if (highlightedSpan) {
        ranges.push({
          from: highlightedSpan.start,
          to: highlightedSpan.end,
          className: 'flowscope-sql-highlight-active',
        });
      }

      view.dispatch({
        effects: setHighlights.of(ranges),
      });

      if (highlightedSpan) {
        view.dispatch({
          selection: { anchor: highlightedSpan.start },
          scrollIntoView: true,
        });
      }

      updateToolbarState(view);
    }, [highlightedSpan, issueHighlights, isControlled, editorView, updateToolbarState]);

    const isMac = /mac/i.test(navigator.userAgent);
    const modKey = isMac ? '⌘' : 'Ctrl';
    const redoShortcut = isMac ? '⇧⌘Z' : 'Ctrl+Y';

    return (
      <div
        className={`flowscope-sql-view flex h-full w-full min-h-0 min-w-0 flex-col ${className || ''}`}
      >
        <div className="flex shrink-0 items-center gap-1 border-b bg-background px-2 py-1">
          <ToolbarButton
            title={`Cut (${modKey} + X)`}
            onClick={() => {
              void handleCut();
            }}
            disabled={!editable || !toolbarState.hasSelection}
          >
            <Scissors className="h-4 w-4" />
          </ToolbarButton>

          <ToolbarButton
            title={`Copy to clipboard (${modKey} + C)`}
            onClick={() => {
              void handleCopy();
            }}
            disabled={!toolbarState.hasSelection}
          >
            <Copy className="h-4 w-4" />
          </ToolbarButton>

          <ToolbarButton
            title={`Paste (${modKey} + V)`}
            onClick={() => {
              void handlePaste();
            }}
            disabled={!editable}
          >
            <Clipboard className="h-4 w-4" />
          </ToolbarButton>

          <ToolbarDivider />

          <ToolbarButton
            title={`Redo (${redoShortcut})`}
            onClick={handleRedo}
            disabled={!toolbarState.canRedo}
          >
            <Redo2 className="h-4 w-4" />
          </ToolbarButton>

          <ToolbarButton
            title={`Undo (${modKey} + Z)`}
            onClick={handleUndo}
            disabled={!toolbarState.canUndo}
          >
            <Undo2 className="h-4 w-4" />
          </ToolbarButton>

          <ToolbarDivider />

          <ToolbarButton
            title={toolbarState.isWrapped ? 'Unwrap lines' : 'Wrap lines'}
            onClick={handleWrapToggle}
            active={toolbarState.isWrapped}
          >
            <WrapText className="h-4 w-4" />
          </ToolbarButton>

          <ToolbarDivider />

          <ToolbarButton title={`Find / replace (${modKey} + F)`} onClick={handleFind}>
            <Search className="h-4 w-4" />
          </ToolbarButton>
        </div>

        <div className="min-h-0 min-w-0 flex-1">
          <CodeMirror
            ref={editorRef}
            value={sqlText}
            onChange={handleChange}
            onCreateEditor={(view) => {
              setEditorView(view);
              updateToolbarState(view);
            }}
            extensions={extensions}
            editable={editable}
            theme={theme}
            basicSetup={{
              lineNumbers: true,
              highlightActiveLineGutter: true,
              foldGutter: true,
            }}
            className="flowscope-codemirror h-full w-full"
          />
        </div>
      </div>
    );
  }
);
