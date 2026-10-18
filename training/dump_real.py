"""Write the held-out real captchas (data/eval.txt) as raw RGBA for eval_js.js.

Each record is a 16-byte ASCII header "NNN a+b" padded with spaces, followed
by the 200x70 image as RGBA bytes.
"""

import argparse
from pathlib import Path

from train import eval_names, read_image, read_labels


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("out", help="output .bin")
    args = ap.parse_args()

    held_out = eval_names()
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    with open(args.out, "wb") as out:
        for name, expr in read_labels():
            if name in held_out:
                out.write(f"{name} {expr}".ljust(16).encode())
                out.write(read_image(name, "RGBA").tobytes())


if __name__ == "__main__":
    main()
