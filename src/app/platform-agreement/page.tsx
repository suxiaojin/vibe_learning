import { AgreementContentPage } from "@/components/agreement-content-page";
import { getSystemSettings } from "@/lib/system-settings";

export default async function PlatformAgreementPage() {
  const settings = await getSystemSettings(["platformAgreementContent"]);
  return <AgreementContentPage content={settings.platformAgreementContent} />;
}
