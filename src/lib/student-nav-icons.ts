export const studentNavIconSlots = [
  { key: "learn", settingKey: "studentNavIconLearnKey", label: "学习" },
  { key: "course-center", settingKey: "studentNavIconCourseCenterKey", label: "课程中心" },
  { key: "study-buddy", settingKey: "studentNavIconStudyBuddyKey", label: "学习搭子" },
  { key: "buddy-circle", settingKey: "studentNavIconBuddyCircleKey", label: "搭子圈" },
  { key: "profile", settingKey: "studentNavIconProfileKey", label: "个人档案" },
  { key: "more", settingKey: "studentNavIconMoreKey", label: "更多" }
] as const;

export type StudentNavIconKey = (typeof studentNavIconSlots)[number]["key"];

export function getStudentNavIconSlot(key: string) {
  return studentNavIconSlots.find((slot) => slot.key === key) ?? null;
}
