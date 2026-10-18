"""Train the CTC captcha reader on the labelled real captchas.

Labelled captchas are listed in data/labels.txt. Those named in data/eval.txt
are held out for evaluation; the rest are used for training.
"""

import argparse
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn
import torch.nn.functional as F
from PIL import Image

VOCAB = "0123456789+-=?"
H, W = 70, 200
DATA = Path(__file__).with_name("data")


def mask_from_rgb(rgb):
    """1 where the pixel is the captcha's pure text blue."""
    r, g, b = rgb[..., 0].astype(int), rgb[..., 1].astype(int), rgb[..., 2].astype(int)
    return ((r < 25) & (g < 25) & (b > 230)).astype(np.uint8)


def eval_names():
    return set((DATA / "eval.txt").read_text().split())


def read_labels():
    """(name, expression) pairs from data/labels.txt, e.g. ("123", "45+6")."""
    for line in (DATA / "labels.txt").read_text().splitlines():
        if line.strip():
            name, expr = line.split()
            yield name, expr


def read_image(name, mode):
    with Image.open(DATA / "real" / f"{name}.gif") as img:
        return np.asarray(img.convert(mode), dtype=np.uint8)


def load_real():
    return [(name, mask_from_rgb(read_image(name, "RGB")), expr + "=?") for name, expr in read_labels()]


class Net(nn.Module):
    """CNN feature extractor + bidirectional LSTM, trained with CTC."""

    def __init__(self):
        super().__init__()

        def block(cin, cout):
            return nn.Sequential(nn.Conv2d(cin, cout, 3, padding=1, bias=False), nn.BatchNorm2d(cout), nn.ReLU())

        self.c1 = block(1, 16)
        self.c2 = block(16, 32)
        self.c3 = block(32, 48)
        self.c4 = block(48, 64)
        self.rnn = nn.LSTM(64 * 4, 64, bidirectional=True, batch_first=True)
        self.out = nn.Linear(128, len(VOCAB) + 1)

    def forward(self, x):
        # Dilating 3x3 closes the holes of the hatch fill.
        x = F.max_pool2d(x, 3, stride=1, padding=1)
        x = F.max_pool2d(self.c1(x), 2)  # 35x100
        x = F.max_pool2d(self.c2(x), 2)  # 17x50
        x = F.max_pool2d(self.c3(x), (2, 1))  # 8x50
        x = F.max_pool2d(self.c4(x), (2, 1))  # 4x50
        n, c, h, w = x.shape
        x = x.permute(0, 3, 1, 2).reshape(n, w, c * h)  # one feature vector per column
        x, _ = self.rnn(x)
        return self.out(x).permute(0, 2, 1)  # (N, C, T)


def decode(logits):
    """Greedy CTC decode of (N, C, T) logits -> list of strings."""
    best = logits.argmax(1).cpu().numpy()
    out = []
    for row in best:
        s, prev = [], 0
        for k in row:
            if k != prev and k != 0:
                s.append(VOCAB[k - 1])
            prev = k
        out.append("".join(s))
    return out


def augment(x):
    """Random shifts and extra specks on a (N,1,H,W) float batch."""
    n = x.shape[0]
    pad = F.pad(x, (6, 6, 4, 4))
    dx = torch.randint(0, 13, (n,), device=x.device)
    dy = torch.randint(0, 9, (n,), device=x.device)
    idx_y = (dy[:, None] + torch.arange(H, device=x.device)[None]).view(n, 1, H, 1).expand(n, 1, H, W + 12)
    pad = pad.gather(2, idx_y)
    idx_x = (dx[:, None] + torch.arange(W, device=x.device)[None]).view(n, 1, 1, W).expand(n, 1, H, W)
    x = pad.gather(3, idx_x)
    specks = (torch.rand_like(x) < torch.rand(n, 1, 1, 1, device=x.device) * 0.004).float()
    return torch.maximum(x, specks)


