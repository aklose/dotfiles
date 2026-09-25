#!/bin/bash
input=$(cat)

model=$(echo "$input" | jq -r '.model.display_name')
dir=$(echo "$input" | jq -r '.workspace.current_dir')
dir_display="${dir/#$HOME/~}"

branch=""
if git -C "$dir" --no-optional-locks rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  branch=$(git -C "$dir" --no-optional-locks branch --show-current 2>/dev/null)
fi

printf '\033[2;36m%s\033[0m \033[2;34m%s\033[0m' "$model" "$dir_display"
[ -n "$branch" ] && printf ' \033[2;33m⎇ %s\033[0m' "$branch"
printf '\n'

read -r ctx used size five seven cost dur added removed < <(echo "$input" | jq -r '[
  (.context_window.used_percentage // "" | if . == "" then "-" else floor end),
  (.context_window.total_input_tokens // 0),
  (.context_window.context_window_size // 200000),
  (.rate_limits.five_hour.used_percentage // "" | if . == "" then "-" else floor end),
  (.rate_limits.seven_day.used_percentage // "" | if . == "" then "-" else floor end),
  (.cost.total_cost_usd // 0),
  (.cost.total_duration_ms // 0),
  (.cost.total_lines_added // 0),
  (.cost.total_lines_removed // 0)
] | @tsv')

transcript=$(echo "$input" | jq -r '.transcript_path // empty')

tok_in=0 tok_out=0
if [ -f "$transcript" ]; then
  read -r tok_in tok_out < <(jq -rs '
    [.[] | select(.type == "assistant" and .message.usage) | {id: .message.id, u: .message.usage}]
    | unique_by(.id) | map(.u)
    | [(map(.input_tokens + (.cache_creation_input_tokens // 0)) | add // 0),
       (map(.output_tokens) | add // 0)]
    | @tsv' "$transcript")
fi

fmt_tokens() {
  local n=$1
  if (( n >= 1000000 )); then
    awk -v n="$n" 'BEGIN { s = sprintf("%.1f", n / 1000000); sub(/\.0$/, "", s); print s "m" }'
  elif (( n >= 1000 )); then
    printf '%dk' $(( (n + 500) / 1000 ))
  else
    printf '%d' "$n"
  fi
}

color() {
  if [ "$1" = "-" ]; then printf '2'
  elif [ "$1" -ge 80 ]; then printf '31'
  elif [ "$1" -ge 50 ]; then printf '33'
  else printf '32'
  fi
}

sep=' \033[2m·\033[0m '

if [ "$ctx" = "-" ]; then
  bar='░░░░░░░░░░'
  ctx_label="--/$(fmt_tokens "$size")"
else
  filled=$(( (ctx + 5) / 10 ))
  (( filled > 10 )) && filled=10
  bar=$(printf '%*s' "$filled" '' | tr ' ' '▓')$(printf '%*s' $((10 - filled)) '' | tr ' ' '░')
  ctx_label="$(fmt_tokens "$used")/$(fmt_tokens "$size")"
fi
printf '\033[%sm%s %s\033[0m' "$(color "$ctx")" "$bar" "$ctx_label"

printf "$sep"'\033[2m↑ %s ↓ %s\033[0m' "$(fmt_tokens "$tok_in")" "$(fmt_tokens "$tok_out")"

if [ "$five" != "-" ]; then
  printf "$sep"'\033[%sm5h %s%%\033[0m' "$(color "$five")" "$five"
fi

if [ "$seven" != "-" ]; then
  printf "$sep"'\033[%sm7d %s%%\033[0m' "$(color "$seven")" "$seven"
fi

printf "$sep"'\033[2m$%.2f\033[0m' "$cost"

mins=$(( dur / 60000 ))
if (( mins >= 60 )); then
  dur_label="$((mins / 60))h$((mins % 60))m"
else
  dur_label="${mins}m"
fi
printf "$sep"'\033[2m%s\033[0m' "$dur_label"

printf "$sep"'\033[32m+%s\033[0m \033[31m−%s\033[0m\n' "$added" "$removed"
