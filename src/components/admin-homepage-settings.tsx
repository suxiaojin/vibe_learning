import { ChevronDown, ImageUp, RotateCcw, Save } from "lucide-react";
import { restoreHomepageImage, saveHomepageText, uploadHomepageImage } from "@/app/admin/settings/homepage-actions";
import {
  homepageImageLabels,
  homepageImageSlots,
  homepageTextGroups,
  type HomepageMediaMap,
  type HomepageText
} from "@/lib/homepage-settings";

type AdminHomepageSettingsProps = {
  content: HomepageText;
  media: HomepageMediaMap;
  openGroup?: string;
  openImage?: string;
};

export function AdminHomepageSettings({ content, media, openGroup, openImage }: AdminHomepageSettingsProps) {
  return (
    <div className="space-y-5">
      <section className="border border-slate-200 bg-white p-5 shadow-sm">
        <h2 className="text-lg font-black text-ink">首页配置</h2>
        <p className="mt-1 text-sm text-slate-600">按分组展开编辑，每组单独保存。保存当前分组不会覆盖其他文字或素材。</p>

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
        <h2 className="text-lg font-black text-ink">首页图片与视频</h2>
        <p className="mt-1 text-sm text-slate-600">六个位置均可上传图片或 MP4 视频，分别保存。图片支持 PNG、JPG、WebP，最大 5MB；MP4 最大 50MB，建议使用 H.264 编码。</p>
        <div className="mt-5 space-y-3">
          {homepageImageSlots.map((slot) => {
            const current = media[slot];
            const isCustom = current.url.startsWith("/api/homepage/images/");
            return (
              <details className="group border border-slate-200 bg-slate-50/40" key={slot} open={openImage === slot}>
                <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal/40 [&::-webkit-details-marker]:hidden">
                  <span className="text-base font-black text-ink">{homepageImageLabels[slot]}</span>
                  <span className="flex shrink-0 items-center gap-3 text-xs font-semibold text-slate-500">
                    {isCustom ? (current.type === "video" ? "自定义视频" : "自定义图片") : "默认图片"}
                    <ChevronDown aria-hidden="true" className="transition-transform group-open:rotate-180" size={18} />
                  </span>
                </summary>
                <div className="border-t border-slate-200 bg-white px-4 py-5">
                  <div className="flex h-44 items-center justify-center overflow-hidden bg-white">
                    {current.type === "video" ? (
                      <video aria-label={`${homepageImageLabels[slot]}当前视频预览`} className="h-full w-full object-contain" controls playsInline preload="none" src={current.url} />
                    ) : (
                      <img alt={`${homepageImageLabels[slot]}当前预览`} className="h-full w-full object-contain" src={current.url} />
                    )}
                  </div>
                  <form action={uploadHomepageImage} className="mt-4 flex flex-wrap items-end gap-3">
                    <input name="slot" type="hidden" value={slot} />
                    <label className="min-w-[210px] flex-1 text-sm font-semibold text-slate-700">
                      选择图片或 MP4 视频
                      <input
                        accept="image/png,image/jpeg,image/webp,video/mp4,.mp4"
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
