// POST /api/extract — turns an attached requirements file (.docx, .txt, .md) into plain text.
import mammoth from "mammoth";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const name = decodeURIComponent(req.headers.get("x-filename") || "file").toLowerCase();
  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.length > 5_000_000) return Response.json({ error: "File too large (max 5 MB)" }, { status: 400 });
  try {
    let text = "";
    if (name.endsWith(".docx")) text = (await mammoth.extractRawText({ buffer: buf })).value;
    else if (/\.(txt|md|markdown|csv)$/.test(name)) text = buf.toString("utf8");
    else return Response.json({ error: "Use a .docx, .txt or .md file (or paste the text)." }, { status: 400 });
    text = text.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();
    return Response.json({ text, chars: text.length });
  } catch (e: any) {
    return Response.json({ error: `Could not read file: ${e.message}` }, { status: 400 });
  }
}
