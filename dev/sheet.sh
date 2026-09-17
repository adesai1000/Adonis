#!/bin/sh
# Re-shoot the diamond preview (light + dark, big + tracker) into one sheet.
# usage: dev/sheet.sh out.png [port]
set -e
OUT=${1:-sheet.png}
PORT=${2:-5173}
D=$(mktemp -d)
node dev/shoot.mjs --url "http://localhost:$PORT/dev/diamond.html" --out $D/lb.png --selector "[data-shot=big]" --wait 2500 >/dev/null
node dev/shoot.mjs --url "http://localhost:$PORT/dev/diamond.html" --out $D/lt.png --selector "[data-shot=tracker]" --wait 2500 >/dev/null
node dev/shoot.mjs --url "http://localhost:$PORT/dev/diamond.html?theme=dark" --out $D/db.png --selector "[data-shot=big]" --wait 2500 >/dev/null
node dev/shoot.mjs --url "http://localhost:$PORT/dev/diamond.html?theme=dark" --out $D/dt.png --selector "[data-shot=tracker]" --wait 2500 >/dev/null
python3 - "$D" "$OUT" <<'PY'
import sys
from PIL import Image
d, out = sys.argv[1], sys.argv[2]
ims = [Image.open(f"{d}/{n}.png") for n in ["lb", "lt", "db", "dt"]]
# tracker shots: crop to the grid and blow up 2x so 36px stones can be judged
def zoom(im):
    im = im.crop((60, 180, 1180, im.height))
    return im.resize((im.width * 2, im.height * 2), Image.NEAREST)
lt, dt = zoom(ims[1]), zoom(ims[3])
w = max(ims[0].width, lt.width)
h = ims[0].height + lt.height + ims[2].height + dt.height + 30
sheet = Image.new("RGB", (w, h), (128, 128, 128))
y = 0
for im in [ims[0], lt, ims[2], dt]:
    sheet.paste(im, (0, y)); y += im.height + 10
sheet.save(out)
print("wrote", out, sheet.size)
PY
rm -rf "$D"
