"""Download the raw datasets into data/raw/ (no Kaggle token needed).

- Kaggle bitext/bitext-gen-ai-chatbot-customer-support-dataset: 27K support utterances,
  27 intents.
- Montgomery County, MD "Warehouse and Retail Sales": liquor sales by SKU/month. The Kaggle
  mirror (divyeshardeshana/warehouse-and-retail-sales) only covers 10 months, too short for
  12-month lag forecasting, so we pull the full 24-month table from the county's open data.
"""

import shutil
import urllib.request
from pathlib import Path

import kagglehub

RAW = Path("data/raw")
BITEXT = (
    "bitext/bitext-gen-ai-chatbot-customer-support-dataset",
    "Bitext_Sample_Customer_Support_Training_Dataset_27K_responses-v11.csv",
)
RETAIL_URL = "https://data.montgomerycountymd.gov/api/views/v76h-r7br/rows.csv?accessType=DOWNLOAD"


def main():
    RAW.mkdir(parents=True, exist_ok=True)
    bitext = RAW / "bitext.csv"
    if not bitext.exists():
        slug, filename = BITEXT
        shutil.copy(Path(kagglehub.dataset_download(slug)) / filename, bitext)
    print(f"bitext: {bitext}")

    retail = RAW / "retail_sales.csv"
    if not retail.exists():
        urllib.request.urlretrieve(RETAIL_URL, retail)
    print(f"retail: {retail}")


if __name__ == "__main__":
    main()
