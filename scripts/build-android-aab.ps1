param(
  [string]$KeyDirectory = (Join-Path $env:USERPROFILE 'UpCatch-release-keys'),
  [switch]$Offline
)

$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$androidRoot = Join-Path $projectRoot 'android'
$bundlePath = Join-Path $androidRoot 'app\build\outputs\bundle\release\app-release.aab'
$keystorePath = Join-Path $KeyDirectory 'upcatch-upload-key.p12'
$passwordPath = Join-Path $KeyDirectory 'upcatch-upload-key.password.txt'
$alias = 'upcatch-upload'
$jdkRoot = 'C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot'
$keytool = Join-Path $jdkRoot 'bin\keytool.exe'
$jarsigner = Join-Path $jdkRoot 'bin\jarsigner.exe'
$androidSdk = Join-Path $env:LOCALAPPDATA 'Android\Sdk'

if (!(Test-Path -LiteralPath $keytool) -or !(Test-Path -LiteralPath $jarsigner)) {
  throw 'JDK 21 is required at the configured path.'
}
if (!(Test-Path -LiteralPath $androidSdk)) { throw 'Android SDK is not installed at the expected location.' }
if ($env:CAPACITOR_SERVER_URL) { throw 'Unset CAPACITOR_SERVER_URL before creating a Play bundle.' }

$hasKeystore = Test-Path -LiteralPath $keystorePath
$hasPassword = Test-Path -LiteralPath $passwordPath
if ($hasKeystore -ne $hasPassword) {
  throw 'The upload keystore and its password file must both be present. Do not generate a replacement key for an existing Play app.'
}

if (!$hasKeystore) {
  New-Item -ItemType Directory -Path $KeyDirectory -Force | Out-Null
  # Keep both files outside the project, readable only by the current Windows user.
  $identity = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
  $acl = Get-Acl -LiteralPath $KeyDirectory
  $acl.SetAccessRuleProtection($true, $false)
  $flags = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
  $rule = [System.Security.AccessControl.FileSystemAccessRule]::new(
    $identity, [System.Security.AccessControl.FileSystemRights]::FullControl,
    $flags, [System.Security.AccessControl.PropagationFlags]::None,
    [System.Security.AccessControl.AccessControlType]::Allow
  )
  $acl.AddAccessRule($rule)
  Set-Acl -LiteralPath $KeyDirectory -AclObject $acl

  $random = [byte[]]::new(48)
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try { $rng.GetBytes($random) } finally { $rng.Dispose() }
  $password = [Convert]::ToBase64String($random)
  $env:UPCATCH_UPLOAD_KEY_PASSWORD = $password
  & $keytool -genkeypair -noprompt -keystore $keystorePath -storetype PKCS12 -alias $alias `
    -keyalg RSA -keysize 4096 -validity 10000 `
    -dname 'CN=UpCatch, OU=Mobile, O=UpCatch, L=Manchester, C=GB' `
    -storepass:env UPCATCH_UPLOAD_KEY_PASSWORD -keypass:env UPCATCH_UPLOAD_KEY_PASSWORD
  if ($LASTEXITCODE -ne 0) { throw 'Upload key generation failed.' }
  [System.IO.File]::WriteAllText($passwordPath, $password, [System.Text.UTF8Encoding]::new($false))
  Write-Output "Created private upload key at $keystorePath"
} else {
  $password = [System.IO.File]::ReadAllText($passwordPath, [System.Text.Encoding]::UTF8).Trim()
  if (!$password) { throw 'Upload key password file is empty.' }
  $env:UPCATCH_UPLOAD_KEY_PASSWORD = $password
  Write-Output "Reusing private upload key at $keystorePath"
}

try {
  $env:JAVA_HOME = $jdkRoot
  $env:ANDROID_HOME = $androidSdk
  $env:UPCATCH_ANDROID_KEYSTORE_FILE = $keystorePath
  $env:UPCATCH_ANDROID_KEYSTORE_PASSWORD = $env:UPCATCH_UPLOAD_KEY_PASSWORD
  $env:UPCATCH_ANDROID_KEY_ALIAS = $alias
  $env:UPCATCH_ANDROID_KEY_PASSWORD = $env:UPCATCH_UPLOAD_KEY_PASSWORD

  Push-Location $androidRoot
  try {
    $gradleArgs = @('bundleRelease', '--quiet')
    if ($Offline) { $gradleArgs += '--offline' }
    & .\gradlew.bat @gradleArgs
    if ($LASTEXITCODE -ne 0) { throw 'Android release bundle build failed.' }
  } finally { Pop-Location }

  if (!(Test-Path -LiteralPath $bundlePath)) { throw 'Gradle did not create the expected AAB.' }
  $verification = & $jarsigner -verify $bundlePath 2>&1
  if ($LASTEXITCODE -ne 0) { throw 'AAB signature verification failed.' }
  if (!($verification -match 'jar verified\.')) { throw 'Jarsigner did not confirm the AAB signature.' }
  Write-Output 'AAB signature verified by jarsigner.'
  $bundle = Get-Item -LiteralPath $bundlePath
  $hash = Get-FileHash -Algorithm SHA256 -LiteralPath $bundlePath
  Write-Output "AAB: $($bundle.FullName)"
  Write-Output "Bytes: $($bundle.Length)"
  Write-Output "SHA-256: $($hash.Hash)"
  Write-Output "Back up the upload key and password file together from $KeyDirectory"
} finally {
  Remove-Item Env:UPCATCH_UPLOAD_KEY_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:UPCATCH_ANDROID_KEYSTORE_PASSWORD -ErrorAction SilentlyContinue
  Remove-Item Env:UPCATCH_ANDROID_KEY_PASSWORD -ErrorAction SilentlyContinue
}
