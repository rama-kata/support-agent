"""QLoRA fine-tune of a small Qwen model as the intent router.

    CUDA_VISIBLE_DEVICES=0 uv run --extra train python training/train_router.py \\
        --base Qwen/Qwen2.5-3B-Instruct --out models/router-qwen2.5-3b

Same base model as the prompting baseline (qwen2.5:3b), so the comparison isolates the
effect of fine-tuning. The prompt is one short line instead of the baseline's 28-intent
catalog: the label set is learned from data. Loss is computed on the label only.
"""

import argparse
import json
import random
from collections import defaultdict
from pathlib import Path

import torch
from datasets import Dataset
from peft import LoraConfig
from transformers import AutoTokenizer, BitsAndBytesConfig
from trl import SFTConfig, SFTTrainer

from support_agent.router import FINETUNE_SYSTEM, training_examples

PER_INTENT = 400
VAL_FRACTION = 0.05


def build_dataset(seed: int) -> tuple[Dataset, Dataset]:
    rng = random.Random(seed)
    by_intent = defaultdict(list)
    for e in training_examples():
        by_intent[e["intent"]].append(e)
    rows = []
    for intent, items in by_intent.items():
        for e in rng.sample(items, min(PER_INTENT, len(items))):
            rows.append({
                "prompt": [{"role": "system", "content": FINETUNE_SYSTEM},
                           {"role": "user", "content": e["instruction"]}],
                "completion": [{"role": "assistant", "content": intent}],
            })
    rng.shuffle(rows)
    n_val = int(len(rows) * VAL_FRACTION)
    return Dataset.from_list(rows[n_val:]), Dataset.from_list(rows[:n_val])


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="Qwen/Qwen2.5-3B-Instruct")
    parser.add_argument("--out", default="models/router-qwen2.5-3b")
    parser.add_argument("--epochs", type=float, default=1.0)
    parser.add_argument("--seed", type=int, default=0)
    args = parser.parse_args()

    train, val = build_dataset(args.seed)
    print(f"train={len(train)} val={len(val)}")

    tokenizer = AutoTokenizer.from_pretrained(args.base)
    config = SFTConfig(
        output_dir=args.out,
        num_train_epochs=args.epochs,
        per_device_train_batch_size=16,
        gradient_accumulation_steps=1,
        learning_rate=2e-4,
        lr_scheduler_type="cosine",
        warmup_steps=20,
        bf16=True,
        logging_steps=20,
        eval_strategy="steps",
        eval_steps=150,
        per_device_eval_batch_size=32,
        save_strategy="no",
        max_length=192,
        completion_only_loss=True,
        gradient_checkpointing=True,
        report_to="none",
        seed=args.seed,
        model_init_kwargs={
            "quantization_config": BitsAndBytesConfig(
                load_in_4bit=True, bnb_4bit_quant_type="nf4",
                bnb_4bit_compute_dtype=torch.bfloat16, bnb_4bit_use_double_quant=True),
            "dtype": torch.bfloat16,
        },
    )
    lora = LoraConfig(r=16, lora_alpha=32, lora_dropout=0.05, task_type="CAUSAL_LM",
                      target_modules=["q_proj", "k_proj", "v_proj", "o_proj",
                                      "gate_proj", "up_proj", "down_proj"])
    trainer = SFTTrainer(model=args.base, args=config, train_dataset=train, eval_dataset=val,
                         processing_class=tokenizer, peft_config=lora)
    trainer.train()
    trainer.save_model(args.out)
    tokenizer.save_pretrained(args.out)
    Path(args.out, "train_info.json").write_text(json.dumps({
        "base": args.base, "train": len(train), "val": len(val), "epochs": args.epochs,
        "per_intent": PER_INTENT, "log": trainer.state.log_history}, indent=2))


if __name__ == "__main__":
    main()
