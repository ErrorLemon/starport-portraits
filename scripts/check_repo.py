"""Validate the distributable project without loading private fleet data."""
from pathlib import Path
import hashlib
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[1]

def main():
    result = subprocess.run(['git', 'ls-files', '-z'], cwd=ROOT, check=True, capture_output=True)
    for name in result.stdout.decode().split('\0'):
        if not name:
            continue
        path = Path(name)
        assert not (set(path.parts) & {'signing', '.gradle', '__pycache__', 'build'}), name
        assert path.name not in {'signing.properties', 'local.properties', '.env'}, name
        assert path.suffix.lower() not in {'.jks', '.keystore', '.apk', '.zip'}, name
        assert not name.endswith(('.fleetproject.json', '.fleetlib.json', '.nameplate.json')), name
        assert (ROOT/path).stat().st_size < 100 * 1024 * 1024, name
        if path.suffix.lower() in {'.xlsx', '.xls', '.csv'}:
            assert name.startswith('web/data/') or name == 'docs/舰队标准导入模板.xlsx', name

    data = json.loads((ROOT/'web/data/library.json').read_text())
    assert len(data['ships']) == 248 and len(data['assets']) == 494
    for key, asset in data['assets'].items():
        path = Path(asset['file'])
        assert path.parts[0] == 'assets' and '..' not in path.parts, key
        assert hashlib.sha256((ROOT/'web'/path).read_bytes()).hexdigest() == asset['sha256'], key

    for base in [ROOT/'web', ROOT/'android/app/src/main/assets/www']:
        for name in ['app.js', 'fleet.js', 'nameplate.js', 'excel.js', 'excel-engine.js', 'fleet-engine.js']:
            subprocess.run(['node', '--check', str(base/name)], check=True)
        for name in ['fleet.js', 'nameplate.js']:
            assert '开发：斯曼达洛舰队-Lemon_ACE' in (base/name).read_text(), name

    settings = json.loads((ROOT/'release.json').read_text())
    gradle = (ROOT/'android/app/build.gradle').read_text()
    assert re.search(r"versionName\s+'([^']+)'", gradle)[1] == settings['version']
    manifest = (ROOT/'android/app/src/main/AndroidManifest.xml').read_text()
    assert 'android.permission.INTERNET' not in manifest
    print('PASS repository exclusions, 248 models, 494 image hashes, JavaScript syntax, fixed credit and version')

if __name__ == '__main__':
    main()
