export const DEFAULT_AVATARS = [
  { id: "student-01", label: "默认头像 01", src: "/assets/avatars/default/student-01.webp" },
  { id: "student-02", label: "默认头像 02", src: "/assets/avatars/default/student-02.webp" },
  { id: "student-03", label: "默认头像 03", src: "/assets/avatars/default/student-03.webp" },
  { id: "student-04", label: "默认头像 04", src: "/assets/avatars/default/student-04.webp" },
  { id: "student-05", label: "默认头像 05", src: "/assets/avatars/default/student-05.webp" },
  { id: "student-06", label: "默认头像 06", src: "/assets/avatars/default/student-06.webp" },
  { id: "student-07", label: "默认头像 07", src: "/assets/avatars/default/student-07.webp" },
  { id: "student-08", label: "默认头像 08", src: "/assets/avatars/default/student-08.webp" },
  { id: "student-09", label: "默认头像 09", src: "/assets/avatars/default/student-09.webp" },
  { id: "student-10", label: "默认头像 10", src: "/assets/avatars/default/student-10.webp" },
  { id: "student-11", label: "默认头像 11", src: "/assets/avatars/default/student-11.webp" },
  { id: "student-12", label: "默认头像 12", src: "/assets/avatars/default/student-12.webp" }
] as const;

const DEFAULT_AVATAR_SRC_SET: ReadonlySet<string> = new Set(DEFAULT_AVATARS.map((avatar) => avatar.src));

export function isDefaultAvatarSrc(value: string) {
  return DEFAULT_AVATAR_SRC_SET.has(value);
}
