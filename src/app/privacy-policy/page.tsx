import { AgreementContentPage } from "@/components/agreement-content-page";
import { getSystemSettings } from "@/lib/system-settings";

export default async function PrivacyPolicyPage() {
  const settings = await getSystemSettings();
  return <AgreementContentPage content={settings.privacyPolicyContent} />;
}
