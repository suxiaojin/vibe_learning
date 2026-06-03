import { ForgotPasswordPanel } from "@/components/forgot-password-panel";
import { getSystemSettings } from "@/lib/system-settings";

export default async function ForgotPasswordPage() {
  const settings = await getSystemSettings();

  return (
    <main className="min-h-dvh bg-white">
      <section className="grid min-h-dvh lg:grid-cols-[39.5vw_1fr]">
        <div className="relative hidden min-h-full overflow-hidden bg-[#5d35ff] lg:block">
          <img
            alt="VibeLearning 找回密码页学习插图"
            className="absolute inset-0 size-full object-cover"
            src={settings.loginHeroImageUrl}
          />
          <div className="absolute inset-0 bg-gradient-to-b from-[#5836ff]/10 via-transparent to-[#120828]/20" />
        </div>

        <ForgotPasswordPanel settings={settings} />
      </section>
    </main>
  );
}
