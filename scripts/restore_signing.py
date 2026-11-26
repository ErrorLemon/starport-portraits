"""Restore the existing private signing backup from one Actions Secret; never print it."""
from pathlib import Path
import base64
import io
import os
import zipfile

ROOT = Path(__file__).resolve().parents[1]

def main():
    encoded = os.environ.get('ANDROID_SIGNING_BUNDLE_BASE64', '')
    if not encoded:
        raise SystemExit('Missing ANDROID_SIGNING_BUNDLE_BASE64 in repository Actions Secrets; release was not built.')
    raw = base64.b64decode(encoded, validate=True)
    if len(raw) > 32768:
        raise SystemExit('Signing backup is unexpectedly large.')
    with zipfile.ZipFile(io.BytesIO(raw)) as archive:
        required = {'signing.properties', 'signing/starport-release.jks'}
        if not required.issubset(archive.namelist()):
            raise SystemExit('Use the original Android signing backup ZIP.')
        payload = {name: archive.read(name) for name in required}
    properties = payload['signing.properties'].decode('utf-8')
    values = dict(line.strip().split('=', 1) for line in properties.splitlines()
                  if '=' in line and not line.lstrip().startswith(('#', '!')))
    if values.get('storeFile') != 'signing/starport-release.jks':
        raise SystemExit('Unexpected signing file path.')
    for name in ['storePassword', 'keyAlias', 'keyPassword']:
        if not values.get(name):
            raise SystemExit('Incomplete signing backup.')
        # GitHub masks the encoded Secret automatically; also mask decoded values.
        value = values[name].replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')
        print('::add-mask::' + value)
    for name, data in payload.items():
        destination = ROOT/'android'/name
        destination.parent.mkdir(parents=True, exist_ok=True)
        destination.write_bytes(data)
        destination.chmod(0o600)
    print('Original signing restored; private files will be removed after the job.')

if __name__ == '__main__':
    main()
