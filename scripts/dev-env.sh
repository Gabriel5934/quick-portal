#!/bin/sh
# Usage: scripts/dev-env.sh FILE EXAMPLE KEY=VALUE... [KEY...]
#
# Creates or completes an env file for the local dev stack (see `make dev-env`).
# A KEY=VALUE argument always sets KEY to VALUE, overwriting any existing value.
# A bare KEY gets a random value (`openssl rand -hex 32`) only when its value in
# FILE is missing or empty, so an existing secret is kept. The last assignment
# of a KEY (with or without a leading `export`) is the one replaced, since it is
# the one that takes effect; a value counts as empty after trimming whitespace
# and surrounding quotes. Other lines, comments and their order are kept, so
# running it again changes nothing.
#
# FILE starts from EXAMPLE when it is missing (or empty when both are missing),
# is rewritten atomically only when something changes, and always ends with
# mode 600. Prints `FILE: set KEY` for each change, never values.
set -eu

usage() {
	echo "usage: $0 FILE EXAMPLE KEY=VALUE... [KEY...]" >&2
	exit 2
}

[ "$#" -ge 2 ] || usage
file=$1
example=$2
shift 2

if [ -e "$file" ]; then
	source_file=$file
elif [ -e "$example" ]; then
	source_file=$example
else
	source_file=
fi

dir=$(dirname -- "$file")
tmp=
next=
trap 'rm -f "$tmp" "$next"' EXIT
trap 'exit 1' HUP INT TERM
tmp=$(mktemp "$dir/.dev-env.XXXXXX")
next=$(mktemp "$dir/.dev-env.XXXXXX")

if [ -n "$source_file" ]; then
	cat -- "$source_file" >"$tmp"
fi

# Starting from EXAMPLE (or from nothing) always writes FILE.
changed=0
[ "$source_file" = "$file" ] || changed=1

for pair in "$@"; do
	case $pair in
	*=*)
		key=${pair%%=*}
		value=${pair#*=}
		force=1
		;;
	*)
		key=$pair
		value=$(openssl rand -hex 32)
		force=0
		;;
	esac
	case $key in
	'' | [0-9]* | *[!A-Za-z0-9_]*)
		echo "$0: invalid key name in argument: $key" >&2
		exit 2
		;;
	esac

	# Values reach awk through ENVIRON, not -v, so backslashes and other
	# special characters are copied literally. Exit status 3 means the key was
	# set; 0 means it was left alone.
	status=0
	DEV_ENV_KEY=$key DEV_ENV_VALUE=$value DEV_ENV_FORCE=$force awk '
		function strip_ws(s) {
			sub("^[ \t\r\f\v]+", "", s)
			sub("[ \t\r\f\v]+$", "", s)
			return s
		}
		# Returns the text after "=" when line assigns key (optionally
		# prefixed by whitespace and "export "), else the nomatch marker.
		function assigned(line, rest) {
			sub("^[ \t\r\f\v]+", "", line)
			if (substr(line, 1, length(key)) == key) {
				rest = substr(line, length(key) + 1)
				sub("^[ \t\r\f\v]*", "", rest)
				if (substr(rest, 1, 1) == "=") return substr(rest, 2)
			}
			if (match(line, "^export[ \t\r\f\v]+")) {
				line = substr(line, RLENGTH + 1)
				if (substr(line, 1, length(key)) == key) {
					rest = substr(line, length(key) + 1)
					sub("^[ \t\r\f\v]*", "", rest)
					if (substr(rest, 1, 1) == "=") return substr(rest, 2)
				}
			}
			return nomatch
		}
		BEGIN {
			key = ENVIRON["DEV_ENV_KEY"]
			value = ENVIRON["DEV_ENV_VALUE"]
			force = ENVIRON["DEV_ENV_FORCE"]
			nomatch = "\001nomatch"
		}
		{ lines[NR] = $0 }
		END {
			last = 0
			for (i = 1; i <= NR; i++) {
				v = assigned(lines[i])
				if (v != nomatch) { last = i; current = v }
			}
			if (last) {
				current = strip_ws(current)
				gsub("^[\"\047]+|[\"\047]+$", "", current)
				if (force != "1" && current != "") {
					for (i = 1; i <= NR; i++) print lines[i]
					exit 0
				}
				if (lines[last] == key "=" value) {
					for (i = 1; i <= NR; i++) print lines[i]
					exit 0
				}
				lines[last] = key "=" value
				for (i = 1; i <= NR; i++) print lines[i]
			} else {
				for (i = 1; i <= NR; i++) print lines[i]
				print key "=" value
			}
			exit 3
		}
	' "$tmp" >"$next" || status=$?

	case $status in
	0) ;;
	3)
		mv -f "$next" "$tmp"
		next=$(mktemp "$dir/.dev-env.XXXXXX")
		changed=1
		echo "$file: set $key"
		;;
	*)
		echo "$0: awk failed with status $status" >&2
		exit 1
		;;
	esac
done

if [ "$changed" -eq 1 ]; then
	chmod 600 "$tmp"
	mv -f "$tmp" "$file"
	tmp=
fi
chmod 600 "$file"
