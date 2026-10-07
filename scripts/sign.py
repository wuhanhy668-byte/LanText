"""macOS CI only. Never print credentials, certificate contents or provisioning data."""
import base64
import datetime
import os
import pathlib
import plistlib
import re
import subprocess
import sys

temp = pathlib.Path(os.environ['RUNNER_TEMP'])
keychain = temp / 'lantext-signing.keychain-db'
certificate = temp / 'lantext-signing.p12'
profile_file = temp / 'lantext.mobileprovision'
decoded_file = temp / 'lantext-profile.plist'
installed = pathlib.Path.home() / 'Library/MobileDevice/Provisioning Profiles/lantext-ci.mobileprovision'

def security(*args):
    result = subprocess.run(['security', *map(str, args)], capture_output=True)
    if result.returncode:
        raise RuntimeError('Signing asset operation failed. Check certificate, password and profile secrets.')
    return result.stdout

def cleanup():
    subprocess.run(['security', 'delete-keychain', str(keychain)], capture_output=True)
    for item in (certificate, profile_file, decoded_file, installed, temp / 'lantext-export.plist'):
        item.unlink(missing_ok=True)

if '--cleanup' in sys.argv:
    cleanup()
    sys.exit(0)

try:
    for name in ('BUILD_CERTIFICATE_BASE64', 'P12_PASSWORD', 'BUILD_PROVISION_PROFILE_BASE64', 'KEYCHAIN_PASSWORD'):
        if not os.environ.get(name):
            raise RuntimeError(f'Missing GitHub Secret: {name}')
    os.umask(0o077)
    for name, dest in [('BUILD_CERTIFICATE_BASE64', certificate), ('BUILD_PROVISION_PROFILE_BASE64', profile_file)]:
        dest.write_bytes(base64.b64decode(''.join(os.environ[name].split()), validate=True))
    profile_data = security('cms', '-D', '-i', profile_file)
    profile = plistlib.loads(profile_data)
    bundle = os.environ['BUNDLE_ID']
    if not re.fullmatch(r'[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+', bundle):
        raise RuntimeError('Invalid BUNDLE_ID repository variable')
    team = profile['TeamIdentifier'][0]
    appid = profile['Entitlements']['application-identifier']
    allowed = appid.split('.', 1)[1]
    if bundle != allowed and not (allowed.endswith('.*') and bundle.startswith(allowed[:-1])):
        raise RuntimeError('Provisioning profile does not match BUNDLE_ID')
    if profile['ExpirationDate'] <= datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None):
        raise RuntimeError('Provisioning profile expired')
    method = os.environ.get('EXPORT_METHOD', 'release-testing')
    if method not in ('release-testing', 'debugging', 'app-store-connect'):
        raise RuntimeError('Unsupported export method')
    development = bool(profile['Entitlements'].get('get-task-allow'))
    if (method == 'debugging') != development:
        raise RuntimeError('Export method does not match development/distribution profile')
    if method == 'release-testing' and not profile.get('ProvisionedDevices'):
        raise RuntimeError('Ad Hoc export requires a profile with registered iPad devices')
    if method == 'app-store-connect' and profile.get('ProvisionedDevices'):
        raise RuntimeError('App Store export requires an App Store provisioning profile')
    security('create-keychain', '-p', os.environ['KEYCHAIN_PASSWORD'], keychain)
    security('set-keychain-settings', '-lut', '21600', keychain)
    security('unlock-keychain', '-p', os.environ['KEYCHAIN_PASSWORD'], keychain)
    security('import', certificate, '-P', os.environ['P12_PASSWORD'], '-A', '-t', 'cert', '-f', 'pkcs12', '-k', keychain)
    security('set-key-partition-list', '-S', 'apple-tool:,apple:', '-k', os.environ['KEYCHAIN_PASSWORD'], keychain)
    security('list-keychains', '-d', 'user', '-s', keychain)
    identities = security('find-identity', '-v', '-p', 'codesigning', keychain).decode()
    matches = re.findall(r'\b([A-Fa-f0-9]{40})\b', identities)
    if len(matches) != 1:
        raise RuntimeError('P12 must contain exactly one valid code signing identity and its private key')
    installed.parent.mkdir(parents=True, exist_ok=True)
    installed.write_bytes(profile_file.read_bytes())
    export = {'method': method, 'teamID': team, 'signingStyle': 'manual',
              'signingCertificate': matches[0], 'provisioningProfiles': {bundle: profile['UUID']},
              'manageAppVersionAndBuildNumber': False}
    export_file = temp / 'lantext-export.plist'
    export_file.write_bytes(plistlib.dumps(export))
    build_number = os.environ.get('GITHUB_RUN_NUMBER', '1')
    subprocess.run(['xcodebuild', '-project', 'ipad/LanText.xcodeproj', '-scheme', 'LanText',
                    '-configuration', 'Release', '-destination', 'generic/platform=iOS',
                    '-archivePath', 'build/LanText.xcarchive', 'archive',
                    f'PRODUCT_BUNDLE_IDENTIFIER={bundle}', f'DEVELOPMENT_TEAM={team}',
                    'CODE_SIGN_STYLE=Manual', f'CODE_SIGN_IDENTITY={matches[0]}',
                    f'PROVISIONING_PROFILE_SPECIFIER={profile["UUID"]}',
                    f'CURRENT_PROJECT_VERSION={build_number}'], check=True)
    subprocess.run(['xcodebuild', '-exportArchive', '-archivePath', 'build/LanText.xcarchive',
                    '-exportPath', 'build/export', '-exportOptionsPlist', str(export_file)], check=True)
except (ValueError, KeyError, RuntimeError, subprocess.CalledProcessError) as error:
    # CalledProcessError contains command arguments: do not serialize it.
    print(str(error) if isinstance(error, RuntimeError) else 'Signing/build failed. Verify signing assets and inspect Xcode diagnostics.', file=sys.stderr)
    sys.exit(1)
finally:
    cleanup()
