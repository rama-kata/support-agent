"""Merge a LoRA router adapter into its base model and serve it with Ollama.

    git clone --depth 1 https://github.com/ggml-org/llama.cpp ~/repos/llama.cpp
    uv run --extra train --with ~/repos/llama.cpp/gguf-py --with sentencepiece \\
        python training/export_ollama.py models/router-qwen2.5-3b --name support-router-3b

Serving through Ollama gives the fine-tuned router the same inference engine as the
prompting baseline, so their latencies are comparable, and the app needs no PyTorch.

Ollama's own safetensors import (`FROM <dir>`) produced a model that only emitted "????"
for this merge, although the same weights were correct in transformers. Converting with
llama.cpp's convert_hf_to_gguf.py and importing the GGUF works.
"""

import argparse
import json
import subprocess
import sys
from pathlib import Path

import torch
from peft import PeftModel
from transformers import AutoModelForCausalLM, AutoTokenizer

LLAMA_CPP = Path.home() / "repos" / "llama.cpp"
CHATML = '''TEMPLATE """{{- range .Messages }}<|im_start|>{{ .Role }}
{{ .Content }}<|im_end|>
{{ end }}<|im_start|>assistant
"""
PARAMETER stop <|im_end|>
'''


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("adapter")
    parser.add_argument("--name", required=True, help="Ollama model name to create")
    parser.add_argument("--quantize", default="q4_K_M")
    parser.add_argument("--llama-cpp", type=Path, default=LLAMA_CPP)
    args = parser.parse_args()

    adapter = Path(args.adapter)
    base = json.loads((adapter / "adapter_config.json").read_text())["base_model_name_or_path"]
    merged, gguf = adapter / "merged", adapter / "router-f16.gguf"

    # Merge in bf16 on CPU: merging into 4-bit weights would lose precision.
    model = AutoModelForCausalLM.from_pretrained(base, dtype=torch.bfloat16, device_map="cpu")
    model = PeftModel.from_pretrained(model, adapter).merge_and_unload()
    model.save_pretrained(merged)
    AutoTokenizer.from_pretrained(adapter).save_pretrained(merged)

    subprocess.run([sys.executable, str(args.llama_cpp / "convert_hf_to_gguf.py"), str(merged),
                    "--outtype", "f16", "--outfile", str(gguf)], check=True)

    modelfile = adapter / "Modelfile"
    modelfile.write_text(f"FROM {gguf.resolve()}\n{CHATML}"
                         "PARAMETER temperature 0\nPARAMETER num_predict 8\n")
    subprocess.run(["ollama", "create", args.name, "-f", str(modelfile),
                    "--quantize", args.quantize], check=True)
    print(f"created Ollama model {args.name}")


if __name__ == "__main__":
    main()
