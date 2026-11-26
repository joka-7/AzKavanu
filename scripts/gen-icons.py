"""Regenerate every app icon and splash screen from the two masters in apps/web/icon/.

The masters are the logo split in two: ``art.png`` (the book and check mark, transparent)
and ``background.png`` (the blue gradient behind it). Keeping them apart lets each icon
place the art inside the area its platform never crops: Android's adaptive-icon safe zone,
the maskable-icon circle, or a round launcher.

Run from the repo root: ``python scripts/gen-icons.py`` (needs Pillow).
"""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
MASTERS = ROOT / "apps/web/icon"
PUBLIC = ROOT / "apps/web/public"
RES = ROOT / "apps/web/android/app/src/main/res"

ART = Image.open(MASTERS / "art.png").convert("RGBA")
ART = ART.crop(ART.getchannel("A").point(lambda a: 255 if a > 8 else 0).getbbox())
BACKGROUND = Image.open(MASTERS / "background.png").convert("RGB")

DENSITIES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
SPLASH_SIZES = {
    "mdpi": (320, 480),
    "hdpi": (480, 800),
    "xhdpi": (720, 1280),
    "xxhdpi": (960, 1600),
    "xxxhdpi": (1280, 1920),
}


def art_fitted(box: int) -> Image.Image:
    """The art scaled to fit a ``box`` x ``box`` square, keeping its proportions."""
    scale = box / max(ART.size)
    return ART.resize((round(ART.width * scale), round(ART.height * scale)), Image.LANCZOS)


def compose(width: int, height: int, art_box: float, transparent: bool = False) -> Image.Image:
    """Art centred on the background (or on nothing), taking ``art_box`` of the shorter side."""
    canvas = (
        Image.new("RGBA", (width, height), (0, 0, 0, 0))
        if transparent
        else BACKGROUND.resize((width, height), Image.LANCZOS).convert("RGBA")
    )
    art = art_fitted(round(min(width, height) * art_box))
    canvas.alpha_composite(art, ((width - art.width) // 2, (height - art.height) // 2))
    return canvas


def clipped(image: Image.Image, radius_ratio: float) -> Image.Image:
    """The image with rounded corners; a ratio of 0.5 makes a circle."""
    mask = Image.new("L", (image.width * 4, image.height * 4), 0)
    ImageDraw.Draw(mask).rounded_rectangle(
        (0, 0, mask.width - 1, mask.height - 1), radius=round(mask.width * radius_ratio), fill=255
    )
    out = image.copy()
    out.putalpha(mask.resize(image.size, Image.LANCZOS))
    return out


def save(image: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    image.save(path, optimize=True)


def web_icons() -> None:
    save(clipped(compose(512, 512, 0.86), 0.22), PUBLIC / "icon-512.png")
    save(clipped(compose(192, 192, 0.86), 0.22), PUBLIC / "icon-192.png")
    # Maskable: full bleed, art inside the central 80% circle every mask keeps.
    save(compose(512, 512, 0.62), PUBLIC / "icon-maskable-512.png")
    # iOS rounds the corners itself and shows transparency as black.
    save(compose(180, 180, 0.8).convert("RGB"), PUBLIC / "apple-touch-icon.png")
    save(clipped(compose(64, 64, 0.92), 0.22), PUBLIC / "favicon.png")


def android_icons() -> None:
    for name, scale in DENSITIES.items():
        folder = RES / f"mipmap-{name}"
        layer = round(108 * scale)
        # Adaptive layers: Android keeps the central 66 of 108 units visible under any mask.
        save(compose(layer, layer, 0.52, transparent=True), folder / "ic_launcher_foreground.png")
        save(BACKGROUND.resize((layer, layer), Image.LANCZOS), folder / "ic_launcher_background.png")
        legacy = round(48 * scale)
        save(clipped(compose(legacy, legacy, 0.84), 0.22), folder / "ic_launcher.png")
        save(clipped(compose(legacy, legacy, 0.7), 0.5), folder / "ic_launcher_round.png")


def splash_screens() -> None:
    for name, (short, long) in SPLASH_SIZES.items():
        save(compose(short, long, 0.55).convert("RGB"), RES / f"drawable-port-{name}" / "splash.png")
        save(compose(long, short, 0.55).convert("RGB"), RES / f"drawable-land-{name}" / "splash.png")
    save(compose(480, 320, 0.55).convert("RGB"), RES / "drawable" / "splash.png")


if __name__ == "__main__":
    web_icons()
    android_icons()
    splash_screens()
