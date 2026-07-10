"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

const avatarUpdatedEventName = "vibe:avatar-updated";

export function StudentSidebarAvatar({ image, name }: { image: string; name: string }) {
  const [avatarImage, setAvatarImage] = useState(image);
  const className = "size-14 rounded-full object-cover shadow-sm";

  useEffect(() => {
    setAvatarImage(image);
  }, [image]);

  useEffect(() => {
    function handleAvatarUpdated(event: Event) {
      const detail = (event as CustomEvent<{ avatarImage?: string }>).detail;
      if (typeof detail?.avatarImage === "string") {
        setAvatarImage(detail.avatarImage);
      }
    }

    window.addEventListener(avatarUpdatedEventName, handleAvatarUpdated);
    return () => window.removeEventListener(avatarUpdatedEventName, handleAvatarUpdated);
  }, []);

  if (avatarImage) {
    return <Link href="/me?tab=homepage"><img alt={`${name} 的头像`} className={className} src={avatarImage} /></Link>;
  }

  return (
    <Link className="grid size-14 place-items-center rounded-full bg-success text-xl font-semibold text-white shadow-sm" href="/me?tab=homepage">
      {name.slice(0, 1).toUpperCase()}
    </Link>
  );
}
