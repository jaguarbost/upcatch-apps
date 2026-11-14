# UpCatch — App Store upload checklist

## Already created a demo project or package in Xcode?

1. Save the demo if you want to keep it, then close its Xcode window. Leave its generated files in that separate project.
2. Follow section 0 below to clone UpCatch into `~/Developer/upcatch-capacitor`, configure `.env.local`, and run the build commands. If you already cloned it, use the existing-clone commands instead.
3. Open UpCatch with `open ios/App/App.xcodeproj` from the UpCatch folder. Let Swift packages resolve. Do not create another Xcode project or copy the demo files into UpCatch.
4. Select the blue **App** project in the left sidebar, then **TARGETS → App → Signing & Capabilities**. Enable **Automatically manage signing** and select your Apple Developer team. Keep **Bundle Identifier: `uk.co.upcatch.app`**. The organization identifier, if asked, is `uk.co.upcatch`.
5. Connect your iPhone, select it as the run destination, and click **Run ▶**. Complete the device checks in section 2.
6. After testing passes, follow section 3 to archive and upload the existing UpCatch app.

## 0. Get the project from Git on your Mac

Install Xcode from the App Store and Node **22** from [Node.js downloads](https://nodejs.org/en/download). Open Xcode once and install its requested iOS components. In Terminal, run these commands one at a time:

```sh
sudo xcode-select --switch /Applications/Xcode.app/Contents/Developer
sudo xcodebuild -license accept
sudo xcodebuild -runFirstLaunch
node --version
npx --yes pnpm@10.30.3 --version
mkdir -p ~/Developer
cd ~/Developer
```

Clone the confirmed Capacitor repository's `main` branch:

```sh
git clone --branch main https://github.com/jaguarbost/upcatch-apps.git upcatch-capacitor
cd upcatch-capacitor
git log -1 --oneline
nano .env.local
```

If GitHub asks you to authenticate for a private repository, complete its sign-in flow; your normal GitHub account password is not a Git HTTPS password. For an existing clone, check its remote and branch before updating:

```sh
cd ~/Developer/upcatch-capacitor
git remote -v
git status --short
git switch main
git pull --ff-only
```

Stop if the checkout has local changes or the pull fails; keep those changes intact.

Git includes the source, iOS project, assets and lockfile. It excludes `.env.local`. In `nano .env.local`, paste these lines and fill the three public values from the Windows project's `.env.local`, using the same Supabase project and OneSignal app:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
NEXT_PUBLIC_ONESIGNAL_APP_ID=
MOBILE_API_BASE_URL=https://www.upcatch.uk
```

Save with **Control+O**, **Enter**, then **Control+X**. Keep server secrets on the deployed backend; do not copy Supabase secret/service-role keys, OneSignal API keys, Resend keys or cron secrets.

Then run these commands one at a time; stop if one fails:

```sh
npx --yes pnpm@10.30.3 install --frozen-lockfile
unset CAPACITOR_SERVER_URL
npx --yes pnpm@10.30.3 native:bundle
npx --yes pnpm@10.30.3 native:sync
npx --yes pnpm@10.30.3 native:check
npx --yes pnpm@10.30.3 native:release-check
open ios/App/App.xcodeproj
```

Open this existing Xcode project directly. Do not create a new app or import individual files. The organization identifier is `uk.co.upcatch`; the existing app bundle identifier is `uk.co.upcatch.app`.

## 1. Sign in and open the project

- On your Mac, open **Xcode → Settings → Accounts** and sign in with your Apple Account. Select a team enrolled in the Apple Developer Program; a Personal Team cannot upload to the App Store.
- Open **`ios/App/App.xcodeproj`** from this project. Let Swift packages finish resolving.
- Select the blue **App** project, then the **App target → Signing & Capabilities**. Enable **Automatically manage signing**, choose your developer team, and resolve any signing errors. Check **Push Notifications** is enabled and configure the team's APNs credentials in OneSignal before testing push.

## 2. Prepare and test

The commands above prepare the native bundle and copy it into the iOS project. In Xcode:

- Confirm **Bundle Identifier: `uk.co.upcatch.app`**, **Version: `2.0.1`**, **Build: `5`** (current repository values). If build 5 was already uploaded, increment the build number before archiving and keep the repository version settings aligned.
- Run on a real iPhone. Complete the device checks in [native-release-operations.md](native-release-operations.md), including offline launch, sign-in/return links, photos, location, meetup flows and push. Resolve failures before uploading.

## 3. Archive and upload

1. In [App Store Connect](https://appstoreconnect.apple.com/), open the existing UpCatch app or create its iOS app record using bundle ID **`uk.co.upcatch.app`**.
2. In Xcode, select the **App** scheme and an iOS device/archive destination, rather than a simulator.
3. Choose **Product → Archive**. In **Window → Organizer → Archives**, select the archive and check its version/build.
4. Choose **Distribute App → App Store Connect** and follow the upload prompts with automatic signing. Resolve validation errors and finish the upload. Labels can vary by Xcode version.
5. Wait for processing, then open **App Store Connect → UpCatch → TestFlight**. Answer export-compliance questions accurately and install the build through TestFlight for final testing.

## 4. Submit for review

Complete screenshots, privacy disclosures, age rating, support/privacy URLs and review access instructions using [native-store-listing.md](native-store-listing.md). Select the processed build for the App Store version and submit for review when testing passes. Uploading alone does not publish the app.

Record the upload/build and device results in [native-release-plan.md](native-release-plan.md). No iOS archive or upload has been verified from this Windows workspace.

Apple references: [prepare for distribution](https://developer.apple.com/documentation/xcode/preparing-your-app-for-distribution), [upload builds](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/), [Xcode upload steps](https://help.apple.com/xcode/mac/current/en.lproj/dev442d7f2ca.html).
