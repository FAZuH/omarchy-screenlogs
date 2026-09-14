#!/bin/bash
# Development helper script
# Usage: ./dev.sh [command1] [command2] ...
#   commands: docs | all | help
#   plus any commands provided by modules (scripts/dev-*.sh, dev/*.sh, dev-*.sh)
#   Multiple commands can be specified and will execute left to right

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

inf() { echo -e "${BLUE}[INFO]${NC} $1"; }
scs() { echo -e "${GREEN}[SUCCESS]${NC} $1"; }
err() { echo -e "${RED}[ERROR]${NC} $1"; }
wrn() { echo -e "${YELLOW}[WARNING]${NC} $1"; }

# --- Module registry ---
# Modules define cmd_<name>() functions (hyphens in the command name map to
# underscores) and register a one-line help description via dev_desc.

declare -A CMD_DESCS
declare -a CMD_ORDER

dev_desc() {
    local cmd="$1"
    local desc="$2"
    if [[ -z "${CMD_DESCS[$cmd]+x}" ]]; then
        CMD_ORDER+=("$cmd")
    fi
    CMD_DESCS[$cmd]="$desc"
}

# --- Core commands ---

cmd_docs() {
    inf "Compiling Mermaid diagrams..."

    if ! command -v mmdc &> /dev/null; then
        wrn "Mermaid CLI not found. Installing..."
        npm install -g @mermaid-js/mermaid-cli
    fi

    mkdir -p docs/diagrams

    for file in docs/diagrams/*.mmd; do
        if [ -f "$file" ]; then
            filename=$(basename "$file" .mmd)
            inf "Compiling $filename.mmd..."
            mmdc -i "$file" -o "docs/diagrams/${filename}.png" -b transparent -s 4 --width 3840 --height 2160
        fi
    done

    scs "Mermaid diagrams compiled to docs/diagrams/"
}
dev_desc docs "Compile Mermaid diagrams to images"

cmd_all() {
    inf "Running all tasks..."
    cmd_docs
    scs "All tasks completed"
}
dev_desc all "Run all core commands in sequence"

# --- Module discovery ---
# Source order is precedence: last-loaded wins. The synced baseline
# (scripts/dev-*.sh) loads first, so project-local modules (dev/*.sh,
# dev-*.sh) can override it.

discover_modules() {
    local pat f
    for pat in "scripts/dev-*.sh" "dev/*.sh" "dev-*.sh"; do
        shopt -s nullglob
        for f in ${SCRIPT_DIR}/${pat}; do
            [ -f "$f" ] || continue
            inf "Loading module: $(basename "$f")"
            source "$f"
        done
        shopt -u nullglob
    done
}

discover_modules

# --- Help function ---

show_help() {
    cat << EOF
Development Helper Script

Usage: ./dev.sh [command1] [command2] ...

Commands:
EOF
    local cmd
    for cmd in "${CMD_ORDER[@]}"; do
        printf '  %-12s - %s\n' "$cmd" "${CMD_DESCS[$cmd]}"
    done
    cat << EOF

Multiple commands can be specified and will execute sequentially from left to right.

Examples:
  ./dev.sh docs                  # Compile Mermaid diagrams
  ./dev.sh all                   # Run all core commands

EOF
}

execute_command() {
    local command="$1"
    local fn="cmd_${command//-/_}"

    case "$command" in
        help)
            show_help
            ;;
        all)
            cmd_all
            ;;
        *)
            if declare -F "$fn" &>/dev/null; then
                "$fn"
            else
                err "Unknown command: $command"
                show_help
                exit 1
            fi
            ;;
    esac
}

if [ $# -eq 0 ]; then
    show_help
    exit 0
fi

for command in "$@"; do
    execute_command "$command"
done