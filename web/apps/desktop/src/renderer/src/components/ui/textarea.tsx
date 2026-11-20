import * as React from "react"
import { cn } from "cn"

/**
 * A multi-line text box. It grows with its text (`field-sizing: content`);
 * give it a `max-h-*` class to cap the growth, and it scrolls from there.
 */
function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex [field-sizing:content] min-h-8 w-full resize-none rounded-lg border border-border bg-field px-2.5 py-1.5 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
        className
      )}
      {...props}
    />
  )
}

export { Textarea }
