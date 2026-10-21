/** Lower-case ASCII slug for file names ("Coiffe du Bouftou" → "coiffe-du-bouftou"). */
export function slugify(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

/** File name of a Photo: prefix, the Tenue items, then a timestamp. */
export function photoFileName(prefix: string, itemNames: string[], date: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
  return [prefix, ...itemNames.map(slugify), stamp].join("-") + ".png";
}

/** Saves the canvas (already at the camera's native resolution, mirrored like the preview) as a PNG download. */
export async function downloadCanvas(canvas: HTMLCanvasElement, fileName: string): Promise<void> {
  const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("Photo impossible");
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Shows 3, 2, 1 in `el`, one per second, then resolves. */
export async function countdown(el: HTMLElement, seconds = 3): Promise<void> {
  el.hidden = false;
  for (let s = seconds; s > 0; s--) {
    el.textContent = String(s);
    await new Promise(r => setTimeout(r, 1000));
  }
  el.hidden = true;
}
