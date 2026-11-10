#!/bin/sh
# Generates the short test tracks and placeholder icons used by the /spike page.
# Needs ffmpeg. Run from the project root: sh scripts/make-test-assets.sh
set -e

AUDIO=public/spike
ICONS=public/icons
mkdir -p "$AUDIO" "$ICONS"

# chord <f1> <f2> <f3> <output> <encoder args...>: a 20-second three-note chord.
chord() {
  f1=$1; f2=$2; f3=$3; out=$4; shift 4
  ffmpeg -loglevel error -y \
    -f lavfi -i "sine=frequency=$f1:duration=20:sample_rate=96000" \
    -f lavfi -i "sine=frequency=$f2:duration=20:sample_rate=96000" \
    -f lavfi -i "sine=frequency=$f3:duration=20:sample_rate=96000" \
    -filter_complex "amix=inputs=3:normalize=0,volume=0.25,afade=t=in:d=0.4,afade=t=out:st=19:d=1,pan=stereo|c0=c0|c1=c0" \
    "$@" "$out"
}

chord 220.00 277.18 329.63 "$AUDIO/01-a-major.mp3"  -ar 44100 -c:a libmp3lame -b:a 192k
chord 261.63 329.63 392.00 "$AUDIO/02-c-major.m4a"  -ar 44100 -c:a aac -b:a 192k
chord 293.66 369.99 440.00 "$AUDIO/03-d-major.flac" -ar 96000 -sample_fmt s32 -bits_per_raw_sample 24 -c:a flac
chord 329.63 415.30 493.88 "$AUDIO/04-e-major.m4a"  -ar 44100 -c:a alac

# Placeholder icon: five bars on a near-black square.
BG=0x0E0E10
FG=0xFF6B4A
ffmpeg -loglevel error -y -f lavfi -i "color=c=$BG:s=512x512" -frames:v 1 -vf "\
drawbox=x=72:y=186:w=48:h=140:color=$FG:t=fill,\
drawbox=x=152:y=126:w=48:h=260:color=$FG:t=fill,\
drawbox=x=232:y=86:w=48:h=340:color=$FG:t=fill,\
drawbox=x=312:y=156:w=48:h=200:color=$FG:t=fill,\
drawbox=x=392:y=201:w=48:h=110:color=$FG:t=fill" "$ICONS/icon-512.png"
ffmpeg -loglevel error -y -i "$ICONS/icon-512.png" -vf scale=192:192 "$ICONS/icon-192.png"
ffmpeg -loglevel error -y -i "$ICONS/icon-512.png" -vf scale=180:180 "$ICONS/apple-touch-icon.png"

ls -l "$AUDIO" "$ICONS"
