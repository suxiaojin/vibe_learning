import { AgreementContentPage } from "@/components/agreement-content-page";
import { getSystemSettings } from "@/lib/system-settings";

export default async function UserAgreementPage() {
  const settings = await getSystemSettings();
  return <AgreementContentPage title="用户协议" content={settings.userAgreementContent} />;
}
