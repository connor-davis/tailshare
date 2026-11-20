import logo from "../../../../build/logo.svg"

/**
 * The window's own title bar: logo, name and a drag area. Windows draws the
 * real minimise, maximise and close buttons over the right edge, so the bar
 * keeps 138 px free there (3 buttons of 46 px).
 */
export function TitleBar() {
  return (
    <header className="flex h-8 shrink-0 items-center pr-[138px] select-none [-webkit-app-region:drag]">
      <div className="flex items-center gap-2 pl-3 text-xs font-medium">
        <img src={logo} alt="" className="size-4" />
        Tailshare
      </div>
    </header>
  )
}
