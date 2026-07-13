#!/bin/sh
set -eu

STACK_DIR=${STACK_DIR:-/opt/gamestr-arcade-phoenixd}
BACKUP_DIR=${BACKUP_DIR:-/opt/backups/gamestr-arcade-phoenixd}
AGE_RECIPIENT_FILE=${AGE_RECIPIENT_FILE:-$STACK_DIR/backup-recipient.txt}
PHOENIX_VOLUME=${PHOENIX_VOLUME:-gamestr-arcade-phoenixd_phoenix-data}

test "$(id -u)" -eq 0 || { echo 'backup must run as root' >&2; exit 1; }
test -s "$AGE_RECIPIENT_FILE" || { echo 'age recipient file is missing' >&2; exit 1; }
recipient=$(sed -n '1p' "$AGE_RECIPIENT_FILE")
case "$recipient" in age1*) ;; *) echo 'invalid age recipient' >&2; exit 1 ;; esac

volume_path=$(docker volume inspect "$PHOENIX_VOLUME" --format '{{.Mountpoint}}')
test -s "$volume_path/seed.dat" || { echo 'phoenixd seed.dat is missing' >&2; exit 1; }
install -d -m 0700 "$BACKUP_DIR"
timestamp=$(date -u +%Y%m%dT%H%M%SZ)
output="$BACKUP_DIR/phoenixd-$timestamp.tar.gz.age"

tar -C "$volume_path" -czf - seed.dat phoenix.conf \
  | age -r "$recipient" -o "$output"
chmod 0600 "$output"
sha256sum "$output" > "$output.sha256"
chmod 0600 "$output.sha256"

# Keep the newest 14 encrypted archives and their checksums.
ls -1t "$BACKUP_DIR"/phoenixd-*.tar.gz.age 2>/dev/null \
  | awk 'NR > 14' \
  | while IFS= read -r old; do rm -f "$old" "$old.sha256"; done

echo "$output"
