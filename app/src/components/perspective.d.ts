declare global {
  namespace React.JSX {
    // noinspection JSUnusedGlobalSymbols
    interface IntrinsicElements {
      "perspective-viewer": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement>,
        HTMLElement
      > & {
        ref?: React.Ref<HTMLElement>;
        theme?: string;
      };
    }
  }
}

export {};