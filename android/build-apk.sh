#!/bin/sh
set -eu
cd "$(dirname "$0")"
if [ ! -f signing.properties ]; then
    echo '缺少 signing.properties。正式更新必须使用原始签名，请恢复签名备份；首次构建可先执行 ./gradlew assembleDebug。' >&2
    exit 1
fi
./gradlew --no-daemon assembleRelease
echo 'APK: app/build/outputs/apk/release/app-release.apk'
