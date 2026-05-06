import * as React from 'react';
import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@radix-ui/react-popover';


export function ClickableTooltip({ children, content }: { children: React.ReactNode; content: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <span
          onClick={(e) => {
            e.stopPropagation();
            setOpen(true);
          }}
          style={{cursor: 'pointer'}}
        >
          {children}
        </span>
      </PopoverTrigger>
      <PopoverContent
        side="top"
        align="center"
        className="z-[9999] rounded-lg border bg-popover px-3 py-1.5 text-sm shadow-md"
      >
        <div className="flex items-center gap-2">
          <span>{content}</span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              setOpen(false);
            }}
            className="ml-2 rounded-sm opacity-70 hover:opacity-100"
            aria-label="close"
          >
            ✕
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
