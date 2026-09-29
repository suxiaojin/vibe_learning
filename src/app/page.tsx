import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { MarketingHomepage } from "@/components/marketing-homepage";
import { getCurrentUser } from "@/lib/auth";
import { getHomepageImageUrls, getHomepageText } from "@/lib/homepage-settings";

export async function generateMetadata(): Promise<Metadata> {
  const content = await getHomepageText();
  return {
    title: content.brand,
    description: `${content.heroDescriptionLead}${content.heroDescriptionMore}`
  };
}

export default async function HomePage({
  searchParams
}: {
  searchParams?: Promise<{ intro?: string }>;
}) {
  const [user, params] = await Promise.all([getCurrentUser(), searchParams]);
  if (user && params?.intro !== "1") {
    redirect("/learn");
  }

  const [content, images] = await Promise.all([getHomepageText(), getHomepageImageUrls()]);
  return <MarketingHomepage signedIn={Boolean(user)} content={content} images={images} />;
}
