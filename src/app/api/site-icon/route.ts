import { getSystemSettings } from "@/lib/system-settings";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const defaultIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="9" fill="#f4f7fb"/>
  <path d="M5 9.5c4.4-1.4 7.9-.7 11 2v13c-3.1-2.7-6.6-3.4-11-2z" fill="#1f9d8a"/>
  <path d="M27 9.5c-4.4-1.4-7.9-.7-11 2v13c3.1-2.7 6.6-3.4 11-2z" fill="#1f9d8a"/>
  <path d="M16 11.5v13" fill="none" stroke="#f4f7fb" stroke-linecap="round" stroke-width="1.5"/>
  <path d="m23 4 .9 2.1L26 7l-2.1.9L23 10l-.9-2.1L20 7l2.1-.9z" fill="#ffc857"/>
</svg>`;

const iconHeaders = {
  "cache-control": "public, max-age=31536000, immutable",
  "x-content-type-options": "nosniff"
};

export async function GET() {
  const { browserTabIconData } = await getSystemSettings(["browserTabIconData"]);
  const match = browserTabIconData.match(/^data:(image\/png|image\/x-icon);base64,([a-z0-9+/=]+)$/i);

  if (!match) {
    return new Response(defaultIcon, {
      headers: {
        ...iconHeaders,
        "content-type": "image/svg+xml; charset=utf-8"
      }
    });
  }

  return new Response(Buffer.from(match[2], "base64"), {
    headers: {
      ...iconHeaders,
      "content-type": match[1]
    }
  });
}
