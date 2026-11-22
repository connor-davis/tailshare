import type { Catalog } from "../../shared/i18n"
import type { en } from "./en"

/** Machine-drafted es messages; native review is still needed. */
export const es = {
  "roomIpc.fileCount": {
    one: "{count} archivo",
    many: "{count} archivos",
    other: "{count} archivos",
  },
  "common.someone": "Alguien",
  "common.file": "Un archivo",
  "config.theSidecarProgramIsMissingAtRun":
    "Falta el programa auxiliar en {path}. Ejecuta «task build».",
  "explorerMenu.couldNotUpdateTheExplorerMenu":
    "No se pudo actualizar el menú del Explorador.",
  "explorerMenu.sendWithTailshare": "Enviar con Tailshare",
  "index.couldNotUpdateTheExplorerMenu":
    "No se pudo actualizar el menú del Explorador.",
  "index.tailshareCouldNotStart": "Tailshare no pudo iniciarse",
  "ipc.answerThisWindow": "Tailshare no pudo responder a esta ventana.",
  "ipc.readThatRequest": "Tailshare no pudo leer esa solicitud.",
  "ipc.openThisReleaseLinkTryAgain":
    "Tailshare no pudo abrir el enlace de la versión. Inténtalo de nuevo.",
  "ipc.openThisAppTryAgain":
    "Tailshare no pudo abrir esta app. Inténtalo de nuevo.",
  "ipc.readTheSidecarAddress":
    "Tailshare no pudo leer la dirección del programa auxiliar.",
  "ipc.readTheChosenFolder": "Tailshare no pudo leer la carpeta elegida.",
  "notify.sendWithTailshare": "Enviar con Tailshare",
  "notify.openARoomThenSendAgain": "Abre una sala y vuelve a enviar.",
  "notify.someoneWantsToJoin": "Alguien quiere entrar",
  "notify.joinRequest": "{name} pide entrar en tu sala.",
  "notify.transferFinished": "Transferencia terminada",
  "notify.transferDone": "{name} terminó.",
  "notify.transferFailed": "Transferencia fallida",
  "notify.transferFailedBody": "{name} no terminó.",
  "notify.tailshareCouldNotReadThatRequest":
    "Tailshare no pudo leer esa solicitud.",
  "recentRooms.thatRoomIsNotValidCheckIt":
    "Esa sala no es válida. Revísala e inténtalo de nuevo.",
  "recentRooms.tailshareCouldNotSaveYourRecentRooms":
    "Tailshare no pudo guardar tus salas recientes. Inténtalo de nuevo.",
  "roomIpc.thatRoomCodeIsNotValid": "Ese código de sala no es válido.",
  "roomIpc.thisRoomSSaveFolderIsMissing":
    "La carpeta de esta sala no existe o no es una carpeta. Elige otra.",
  "roomIpc.tailshareCouldNotReadThatRequest":
    "Tailshare no pudo leer esa solicitud.",
  "roomIpc.tailshareCouldNotAddThoseFiles":
    "Tailshare no pudo añadir esos archivos.",
  "roomIpc.theOpenRoomChangedSendAgain":
    "La sala abierta ha cambiado. Vuelve a enviar.",
  "roomIpc.tailshareCouldNotAddTheseFiles":
    "Tailshare no pudo añadir estos archivos.",
  "roomIpc.thatPictureIsTooBigToPaste":
    "Esa imagen es demasiado grande para pegarla. El límite es 25 MB.",
  "roomIpc.pastedPictureName": "Imagen pegada {time}.png",
  "roomIpc.chooseADownloadsFolder": "Elige una carpeta de descargas.",
  "roomIpc.chooseARealFolderNotAShortcut":
    "Elige una carpeta real, no un acceso directo ni una que no exista.",
  "roomIpc.couldNotOpenTheRoomFolder":
    "No se pudo abrir la carpeta de la sala.",
  "roomIpc.tailshareCouldNotCompleteThatFileRequest":
    "Tailshare no pudo completar esa solicitud de archivo.",
  "savedDownloads.tailshareCouldNotReadThatRequest":
    "Tailshare no pudo leer esa solicitud.",
  "settings.thoseSettingsAreNotValidCheckThem":
    "Esos ajustes no son válidos. Revísalos e inténtalo de nuevo.",
  "settings.tailshareCouldNotSaveYourSettingsTry":
    "Tailshare no pudo guardar tus ajustes. Inténtalo de nuevo.",
  "sidecar.couldNotStart": "No se pudo iniciar: {details}",
  "sidecar.theSidecarDidNotStartInTime":
    "El programa auxiliar no se inició a tiempo.",
  "sidecar.theSidecar": "El programa auxiliar {reason}.",
  "sidecar.theSidecarCouldNotBeStartedRestart":
    "No se pudo iniciar el programa auxiliar. Reinicia Tailshare.",
  "sidecar.theSidecarIsNotAnsweringYet":
    "El programa auxiliar aún no responde.",
  "sidecar.theSidecarSentA": "El programa auxiliar envió {reason}.",
  "sidecar.theSidecarBeforeItWasReady":
    "El programa auxiliar {reason} antes de estar listo.",
  "sidecar.healthCheckFailed": "Falló la comprobación de estado: {details}",
  "tray.tailshare": "Tailshare",
  "tray.openTailshare": "Abrir Tailshare",
  "tray.quit": "Salir",
  "trusted.readThatRequest": "Tailshare no pudo leer esa solicitud.",
  "trusted.readThatJoinRequest":
    "Tailshare no pudo leer esa solicitud de entrada.",
  "trusted.computer": "Equipo",
  "trusted.youCanTrustUpTo100Computers":
    "Puedes confiar en hasta 100 equipos. Elimina uno en Ajustes primero.",
  "trusted.tailshareCouldNotAnswerThisWindow":
    "Tailshare no pudo responder a esta ventana.",
  "trusted.tailshareCouldNotReadThatRequest":
    "Tailshare no pudo leer esa solicitud.",
  "updater.noReleaseNotes": "No hay notas de la versión.",
  "updater.noUpdateIsReadyWaitForThe":
    "No hay actualizaciones listas. Espera a que termine la descarga.",
  "updater.tailshareCouldNotRestartToUpdateTry":
    "Tailshare no pudo reiniciarse para actualizar. Inténtalo de nuevo.",
  "window.tailshare": "Tailshare",
} satisfies Catalog<typeof en>
