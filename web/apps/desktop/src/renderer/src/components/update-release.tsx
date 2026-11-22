import { useT } from "@/i18n/provider"
import { useState } from "react"
import Markdown from "react-markdown"
import { isReleaseLink, type UpdateStatus } from "../../../shared/bridge"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { ScrollArea } from "@/components/ui/scroll-area"

const elements = [
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "ul",
  "ol",
  "li",
  "strong",
  "em",
  "code",
  "pre",
  "a",
  "blockquote",
  "hr",
  "br",
]

/**
 * Allowlisted Markdown release notes, shared by the top bar dialog and
 * Settings. Each surface places its own Download button.
 */
export function UpdateRelease({ status }: { status: UpdateStatus }) {
  const t = useT()

  const [error, setError] = useState("")

  return (
    <div className="grid min-w-0 gap-4">
      <ScrollArea className="h-[min(16rem,40vh)]">
        <div className="pr-4 text-sm leading-relaxed wrap-anywhere text-foreground [&_:is(h1,h2,h3,h4,h5,h6)]:mt-4 [&_:is(h1,h2,h3,h4,h5,h6)]:mb-2 [&_:is(h1,h2,h3,h4,h5,h6)]:font-semibold [&_blockquote]:my-3 [&_blockquote]:border-l [&_blockquote]:pl-3 [&_blockquote]:text-muted-foreground [&_code]:rounded-sm [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-xs [&_h1]:text-base [&_h2]:text-base [&_h3]:text-sm [&_h4]:text-sm [&_h5]:text-sm [&_h6]:text-sm [&_hr]:my-4 [&_hr]:border-border [&_li]:my-1 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-5 [&_p]:my-3 [&_pre]:my-3 [&_pre]:overflow-x-auto [&_pre]:rounded-md [&_pre]:border [&_pre]:bg-muted [&_pre]:p-3 [&_pre_code]:p-0 [&_strong]:font-semibold [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-5 [&>:first-child]:mt-0">
          <Markdown
            skipHtml
            allowedElements={elements}
            components={{
              a: ({ href, children }) => {
                const allowed = isReleaseLink(href)
                return (
                  <a
                    href={allowed ? href : undefined}
                    aria-disabled={!allowed}
                    className="rounded-sm text-link underline underline-offset-4 outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    onAuxClick={(event) => event.preventDefault()}
                    onClick={(event) => {
                      event.preventDefault()
                      if (allowed)
                        void window.tailshare
                          .openReleaseLink(href)
                          .catch(() => {
                            setError(
                              t("updateRelease.couldNotOpenThisReleaseLinkTry")
                            )
                          })
                    }}
                  >
                    {children}
                  </a>
                )
              },
            }}
          >
            {status.notes}
          </Markdown>
        </div>
      </ScrollArea>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
    </div>
  )
}
