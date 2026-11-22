import type { Catalog } from "../../shared/i18n"
import type { en } from "./en"

/** Machine-drafted de messages; native review is still needed. */
export const de = {
  "roomIpc.fileCount": {
    one: "{count} Datei",
    other: "{count} Dateien",
  },
  "common.someone": "Jemand",
  "common.file": "Eine Datei",
  "config.theSidecarProgramIsMissingAtRun":
    "Das Hilfsprogramm fehlt unter {path}. Führe „task build“ aus.",
  "explorerMenu.couldNotUpdateTheExplorerMenu":
    "Explorer-Menü konnte nicht aktualisiert werden.",
  "explorerMenu.sendWithTailshare": "Mit Tailshare senden",
  "index.couldNotUpdateTheExplorerMenu":
    "Explorer-Menü konnte nicht aktualisiert werden.",
  "index.tailshareCouldNotStart": "Tailshare konnte nicht gestartet werden",
  "ipc.answerThisWindow": "Tailshare konnte diesem Fenster nicht antworten.",
  "ipc.readThatRequest": "Tailshare konnte diese Anfrage nicht lesen.",
  "ipc.openThisReleaseLinkTryAgain":
    "Tailshare konnte diesen Versionslink nicht öffnen. Versuche es erneut.",
  "ipc.openThisAppTryAgain":
    "Tailshare konnte diese App nicht öffnen. Versuche es erneut.",
  "ipc.readTheSidecarAddress":
    "Tailshare konnte die Adresse des Hilfsprogramms nicht lesen.",
  "ipc.readTheChosenFolder":
    "Tailshare konnte den gewählten Ordner nicht lesen.",
  "notify.sendWithTailshare": "Mit Tailshare senden",
  "notify.openARoomThenSendAgain": "Öffne einen Raum und sende erneut.",
  "notify.someoneWantsToJoin": "Jemand möchte beitreten",
  "notify.joinRequest": "{name} möchte deinem Raum beitreten.",
  "notify.transferFinished": "Übertragung abgeschlossen",
  "notify.transferDone": "{name} ist fertig.",
  "notify.transferFailed": "Übertragung fehlgeschlagen",
  "notify.transferFailedBody": "{name} wurde nicht abgeschlossen.",
  "notify.tailshareCouldNotReadThatRequest":
    "Tailshare konnte diese Anfrage nicht lesen.",
  "recentRooms.thatRoomIsNotValidCheckIt":
    "Dieser Raum ist ungültig. Prüfe ihn und versuche es erneut.",
  "recentRooms.tailshareCouldNotSaveYourRecentRooms":
    "Tailshare konnte deine letzten Räume nicht speichern. Versuche es erneut.",
  "roomIpc.thatRoomCodeIsNotValid": "Dieser Raumcode ist ungültig.",
  "roomIpc.thisRoomSSaveFolderIsMissing":
    "Der Speicherordner dieses Raums fehlt oder ist kein Ordner. Wähle einen anderen für diesen Raum.",
  "roomIpc.tailshareCouldNotReadThatRequest":
    "Tailshare konnte diese Anfrage nicht lesen.",
  "roomIpc.tailshareCouldNotAddThoseFiles":
    "Tailshare konnte diese Dateien nicht hinzufügen.",
  "roomIpc.theOpenRoomChangedSendAgain":
    "Der offene Raum hat sich geändert. Sende erneut.",
  "roomIpc.tailshareCouldNotAddTheseFiles":
    "Tailshare konnte diese Dateien nicht hinzufügen.",
  "roomIpc.thatPictureIsTooBigToPaste":
    "Dieses Bild ist zu groß zum Einfügen. Die Grenze liegt bei 25 MB.",
  "roomIpc.pastedPictureName": "Eingefügtes Bild {time}.png",
  "roomIpc.chooseADownloadsFolder": "Wähle einen Downloadordner.",
  "roomIpc.chooseARealFolderNotAShortcut":
    "Wähle einen echten Ordner, keinen Link oder fehlenden Ordner.",
  "roomIpc.couldNotOpenTheRoomFolder":
    "Raumordner konnte nicht geöffnet werden.",
  "roomIpc.tailshareCouldNotCompleteThatFileRequest":
    "Tailshare konnte diese Dateianfrage nicht abschließen.",
  "savedDownloads.tailshareCouldNotReadThatRequest":
    "Tailshare konnte diese Anfrage nicht lesen.",
  "settings.thoseSettingsAreNotValidCheckThem":
    "Diese Einstellungen sind ungültig. Prüfe sie und versuche es erneut.",
  "settings.tailshareCouldNotSaveYourSettingsTry":
    "Tailshare konnte deine Einstellungen nicht speichern. Versuche es erneut.",
  "sidecar.couldNotStart": "Start fehlgeschlagen: {details}",
  "sidecar.theSidecarDidNotStartInTime":
    "Das Hilfsprogramm wurde nicht rechtzeitig gestartet.",
  "sidecar.theSidecar": "Das Hilfsprogramm {reason}.",
  "sidecar.theSidecarCouldNotBeStartedRestart":
    "Das Hilfsprogramm konnte nicht gestartet werden. Starte Tailshare neu.",
  "sidecar.theSidecarIsNotAnsweringYet":
    "Das Hilfsprogramm antwortet noch nicht.",
  "sidecar.theSidecarSentA": "Das Hilfsprogramm hat {reason} gesendet.",
  "sidecar.theSidecarBeforeItWasReady":
    "Das Hilfsprogramm {reason}, bevor es bereit war.",
  "sidecar.healthCheckFailed": "Zustandsprüfung fehlgeschlagen: {details}",
  "tray.tailshare": "Tailshare",
  "tray.openTailshare": "Tailshare öffnen",
  "tray.quit": "Beenden",
  "trusted.readThatRequest": "Tailshare konnte diese Anfrage nicht lesen.",
  "trusted.readThatJoinRequest":
    "Tailshare konnte diese Beitrittsanfrage nicht lesen.",
  "trusted.computer": "Computer",
  "trusted.youCanTrustUpTo100Computers":
    "Du kannst bis zu 100 Computern vertrauen. Entferne zuerst einen in den Einstellungen.",
  "trusted.tailshareCouldNotAnswerThisWindow":
    "Tailshare konnte diesem Fenster nicht antworten.",
  "trusted.tailshareCouldNotReadThatRequest":
    "Tailshare konnte diese Anfrage nicht lesen.",
  "updater.noReleaseNotes": "Keine Versionshinweise.",
  "updater.noUpdateIsReadyWaitForThe":
    "Kein Update ist bereit. Warte, bis der Download beendet ist.",
  "updater.tailshareCouldNotRestartToUpdateTry":
    "Tailshare konnte zum Aktualisieren nicht neu starten. Versuche es erneut.",
  "window.tailshare": "Tailshare",
} satisfies Catalog<typeof en>
