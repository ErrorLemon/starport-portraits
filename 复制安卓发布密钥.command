#!/bin/sh
set -eu
cd "$(dirname "$0")"
python3 scripts/copy_signing_secret.py
printf '\n按回车关闭窗口。'
read -r ignored