def encode_targets(labels):
    flat = [VOCAB.index(c) + 1 for t in labels for c in t]
    return torch.tensor(flat), torch.tensor([len(t) for t in labels])


def evaluate(model, real, device):
    model.eval()
    with torch.no_grad():
        x = torch.tensor(np.stack([m for _, m, _ in real]), dtype=torch.float32, device=device)[:, None]
        preds = decode(model(x))
    model.train()
    wrong = [(name, label, p) for (name, _, label), p in zip(real, preds) if p.split("=")[0] != label.split("=")[0]]
    return 1 - len(wrong) / len(real), wrong


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("out", help="output .pt checkpoint")
    ap.add_argument("--train-on-eval", action="store_true", help="also train on the held-out samples (for a final model)")
    ap.add_argument("--steps", type=int, default=9384, help="training steps")
    ap.add_argument("--eval-every", type=int, default=782, help="steps between held-out evaluations and checkpoints")
    ap.add_argument("--batch", type=int, default=288, help="samples per batch, drawn at random with replacement")
    ap.add_argument("--lr", type=float, default=3e-3, help="peak learning rate of the one-cycle schedule")
    ap.add_argument("--init", help="checkpoint to start from instead of random weights (for fine-tuning)")
    ap.add_argument("--seed", type=int, default=None, help="seed for weight initialisation and batch sampling")
    args = ap.parse_args()
    if args.steps < 1 or args.eval_every < 1 or args.batch < 1:
        ap.error("--steps, --eval-every and --batch must be positive")

    if args.seed is not None:
        torch.manual_seed(args.seed)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    device = "cuda" if torch.cuda.is_available() else "cpu"
    real = load_real()
    held_out = eval_names()
    real_eval = [r for r in real if r[0] in held_out]
    real_train = real if args.train_on_eval else [r for r in real if r[0] not in held_out]
    if not real_train:
        raise SystemExit("no labelled captchas to train on")
    print(f"train {len(real_train)}, held out {len(real_eval)}")

    model = Net().to(device)
    if args.init:
        model.load_state_dict(torch.load(args.init, map_location=device))
    print("params", sum(p.numel() for p in model.parameters()))
    opt = torch.optim.AdamW(model.parameters(), lr=args.lr, weight_decay=1e-4)
    sched = torch.optim.lr_scheduler.OneCycleLR(opt, args.lr, total_steps=args.steps)
    ctc = nn.CTCLoss(zero_infinity=True)
    scaler = torch.amp.GradScaler(enabled=device == "cuda")
    train_x = torch.tensor(np.stack([m for _, m, _ in real_train]), dtype=torch.uint8)
    train_y = [t for _, _, t in real_train]

    total = 0.0
    wrong = []
    for step in range(1, args.steps + 1):
        idx = torch.randint(0, len(train_y), (args.batch,))
        x = augment(train_x[idx].to(device, dtype=torch.float32)[:, None])
        yb = [train_y[j] for j in idx.tolist()]
        with torch.autocast(device, dtype=torch.float16, enabled=device == "cuda"):
            logits = model(x)
        logp = logits.float().permute(2, 0, 1).log_softmax(2)
        tgt, tlen = encode_targets(yb)
        loss = ctc(logp, tgt, torch.full((len(yb),), logp.shape[0], dtype=torch.long), tlen)
        opt.zero_grad()
        scaler.scale(loss).backward()
        scaler.step(opt)
        scaler.update()
        sched.step()
        total += loss.item()
        if step % args.eval_every == 0 or step == args.steps:
            acc, wrong = evaluate(model, real_eval, device) if real_eval else (float("nan"), [])
            steps = (step - 1) % args.eval_every + 1
            print(f"step {step}: loss {total / steps:.4f}  held-out acc {acc:.3f}", flush=True)
            total = 0.0
            torch.save(model.state_dict(), args.out)
    for w in wrong:
        print("  wrong", *w)


if __name__ == "__main__":
    main()
