#!/bin/sh
# Sky CLI installer — macOS and Linux.
#
#   curl -fsSL https://raw.githubusercontent.com/skysyaz/Sky-cli/main/install.sh | sh
#
# Fetches the repo, builds it, and installs a `sky` launcher onto your PATH.
# Override behaviour with environment variables:
#   SKY_REPO         GitHub owner/repo         (default: skysyaz/Sky-cli)
#   SKY_REF          branch or tag to install  (default: main)
#   SKY_INSTALL_DIR  where the app is built    (default: ~/.sky/app)
#   SKY_BIN_DIR      where the launcher goes    (default: ~/.local/bin)
set -eu

REPO="${SKY_REPO:-skysyaz/Sky-cli}"
REF="${SKY_REF:-main}"
INSTALL_DIR="${SKY_INSTALL_DIR:-$HOME/.sky/app}"
BIN_DIR="${SKY_BIN_DIR:-$HOME/.local/bin}"

# --- pretty output (only colorize a real terminal) -------------------------
if [ -t 1 ]; then
  BOLD="$(printf '\033[1m')"; DIM="$(printf '\033[2m')"; RED="$(printf '\033[31m')"
  GREEN="$(printf '\033[32m')"; RESET="$(printf '\033[0m')"
else
  BOLD=""; DIM=""; RED=""; GREEN=""; RESET=""
fi
info() { printf '%s\n' "${DIM}sky:${RESET} $1"; }
ok()   { printf '%s\n' "${GREEN}sky:${RESET} $1"; }
err()  { printf '%s\n' "${RED}sky: $1${RESET}" >&2; }
die()  { err "$1"; exit 1; }

# --- platform check --------------------------------------------------------
OS="$(uname -s)"
case "$OS" in
  Darwin) PLATFORM="macOS" ;;
  Linux)  PLATFORM="Linux" ;;
  *) die "unsupported OS: $OS (Sky supports macOS and Linux)." ;;
esac
info "Installing Sky for ${BOLD}${PLATFORM}${RESET} (ref: ${REF})"

# --- prerequisites ---------------------------------------------------------
if ! command -v node >/dev/null 2>&1; then
  err "Node.js 20+ is required but was not found."
  if [ "$PLATFORM" = "macOS" ]; then
    err "Install it with: brew install node   (or from https://nodejs.org)"
  else
    err "Install it from https://nodejs.org or your package manager."
  fi
  exit 1
fi
NODE_MAJOR="$(node -p 'process.versions.node.split(".")[0]')"
if [ "$NODE_MAJOR" -lt 20 ]; then
  die "Node.js 20+ is required (found $(node -v))."
fi
command -v npm >/dev/null 2>&1 || die "npm is required but was not found."

# --- fetch the source ------------------------------------------------------
info "Downloading ${REPO}…"
mkdir -p "$(dirname "$INSTALL_DIR")"
rm -rf "$INSTALL_DIR"

if command -v git >/dev/null 2>&1; then
  git clone --depth 1 --branch "$REF" "https://github.com/${REPO}.git" "$INSTALL_DIR" >/dev/null 2>&1 \
    || die "git clone failed (does ref '${REF}' exist on ${REPO}?)."
elif command -v curl >/dev/null 2>&1; then
  TMP="$(mktemp -d)"
  curl -fsSL "https://github.com/${REPO}/archive/refs/heads/${REF}.tar.gz" \
    | tar xz -C "$TMP" || die "download failed."
  # The tarball extracts to <repo>-<ref>; move it into place.
  SRC="$(find "$TMP" -maxdepth 1 -mindepth 1 -type d | head -n 1)"
  mv "$SRC" "$INSTALL_DIR"
  rm -rf "$TMP"
else
  die "either git or curl is required to download Sky."
fi

# --- build -----------------------------------------------------------------
info "Installing dependencies and building (this may take a minute)…"
( cd "$INSTALL_DIR" && npm install --no-audit --no-fund >/dev/null 2>&1 && npm run build >/dev/null 2>&1 ) \
  || die "build failed. Re-run with: cd '$INSTALL_DIR' && npm install && npm run build"

# --- launcher --------------------------------------------------------------
mkdir -p "$BIN_DIR"
cat > "$BIN_DIR/sky" <<EOF
#!/bin/sh
exec node "$INSTALL_DIR/dist/cli/main.js" "\$@"
EOF
chmod +x "$BIN_DIR/sky"

ok "Installed sky $("$BIN_DIR/sky" --version 2>/dev/null || echo '') to ${BOLD}${BIN_DIR}/sky${RESET}"

# --- PATH guidance ---------------------------------------------------------
case ":$PATH:" in
  *":$BIN_DIR:"*) : ;;
  *)
    printf '\n'
    info "${BIN_DIR} is not on your PATH. Add it to your shell profile:"
    printf '  %sexport PATH="%s:$PATH"%s\n\n' "$BOLD" "$BIN_DIR" "$RESET"
    ;;
esac

printf 'Next steps:\n'
printf '  %ssky init%s      # choose a provider and set your API key\n' "$BOLD" "$RESET"
printf '  %ssky "…" %s      # start an agent session\n' "$BOLD" "$RESET"
