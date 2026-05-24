import { JSX, useCallback, useRef } from 'react';
import { useLineageActions } from '../store';
import { sanitizeIdentifier } from '../utils/sanitize';
import { cn } from '@pondpilot/flowscope-app/src/lib/utils';
import { SearchCode } from 'lucide-react';
import { Span } from '@pondpilot/flowscope-core';
import { NavigationRequest } from '../types';

interface SpansProps {
  spans?: Span[];
  sourceName?: string;
  name: string;
  type: NavigationRequest['targetType'];
}

export function Spans({
  spans,
  sourceName,
  name,
  type,
}: SpansProps): JSX.Element | null {
  if( !spans || spans.length == 0 ) {
    return null;
  }
  const { highlightSpan, requestNavigation } = useLineageActions();
  const currentSpanIndex = useRef(0);
  const handleSearchInText = useCallback(() => {
    if (!spans.length) {
      return;
    }
    const span = spans[currentSpanIndex.current];
    currentSpanIndex.current =
      currentSpanIndex.current < spans.length - 1 ? currentSpanIndex.current + 1 : 0;
    highlightSpan(span);
    if (sourceName) {
      requestNavigation({
        sourceName: sourceName,
        span: span,
        targetName: sanitizeIdentifier(name),
        targetType: type,
      });
    }
  }, [spans, currentSpanIndex, highlightSpan, requestNavigation]);
  return (
    <div className={'flex rounded-full items-center bg-slate-200 dark:bg-slate-900'}>
      <button
        type="button"
        className={cn(
          'nodrag self-center flex size-6 shrink-0 items-center justify-center rounded-full border-transparent outline-none transition-colors duration-200',
          'bg-transparent text-slate-700 hover:bg-slate-100 hover:text-slate-900',
          'dark:text-slate-200 dark:hover:bg-slate-700 dark:hover:text-white'
        )}
        aria-label="Search in text"
        title="Search in text"
        onClick={(event) => {
          event.stopPropagation();
          handleSearchInText();
        }}
      >
        <SearchCode size={14} style={{ opacity: 0.75 }} />
      </button>
      <span className={'pr-3'}>{spans.length}</span>
    </div>
  );
}