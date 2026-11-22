import type { Catalog } from "../../shared/i18n"
import type { en } from "./en"

/** Machine-drafted ar messages; native review is still needed. */
export const ar = {
  "roomIpc.fileCount": {
    zero: "الملفات: {count}",
    one: "الملفات: {count}",
    two: "الملفات: {count}",
    few: "الملفات: {count}",
    many: "الملفات: {count}",
    other: "الملفات: {count}",
  },
  "common.someone": "شخص ما",
  "common.file": "ملف",
  "config.theSidecarProgramIsMissingAtRun":
    "البرنامج المساعد غير موجود في {path}. شغّل «task build».",
  "explorerMenu.couldNotUpdateTheExplorerMenu": "تعذر تحديث قائمة المستكشف.",
  "explorerMenu.sendWithTailshare": "إرسال عبر Tailshare",
  "index.couldNotUpdateTheExplorerMenu": "تعذر تحديث قائمة المستكشف.",
  "index.tailshareCouldNotStart": "تعذر بدء Tailshare",
  "ipc.answerThisWindow": "تعذر على Tailshare الاستجابة لهذه النافذة.",
  "ipc.readThatRequest": "تعذر على Tailshare قراءة هذا الطلب.",
  "ipc.openThisReleaseLinkTryAgain":
    "تعذر على Tailshare فتح رابط الإصدار. حاول مرة أخرى.",
  "ipc.openThisAppTryAgain":
    "تعذر على Tailshare فتح هذا التطبيق. حاول مرة أخرى.",
  "ipc.readTheSidecarAddress":
    "تعذر على Tailshare قراءة عنوان البرنامج المساعد.",
  "ipc.readTheChosenFolder": "تعذر على Tailshare قراءة المجلد المختار.",
  "notify.sendWithTailshare": "إرسال عبر Tailshare",
  "notify.openARoomThenSendAgain": "افتح غرفة ثم أرسل مجددًا.",
  "notify.someoneWantsToJoin": "شخص يريد الانضمام",
  "notify.joinRequest": "يطلب {name} الانضمام إلى غرفتك.",
  "notify.transferFinished": "اكتمل النقل",
  "notify.transferDone": "اكتمل {name}.",
  "notify.transferFailed": "فشل النقل",
  "notify.transferFailedBody": "لم يكتمل {name}.",
  "notify.tailshareCouldNotReadThatRequest":
    "تعذر على Tailshare قراءة هذا الطلب.",
  "recentRooms.thatRoomIsNotValidCheckIt":
    "هذه الغرفة غير صالحة. تحقق منها وحاول مرة أخرى.",
  "recentRooms.tailshareCouldNotSaveYourRecentRooms":
    "تعذر على Tailshare حفظ غرفك الأخيرة. حاول مرة أخرى.",
  "roomIpc.thatRoomCodeIsNotValid": "رمز الغرفة غير صالح.",
  "roomIpc.thisRoomSSaveFolderIsMissing":
    "مجلد حفظ الغرفة مفقود أو ليس مجلدًا. اختر مجلدًا آخر لهذه الغرفة.",
  "roomIpc.tailshareCouldNotReadThatRequest":
    "تعذر على Tailshare قراءة هذا الطلب.",
  "roomIpc.tailshareCouldNotAddThoseFiles":
    "تعذر على Tailshare إضافة هذه الملفات.",
  "roomIpc.theOpenRoomChangedSendAgain": "تغيرت الغرفة المفتوحة. أرسل مجددًا.",
  "roomIpc.tailshareCouldNotAddTheseFiles":
    "تعذر على Tailshare إضافة هذه الملفات.",
  "roomIpc.thatPictureIsTooBigToPaste":
    "هذه الصورة كبيرة جدًا للصقها. الحد هو 25 MB.",
  "roomIpc.pastedPictureName": "صورة ملصقة {time}.png",
  "roomIpc.chooseADownloadsFolder": "اختر مجلدًا للتنزيلات.",
  "roomIpc.chooseARealFolderNotAShortcut":
    "اختر مجلدًا حقيقيًا، لا اختصارًا أو مجلدًا مفقودًا.",
  "roomIpc.couldNotOpenTheRoomFolder": "تعذر فتح مجلد الغرفة.",
  "roomIpc.tailshareCouldNotCompleteThatFileRequest":
    "تعذر على Tailshare إكمال طلب الملف.",
  "savedDownloads.tailshareCouldNotReadThatRequest":
    "تعذر على Tailshare قراءة هذا الطلب.",
  "settings.thoseSettingsAreNotValidCheckThem":
    "هذه الإعدادات غير صالحة. تحقق منها وحاول مرة أخرى.",
  "settings.tailshareCouldNotSaveYourSettingsTry":
    "تعذر على Tailshare حفظ إعداداتك. حاول مرة أخرى.",
  "sidecar.couldNotStart": "تعذر البدء: {details}",
  "sidecar.theSidecarDidNotStartInTime":
    "لم يبدأ البرنامج المساعد في الوقت المحدد.",
  "sidecar.theSidecar": "البرنامج المساعد {reason}.",
  "sidecar.theSidecarCouldNotBeStartedRestart":
    "تعذر بدء البرنامج المساعد. أعد تشغيل Tailshare.",
  "sidecar.theSidecarIsNotAnsweringYet": "البرنامج المساعد لا يستجيب بعد.",
  "sidecar.theSidecarSentA": "أرسل البرنامج المساعد {reason}.",
  "sidecar.theSidecarBeforeItWasReady":
    "البرنامج المساعد {reason} قبل أن يصبح جاهزًا.",
  "sidecar.healthCheckFailed": "فشل فحص الحالة: {details}",
  "tray.tailshare": "Tailshare",
  "tray.openTailshare": "فتح Tailshare",
  "tray.quit": "إنهاء",
  "trusted.readThatRequest": "تعذر على Tailshare قراءة هذا الطلب.",
  "trusted.readThatJoinRequest": "تعذر على Tailshare قراءة طلب الانضمام.",
  "trusted.computer": "جهاز",
  "trusted.youCanTrustUpTo100Computers":
    "يمكنك الوثوق بما يصل إلى 100 جهاز. أزل أحدها من الإعدادات أولًا.",
  "trusted.tailshareCouldNotAnswerThisWindow":
    "تعذر على Tailshare الاستجابة لهذه النافذة.",
  "trusted.tailshareCouldNotReadThatRequest":
    "تعذر على Tailshare قراءة هذا الطلب.",
  "updater.noReleaseNotes": "لا توجد ملاحظات إصدار.",
  "updater.noUpdateIsReadyWaitForThe":
    "لا يوجد تحديث جاهز. انتظر انتهاء التنزيل.",
  "updater.tailshareCouldNotRestartToUpdateTry":
    "تعذر على Tailshare إعادة التشغيل للتحديث. حاول مرة أخرى.",
  "window.tailshare": "Tailshare",
} satisfies Catalog<typeof en>
