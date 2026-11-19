import { contextBridge } from "electron"
import type { TailshareBridge } from "../shared/bridge"

const bridge: TailshareBridge = Object.freeze({})

contextBridge.exposeInMainWorld("tailshare", bridge)
