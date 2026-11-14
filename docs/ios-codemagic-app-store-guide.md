# UpCatch: Git clone to App Store with Codemagic

Checked 14 November 2026. Use this route from Windows or an older Mac limited to Xcode 14.2. Codemagic runs modern Xcode remotely; local Xcode is not required.

## 1. Clone the project

Install Git and Node.js 22. Open Terminal, PowerShell or Git Bash in the parent folder for your new checkout. Run commands individually; stop if one fails:

```sh
git clone --branch main https://github.com/jaguarbost/upcatch-apps.git upcatch-capacitor
cd upcatch-capacitor
git log -1 --oneline
git switch main
npx --yes pnpm@10.30.3 install --frozen-lockfile
```

For a private repo, use GitHub's supported sign-in flow or SSH; your normal GitHub password is not a Git HTTPS password. If you already have a checkout, use it instead. Check `git status --short` and preserve local work before switching branches or updating.

Codemagic builds committed, pushed source from your selected GitHub branch. Your local uncommitted work is not included.

| Project setting | Value |
| --- | --- |
| Bundle ID | `uk.co.upcatch.app` |
| Xcode project | `ios/App/App.xcodeproj` |
| Scheme | `App` |
| Dependencies | Swift Package Manager |
| Native client build | `pnpm native:bundle` |
| Backend | `https://www.upcatch.uk` |

Keep the existing iOS project. Do not create a replacement project or run CocoaPods setup; this project uses Swift Package Manager.

## 2. Is Codemagic best and cheap?

**For one person releasing UpCatch occasionally, start with Codemagic's personal free plan on Mac mini M2.** It is a practical low-cost choice with signing and publishing tools. There is still a one-time setup; no provider removes Apple's requirements.

| Option | Cost and tradeoff |
| --- | --- |
| Codemagic personal | 500 free macOS M2 minutes/month, one user, one concurrent build. With billing enabled, additional M2 minutes cost $0.095/minute. Team accounts do not receive these free minutes. |
| GitHub Actions | Standard runners are free for public repositories. Private repositories use plan-dependent included compute and paid overages. Can be competitive, but requires signing/upload automation. |
| Capawesome Platform | Capacitor-focused alternative with builds and store publishing, advertised from $19/month. Check billing cadence and allowances before subscribing. |

Example: 600 M2 minutes on an eligible Codemagic personal account means 100 paid minutes: **$9.50 before tax**. Failed builds consume time. Begin with manual builds, watch usage, and check billing before enabling overages. An annual fixed-price plan is unnecessary for occasional releases.

Apple Developer Program membership is a separate requirement and fee; confirm your regional price with Apple. Codemagic does not replace membership or App Review. This recommendation does not mean Codemagic is always the cheapest or best provider.

