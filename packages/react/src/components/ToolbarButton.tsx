import type { JSX } from 'react';

const toolbarButtonBaseClass =
  'inline-flex h-8 w-8 items-center justify-center rounded-md border border-transparent transition-colors duration-150 outline-none';
const toolbarButtonEnabledClass =
  'hover:bg-muted active:bg-muted/80 focus-visible:ring-2 focus-visible:ring-ring/50';
const toolbarButtonDisabledClass = 'cursor-not-allowed opacity-40';


type ToolbarButtonProps = {
  title: string;
  onClick: () => void | Promise<void>;
  disabled?: boolean;
  active?: boolean;
  children: JSX.Element;
};

export function ToolbarButton({
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