import { useT } from "@/i18n/provider"
import { useState } from "react"
import { QRCodeSVG } from "qrcode.react"
import { announce } from "@/components/status-region"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { formatCode, joinLink } from "@/lib/code-input"

/**
 * The share code with copy actions and a QR dialog. The link is what a friend
 * clicks to join. `compact` is the one-line form for the room header; the
 * full form is big and centred, with the buttons under the code.
 */
export function ShareCode({
  code,
  compact = false,
}: {
  /** The code, with or without its dash. */
  code: string
  /** Smaller type and buttons, for the header. */
  compact?: boolean
}) {
  const t = useT()

  const [copied, setCopied] = useState<"code" | "link" | null>(null)
  const [failed, setFailed] = useState(false)
  const size = compact ? "sm" : "default"

  const copy = (kind: "code" | "link") => {
    const text = kind === "code" ? code.replace(/-/g, "") : joinLink(code)

    // Promise.resolve also covers a clipboard that throws before returning.
    Promise.resolve()
      .then(() => navigator.clipboard.writeText(text))
      .then(() => {
        setCopied(kind)
        setFailed(false)
        announce(
          kind === "code"
            ? t("shareCode.codeCopied")
            : t("shareCode.linkCopied")
        )
      })
      .catch(() => {
        setFailed(true)
        announce(t("shareCode.couldNotCopySelectTheCodeInstead"))
      })
  }

  return (
    <div
      className={
        compact
          ? "flex flex-wrap items-center gap-2"
          : "flex flex-col items-center gap-4"
      }
    >
      <p
        dir="ltr"
        className={
          compact
            ? "rounded-md bg-chrome px-3 py-1 font-mono text-base font-semibold tracking-widest text-primary tabular-nums"
            : "font-mono text-5xl font-semibold tracking-widest tabular-nums"
        }
      >
        {formatCode(code)}
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size={size} onClick={() => copy("code")}>
          {copied === "code" ? t("shareCode.copied") : t("shareCode.copyCode")}
        </Button>
        <Button variant="outline" size={size} onClick={() => copy("link")}>
          {copied === "link" ? t("shareCode.copied") : t("shareCode.copyLink")}
        </Button>
        <Dialog>
          <DialogTrigger asChild>
            <Button variant="outline" size={size}>
              {t("shareCode.showQr")}
            </Button>
          </DialogTrigger>
          <DialogContent className="p-6 sm:max-w-sm">
            <DialogHeader>
              <DialogTitle>{t("shareCode.qrTitle")}</DialogTitle>
              <DialogDescription>{t("shareCode.qrHint")}</DialogDescription>
            </DialogHeader>
            <div className="mx-auto max-w-full rounded-md bg-chrome-foreground p-4">
              <QRCodeSVG
                value={joinLink(code)}
                size={256}
                bgColor="var(--chrome-foreground)"
                fgColor="var(--chrome)"
                marginSize={4}
                role="img"
                aria-label={t("shareCode.qrLabel")}
                className="h-auto max-w-full"
              />
            </div>
            <p
              dir="ltr"
              className="text-center font-mono text-2xl font-semibold tracking-widest"
            >
              {formatCode(code)}
            </p>
          </DialogContent>
        </Dialog>
      </div>
      {failed ? (
        <p role="alert" className="text-sm text-destructive">
          {t("shareCode.couldNotCopySelectTheCodeAnd")}
        </p>
      ) : null}
    </div>
  )
}
