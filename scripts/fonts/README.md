# Splash-rendering fonts

These are the TrueType versions of the existing Bricolage Grotesque and Figtree app fonts, used only by `scripts/generate-native-assets.mjs`. Pango/Fontconfig cannot reliably register the browser WOFF2 files, so the asset generator uses TTF files to avoid silently falling back to a different font. The installed web client continues using its existing bundled WOFF2 files.

Sources: [Bricolage Grotesque](https://github.com/google/fonts/tree/main/ofl/bricolagegrotesque) and [Figtree](https://github.com/google/fonts/tree/main/ofl/figtree) in the official Google Fonts repository. Both use the SIL Open Font License; the corresponding license files are included here. Downloaded 14 November 2026.
