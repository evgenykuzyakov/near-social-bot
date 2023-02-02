#!/bin/bash
# set -e

cd $(dirname "$0")
mkdir -p logs/raw

while :
do
  DATE=$(date "+%Y_%m_%d")
  date | tee -a logs/raw/$DATE.txt
  yarn start 2>&1 | tee -a logs/raw/$DATE.txt
  sleep 5
done
