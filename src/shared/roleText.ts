import type { Role } from "./types";

export const ROLE_LABEL: Record<Role, string> = {
  MAFIA: "Mafia",
  DOCTOR: "Doctor",
  DETECTIVE: "Detective",
  CITIZEN: "Citizen",
  SHEIK: "Sheik of Citizens",
  SNIPER: "Sniper",
  UPRIGHT: "Upright Citizen",
};

export const ROLE_LABEL_AR: Record<Role, string> = {
  MAFIA: "المافيا",
  DOCTOR: "الطبيب",
  DETECTIVE: "الشرطي",
  CITIZEN: "مواطن",
  SHEIK: "شيخ المواطنين",
  SNIPER: "القناص",
  UPRIGHT: "المواطن الصالح",
};

export const ROLE_BLURB: Record<Role, string> = {
  MAFIA: "كل ليلة، اتفق مع أفراد المافيا على ضحية واحدة.",
  DOCTOR: "كل ليلة، اختر شخصاً واحداً لتحميه من المافيا.",
  DETECTIVE: "كل ليلة، تحقّق من شخص واحد لتعرف إن كان من المافيا.",
  CITIZEN: "نَم طوال الليل. وفي النهار، اكشف المافيا وصوّت لإخراجهم.",
  SHEIK: "إذا صوّتت المدينة لإخراجك، تكشف كارتك وتنجو مرة واحدة، ويصبح صوتك بثلاثة أصوات.",
  SNIPER: "معك رصاصة واحدة طوال اللعبة. إن أصبت مافيا تنجو، وإن أصبت بريئاً تموتان معاً.",
  UPRIGHT: "إذا صوّتت المدينة لإخراجك، تسحب معك لاعباً واحداً تختاره.",
};

/** "المافيا (Mafia)" — Arabic name with the English one in brackets. */
export const roleTitle = (r: Role) => `${ROLE_LABEL_AR[r]} (${ROLE_LABEL[r]})`;
