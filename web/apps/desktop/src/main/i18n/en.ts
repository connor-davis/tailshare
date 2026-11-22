/** English source messages. Keys describe their owning surface and purpose. */
export const en = {
  "roomIpc.fileCount": { one: "{count} file", other: "{count} files" },

  "common.someone": "Someone",
  "common.file": "A file",

  "config.theSidecarProgramIsMissingAtRun":
    'The sidecar program is missing at {path}. Run "task build".',
  "explorerMenu.couldNotUpdateTheExplorerMenu":
    "Could not update the Explorer menu.",
  "explorerMenu.sendWithTailshare": "Send with Tailshare",
  "index.couldNotUpdateTheExplorerMenu": "Could not update the Explorer menu.",
  "index.tailshareCouldNotStart": "Tailshare could not start",

  "ipc.answerThisWindow": "Tailshare could not answer this window.",
  "ipc.readThatRequest": "Tailshare could not read that request.",
  "ipc.openThisReleaseLinkTryAgain":
    "Tailshare could not open this release link. Try again.",
  "ipc.openThisAppTryAgain": "Tailshare could not open this app. Try again.",
  "ipc.readTheSidecarAddress": "Tailshare could not read the sidecar address.",
  "ipc.readTheChosenFolder": "Tailshare could not read the chosen folder.",
  "notify.sendWithTailshare": "Send with Tailshare",
  "notify.openARoomThenSendAgain": "Open a room, then send again.",
  "notify.someoneWantsToJoin": "Someone wants to join",
  "notify.joinRequest": "{name} is asking to join your room.",
  "notify.transferFinished": "Transfer finished",
  "notify.transferDone": "{name} is done.",
  "notify.transferFailed": "Transfer failed",
  "notify.transferFailedBody": "{name} did not finish.",
  "notify.tailshareCouldNotReadThatRequest":
    "Tailshare could not read that request.",
  "recentRooms.thatRoomIsNotValidCheckIt":
    "That room is not valid. Check it and try again.",
  "recentRooms.tailshareCouldNotSaveYourRecentRooms":
    "Tailshare could not save your recent rooms. Try again.",
  "roomIpc.thatRoomCodeIsNotValid": "That room code is not valid.",

  "roomIpc.thisRoomSSaveFolderIsMissing":
    "This room's save folder is missing or not a folder. Choose another one for this room.",
  "roomIpc.tailshareCouldNotReadThatRequest":
    "Tailshare could not read that request.",
  "roomIpc.tailshareCouldNotAddThoseFiles":
    "Tailshare could not add those files.",
  "roomIpc.theOpenRoomChangedSendAgain": "The open room changed. Send again.",

  "roomIpc.tailshareCouldNotAddTheseFiles":
    "Tailshare could not add these files.",
  "roomIpc.thatPictureIsTooBigToPaste":
    "That picture is too big to paste. The limit is 25 MB.",
  "roomIpc.pastedPictureName": "Pasted picture {time}.png",
  "roomIpc.chooseADownloadsFolder": "Choose a downloads folder.",
  "roomIpc.chooseARealFolderNotAShortcut":
    "Choose a real folder, not a shortcut or a missing one.",
  "roomIpc.couldNotOpenTheRoomFolder": "Could not open the room folder.",
  "roomIpc.tailshareCouldNotCompleteThatFileRequest":
    "Tailshare could not complete that file request.",

  "savedDownloads.tailshareCouldNotReadThatRequest":
    "Tailshare could not read that request.",
  "settings.thoseSettingsAreNotValidCheckThem":
    "Those settings are not valid. Check them and try again.",
  "settings.tailshareCouldNotSaveYourSettingsTry":
    "Tailshare could not save your settings. Try again.",
  "sidecar.couldNotStart": "Could not start: {details}",
  "sidecar.theSidecarDidNotStartInTime": "The sidecar did not start in time.",
  "sidecar.theSidecar": "The sidecar {reason}.",
  "sidecar.theSidecarCouldNotBeStartedRestart":
    "The sidecar could not be started. Restart Tailshare.",
  "sidecar.theSidecarIsNotAnsweringYet": "The sidecar is not answering yet.",
  "sidecar.theSidecarSentA": "The sidecar sent a {reason}.",
  "sidecar.theSidecarBeforeItWasReady":
    "The sidecar {reason} before it was ready.",
  "sidecar.healthCheckFailed": "Health check failed: {details}",
  "tray.tailshare": "Tailshare",
  "tray.openTailshare": "Open Tailshare",
  "tray.quit": "Quit",

  "trusted.readThatRequest": "Tailshare could not read that request.",
  "trusted.readThatJoinRequest": "Tailshare could not read that join request.",
  "trusted.computer": "Computer",
  "trusted.youCanTrustUpTo100Computers":
    "You can trust up to 100 computers. Remove one in Settings first.",
  "trusted.tailshareCouldNotAnswerThisWindow":
    "Tailshare could not answer this window.",
  "trusted.tailshareCouldNotReadThatRequest":
    "Tailshare could not read that request.",
  "updater.noReleaseNotes": "No release notes.",
  "updater.noUpdateIsReadyWaitForThe":
    "No update is ready. Wait for the download to finish.",
  "updater.tailshareCouldNotRestartToUpdateTry":
    "Tailshare could not restart to update. Try again.",
  "window.tailshare": "Tailshare",
} as const
