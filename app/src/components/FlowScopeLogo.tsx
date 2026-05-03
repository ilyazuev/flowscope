// interface FlowScopeLogoProps {
//   className?: string;
// }

/**
 * FlowScope duck logo with theme-aware shadow coloring.
 * The shadow paths use currentColor which inherits from the parent's text color.
 */
export function FlowScopeLogo() { // { className }: FlowScopeLogoProps
  return (
    <img src={import.meta.env.VITE_APP_LOGO} alt="logo" className={"max-w-15"} />
  );  
}
