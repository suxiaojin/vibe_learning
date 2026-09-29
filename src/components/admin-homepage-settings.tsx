import { ImageUp, RotateCcw, Save } from "lucide-react";
import { restoreHomepageImage, saveHomepageText, uploadHomepageImage } from "@/app/admin/settings/homepage-actions";
import {
  homepageImageLabels,
  homepageImageSlots,
  homepageTextGroups,
  type HomepageImageSlot,
  type HomepageText
} from "@/lib/homepage-settings";

type AdminHomepageSettingsProps = {
  content: HomepageText;
  imageUrls: Record<HomepageImageSlot, string>;
};

export function AdminHomepageSettings({ content, imageUrls }: AdminHomepageSettingsProps) {
  return (
    <div className="space-y-5">
      <section className="border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black text-ink">首页配置</h2>
        <p className="mt-1 text-sm text-slate-600">这里的文字显示在未登录首页和已登录的官网首页。保存文字不会更换图片。</p>

        <form action={saveHomepageText} className="mt-6 space-y-7">
          {homepageTextGroups.map((group) => (
            <fieldset className="border-t border-slate-100 pt-5" key={group.title}>
              <legend className="pr-3 text-base font-black text-ink">{group.title}</legend>
              <div className="grid gap-4 md:grid-cols-2">
                {group.fields.map((field) => {
                  const id = `homepage-${field.key}`;
                  const limit = field.maxLength ?? (field.multiline ? 240 : 80);
                  return (
                    <div className={field.multiline ? "md:col-span-2" : ""} key={field.key}>
                      <label className="label" htmlFor={id}>{field.label}</label>
                      {field.multiline ? (
                        <textarea
                          className="input min-h-20 rounded-none"
                          defaultValue={content[field.key]}
                          id={id}
                          maxLength={limit}
                          name={field.key}
                          required
                          rows={2}
                        />
                      ) : (
                        <input
                          className="input rounded-none"
                          defaultValue={content[field.key]}
                          id={id}
                          maxLength={limit}
                          name={field.key}
                          required
                          type="text"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </fieldset>
          ))}

          <div className="flex justify-end border-t border-slate-100 pt-5">
            <button className="primary-button rounded-none" type="submit">
              <Save size={16} />
              保存首页文字
            </button>
          </div>
        </form>
      </section>

      <section className="border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black text-ink">首页图片</h2>
        <p className="mt-1 text-sm text-slate-600">六张图片分别上传，保存其中一张不会覆盖其他图片。支持 PNG、JPG 和 WebP，单张不超过 5MB；系统会转换为 WebP。</p>
        <div className="mt-5 grid gap-4 xl:grid-cols-2">
          {homepageImageSlots.map((slot) => {
            const isCustom = imageUrls[slot].startsWith("/api/homepage/images/");
            return (
              <div className="border border-slate-200 p-4" key={slot}>
                <div className="flex items-start justify-between gap-3">
                  <h3 className="text-base font-black text-ink">{homepageImageLabels[slot]}</h3>
                  <span className="text-xs font-semibold text-slate-500">{isCustom ? "自定义图片" : "默认图片"}</span>
                </div>
                <div className="mt-4 flex h-44 items-center justify-center overflow-hidden bg-white">
                  <img alt={`${homepageImageLabels[slot]}当前预览`} className="h-full w-full object-contain" src={imageUrls[slot]} />
                </div>
                <form action={uploadHomepageImage} className="mt-4 flex flex-wrap items-end gap-3" encType="multipart/form-data">
                  <input name="slot" type="hidden" value={slot} />
                  <label className="min-w-[210px] flex-1 text-sm font-semibold text-slate-700">
                    选择新图片
                    <input
                      accept="image/png,image/jpeg,image/webp"
                      className="input mt-2 w-full rounded-none pt-2"
                      name="image"
                      required
                      type="file"
                    />
                  </label>
                  <button className="secondary-button rounded-none" type="submit">
                    <ImageUp size={16} />
                    上传并保存
                  </button>
                </form>
                {isCustom ? (
                  <form action={restoreHomepageImage} className="mt-2 flex justify-end">
                    <input name="slot" type="hidden" value={slot} />
                    <button className="inline-flex min-h-11 items-center gap-2 px-2 text-sm font-semibold text-slate-600 hover:text-teal" type="submit">
                      <RotateCcw size={15} />
                      恢复默认图片
                    </button>
                  </form>
                ) : null}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
