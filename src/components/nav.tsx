import { getCurrentUser } from "@/lib/auth";
import { PublicNav } from "@/components/public-nav";

export async function Nav() {
  const user = await getCurrentUser();

  if (user) {
    return null;
  }

  return <PublicNav />;
}
