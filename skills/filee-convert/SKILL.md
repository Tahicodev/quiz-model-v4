---
name: filee-convert
description: Convert files between formats (images, PDF, Word/Excel/PowerPoint, HWP, e-books, video, audio, archives, fonts, CAD, data files) using the installed `filee` CLI. Use whenever the user asks to convert, merge, split or compress a file. Never write custom conversion code.
---

## Rules
- Always use the `filee` command through the bash tool. NEVER write a script,
  install a library, or call another converter to do a conversion.
- If a format or option is unclear, run `filee help` first and read the output.
- If `filee` is not found, tell the user to install it from
  https://github.com/KnifeLemon/Filee/releases/latest. Do not work around it.

## Commands
filee convert photo.heic --to jpg
filee convert *.png --to webp --quality 80 -o converted
filee watch D:\Inbox --to pdf --move-originals

- `--to <format>`: target format (jpg, png, webp, pdf, docx, mp4, mp3, ...)
- `-o <dir>`: output folder (default: next to the original file)
- `--quality <n>`: quality for lossy formats

## Notes
- Output is saved next to the original unless `-o` is given.
- Some conversions need an optional engine that Filee downloads on demand:
  video/audio (FFmpeg), EPS/PS (Ghostscript), old Office formats (LibreOffice),
  LaTeX/rst/Org text formats (Pandoc), rare e-books (calibre).
  If a conversion fails because an engine is missing, report that to the user.
- Chained routes (e.g. HWP -> HWPX -> DOCX) are found automatically.

## After running
- Verify the output file exists and tell the user its path.
- If the command fails, show the error message. Do not retry with custom code.