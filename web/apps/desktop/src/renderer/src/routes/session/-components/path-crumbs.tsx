import { Fragment } from "react"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

/** The folder trail of one pane. Each earlier step is a button. */
export function PathCrumbs({
  rootName,
  path,
  onGo,
}: {
  /** Name shown for the shared folder itself. */
  rootName: string
  /** Current folder, slash separated; empty for the shared folder. */
  path: string
  /** Called with the folder to open. */
  onGo: (path: string) => void
}) {
  const parts = path === "" ? [] : path.split("/")
  const trail = [
    { label: rootName, target: "" },
    ...parts.map((part, index) => ({
      label: part,
      target: parts.slice(0, index + 1).join("/"),
    })),
  ]

  return (
    <Breadcrumb className="min-w-0 flex-1">
      <BreadcrumbList className="flex-nowrap overflow-hidden">
        {trail.map((step, index) => (
          <Fragment key={step.target}>
            {index > 0 ? <BreadcrumbSeparator /> : null}
            <BreadcrumbItem className="min-w-0">
              {index === trail.length - 1 ? (
                <BreadcrumbPage className="truncate" title={step.label}>
                  {step.label}
                </BreadcrumbPage>
              ) : (
                <button
                  type="button"
                  className="min-h-8 truncate rounded-sm px-1 text-link hover:underline"
                  title={step.label}
                  onClick={() => onGo(step.target)}
                >
                  {step.label}
                </button>
              )}
            </BreadcrumbItem>
          </Fragment>
        ))}
      </BreadcrumbList>
    </Breadcrumb>
  )
}
