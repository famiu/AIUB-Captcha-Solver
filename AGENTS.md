# AGENTS.md

A browser extension (Manifest V3, plain JavaScript, no build step) that solves the AIUB portal's math captcha with a CNN + BiLSTM CTC model, plus the PyTorch pipeline that trains it. `README.md` covers installing and building, and `training/README.md` covers training.

## Commands

From the repository root:

```sh
npx web-ext@10 lint --source-dir extension    # must report 0 errors, 0 warnings, 0 notices
```

From `training/`, with the virtual environment from `training/README.md` active:

```sh
python dump_real.py out/eval.bin              # held-out captchas as raw RGBA
node eval_js.js out/eval.bin                  # what the shipped extension does on them
node eval_js.js out/eval.bin --model FILE     # a model exported with export.py --out FILE
python export.py CHECKPOINT --out out/check.js
```

## Map

- `extension/content.js`: page integration (find the captcha, fill, refresh, animate).
- `extension/solver.js`: the model's forward pass and the answer decoder.
- `extension/model.js`: generated weights.
- `training/train.py`: `Net`, the data loading and the training loop. `export.py` writes `model.js`.
- `training/out/`: ignored by git. All datasets, checkpoints, dumps and logs go here.

## Always

- Keep `Net.forward` in `training/train.py`, `forward` in `extension/solver.js` and the format that `export.py` writes and `loadLayers` reads in step; change them together. Afterwards, export a checkpoint and run `eval_js.js` on it. If the format is meant to be unchanged, `export.py CHECKPOINT --out out/check.js` must be byte-identical to `extension/model.js` for the checkpoint that produced it.
- Regenerate `extension/model.js` only by running `training/export.py`.
- After editing `icons/icon.svg`, re-render each `extension/icons/icon-N.png` (N = 16, 32, 48, 96, 128), for example `magick -background none -density $((72 * N / 48)) icons/icon.svg -resize NxN PNG32:extension/icons/icon-N.png`.
- Measure candidate models with `eval_js.js --model` before the final `--train-on-eval` stage. The shipped model has seen the held-out set, so its own score there means nothing.
- Keep the held-out numbers in `training/README.md` in step with the shipped model.
- Bump `version` in `extension/manifest.json` for each release; addons.mozilla.org accepts each version only once. Pushing a tag `v<version>` runs `.github/workflows/release.yml`, which signs the package and publishes the GitHub release.
- Put large files (datasets, checkpoints, virtualenvs, downloads) in `training/out/`, not `/tmp`.

## Ask first

- Changing labels in `training/data/labels.txt` or the held-out list in `training/data/eval.txt`.

## Never

- Add browser-specific code, a second manifest or extension API calls. One package serves Firefox and Chromium-based browsers.
- Train on images listed in `training/data/eval.txt`, except with `train.py --train-on-eval` for the final shipped model.
- Add machine-specific paths, usernames or hardware assumptions. Training uses CUDA when available and the CPU otherwise.
- Enter credentials or submit the form when checking `content.js` on <https://portal.aiub.edu/>. Its behaviour can be checked only there, in both Firefox (load the built package as a temporary add-on) and a Chromium-based browser (load `extension/` unpacked).
