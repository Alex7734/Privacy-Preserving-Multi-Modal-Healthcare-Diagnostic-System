#!/usr/bin/env bash
# stop.sh — kill all FHE Medical services
cd "$(dirname "$0")"
for port in 8000 8001 5173; do
  pids=$(lsof -ti:"$port" 2>/dev/null || true)
  [ -n "$pids" ] && echo "$pids" | xargs kill -9 2>/dev/null && echo "Stopped :$port" || true
done
echo "All services stopped."
