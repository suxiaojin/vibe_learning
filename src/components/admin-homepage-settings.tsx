import { ChevronDown, ImageUp, RotateCcw, Save } from "lucide-react";
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
  openGroup?: string;
  openImage?: string;
};

export function AdminHomepageSettings({ content, imageUrls, openGroup, openImage }: AdminHomepageSettingsProps) {
  return (
    <div className="space-y-5">
      <section className="border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black text-ink">首页配置</h2>
        <p className="mt-1 text-sm text-slate-600">按分组展开编辑，每组单独保存。保存当前分组不会覆盖其他文字或图片。</p>

        <div className="mt-5 space-y-3">
          {homepageTextGroups.map((group) => (
            <details className="group border border-slate-200 bg-slate-50/40" key={group.id} open={openGroup === group.id}>
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40 [&::-webkit-details-marker]:hidden">
                <span className="text-base font-black text-ink">{group.title}</span>
                <span className="flex shrink-0 items-center gap-3 text-xs font-semibold text-slate-500">
                  {group.fields.length} 项配置
                  <ChevronDown aria-hidden="true" className="transition-transform group-open:rotate-180" size={18} />
                </span>
              </summary>
              <div className="border-t border-slate-200 bg-white px-4 py-5">
                <form action={saveHomepageText}>
                  <input name="group" type="hidden" value={group.id} />
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
                  <div className="mt-5 flex justify-end border-t border-slate-100 pt-4">
                    <button className="primary-button rounded-none" type="submit">
                      <Save size={16} />
                      保存{group.title}
                    </button>
                  </div>
                </form>
              </div>
            </details>
          ))}
        </div>
      </section>

      <section className="border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black text-ink">首页图片</h2>
        <p className="mt-1 text-sm text-slate-600">展开对应图片即可预览、上传或恢复默认。六张图片分别保存，支持 PNG、JPG 和 WebP，单张不超过 5MB。</p>
        <div className="mt-5 space-y-3">
          {homepageImageSlots.map((slot) => {
            const isCustom = imageUrls[slot].startsWith("/api/homepage/images/");
            return (
              <details className="group border border-slate-200 bg-slate-50/40" key={slot} open={openImage === slot}>
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40 [&::-webkit-details-marker]:hidden">
                  <span className="text-base font-black text-ink">{homepageImageLabels[slot]}</span>
                  <span className="flex shrink-0 items-center gap-3 text-xs font-semibold text-slate-500">
                    {isCustom ? "自定义图片" : "默认图片"}
                    <ChevronDown aria-hidden="true" className="transition-transform group-open:rotate-180" size={18} />
                  </span>
                </summary>
                <div className="border-t border-slate-200 bg-white px-4 py-5">
                  <div className="flex h-44 items-center justify-center overflow-hidden bg-white">
                    <img alt={`${homepageImageLabels[slot]}当前预览`} className="h-full w-full object-contain" src={imageUrls[slot]} />
                  </div>
                  <form action={uploadHomepageImage} className="mt-4 flex flex-wrap items-end gap-3">
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
              </details>
            );
          })}
        </div>
      </section>
    </div>
  );
}
