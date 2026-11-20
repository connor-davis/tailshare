import type { ReactNode } from "react"
import { cn } from "cn"
import { Label } from "@/components/ui/label"

/** A bordered list of setting rows, split by thin lines. */
export function SettingList({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <div
      className={cn("divide-y overflow-hidden rounded-lg border", className)}
      {...props}
    />
  )
}

/** One setting: its words on the left, its control on the right. */
export function SettingRow({
  label,
  htmlFor,
  description,
  invalid,
  children,
}: {
  /** The setting's name. */
  label: string
  /** The id of the control, so the label names it. Leave out for a group. */
  htmlFor?: string
  /** What it does, in plain words. Shown in red when `invalid`. */
  description?: ReactNode
  /** True when the value is refused; turns the description into the reason. */
  invalid?: boolean
  /** The control. */
  children: ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-6 p-4">
      <div className="flex min-w-0 flex-col gap-1">
        <Label htmlFor={htmlFor}>{label}</Label>
        {description ? (
          <p
            className={cn(
              "text-sm",
              invalid ? "text-destructive" : "text-muted-foreground"
            )}
          >
            {description}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-2">{children}</div>
    </div>
  )
}
