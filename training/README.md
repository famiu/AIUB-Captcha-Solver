# Training the model

This directory holds everything needed to rebuild the model in `extension/model.js`.

## How the extension reads a captcha

The portal shows an ASP.NET CaptchaMvc math captcha: a 200×70 GIF with `a+b=?` or `a-b=?` in a random font, among noise. The text is drawn in pure `#0000FF` and filled with a fixed 8×8 hatch pattern, so keeping only exactly-blue pixels removes almost all of the noise.

The model is a small CNN followed by a bidirectional LSTM, trained with CTC loss on that blue mask. The extension sums the probability of every expression with the same answer and fills in the most probable answer only if its probability is at least 0.97. The weights are stored as int8, about 300 KB in total.

## Contents

| Path | Purpose |
|---|---|
| `data/real/` | Real captchas downloaded from the portal (`NNN.gif`). |
| `data/labels.txt` | Labels, one `NNN a+b` per line. Training uses only images listed here. |
| `data/eval.txt` | Labelled images held out for evaluation. All other labelled images are used for training. |
| `train.py` | Trains the model on the labelled captchas, printing held-out accuracy as it goes. |
| `export.py` | Writes a trained checkpoint to `extension/model.js`. |
| `dump_real.py`, `eval_js.js` | Measure an exported model on the held-out captchas, running the extension's own solver under Node.js. |

Generated files belong in `out/`, which is ignored by git.

## Setup

You need Python 3 and a current LTS release of Node.js. From this directory, create a virtual environment and install the dependencies. This example uses [uv](https://docs.astral.sh/uv/), but any virtualenv tool works:

```sh
uv venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
uv pip install -r requirements.txt
```

Training uses a CUDA GPU when PyTorch finds one and the CPU otherwise. Run any script with `--help` for its options.

## Retraining

Train a candidate model on every labelled captcha except the held-out ones, and measure it:

```sh
python train.py out/model.pt --seed 12
python export.py out/model.pt --out out/model.js

python dump_real.py out/eval.bin
node eval_js.js out/eval.bin --model out/model.js
```

`eval_js.js` reports how many held-out captchas the extension would fill in correctly, fill in wrongly, or refresh.

Once evaluation is done, continue training on all labelled captchas, including the held-out ones, and export the result into the extension:

```sh
python train.py out/final.pt --init out/model.pt --train-on-eval --steps 4692 --lr 1e-3 --seed 31
python export.py out/final.pt
```

These commands built the released model. Its first stage scores 501 correct, 0 wrong and 14 refreshed out of 515 held-out captchas. Results on a GPU are not bit-for-bit reproducible, even with `--seed`.

## Adding training data

Put new captchas in `data/real/` as `NNN.gif`. They are used once they are labelled in `data/labels.txt`. Leave out any image that cannot be read with confidence.
