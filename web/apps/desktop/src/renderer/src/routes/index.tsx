import { createFileRoute } from "@tanstack/react-router"
import { Button } from "@/components/ui/button"

/** The shell placeholder; connection controls arrive in step 11. */
export const Route = createFileRoute("/")({ component: Home })

function Home() {
  return (
    <main className="flex min-h-screen flex-col items-start justify-center gap-4 p-8">
      <h1 className="text-xl font-semibold">Tailshare</h1>
      <Button disabled>Connect (coming soon)</Button>
    </main>
  )
}
