"""Create offline downloads; only a verified APK with the original certificate can be released."""
from pathlib import Path
import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import zipfile

ROOT = Path(__file__).resolve().parents[1]

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--tag')
    parser.add_argument('--web-only', action='store_true')
    parser.add_argument('--check-only', action='store_true')
    args = parser.parse_args()
    settings = json.loads((ROOT/'release.json').read_text())
    tag = args.tag or 'v' + settings['version']
    if not re.fullmatch(r'v[0-9]+\.[0-9]+\.[0-9]+', tag) or tag != 'v' + settings['version']:
        raise SystemExit('Version tag must match release.json, e.g. v' + settings['version'])
    gradle = (ROOT/'android/app/build.gradle').read_text()
    if re.search(r"versionName\s+'([^']+)'", gradle)[1] != settings['version']:
        raise SystemExit('Android versionName must match release.json.')
    if args.check_only:
        print('PASS release version ' + tag)
        return
    output = ROOT/'dist'
    output.mkdir(exist_ok=True)
    paths = []
    web = output/f'starport-portraits-{tag}-web-offline.zip'
    with zipfile.ZipFile(web, 'w', zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for path in sorted((ROOT/'web').rglob('*')):
            if path.is_file() and not path.name.startswith('.'):
                archive.write(path, 'starport-portraits/' + path.relative_to(ROOT/'web').as_posix())
        archive.write(ROOT/'NOTICE.md', 'starport-portraits/NOTICE.md')
    with zipfile.ZipFile(web) as archive:
        assert archive.testzip() is None
        assert 'starport-portraits/index.html' in archive.namelist()
    paths.append(web)
    if not args.web_only:
        sdk = os.environ.get('ANDROID_HOME') or os.environ.get('ANDROID_SDK_ROOT')
        if not sdk:
            raise SystemExit('ANDROID_HOME is required to verify the release APK.')
        signer = Path(sdk)/'build-tools/36.0.0/apksigner'
        apk = ROOT/'android/app/build/outputs/apk/release/app-release.apk'
        result = subprocess.run([str(signer), 'verify', '--verbose', '--print-certs', str(apk)],
                                check=True, capture_output=True, text=True)
        expected = 'certificate SHA-256 digest: ' + settings['android_certificate_sha256']
        if expected not in result.stdout:
            raise SystemExit('APK certificate differs from the original app. Nothing was published.')
        with zipfile.ZipFile(apk, metadata_encoding='utf-8') as archive:
            assert archive.testzip() is None
            for path in (ROOT/'android/app/src/main/assets/www').rglob('*'):
                if path.is_file():
                    name = 'assets/www/' + path.relative_to(ROOT/'android/app/src/main/assets/www').as_posix()
                    assert archive.read(name) == path.read_bytes(), name
        final_apk = output/f'starport-portraits-{tag}-android.apk'
        shutil.copy2(apk, final_apk)
        paths.append(final_apk)
    checksums = output/'SHA256SUMS.txt'
    checksums.write_text(''.join(hashlib.sha256(path.read_bytes()).hexdigest() + '  ' + path.name + '\n' for path in paths))
    (output/'release-notes.md').write_text(
        '# 星港合影 ' + tag + '\n\n开发：斯曼达洛舰队-Lemon_ACE\n\n'
        '- 安卓：Android 10 及以上，使用原始签名，离线运行。\n'
        '- 电脑版：下载 web-offline.zip 并完整解压，打开 index.html。\n'
        '- 内置 248 个型号、494 张透明图片、3 张名牌背景。\n'
        '- 保留 Excel 导入、标准模板、紧凑排列、Logo、标题位置和逐项说明开关。\n'
        '- 更新或卸载前请导出工程备份。\n\n'
        '游戏及社区素材来源和许可见下载包内的 NOTICE.md 与中文名称来源与许可.md。\n')
    print('Created: ' + ', '.join(path.name for path in paths) + ', SHA256SUMS.txt')

if __name__ == '__main__':
    main()