Sources: [Codemagic pricing](https://codemagic.io/pricing/), [free-plan eligibility](https://docs.codemagic.io/billing/pricing/), [GitHub billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions), [Capawesome pricing](https://capawesome.io/pricing/), [Apple enrollment](https://developer.apple.com/programs/enroll/).

## 3. Prepare your Apple app in the browser

1. Sign in to your enrolled [Apple Developer account](https://developer.apple.com/account/) and accept outstanding agreements.
2. Under **Certificates, Identifiers & Profiles > Identifiers**, find the explicit App ID `uk.co.upcatch.app`, or register it if absent. Enable **Push Notifications** to match the existing entitlements.
3. In [App Store Connect](https://appstoreconnect.apple.com/), open UpCatch if it exists. Otherwise use **Apps > + > New App**, select iOS, enter the name/language, choose `uk.co.upcatch.app`, and enter an internal SKU such as `upcatch-ios`.
4. Use the same Apple team for the app record, identifier, certificate, API key and provisioning profile.

Apple currently requires Xcode 26 or later with the iOS 26 SDK or later. The cloud template below selects Xcode 26.3; your local Xcode 14.2 is not used. Recheck requirements for later releases. [Apple requirements](https://developer.apple.com/news/upcoming-requirements/?id=04282026a)

## 4. Connect GitHub and Apple to Codemagic

1. Sign up/sign in at [Codemagic](https://codemagic.io/). Use a personal account for the individual free allowance.
2. Choose **Add application**, connect GitHub, grant access to `jaguarbost/upcatch-apps`, and add that repository. Choose the YAML configuration route; dashboard labels may vary.
3. In **App Store Connect > Users and Access > Integrations > App Store Connect API**, generate a dedicated team API key with **App Manager** access. If API access is unavailable, the Account Holder must enable/request it first.
4. Download the `.p8` once; save its **Key ID** and **Issuer ID** securely.
5. In Codemagic account settings, find **Integrations > Developer Portal** (sometimes labelled Team integrations). Add the key with the name **`upcatch-apple`**, its IDs and the `.p8` file. Use the same account context as your application; a settings label containing “Team” does not itself require a paid Team plan.

Keep private keys in the credential integration and a secure backup outside Git. [Codemagic Apple integration](https://docs.codemagic.io/yaml-publishing/app-store-connect/)

## 5. Configure distribution signing once

An API key alone does not populate all signing files needed by this workflow.

1. Open Codemagic account settings **codemagic.yaml settings > Code signing identities > iOS certificates**.
2. Generate an **Apple Distribution** certificate using `upcatch-apple`. Download the certificate/private-key archive and its password when offered, then upload the archive back under iOS certificates if required. Back it up securely outside Git.
3. Alternatively upload your existing distribution `.p12` and password. A `.cer` alone lacks the private key.

See [Codemagic signing identities](https://docs.codemagic.io/yaml-code-signing/signing-ios/).

4. In Apple Developer **Certificates, Identifiers & Profiles > Profiles > +**, create an **App Store Connect** distribution profile. Select `uk.co.upcatch.app` and the distribution certificate above, name it `UpCatch App Store`, generate and download it. Your account needs profile-management permission. [Apple profile steps](https://developer.apple.com/help/account/provisioning-profiles/create-an-app-store-provisioning-profile/)
5. In Codemagic **Code signing identities > iOS provisioning profiles**, upload the `.mobileprovision`, or fetch the existing App Store profile through the API integration. Confirm bundle ID, certificate and push capability match.

Do not revoke certificates used by other releases to resolve setup errors. Regenerate the profile if its capabilities or certificate change.

## 6. Add public client configuration

In the Codemagic application's **Environment variables**, create group **`upcatch_native_public`** and add:

| Variable | Value |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Existing project's public Supabase URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Existing project's publishable key |
| `NEXT_PUBLIC_ONESIGNAL_APP_ID` | Existing OneSignal app ID |
| `MOBILE_API_BASE_URL` | `https://www.upcatch.uk` |

These public values are included in the binary. Keep Supabase secret/service-role keys, database passwords, OneSignal API keys, Resend keys and cron secrets on the backend. Do not set `CAPACITOR_SERVER_URL`; production uses the bundled client and the existing deployed backend.

## 7. Create and push the workflow

The repository now includes **`codemagic.yaml` in its root**, beside `package.json`. Use the branch containing that file in Codemagic and click **Check for configuration file**. For a checkout that predates the file, add the following configuration at that root path and push it first.

```yaml
workflows:
  upcatch-ios:
    name: UpCatch iOS upload
    instance_type: mac_mini_m2
    max_build_duration: 60
    integrations:
      app_store_connect: upcatch-apple
    environment:
      node: 22
      xcode: 26.3
      groups:
        - upcatch_native_public
      ios_signing:
        distribution_type: app_store
        bundle_identifier: uk.co.upcatch.app
    scripts:
      - name: Install locked dependencies
        script: |
          set -eu
          npx --yes pnpm@10.30.3 install --frozen-lockfile
      - name: Check source and package native client
        script: |
          set -eu
          unset CAPACITOR_SERVER_URL
          npx --yes pnpm@10.30.3 typecheck
          npx --yes pnpm@10.30.3 test:native
          npx --yes pnpm@10.30.3 native:bundle
          npx --yes pnpm@10.30.3 native:sync
          npx --yes pnpm@10.30.3 native:check
          npx --yes pnpm@10.30.3 native:release-check
      - name: Resolve Swift packages
        script: |
          set -eu
          xcodebuild -resolvePackageDependencies \
            -project ios/App/App.xcodeproj -scheme App
      - name: Apply distribution profile
        script: |
          set -eu
          xcode-project use-profiles
      - name: Archive and export signed IPA
        script: |
          set -eu
          xcode-project build-ipa \
            --project ios/App/App.xcodeproj \
            --scheme App \
            --config Release
    artifacts:
      - build/ios/ipa/*.ipa
      - /tmp/xcodebuild_logs/*.log
    publishing:
      app_store_connect:
        auth: integration
        submit_to_testflight: false
        submit_to_app_store: false
```

The workflow uploads the signed binary. The two `false` settings leave beta-review and public-review submission to you in Apple's browser interface; they do not disable upload.

Full `native:sync` is intentional: the repository guard checks copied assets on both platforms. It also refreshes Swift package paths after pnpm installation. No Android release is built. `pnpm build` builds the separate Next.js server and does not replace `native:bundle`.

**Check version/build before upload.** At writing, local metadata is **2.0.1, build 5**; verify your selected branch and Apple's existing uploads. If the build number is already used, increase both `CURRENT_PROJECT_VERSION` entries in `ios/App/App.xcodeproj/project.pbxproj` and Android's `versionCode` in `android/app/build.gradle` together. The repository guard requires agreement. Keep marketing versions aligned with `package.json` for a release; do not downgrade them to match an old example.

Run:

```sh
git diff --check
git add codemagic.yaml
git commit -m "Add Codemagic iOS build and upload workflow"
git push origin main
```

If you changed version files, review and stage those specific files before committing too. Keep unrelated files and credentials out of the commit. This project pushes only to `main`; select `main` in Codemagic and click **Check for configuration file** after pushing.

This template needs a real cloud build to validate compilation and signing. References: [native iOS workflow](https://docs.codemagic.io/yaml-quick-start/building-a-native-ios-app/), [Capacitor integration](https://docs.codemagic.io/yaml-quick-start/building-an-ionic-app/).

## 8. Build and install through TestFlight

1. In Codemagic choose **Start new build**, branch `main`, workflow **UpCatch iOS upload**. Confirm the commit includes the workflow and latest source; start the build.
2. Check all steps, including publishing. An exported IPA alone does not prove Apple accepted the upload.
3. Open **App Store Connect > UpCatch > TestFlight**, wait for processing, and resolve compliance questions or processing errors.
4. Create an **Internal Testing** group, add your eligible App Store Connect user and the processed build. Install Apple's **TestFlight** app on your iPhone, accept the invitation with the invited Apple Account, and tap **Install**. [Apple internal tester steps](https://developer.apple.com/help/app-store-connect/test-a-beta-version/add-internal-testers/)
5. For testers without App Store Connect access, use external testing and complete the required beta review.

Downloading an IPA to the iPhone Files app does not install it through the App Store. TestFlight is the test installation route here.

Test sign-in, confirmation/reset/Google return links, restart persistence, photos, location, meetup flows, notification delivery/taps and offline startup on a real iPhone. Check the approved UI using [native-release-operations.md](native-release-operations.md). Configure APNs in OneSignal for the same Apple team/bundle ID; the upload API key is not an APNs key. A successful build does not prove backend or push behavior.

## 9. Submit and release on the public App Store

After device testing passes, in App Store Connect:

1. Open UpCatch's iOS App Store version matching the uploaded marketing version.
2. Add real release screenshots, description, category, age rating, support URL, privacy policy and App Privacy answers. Complete outstanding operator/privacy details in [native-store-listing.md](native-store-listing.md).
3. Select the processed build and answer export compliance and other declarations accurately.
4. Supply reviewer access/instructions for authenticated flows. Configure pricing and availability; choose manual release if you want control after approval.
5. Add the version for review and submit. Respond to reviewer requests in App Store Connect.
6. After approval, release it if manual release was selected. When available in your region, open the public App Store listing on your iPhone and tap **Get**.

Upload, TestFlight testing, App Review and public release are separate stages. Record actual cloud/build/device evidence in [native-release-plan.md](native-release-plan.md); complete milestones only after acceptance checks pass.

## 10. Later uploads and troubleshooting

For updates, align version metadata, increase build numbers for each new uploaded binary, commit/push and run the workflow again. Preserve the pnpm lockfile.

| Problem | Action |
| --- | --- |
| Workflow missing | Commit `codemagic.yaml` at the selected branch's root. |
| Free minutes missing | Check personal versus Team account and M2 machine selection. |
| Missing Supabase configuration | Check the environment group and exact variable names. |
| Missing Swift package path | Confirm frozen install and `native:sync` passed before package resolution. |
| Signing/profile error | Check App Store distribution type, bundle ID, matching certificate/private key and profile validity. |
| Push entitlement mismatch | Enable push on the App ID and regenerate/upload its profile. |
| Duplicate build rejected | Increase both iOS build settings and Android versionCode, commit and push. |
| Upload passes but build absent | Check Apple's processing status and validation emails. |
| TestFlight install unavailable | Check compliance, processing, invitation account and group/build assignment. |
| Login or push fails | Check deployed backend, Supabase callback configuration and OneSignal/APNs separately. |

**Verification status:** Documentation and starter template only. No Codemagic account connection, signed iOS archive, upload, TestFlight installation or App Store release has been performed or verified by writing this guide.
