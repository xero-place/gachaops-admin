#!/usr/bin/env bash
set -uo pipefail
MEDIA_ROOT="/var/www/videos"
PG=(docker exec -i gachaops-postgres psql -U gachaops -d gachaops)
APPLY=0
[ "${1:-}" = "--apply" ] && APPLY=1
echo "==== 縦型 keyint1_1024.mp4 資産の棚卸し (apply=${APPLY}) ===="
mapfile -t ROWS < <("${PG[@]}" -Atqc "SELECT id||E'\t'||url FROM assets WHERE url LIKE '%keyint1_1024.mp4';")
n_target=0; n_skip=0; n_done=0; n_fail=0; n_missing=0
for row in "${ROWS[@]}"; do
  [ -z "$row" ] && continue
  id="${row%%$'\t'*}"; url="${row#*$'\t'}"; rel="${url#*/videos/}"; f="${MEDIA_ROOT}/${rel}"
  if [ ! -f "$f" ]; then echo "MISSING  ${id}  ${f}"; n_missing=$((n_missing+1)); continue; fi
  read -r w h lvl < <(ffprobe -v error -select_streams v:0 -show_entries stream=width,height,level -of default=nw=1:nk=1 "$f" | paste -sd' ')
  if [ "$w" = "1024" ] && [ "$h" = "1280" ] && [ "$lvl" = "31" ]; then
    echo "TARGET   ${id}  ${w}x${h} level=${lvl}  ${f}"; n_target=$((n_target+1))
    if [ "$APPLY" = "1" ]; then
      dir="$(dirname "$f")"; dst="${dir}/keyint1_1024_v2.mp4"
      if [ -f "$dst" ] && [ "$(ffprobe -v error -select_streams v:0 -show_entries stream=level -of default=nw=1:nk=1 "$dst" 2>/dev/null)" = "40" ]; then
        echo "  -- _v2 既存(level=40)。再エンコード省略。"
      else
        ffmpeg -y -loglevel error -i "$f" \
          -vf "scale=1024:1280:force_original_aspect_ratio=decrease,pad=1024:1280:(ow-iw)/2:(oh-ih)/2:black,setparams=range=unknown:color_primaries=unknown:color_trc=unknown:colorspace=unknown" \
          -c:v libx264 -profile:v high -level 4.0 -pix_fmt yuv420p \
          -color_range unknown -color_primaries unspecified -color_trc unspecified -colorspace unspecified \
          -maxrate 3M -bufsize 6M -g 60 -keyint_min 60 \
          -c:a aac -ar 44100 -ac 2 -b:a 128k -movflags +faststart "$dst" || { echo "  !! ffmpeg 失敗: ${f}"; n_fail=$((n_fail+1)); continue; }
      fi
      nl="$(ffprobe -v error -select_streams v:0 -show_entries stream=level -of default=nw=1:nk=1 "$dst" 2>/dev/null)"
      if [ "$nl" != "40" ]; then echo "  !! 検証失敗 level=${nl}: ${dst}"; n_fail=$((n_fail+1)); continue; fi
      newurl="${url/keyint1_1024.mp4/keyint1_1024_v2.mp4}"
      if "${PG[@]}" -c "UPDATE assets SET url='${newurl}' WHERE id='${id}';" >/dev/null 2>&1; then
        echo "  -> DONE  url=${newurl}"; n_done=$((n_done+1))
      else echo "  !! DB更新失敗: ${id}"; n_fail=$((n_fail+1)); fi
    fi
  else echo "SKIP     ${id}  ${w}x${h} level=${lvl}"; n_skip=$((n_skip+1)); fi
done
echo "==== 集計 ===="
echo "  対象=${n_target}  除外=${n_skip}  欠損=${n_missing}"
[ "$APPLY" = "1" ] && echo "  適用=${n_done}  失敗=${n_fail}"
[ "$APPLY" = "0" ] && echo "  (dry-run。実行: bash backfill_l40.sh --apply)"
