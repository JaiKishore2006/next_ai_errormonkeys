import os
import requests
import zipfile

DATA_RAW = "data-raw"
ZIP_URL = "https://archive.ics.uci.edu/static/public/502/online+retail+ii.zip"
ZIP_PATH = os.path.join(DATA_RAW, "online_retail_ii.zip")

os.makedirs(DATA_RAW, exist_ok=True)

def download_data():
    if not os.path.exists(ZIP_PATH):
        print(f"Downloading {ZIP_URL}...")
        resp = requests.get(ZIP_URL, stream=True, timeout=60)
        resp.raise_for_status()
        total_size = int(resp.headers.get('content-length', 0))
        downloaded = 0
        with open(ZIP_PATH, "wb") as f:
            for chunk in resp.iter_content(chunk_size=1024 * 1024):
                if chunk:
                    f.write(chunk)
                    downloaded += len(chunk)
                    if total_size > 0:
                        pct = downloaded / total_size * 100
                        print(f"Downloaded {downloaded / 1024 / 1024:.1f} MB / {total_size / 1024 / 1024:.1f} MB ({pct:.1f}%)")
                    else:
                        print(f"Downloaded {downloaded / 1024 / 1024:.1f} MB")
        print("Download complete.")
    else:
        print(f"{ZIP_PATH} already exists.")

    print("Extracting zip...")
    with zipfile.ZipFile(ZIP_PATH, 'r') as zf:
        zf.extractall(DATA_RAW)
        print("Extracted files:", zf.namelist())

if __name__ == "__main__":
    download_data()
