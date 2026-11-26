"""Copy a private signing ZIP as an Actions Secret on macOS; do not print secret data."""
from pathlib import Path
import base64
import shutil
import subprocess
import sys
import zipfile

ROOT = Path(__file__).resolve().parents[1]

def main():
    path = Path(sys.argv[1]).expanduser() if len(sys.argv) > 1 else ROOT.parent/'星港合影-安卓签名备份-请勿分发.zip'
    if not path.is_file():
        raise SystemExit('找不到原始签名备份 ZIP，请将它放在项目文件夹的上一层，或将路径传给此脚本。')
    if not shutil.which('pbcopy'):
        raise SystemExit('此复制助手适用于 macOS；它不会将密钥输出到终端。')
    with zipfile.ZipFile(path) as archive:
        if not {'signing.properties', 'signing/starport-release.jks'}.issubset(archive.namelist()):
            raise SystemExit('请选择原始安卓签名备份 ZIP。')
    encoded = base64.b64encode(path.read_bytes())
    if len(encoded) > 48000:
        raise SystemExit('文件过大，请确认选择了正确的签名备份。')
    subprocess.run(['pbcopy'], input=encoded, check=True)
    print('已复制到剪贴板。请粘贴到 GitHub Actions Secret：ANDROID_SIGNING_BUNDLE_BASE64。')

if __name__ == '__main__':
    main()
