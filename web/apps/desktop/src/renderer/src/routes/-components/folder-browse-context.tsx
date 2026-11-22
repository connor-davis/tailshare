import { createContext } from "react"

/** The folder shown in the expanded Files tile. */
export interface BrowseFolder {
  path: string
  name: string
  scope: "local" | "peer"
}

/** Lets a folder card in Chat or Files open the room's existing Files tile. */
export const FolderBrowseContext = createContext<
  (folder: BrowseFolder) => void
>(() => {})
