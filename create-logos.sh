#!/bin/bash

pushd public

if [ ! -e logo.png ]; then
  echo "logo.png not found in public directory. Please add your logo image."
  exit 1
fi

magick logo.png -define icon:auto-resize=256,128,64,48,32,16 favicon.ico
magick logo.png -resize 512x512 logo-512.png
magick logo.png -resize 192x192 logo-192.png
magick logo.png -resize 32x32   logo-32.png
magick logo.png -resize 16x16   logo-16.png
magick logo.png -resize 180x180 apple-touch-icon.png
magick logo.png -resize 1200x1200^ -gravity center -extent 1200x630 og-image.png

popd