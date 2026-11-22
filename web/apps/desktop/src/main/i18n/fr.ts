import type { Catalog } from "../../shared/i18n"
import type { en } from "./en"

/** Machine-drafted fr messages; native review is still needed. */
export const fr = {
  "roomIpc.fileCount": {
    one: "{count} fichier",
    many: "{count} fichiers",
    other: "{count} fichiers",
  },
  "common.someone": "Quelqu’un",
  "common.file": "Un fichier",
  "config.theSidecarProgramIsMissingAtRun":
    "Le programme auxiliaire manque à {path}. Exécutez « task build ».",
  "explorerMenu.couldNotUpdateTheExplorerMenu":
    "Impossible de mettre à jour le menu de l’Explorateur.",
  "explorerMenu.sendWithTailshare": "Envoyer avec Tailshare",
  "index.couldNotUpdateTheExplorerMenu":
    "Impossible de mettre à jour le menu de l’Explorateur.",
  "index.tailshareCouldNotStart": "Tailshare n’a pas pu démarrer",
  "ipc.answerThisWindow": "Tailshare n’a pas pu répondre à cette fenêtre.",
  "ipc.readThatRequest": "Tailshare n’a pas pu lire cette demande.",
  "ipc.openThisReleaseLinkTryAgain":
    "Tailshare n’a pas pu ouvrir ce lien de version. Réessayez.",
  "ipc.openThisAppTryAgain":
    "Tailshare n’a pas pu ouvrir cette appli. Réessayez.",
  "ipc.readTheSidecarAddress":
    "Tailshare n’a pas pu lire l’adresse du programme auxiliaire.",
  "ipc.readTheChosenFolder": "Tailshare n’a pas pu lire le dossier choisi.",
  "notify.sendWithTailshare": "Envoyer avec Tailshare",
  "notify.openARoomThenSendAgain": "Ouvrez un salon, puis renvoyez.",
  "notify.someoneWantsToJoin": "Quelqu’un souhaite rejoindre le salon",
  "notify.joinRequest": "{name} demande à rejoindre votre salon.",
  "notify.transferFinished": "Transfert terminé",
  "notify.transferDone": "{name} est terminé.",
  "notify.transferFailed": "Échec du transfert",
  "notify.transferFailedBody": "{name} ne s’est pas terminé.",
  "notify.tailshareCouldNotReadThatRequest":
    "Tailshare n’a pas pu lire cette demande.",
  "recentRooms.thatRoomIsNotValidCheckIt":
    "Ce salon n’est pas valide. Vérifiez-le et réessayez.",
  "recentRooms.tailshareCouldNotSaveYourRecentRooms":
    "Tailshare n’a pas pu enregistrer vos salons récents. Réessayez.",
  "roomIpc.thatRoomCodeIsNotValid": "Ce code de salon n’est pas valide.",
  "roomIpc.thisRoomSSaveFolderIsMissing":
    "Le dossier de ce salon est introuvable ou n’est pas un dossier. Choisissez-en un autre.",
  "roomIpc.tailshareCouldNotReadThatRequest":
    "Tailshare n’a pas pu lire cette demande.",
  "roomIpc.tailshareCouldNotAddThoseFiles":
    "Tailshare n’a pas pu ajouter ces fichiers.",
  "roomIpc.theOpenRoomChangedSendAgain": "Le salon ouvert a changé. Renvoyez.",
  "roomIpc.tailshareCouldNotAddTheseFiles":
    "Tailshare n’a pas pu ajouter ces fichiers.",
  "roomIpc.thatPictureIsTooBigToPaste":
    "Cette image est trop grande pour être collée. La limite est de 25 MB.",
  "roomIpc.pastedPictureName": "Image collée {time}.png",
  "roomIpc.chooseADownloadsFolder": "Choisissez un dossier de téléchargement.",
  "roomIpc.chooseARealFolderNotAShortcut":
    "Choisissez un vrai dossier, pas un raccourci ou un dossier absent.",
  "roomIpc.couldNotOpenTheRoomFolder":
    "Impossible d’ouvrir le dossier du salon.",
  "roomIpc.tailshareCouldNotCompleteThatFileRequest":
    "Tailshare n’a pas pu traiter cette demande de fichier.",
  "savedDownloads.tailshareCouldNotReadThatRequest":
    "Tailshare n’a pas pu lire cette demande.",
  "settings.thoseSettingsAreNotValidCheckThem":
    "Ces paramètres ne sont pas valides. Vérifiez-les et réessayez.",
  "settings.tailshareCouldNotSaveYourSettingsTry":
    "Tailshare n’a pas pu enregistrer vos paramètres. Réessayez.",
  "sidecar.couldNotStart": "Impossible de démarrer : {details}",
  "sidecar.theSidecarDidNotStartInTime":
    "Le programme auxiliaire n’a pas démarré à temps.",
  "sidecar.theSidecar": "Le programme auxiliaire {reason}.",
  "sidecar.theSidecarCouldNotBeStartedRestart":
    "Impossible de démarrer le programme auxiliaire. Redémarrez Tailshare.",
  "sidecar.theSidecarIsNotAnsweringYet":
    "Le programme auxiliaire ne répond pas encore.",
  "sidecar.theSidecarSentA": "Le programme auxiliaire a envoyé {reason}.",
  "sidecar.theSidecarBeforeItWasReady":
    "Le programme auxiliaire {reason} avant d’être prêt.",
  "sidecar.healthCheckFailed": "Échec du contrôle d’état : {details}",
  "tray.tailshare": "Tailshare",
  "tray.openTailshare": "Ouvrir Tailshare",
  "tray.quit": "Quitter",
  "trusted.readThatRequest": "Tailshare n’a pas pu lire cette demande.",
  "trusted.readThatJoinRequest":
    "Tailshare n’a pas pu lire cette demande d’arrivée.",
  "trusted.computer": "Ordinateur",
  "trusted.youCanTrustUpTo100Computers":
    "Vous pouvez enregistrer 100 ordinateurs de confiance. Retirez-en un dans les paramètres.",
  "trusted.tailshareCouldNotAnswerThisWindow":
    "Tailshare n’a pas pu répondre à cette fenêtre.",
  "trusted.tailshareCouldNotReadThatRequest":
    "Tailshare n’a pas pu lire cette demande.",
  "updater.noReleaseNotes": "Aucune note de version.",
  "updater.noUpdateIsReadyWaitForThe":
    "Aucune mise à jour n’est prête. Attendez la fin du téléchargement.",
  "updater.tailshareCouldNotRestartToUpdateTry":
    "Tailshare n’a pas pu redémarrer pour se mettre à jour. Réessayez.",
  "window.tailshare": "Tailshare",
} satisfies Catalog<typeof en>
