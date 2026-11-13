# BonaMind Wear OS companion — signing notes

The watch app (`android/wear`) is a separate bundle that must be signed to
ship on the Play Store. It has the **same package name** as the phone app
(`com.auramind.app`; its Kotlin namespace stays `com.auramind.app.wear`) and
the **same release keystore and credentials** — see
`bonamind-web/android/keystore/README.md`. Both are required: the Wearable
Data Layer only connects a phone app and a watch app whose package name and
signing key match, and Play only ships a watch bundle in the phone app's
listing under that package name.

## Rules (identical to the phone app)

- The keystore and passwords **never enter git**. They come from CI secrets
  (`ANDROID_KEYSTORE_B64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`,
  `ANDROID_KEY_PASSWORD`) or a developer's `keystore.env`.
- The release build **loud-fails** without credentials — it never silently
  signs with the debug key.
- **Back up the keystore** (two offline copies: encrypted USB + password
  manager). Losing it means you cannot ship updates to the existing listing.

## Building

```bash
# Compile-only check (no credentials needed)
cd bonamind-web/android && ./gradlew :wear:assembleDebug

# Signed release (with ANDROID_KEYSTORE_* env vars set)
./gradlew :wear:bundleRelease
```

The release AAB lands at `wear/build/outputs/bundle/release/wear-release.aab`.

Its versionCode is `WEAR_VERSION_CODE` if set, otherwise
1,000,000,000 + `ANDROID_VERSION_CODE` (1 when neither is set). The phone and
watch bundles share one listing, and Play requires every bundle's
versionCode to be unique across form factors.

## Play Store note

The manifest declares `com.google.android.wearable.standalone=false`: the
watch gets its decks from the phone app and has no network code of its own.

1. In Play Console, open the BonaMind app → **Advanced settings → Form
   factors → Add form factor → Wear OS**. This creates the Wear OS tracks.
2. Run the **Mobile Android** workflow with `wear_track` set (`wear:qa` for
   internal testing, `wear:beta`, `wear:production`, or `wear:<name>` for a
   closed track you created). Blank uploads the phone bundle only.
3. Test on a real watch paired with a phone that has the same track's
   phone build before promoting.