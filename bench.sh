#! /bin/bash

echo '=============================='
echo '= Normal Mode | Without Auth ='
echo '=============================='
npx concurrently --raw -k "node ./bench/normal-without-auth.js" "npx wait-on tcp:3000 && node ./bench/normal-bench.js"

echo '==========================='
echo '= Normal Mode | With Auth ='
echo '==========================='
npx concurrently --raw -k "node ./bench/normal-with-auth.js" "npx wait-on tcp:3000 && node ./bench/normal-bench.js"
