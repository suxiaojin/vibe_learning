import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";

export default async function HomePage() {
  const user = await getCurrentUser();
  if (user?.role === "admin") {
    redirect("/admin");
  }
  if (user) {
    redirect("/learn");
  }
  redirect("/login");
}
